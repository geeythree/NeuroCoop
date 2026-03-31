import Fastify from 'fastify';
import cors from '@fastify/cors';
import { readFileSync } from 'fs';
import { privateKeyToAccount } from 'viem/accounts';
import { createConfig } from './config.js';
import { CoopClient } from './coop.js';
import { getPublicKey, encryptNeuroData, decryptNeuroData } from './crypto.js';
import { initStoracha, uploadEncrypted, computeDataHash, getGatewayUrl } from './storacha.js';
import { parseEegMetadata, deidentifyEeg, generateDataSummary } from './eeg.js';
import { generateCoopReceipt } from './receipt.js';
import { getDashboardHtml } from './dashboard.js';
import { DataCategory, PROPOSAL_STATUS_LABELS } from './types.js';
import type { EncryptedUpload, ConsentReceipt } from './types.js';

async function main() {
  const config = createConfig();

  if (!config.ownerPrivateKey) {
    console.error('OWNER_PRIVATE_KEY is required');
    process.exit(1);
  }
  if (!config.coopAddress) {
    console.error('COOP_ADDRESS is required — deploy NeuroCoop.sol first');
    process.exit(1);
  }

  // --- Initialize ---
  console.log('=== NeuroCoop ===');
  console.log('Neural Data Cooperative Protocol');
  console.log('Collective governance of neural data at the intersection of');
  console.log('cognition, coordination, and computation.');
  console.log('');

  const coop = new CoopClient(config);
  const ownerAddress = coop.registerWallet(config.ownerPrivateKey);
  const ownerPublicKey = getPublicKey(config.ownerPrivateKey);

  console.log(`[flow] Deployer: ${ownerAddress}`);
  console.log(`[flow] Contract: ${config.coopAddress}`);
  console.log(`[flow] Chain: Flow EVM Testnet (${config.flowChainId})`);
  console.log(`[crypto] ECIES (secp256k1 + AES-256-CBC)`);

  const balance = await coop.getBalance(ownerAddress);
  console.log(`[flow] Balance: ${balance} FLOW`);

  let storachaClient: Awaited<ReturnType<typeof initStoracha>> | null = null;
  try {
    storachaClient = await initStoracha(config.storachaEmail);
  } catch (err) {
    console.error(`[storacha] Init failed: ${err instanceof Error ? err.message : err}`);
    console.warn('[storacha] Continuing without Storacha');
  }

  // --- State ---
  const uploads = new Map<string, EncryptedUpload>();
  const encryptionCache = new Map<string, string>();
  const receipts = new Map<number, ConsentReceipt>();
  const registeredWallets = new Map<string, string>(); // address -> privateKey
  registeredWallets.set(ownerAddress.toLowerCase(), config.ownerPrivateKey);
  const startTime = Date.now();

  // --- Server ---
  const server = Fastify({ logger: false, bodyLimit: 2_097_152 });
  await server.register(cors, { origin: true });

  server.get('/', async (_req, reply) => {
    reply.type('text/html').send(getDashboardHtml(config.coopAddress, ownerAddress));
  });

  server.get('/health', async () => {
    const mc = await coop.getMemberCount().catch(() => 0);
    const pc = await coop.getProposalCount().catch(() => 0);
    return {
      status: 'ok',
      project: 'NeuroCoop — Neural Data Cooperative Protocol',
      track: 'Neurotech: cognition × coordination × computation',
      uptime: Math.floor((Date.now() - startTime) / 1000),
      contract: config.coopAddress,
      chain: 'Flow EVM Testnet (545)',
      encryption: 'ECIES (secp256k1 + AES-256-CBC)',
      storage: storachaClient ? 'Storacha (IPFS/Filecoin)' : 'local',
      cooperative: { members: mc, proposals: pc },
      framework: {
        neurorights: 'Neurorights Foundation 5 Rights (Yuste et al.)',
        governance: 'One member, one vote (cognitive equality)',
        legislation: ['Chile 2021', 'Colorado HB 24-1058', 'California SB 1223'],
        standards: ['UNESCO Nov 2025', 'IEEE P7700'],
      },
    };
  });

  /**
   * POST /join — Upload EEG data and join the cooperative.
   * Pipeline: Raw EEG → De-identify → Encrypt → Store on Storacha → Join on Flow EVM
   */
  server.post<{
    Body: { privateKey: string; data?: string; filename?: string; deidentify?: boolean; noiseEpsilon?: number };
  }>('/join', async (req, reply) => {
    try {
      const { privateKey } = req.body;
      if (!privateKey) { reply.code(400); return { error: 'Required: privateKey' }; }

      const memberAddress = coop.registerWallet(privateKey as `0x${string}`);
      registeredWallets.set(memberAddress.toLowerCase(), privateKey);
      const pubKey = getPublicKey(privateKey);

      // Load EEG data
      let rawData: string;
      let filename: string;
      if (req.body.data) {
        rawData = req.body.data;
        filename = req.body.filename || 'upload.csv';
      } else {
        rawData = readFileSync(new URL('../sample-data/sample-eeg.csv', import.meta.url), 'utf-8');
        filename = 'sample-eeg.csv';
      }

      const metadata = parseEegMetadata(rawData);
      const shouldDeidentify = req.body.deidentify !== false;
      let processedData = rawData;
      let modifications: string[] = [];

      if (shouldDeidentify) {
        const result = deidentifyEeg(rawData, { addNoise: true, noiseEpsilon: req.body.noiseEpsilon || 1.0 });
        processedData = result.data;
        modifications = result.modifications;
      }

      const timestamp = Math.floor(Date.now() / 1000);
      const dataId = coop.generateDataId(memberAddress, filename, timestamp);
      const dataHash = computeDataHash(new TextEncoder().encode(processedData));
      const { encrypted } = await encryptNeuroData(pubKey, processedData);

      let storachaCid: string;
      if (storachaClient) {
        try {
          storachaCid = await uploadEncrypted(storachaClient, new TextEncoder().encode(encrypted), filename);
        } catch (stErr) {
          console.warn(`[storacha] Upload failed, using local fallback: ${stErr instanceof Error ? stErr.message : stErr}`);
          storachaCid = `local:${dataHash.substring(0, 16)}`;
        }
      } else {
        storachaCid = `local:${dataHash.substring(0, 16)}`;
      }

      const txHash = await coop.joinCooperative(
        memberAddress, dataId, storachaCid, dataHash,
        metadata.channelCount, metadata.sampleRate, shouldDeidentify
      );

      uploads.set(dataId, {
        dataId, storachaCid, dataHash, txHash, owner: memberAddress, filename,
        channelCount: metadata.channelCount, sampleRate: metadata.sampleRate,
        deidentified: shouldDeidentify, timestamp,
      });
      encryptionCache.set(memberAddress.toLowerCase(), encrypted);

      const summary = generateDataSummary(rawData);

      return {
        success: true,
        member: memberAddress,
        dataId, storachaCid, dataHash, txHash,
        explorerUrl: `https://evm-testnet.flowscan.io/tx/${txHash}`,
        metadata: { channels: metadata.channels, channelCount: metadata.channelCount, sampleRate: metadata.sampleRate },
        deidentification: shouldDeidentify ? { modifications, epsilon: req.body.noiseEpsilon || 1.0 } : null,
        summary,
      };
    } catch (err) {
      reply.code(500);
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  /**
   * POST /proposal — Researcher submits a research proposal.
   */
  server.post<{
    Body: { privateKey: string; purpose: string; description: string; durationDays: number; categories?: number[] };
  }>('/proposal', async (req, reply) => {
    try {
      const { privateKey, purpose, description, durationDays } = req.body;
      if (!privateKey || !purpose || !description || !durationDays) {
        reply.code(400);
        return { error: 'Required: privateKey, purpose, description, durationDays' };
      }

      const researcherAddress = coop.registerWallet(privateKey as `0x${string}`);
      const categories = req.body.categories?.length
        ? req.body.categories
        : [DataCategory.PROCESSED_FEATURES, DataCategory.INFERENCES];

      const { txHash, proposalId } = await coop.submitProposal(
        researcherAddress, purpose, description, durationDays, categories
      );

      return {
        success: true,
        proposalId,
        researcher: researcherAddress,
        purpose, description, durationDays,
        categories: categories.map(c => ({ id: c, label: ['Raw EEG', 'Processed Features', 'ML Inferences', 'Metadata'][c] })),
        txHash,
        explorerUrl: `https://evm-testnet.flowscan.io/tx/${txHash}`,
        message: 'Proposal submitted. Cooperative members can now vote.',
      };
    } catch (err) {
      reply.code(500);
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  /**
   * POST /vote — Member votes on a proposal. One member = one vote.
   */
  server.post<{
    Body: { privateKey: string; proposalId: number; support: boolean };
  }>('/vote', async (req, reply) => {
    try {
      const { privateKey, proposalId, support } = req.body;
      if (!privateKey || proposalId === undefined || support === undefined) {
        reply.code(400);
        return { error: 'Required: privateKey, proposalId, support (boolean)' };
      }

      const voterAddress = coop.registerWallet(privateKey as `0x${string}`);
      const txHash = await coop.vote(voterAddress, proposalId, support);

      const proposal = await coop.getProposal(proposalId);

      return {
        success: true,
        voter: voterAddress,
        proposalId,
        support,
        currentTally: { for: proposal.votesFor, against: proposal.votesAgainst },
        txHash,
        explorerUrl: `https://evm-testnet.flowscan.io/tx/${txHash}`,
      };
    } catch (err) {
      reply.code(500);
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  /**
   * POST /execute — Execute a proposal after voting. Grants or denies access.
   */
  server.post<{
    Body: { privateKey: string; proposalId: number };
  }>('/execute', async (req, reply) => {
    try {
      const { privateKey, proposalId } = req.body;
      if (!privateKey || proposalId === undefined) {
        reply.code(400);
        return { error: 'Required: privateKey, proposalId' };
      }

      const callerAddress = coop.registerWallet(privateKey as `0x${string}`);
      const txHash = await coop.executeProposal(callerAddress, proposalId);
      const proposal = await coop.getProposal(proposalId);

      const approved = proposal.status === 3; // Executed
      let receipt: ConsentReceipt | null = null;

      if (approved) {
        receipt = generateCoopReceipt({
          proposal,
          executionTxHash: txHash,
          storachaCid: '',
          contractAddress: config.coopAddress,
        });

        if (storachaClient) {
          try {
            const receiptBytes = new TextEncoder().encode(JSON.stringify(receipt, null, 2));
            const receiptCid = await uploadEncrypted(storachaClient, receiptBytes, `receipt-proposal-${proposalId}.json`);
            receipt.proofs.storachaCid = receiptCid;
          } catch (stErr) {
            console.warn(`[storacha] Receipt upload failed: ${stErr instanceof Error ? stErr.message : stErr}`);
          }
        }

        receipts.set(proposalId, receipt);
      }

      return {
        success: true,
        proposalId,
        outcome: approved ? 'APPROVED — access granted' : 'REJECTED — access denied',
        votes: { for: proposal.votesFor, against: proposal.votesAgainst, total: proposal.totalVoters },
        accessExpiresAt: approved && proposal.accessExpiresAt > 0
          ? new Date(proposal.accessExpiresAt * 1000).toISOString()
          : null,
        txHash,
        explorerUrl: `https://evm-testnet.flowscan.io/tx/${txHash}`,
        receipt,
      };
    } catch (err) {
      reply.code(500);
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  /**
   * POST /decrypt — Researcher accesses pooled data if proposal was approved.
   */
  server.post<{
    Body: { proposalId: number };
  }>('/decrypt', async (req, reply) => {
    try {
      const { proposalId } = req.body;
      if (proposalId === undefined) {
        reply.code(400);
        return { success: false, error: 'Required: proposalId' };
      }

      const hasAccess = await coop.hasAccess(proposalId);
      if (!hasAccess) {
        const proposal = await coop.getProposal(proposalId);
        reply.code(403);
        return {
          success: false,
          error: proposal.status === 2
            ? 'Proposal was REJECTED by the cooperative. Access denied.'
            : proposal.accessExpiresAt > 0 && Date.now() / 1000 > proposal.accessExpiresAt
              ? 'Access has EXPIRED.'
              : 'Proposal has not been approved yet.',
          proposalId,
          status: PROPOSAL_STATUS_LABELS[proposal.status],
        };
      }

      // Collect all member data
      const memberAddresses = await coop.getMemberList();
      const pooledData: { member: string; data: string }[] = [];

      for (const addr of memberAddresses) {
        const encrypted = encryptionCache.get(addr.toLowerCase());
        if (!encrypted) continue;

        const memberKey = registeredWallets.get(addr.toLowerCase());
        if (!memberKey) continue;

        const decrypted = await decryptNeuroData(memberKey, encrypted);
        pooledData.push({ member: addr.slice(0, 10) + '...', data: decrypted });
      }

      const proposal = await coop.getProposal(proposalId);

      return {
        success: true,
        proposalId,
        purpose: proposal.purpose,
        accessExpiresAt: new Date(proposal.accessExpiresAt * 1000).toISOString(),
        pooledData,
        totalMembers: pooledData.length,
        message: `Access granted via cooperative vote (${proposal.votesFor}-${proposal.votesAgainst}). Data from ${pooledData.length} members.`,
      };
    } catch (err) {
      reply.code(500);
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // --- View Endpoints ---

  server.get('/proposals', async () => {
    const count = await coop.getProposalCount();
    const proposals = [];
    for (let i = 0; i < count; i++) {
      proposals.push(await coop.getProposal(i));
    }
    return { proposals, total: count };
  });

  server.get<{ Params: { id: string } }>('/proposal/:id', async (req) => {
    const proposal = await coop.getProposal(parseInt(req.params.id));
    const hasAccess = await coop.hasAccess(parseInt(req.params.id));
    return { proposal, hasAccess, receipt: receipts.get(parseInt(req.params.id)) || null };
  });

  server.get('/members', async () => {
    const addresses = await coop.getMemberList();
    const members = [];
    for (const addr of addresses) {
      const m = await coop.getMember(addr);
      if (m) members.push(m);
    }
    return { members, total: members.length };
  });

  server.get('/events', async () => ({
    events: coop.events.slice(-50),
    total: coop.events.length,
  }));

  // --- Start ---
  await server.listen({ port: config.port, host: '0.0.0.0' });
  console.log(`\n[server] NeuroCoop running at http://localhost:${config.port}`);

  async function shutdown(signal: string) {
    console.log(`\n[server] ${signal}, shutting down...`);
    await server.close();
    process.exit(0);
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
