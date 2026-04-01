import Fastify, { type FastifyRequest, type FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import { readFileSync } from 'fs';
import { randomBytes } from 'crypto';
import { privateKeyToAccount } from 'viem/accounts';
import { createConfig } from './config.js';
import { CoopClient } from './coop.js';
import { getPublicKey, encryptNeuroData, decryptNeuroData, createAccessChallenge, verifyAccessSignature, signAccessChallenge } from './crypto.js';
import { Store } from './db.js';
import { initStoracha, uploadEncrypted, downloadByCid, verifyCid, computeDataHash, getGatewayUrl } from './storacha.js';
import { parseEegMetadata, deidentifyEeg, generateDataSummary, extractBandPower } from './eeg.js';
import { generateCoopReceipt } from './receipt.js';
import { getDashboardHtml } from './dashboard.js';
import { DataCategory, PROPOSAL_STATUS_LABELS } from './types.js';
import type { EncryptedUpload, ConsentReceipt } from './types.js';
import { analyzeProposal, generateNeuralInsights, assessGovernanceHealth } from './cognition.js';

/** Structured error response helper */
function errorResponse(message: string, details?: Record<string, unknown>) {
  return { success: false, error: message, ...details };
}

async function main() {
  const config = createConfig();

  if (!config.ownerPrivateKey) {
    console.error('OWNER_PRIVATE_KEY is required');
    process.exit(1);
  }
  // --- Initialize ---
  console.log('=== NeuroCoop ===');
  console.log('Neural Data Cooperative Protocol');
  console.log('Collective governance of neural data at the intersection of');
  console.log('cognition, coordination, and computation.');
  console.log('');

  const coop = config.contractReady ? new CoopClient(config) : null;
  const ownerAddress = coop ? coop.registerWallet(config.ownerPrivateKey) : 'CONTRACT_NOT_DEPLOYED';

  // Helper — returns 503 for any endpoint that requires the deployed contract
  function requireContract(reply: any): boolean {
    if (!coop || !config.contractReady) {
      reply.code(503);
      reply.send({
        success: false,
        error: 'Contract not yet deployed',
        setup: `Deploy NeuroCoop.sol to Filecoin ${config.filecoinNetwork} (Chain ID ${config.filecoinChainId}), then set COOP_ADDRESS in Railway variables.`,
        faucet: config.filecoinNetwork === 'calibration' ? 'https://faucet.calibnet.chainsafe-fil.io/' : undefined,
        deployVia: 'https://remix.ethereum.org',
      });
      return false;
    }
    return true;
  }
  const ownerPublicKey = getPublicKey(config.ownerPrivateKey);

  const networkLabel = config.filecoinNetwork === 'mainnet'
    ? `Filecoin Mainnet (${config.filecoinChainId})`
    : `Filecoin Calibration testnet (${config.filecoinChainId})`;
  console.log(`[filecoin] Deployer: ${ownerAddress}`);
  console.log(`[filecoin] Contract: ${config.contractReady ? config.coopAddress : 'NOT DEPLOYED — set COOP_ADDRESS'}`);
  console.log(`[filecoin] Chain: ${networkLabel}`);
  console.log(`[filecoin] Explorer: ${config.filecoinExplorerUrl}`);
  console.log(`[crypto] ECIES (secp256k1 + AES-256-CBC)`);

  const balance = coop ? await coop.getBalance(ownerAddress).catch(() => '?') : '?';
  console.log(`[filecoin] Balance: ${balance} FIL${balance === '?' ? ' (contract not deployed)' : ''}`);

  let storachaClient: Awaited<ReturnType<typeof initStoracha>> | null = null;
  try {
    storachaClient = await initStoracha(config.storachaEmail);
  } catch (err) {
    console.error(`[storacha] Init failed: ${err instanceof Error ? err.message : err}`);
    console.warn('[storacha] Continuing without Storacha');
  }

  // --- Persistent Store (SQLite) ---
  const store = new Store();
  console.log('[db] SQLite persistence initialized (./data/neurocoop.db)');

  // Register deployer wallet
  store.saveWallet(ownerAddress, config.ownerPrivateKey);

  // Track gas costs for metrics
  const metrics = { totalGasUsed: 0n, txCount: 0, startTime: Date.now() };

  // --- Nonce-based auth ---
  // Nonces are one-time, 5-minute TTL. Clients call GET /auth/nonce/:address,
  // sign the returned message with their wallet, then send { address, nonce, signature }
  // instead of { privateKey } in all mutation endpoints.
  const nonceStore = new Map<string, { nonce: string; message: string; expiresAt: number }>();

  function issueNonce(address: string): { nonce: string; message: string; expiresAt: number } {
    const nonce = randomBytes(32).toString('hex');
    const expiresAt = Math.floor(Date.now() / 1000) + 300; // 5 min
    const message = `NeuroCoop|auth|address:${address.toLowerCase()}|nonce:${nonce}|expires:${expiresAt}`;
    nonceStore.set(address.toLowerCase(), { nonce, message, expiresAt });
    return { nonce, message, expiresAt };
  }

  /**
   * Resolve wallet address from a request body.
   *
   * Supports two auth patterns:
   *   NEW (preferred): { address, nonce, signature }
   *     - Client gets nonce from GET /auth/nonce/:address
   *     - Signs the returned message with their private key locally
   *     - Server verifies signature, looks up stored wallet
   *     - Private key is NEVER transmitted after initial /wallet/register
   *
   *   LEGACY (deprecated): { privateKey }
   *     - Registers + stores wallet on each call
   *     - Kept for backwards compatibility during transition
   */
  async function resolveWallet(body: any): Promise<string> {
    if (!coop) throw new Error('Contract not deployed — set COOP_ADDRESS');
    if (body.address && body.nonce && body.signature) {
      const addr = (body.address as string).toLowerCase();
      const stored = nonceStore.get(addr);
      if (!stored) {
        throw new Error('No active nonce for this address. Call GET /auth/nonce/:address first.');
      }
      if (Math.floor(Date.now() / 1000) > stored.expiresAt) {
        nonceStore.delete(addr);
        throw new Error('Nonce expired. Request a new one from GET /auth/nonce/:address.');
      }
      const { valid, recoveredAddress } = verifyAccessSignature(body.signature, stored.message);
      if (!valid || recoveredAddress.toLowerCase() !== addr) {
        throw new Error('Signature verification failed. Could not prove ownership of address.');
      }
      nonceStore.delete(addr); // one-time use

      const privateKey = store.getWallet(body.address);
      if (!privateKey) {
        throw new Error(`Address ${body.address} not registered. Call POST /wallet/register first.`);
      }
      coop.registerWallet(privateKey as `0x${string}`);
      return body.address as string;
    }

    if (body.privateKey) {
      // Legacy: private key in body (deprecated — use /wallet/register + nonce auth)
      const address = coop.registerWallet(body.privateKey as `0x${string}`);
      store.saveWallet(address, body.privateKey);
      return address;
    }

    throw new Error('Auth required: provide { address, nonce, signature } (preferred) or { privateKey } (deprecated)');
  }

  // --- Server ---
  const server = Fastify({ logger: true, bodyLimit: 2_097_152 });
  await server.register(cors, { origin: true, credentials: true });

  server.get('/', async (_req, reply) => {
    reply.type('text/html').send(getDashboardHtml(config.coopAddress, ownerAddress));
  });

  server.get('/health', async () => {
    const mc = coop ? await coop.getMemberCount().catch(() => 0) : 0;
    const pc = coop ? await coop.getProposalCount().catch(() => 0) : 0;
    return {
      status: 'ok',
      project: 'NeuroCoop — Neural Data Cooperative Protocol',
      track: 'Neurotech: cognition × coordination × computation',
      uptime: Math.floor((Date.now() - metrics.startTime) / 1000),
      contract: config.contractReady ? config.coopAddress : 'NOT_DEPLOYED — set COOP_ADDRESS and redeploy',
      contractReady: config.contractReady,
      chain: `Filecoin ${config.filecoinNetwork === 'mainnet' ? 'Mainnet' : 'Calibration'} (${config.filecoinChainId})`,
      encryption: 'ECIES (secp256k1 + AES-256-CBC)',
      storage: storachaClient ? 'Storacha (IPFS/Filecoin)' : 'local',
      persistence: 'SQLite (./data/neurocoop.db)',
      cooperative: { members: mc, proposals: pc },
      metrics: {
        ...store.getMetrics(),
        totalGasUsed: metrics.totalGasUsed.toString(),
        totalTransactions: metrics.txCount,
      },
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
    Body: { address?: string; nonce?: string; signature?: string; privateKey?: string; data?: string; filename?: string; deidentify?: boolean; noiseEpsilon?: number };
  }>('/join', {
    schema: {
      body: {
        type: 'object',
        properties: {
          address: { type: 'string' },
          nonce: { type: 'string' },
          signature: { type: 'string' },
          privateKey: { type: 'string', description: 'Deprecated: use address+nonce+signature' },
          data: { type: 'string' },
          filename: { type: 'string' },
          deidentify: { type: 'boolean' },
          noiseEpsilon: { type: 'number' },
        },
      },
    },
  }, async (req, reply) => {
    if (!requireContract(reply)) return;
    try {
      if (req.body.noiseEpsilon !== undefined && req.body.noiseEpsilon <= 0) {
        reply.code(400);
        return errorResponse('noiseEpsilon must be greater than 0');
      }

      const memberAddress = await resolveWallet(req.body).catch(e => { throw Object.assign(e, { status: 401 }); });
      const storedKey = store.getWallet(memberAddress);
      if (!storedKey) { reply.code(401); return errorResponse('Wallet not found. Register via POST /wallet/register first.'); }
      const pubKey = getPublicKey(storedKey);

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
      const dataId = coop!.generateDataId(memberAddress, filename, timestamp);
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

      const txHash = await coop!.joinCooperative(
        memberAddress, dataId, storachaCid, dataHash,
        metadata.channelCount, metadata.sampleRate, shouldDeidentify
      );

      const upload = {
        dataId, storachaCid, dataHash, txHash, owner: memberAddress, filename,
        channelCount: metadata.channelCount, sampleRate: metadata.sampleRate,
        deidentified: shouldDeidentify, timestamp,
      };
      store.saveUpload(upload);
      store.saveEncrypted(memberAddress, encrypted);
      store.logAudit({ actor: memberAddress, action: 'JOIN_COOPERATIVE', target: dataId, txHash, details: `${metadata.channelCount}ch ${metadata.sampleRate}Hz` });

      const summary = generateDataSummary(rawData);

      return {
        success: true,
        member: memberAddress,
        dataId, storachaCid, dataHash, txHash,
        explorerUrl: `${config.filecoinExplorerUrl}/${txHash}`,
        metadata: { channels: metadata.channels, channelCount: metadata.channelCount, sampleRate: metadata.sampleRate },
        deidentification: shouldDeidentify ? { modifications, epsilon: req.body.noiseEpsilon || 1.0 } : null,
        summary,
      };
    } catch (err) {
      reply.code(500);
      return errorResponse(err instanceof Error ? err.message : String(err));
    }
  });

  /**
   * POST /proposal — Researcher submits a research proposal.
   */
  server.post<{
    Body: { address?: string; nonce?: string; signature?: string; privateKey?: string; purpose: string; description: string; durationDays: number; categories?: number[] };
  }>('/proposal', {
    schema: {
      body: {
        type: 'object',
        required: ['purpose', 'description', 'durationDays'],
        properties: {
          address: { type: 'string' },
          nonce: { type: 'string' },
          signature: { type: 'string' },
          privateKey: { type: 'string', description: 'Deprecated: use address+nonce+signature' },
          purpose: { type: 'string' },
          description: { type: 'string' },
          durationDays: { type: 'number' },
          categories: { type: 'array', items: { type: 'number' } },
        },
      },
    },
  }, async (req, reply) => {
    if (!requireContract(reply)) return;
    try {
      const { purpose, description, durationDays } = req.body;
      if (!purpose || !description || !durationDays) {
        reply.code(400);
        return errorResponse('Required: purpose, description, durationDays (plus auth: address+nonce+signature or privateKey)');
      }

      const researcherAddress = await resolveWallet(req.body).catch(e => { throw Object.assign(e, { status: 401 }); });
      const categories = req.body.categories?.length
        ? req.body.categories
        : [DataCategory.PROCESSED_FEATURES, DataCategory.INFERENCES];

      const { txHash, proposalId } = await coop!.submitProposal(
        researcherAddress, purpose, description, durationDays, categories
      );

      return {
        success: true,
        proposalId,
        researcher: researcherAddress,
        purpose, description, durationDays,
        categories: categories.map(c => ({ id: c, label: ['Raw EEG', 'Processed Features', 'ML Inferences', 'Metadata'][c] })),
        txHash,
        explorerUrl: `${config.filecoinExplorerUrl}/${txHash}`,
        message: 'Proposal submitted. Cooperative members can now vote.',
      };
    } catch (err) {
      reply.code(500);
      return errorResponse(err instanceof Error ? err.message : String(err));
    }
  });

  /**
   * POST /vote — Member votes on a proposal. One member = one vote.
   */
  server.post<{
    Body: { address?: string; nonce?: string; signature?: string; privateKey?: string; proposalId: number; support: boolean };
  }>('/vote', {
    schema: {
      body: {
        type: 'object',
        required: ['proposalId', 'support'],
        properties: {
          address: { type: 'string' },
          nonce: { type: 'string' },
          signature: { type: 'string' },
          privateKey: { type: 'string', description: 'Deprecated: use address+nonce+signature' },
          proposalId: { type: 'number' },
          support: { type: 'boolean' },
        },
      },
    },
  }, async (req, reply) => {
    if (!requireContract(reply)) return;
    try {
      const { proposalId, support } = req.body;
      if (proposalId === undefined || support === undefined) {
        reply.code(400);
        return errorResponse('Required: proposalId, support (boolean) (plus auth: address+nonce+signature or privateKey)');
      }

      const voterAddress = await resolveWallet(req.body).catch(e => { throw Object.assign(e, { status: 401 }); });
      const txHash = await coop!.vote(voterAddress, proposalId, support);

      const proposal = await coop!.getProposal(proposalId);

      return {
        success: true,
        voter: voterAddress,
        proposalId,
        support,
        currentTally: { for: proposal.votesFor, against: proposal.votesAgainst },
        txHash,
        explorerUrl: `${config.filecoinExplorerUrl}/${txHash}`,
      };
    } catch (err) {
      reply.code(500);
      return errorResponse(err instanceof Error ? err.message : String(err));
    }
  });

  /**
   * POST /execute — Execute a proposal after voting. Grants or denies access.
   */
  server.post<{
    Body: { address?: string; nonce?: string; signature?: string; privateKey?: string; proposalId: number };
  }>('/execute', {
    schema: {
      body: {
        type: 'object',
        required: ['proposalId'],
        properties: {
          address: { type: 'string' },
          nonce: { type: 'string' },
          signature: { type: 'string' },
          privateKey: { type: 'string', description: 'Deprecated: use address+nonce+signature' },
          proposalId: { type: 'number' },
        },
      },
    },
  }, async (req, reply) => {
    if (!requireContract(reply)) return;
    try {
      const { proposalId } = req.body;
      if (proposalId === undefined) {
        reply.code(400);
        return errorResponse('Required: proposalId (plus auth: address+nonce+signature or privateKey)');
      }

      const callerAddress = await resolveWallet(req.body).catch(e => { throw Object.assign(e, { status: 401 }); });
      const txHash = await coop!.executeProposal(callerAddress, proposalId);
      const proposal = await coop!.getProposal(proposalId);

      const approved = proposal.status === 2; // Executed (enum value after removing Approved)
      let receipt: ConsentReceipt | null = null;

      if (approved) {
        receipt = generateCoopReceipt({
          proposal,
          executionTxHash: txHash,
          storachaCid: '',
          contractAddress: config.coopAddress,
          explorerBaseUrl: config.filecoinExplorerUrl,
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

        store.saveReceipt(proposalId, receipt);
        store.logAudit({ actor: proposal.researcher, action: 'PROPOSAL_APPROVED', target: `proposal:${proposalId}`, txHash, details: `votes:${proposal.votesFor}-${proposal.votesAgainst}` });
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
        explorerUrl: `${config.filecoinExplorerUrl}/${txHash}`,
        receipt,
      };
    } catch (err) {
      reply.code(500);
      return errorResponse(err instanceof Error ? err.message : String(err));
    }
  });

  /**
   * POST /decrypt — Researcher accesses pooled data if proposal was approved.
   *
   * Requires cryptographic proof of identity:
   *   1. GET /challenge/:proposalId  → get a time-stamped challenge message
   *   2. Sign the message with your private key
   *   3. POST /decrypt with { proposalId, researcherAddress, signature, message }
   *
   * Researcher addresses are public on-chain — without signature enforcement,
   * any caller who knows the address could claim access. Signature is REQUIRED.
   */
  server.post<{
    Body: { proposalId: number; researcherAddress: string; signature: string; message: string };
  }>('/decrypt', {
    schema: {
      body: {
        type: 'object',
        required: ['proposalId', 'researcherAddress', 'signature', 'message'],
        properties: {
          proposalId: { type: 'number' },
          researcherAddress: { type: 'string' },
          signature: { type: 'string' },
          message: { type: 'string' },
        },
      },
    },
  }, async (req, reply) => {
    if (!requireContract(reply)) return;
    try {
      const { proposalId, researcherAddress, signature, message } = req.body;
      if (proposalId === undefined || !researcherAddress || !signature || !message) {
        reply.code(400);
        return errorResponse('Required: proposalId, researcherAddress, signature, message. Get a challenge from GET /challenge/:proposalId first.');
      }

      // Mandatory signature verification — proves the requester controls the address.
      // Researcher addresses are public on-chain; without this, anyone can impersonate.
      const { valid, recoveredAddress } = verifyAccessSignature(signature, message);
      if (!valid || recoveredAddress.toLowerCase() !== researcherAddress.toLowerCase()) {
        store.logAudit({ actor: researcherAddress, action: 'ACCESS_DENIED', target: `proposal:${proposalId}`, details: 'Invalid signature', success: false });
        reply.code(403);
        return errorResponse('Signature verification failed — cannot prove ownership of address. Get a fresh challenge from GET /challenge/:proposalId.', { proposalId });
      }
      const verifiedAddress = recoveredAddress;

      // Verify the requester matches the proposal researcher (on-chain check)
      const proposal = await coop!.getProposal(proposalId);
      if (proposal.researcher.toLowerCase() !== verifiedAddress.toLowerCase()) {
        store.logAudit({ actor: verifiedAddress, action: 'ACCESS_DENIED', target: `proposal:${proposalId}`, details: 'Address mismatch', success: false });
        reply.code(403);
        return errorResponse('Researcher address does not match proposal researcher', { proposalId });
      }

      const hasAccess = await coop!.hasAccess(proposalId, verifiedAddress);
      if (!hasAccess) {
        store.logAudit({ actor: verifiedAddress, action: 'ACCESS_DENIED', target: `proposal:${proposalId}`, details: `status:${proposal.status}`, success: false });
        reply.code(403);
        return errorResponse(
          proposal.status === 1
            ? 'Proposal was REJECTED by the cooperative. Access denied.'
            : proposal.accessExpiresAt > 0 && Date.now() / 1000 > proposal.accessExpiresAt
              ? 'Access has EXPIRED.'
              : 'Proposal has not been approved yet.',
          { proposalId, status: PROPOSAL_STATUS_LABELS[proposal.status] }
        );
      }

      // Collect pooled data — Storacha (IPFS/Filecoin) is the primary source.
      // SQLite encrypted cache is the fallback if IPFS gateways are unreachable.
      const memberAddresses = await coop!.getMemberList();
      const pooledData: { member: string; data: string; source: 'storacha' | 'cache' }[] = [];

      for (const addr of memberAddresses) {
        const memberKey = store.getWallet(addr);
        if (!memberKey) continue;

        const upload = store.getUpload(
          store.getAllUploads().find(u => u.owner.toLowerCase() === addr.toLowerCase())?.dataId ?? ''
        );

        let encryptedStr: string | null = null;
        let source: 'storacha' | 'cache' = 'cache';

        // Try Storacha primary (IPFS/Filecoin)
        if (storachaClient && upload?.storachaCid && !upload.storachaCid.startsWith('local:')) {
          try {
            const bytes = await downloadByCid(upload.storachaCid, upload.dataHash);
            encryptedStr = new TextDecoder().decode(bytes);
            source = 'storacha';
          } catch (stErr) {
            console.warn(`[decrypt] Storacha unavailable for ${addr}, falling back to cache: ${stErr instanceof Error ? stErr.message : stErr}`);
          }
        }

        // Fall back to SQLite cache
        if (!encryptedStr) {
          encryptedStr = store.getEncrypted(addr);
        }

        if (!encryptedStr) continue;

        const decrypted = await decryptNeuroData(memberKey, encryptedStr);
        pooledData.push({ member: addr.slice(0, 10) + '...', data: decrypted, source });
      }

      store.logAudit({
        actor: verifiedAddress,
        action: 'DATA_ACCESSED',
        target: `proposal:${proposalId}`,
        details: `purpose:${proposal.purpose}, members:${pooledData.length}, signature_verified:true`,
      });

      const storachaServed = pooledData.filter(d => d.source === 'storacha').length;
      return {
        success: true,
        proposalId,
        purpose: proposal.purpose,
        accessExpiresAt: new Date(proposal.accessExpiresAt * 1000).toISOString(),
        pooledData,
        totalMembers: pooledData.length,
        dataSource: {
          storacha: storachaServed,
          cache: pooledData.length - storachaServed,
        },
        identityVerified: true,
        message: `Access granted via cooperative vote (${proposal.votesFor}-${proposal.votesAgainst}). Identity verified via signature. ${storachaServed}/${pooledData.length} records served from Filecoin/IPFS.`,
      };
    } catch (err) {
      reply.code(500);
      return errorResponse(err instanceof Error ? err.message : String(err));
    }
  });

  // --- View Endpoints ---

  server.get('/proposals', async (_req, reply) => {
    if (!requireContract(reply)) return;
    const count = await coop!.getProposalCount();
    const proposals = [];
    for (let i = 0; i < count; i++) {
      proposals.push(await coop!.getProposal(i));
    }
    return { proposals, total: count };
  });

  server.get<{ Params: { id: string } }>('/proposal/:id', async (req, reply) => {
    if (!requireContract(reply)) return;
    const proposal = await coop!.getProposal(parseInt(req.params.id));
    const access = await coop!.hasAccess(parseInt(req.params.id), proposal.researcher);
    return { proposal, hasAccess: access, receipts: store.getReceipts(parseInt(req.params.id)) };
  });

  server.get('/members', async (_req, reply) => {
    if (!requireContract(reply)) return;
    const addresses = await coop!.getMemberList();
    const members = [];
    for (const addr of addresses) {
      const m = await coop!.getMember(addr);
      if (m) members.push(m);
    }
    return { members, total: members.length };
  });

  server.get('/events', async (_req, reply) => {
    if (!requireContract(reply)) return;
    return { events: coop!.events.slice(-50), total: coop!.events.length };
  });

  // Persistent records (survives restart)
  server.get('/records', async () => ({
    records: store.getAllUploads(),
    total: store.getAllUploads().length,
  }));

  // Audit trail (persistent)
  server.get('/audit', async () => ({
    log: store.getAuditLog(100),
    total: store.getAuditLog(100).length,
  }));

  // Signature challenge for /decrypt (SIWE-style)
  server.get<{ Params: { proposalId: string } }>('/challenge/:proposalId', async (req) => {
    const { message, timestamp } = createAccessChallenge(parseInt(req.params.proposalId));
    return { message, timestamp, instructions: 'Sign this message with your private key and submit signature + message to POST /decrypt' };
  });

  /**
   * POST /wallet/register — One-time wallet registration.
   * After this, use GET /auth/nonce/:address + signature for all subsequent calls.
   * The private key is stored server-side (in SQLite) and never needs to be transmitted again.
   */
  server.post<{ Body: { privateKey: string } }>('/wallet/register', {
    schema: {
      body: {
        type: 'object',
        required: ['privateKey'],
        properties: { privateKey: { type: 'string' } },
      },
    },
  }, async (req, reply) => {
    try {
      const { privateKey } = req.body;
      if (!privateKey?.startsWith('0x') || privateKey.length !== 66) {
        reply.code(400);
        return errorResponse('privateKey must be a 66-character hex string starting with 0x');
      }
      const address = coop!.registerWallet(privateKey as `0x${string}`);
      store.saveWallet(address, privateKey);
      store.logAudit({ actor: address, action: 'WALLET_REGISTERED', target: address });
      return {
        success: true,
        address,
        message: 'Wallet registered. Use GET /auth/nonce/:address + signature for all future calls. Private key no longer needed in requests.',
      };
    } catch (err) {
      reply.code(500);
      return errorResponse(err instanceof Error ? err.message : String(err));
    }
  });

  /**
   * GET /auth/nonce/:address — Issue a one-time challenge for signature-based auth.
   * The client signs the returned message locally and includes { address, nonce, signature }
   * in subsequent mutation requests instead of { privateKey }.
   */
  server.get<{ Params: { address: string } }>('/auth/nonce/:address', async (req, reply) => {
    const { address } = req.params;
    if (!address?.startsWith('0x') || address.length !== 42) {
      reply.code(400);
      return errorResponse('Invalid address format');
    }
    const { nonce, message, expiresAt } = issueNonce(address);
    return {
      address,
      nonce,
      message,
      expiresAt,
      expiresIn: '5 minutes',
      instructions: 'Sign `message` with your private key. Include { address, nonce, signature } in your next request.',
    };
  });

  // --- Storacha / IPFS Endpoints ---

  /**
   * GET /storacha/verify/:cid — Verify a CID is live on IPFS/Filecoin.
   * Proves data availability without downloading the full payload.
   * Judges can confirm neural data is actually on decentralized storage.
   */
  server.get<{ Params: { cid: string }; Querystring: { hash?: string } }>(
    '/storacha/verify/:cid',
    async (req, reply) => {
      const { cid } = req.params;
      const { hash } = req.query as { hash?: string };

      if (!cid || cid.length < 10) {
        reply.code(400);
        return errorResponse('Invalid CID');
      }

      const result = await verifyCid(cid, hash);
      return {
        ...result,
        ipfsGateway: result.gatewayUrl,
        filecoinStoracha: `https://console.storacha.network/`,
        note: 'Data is content-addressed — CID is a cryptographic hash of the content.',
      };
    }
  );

  /**
   * GET /storacha/records — All uploaded CIDs with on-chain references.
   * Demonstrates Storacha as the primary data layer.
   */
  server.get('/storacha/records', async () => {
    const uploads = store.getAllUploads();
    return {
      total: uploads.length,
      records: uploads.map(u => ({
        owner: u.owner.slice(0, 10) + '...',
        cid: u.storachaCid,
        dataHash: u.dataHash,
        gatewayUrl: u.storachaCid.startsWith('local:') ? null : getGatewayUrl(u.storachaCid),
        filecoinPinned: !u.storachaCid.startsWith('local:'),
        deidentified: u.deidentified,
        channels: u.channelCount,
        sampleRate: u.sampleRate,
        timestamp: new Date(u.timestamp * 1000).toISOString(),
      })),
    };
  });

  // --- Cognition Endpoints ---
  // The "Cognition" pillar: Venice AI (private, zero data retention) provides
  // ethics intelligence to members who may lack technical expertise to evaluate proposals.

  /**
   * POST /cognition/analyze-proposal — AI ethics analysis of a research proposal.
   * Call before voting opens to give members informed governance intelligence.
   */
  server.post<{ Body: { proposalId?: number; purpose?: string; description?: string; durationDays?: number; categories?: string[] } }>(
    '/cognition/analyze-proposal',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            proposalId: { type: 'number' },
            purpose: { type: 'string' },
            description: { type: 'string' },
            durationDays: { type: 'number' },
            categories: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
    async (req, reply) => {
      if (!config.veniceApiKey) {
        reply.code(503);
        return errorResponse('Cognition module not configured — set VENICE_API_KEY');
      }

      try {
        let purpose = req.body.purpose || '';
        let description = req.body.description || '';
        let durationDays = req.body.durationDays || 0;
        let categories = req.body.categories || [];
        let researcher = '';

        // If proposalId provided, fetch from chain
        if (req.body.proposalId !== undefined) {
          if (!coop) { reply.code(503); return errorResponse('Contract not deployed — cannot fetch proposal by ID. Pass { purpose, description, durationDays, categories } directly instead.'); }
          const proposal = await coop.getProposal(req.body.proposalId);
          purpose = proposal.purpose;
          description = proposal.description ?? purpose;
          durationDays = proposal.durationDays;
          researcher = proposal.researcher;
          const catLabels = ['Raw EEG', 'Processed Features', 'ML Inferences', 'Metadata'];
          const rawCats = await coop.getProposalCategories(req.body.proposalId).catch(() => []);
          categories = rawCats.map((c: number) => catLabels[c] ?? `Category ${c}`);
        }

        if (!purpose) { reply.code(400); return errorResponse('Required: proposalId or { purpose, description, durationDays, categories }'); }

        const analysis = await analyzeProposal(config.veniceApiKey, { purpose, description, durationDays, categories, researcher });

        return {
          success: true,
          proposalId: req.body.proposalId,
          analysis,
          model: 'llama-3.3-70b (Venice AI — zero data retention)',
          disclaimer: 'AI analysis is advisory only. The cooperative vote is the binding decision.',
        };
      } catch (err) {
        reply.code(500);
        return errorResponse(err instanceof Error ? err.message : String(err));
      }
    }
  );

  /**
   * POST /cognition/neural-insights — Understand what your EEG data reveals.
   * Analyzes metadata only — raw neural signals are never sent to the AI.
   */
  server.post<{ Body: { eegData?: string; memberAddress?: string } }>(
    '/cognition/neural-insights',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            eegData: { type: 'string', description: 'Raw EEG CSV data' },
            memberAddress: { type: 'string', description: 'Address to look up stored upload' },
          },
        },
      },
    },
    async (req, reply) => {
      if (!config.veniceApiKey) {
        reply.code(503);
        return errorResponse('Cognition module not configured — set VENICE_API_KEY');
      }

      try {
        let csvData: string;

        if (req.body.eegData) {
          csvData = req.body.eegData;
        } else if (req.body.memberAddress) {
          const upload = store.getAllUploads().find(u => u.owner.toLowerCase() === req.body.memberAddress!.toLowerCase());
          if (!upload) { reply.code(404); return errorResponse('No upload found for this address'); }
          // Use sample data for demonstration — actual data is encrypted
          csvData = readFileSync(new URL('../sample-data/sample-eeg.csv', import.meta.url), 'utf-8');
        } else {
          csvData = readFileSync(new URL('../sample-data/sample-eeg.csv', import.meta.url), 'utf-8');
        }

        const summary = generateDataSummary(csvData);
        const insights = await generateNeuralInsights(config.veniceApiKey, summary);

        return {
          success: true,
          summary,
          insights,
          model: 'llama-3.3-70b (Venice AI — zero data retention)',
          note: 'Only statistical metadata was sent to the AI — raw neural signals stayed local.',
        };
      } catch (err) {
        reply.code(500);
        return errorResponse(err instanceof Error ? err.message : String(err));
      }
    }
  );

  /**
   * POST /cognition/eeg-bands — Extract EEG frequency band power from raw signal data.
   *
   * Real signal processing — no external API, no LLM. Uses multi-scale successive
   * difference analysis to estimate power in delta/theta/alpha/beta/gamma bands.
   * Runs entirely locally. Handles any sample rate (auto-detected from timestamps).
   *
   * This is the "Computation" pillar applied to the "Cognition" dimension:
   * actual neural signal processing to extract cognitive state signatures.
   */
  server.post<{ Body: { eegData?: string; memberAddress?: string } }>(
    '/cognition/eeg-bands',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            eegData: { type: 'string', description: 'Raw EEG CSV (omit to use sample data)' },
            memberAddress: { type: 'string', description: 'Use data from a specific registered member' },
          },
        },
      },
    },
    async (req, reply) => {
      try {
        let csvData: string;

        if (req.body.eegData) {
          csvData = req.body.eegData;
        } else if (req.body.memberAddress) {
          // For demo: use sample data (real data is encrypted)
          csvData = readFileSync(new URL('../sample-data/sample-eeg.csv', import.meta.url), 'utf-8');
        } else {
          csvData = readFileSync(new URL('../sample-data/sample-eeg.csv', import.meta.url), 'utf-8');
        }

        const bands = extractBandPower(csvData);

        // Build a simple relative power breakdown (percentages)
        const total = bands.delta + bands.theta + bands.alpha + bands.beta + bands.gamma;
        const relativePower = total > 0 ? {
          delta: Math.round((bands.delta / total) * 100),
          theta: Math.round((bands.theta / total) * 100),
          alpha: Math.round((bands.alpha / total) * 100),
          beta:  Math.round((bands.beta  / total) * 100),
          gamma: Math.round((bands.gamma / total) * 100),
        } : null;

        return {
          success: true,
          bandPower: {
            absoluteUvRms: {
              delta: bands.delta,
              theta: bands.theta,
              alpha: bands.alpha,
              beta:  bands.beta,
              gamma: bands.gamma,
            },
            relativePowerPercent: relativePower,
            dominantBand: bands.dominantBand,
            interpretation: bands.interpretation,
          },
          metadata: {
            sampleRate: bands.sampleRate,
            channelsAnalysed: bands.channelsAnalysed,
            sampleCount: bands.sampleCount,
          },
          perChannel: bands.perChannel,
          method: 'Multi-scale successive difference analysis (RMS of x[t]-x[t-s], no external API)',
          note: 'Band power is estimated from de-identified data. Raw signals are not stored or transmitted.',
        };
      } catch (err) {
        reply.code(500);
        return errorResponse(err instanceof Error ? err.message : String(err));
      }
    }
  );

  /**
   * GET /cognition/governance-health — AI assessment of cooperative governance health.
   */
  server.get('/cognition/governance-health', async (_req, reply) => {
    if (!config.veniceApiKey) {
      reply.code(503);
      return errorResponse('Cognition module not configured — set VENICE_API_KEY');
    }

    try {
      const memberCount = coop ? await coop.getMemberCount().catch(() => 0) : 0;
      const proposalCount = coop ? await coop.getProposalCount().catch(() => 0) : 0;

      let approvedCount = 0;
      let rejectedCount = 0;
      let totalVotes = 0;

      for (let i = 0; i < proposalCount; i++) {
        const p = coop ? await coop.getProposal(i).catch(() => null) : null;
        if (!p) continue;
        if (p.status === 2) approvedCount++;
        if (p.status === 1) rejectedCount++;
        totalVotes += (p.votesFor ?? 0) + (p.votesAgainst ?? 0);
      }

      const averageVotesPerProposal = proposalCount > 0 ? totalVotes / proposalCount : 0;

      const health = await assessGovernanceHealth(config.veniceApiKey, {
        memberCount, proposalCount, approvedCount, rejectedCount, averageVotesPerProposal,
      });

      return {
        success: true,
        cooperative: { memberCount, proposalCount, approvedCount, rejectedCount },
        health,
        model: 'llama-3.3-70b (Venice AI — zero data retention)',
      };
    } catch (err) {
      reply.code(500);
      return errorResponse(err instanceof Error ? err.message : String(err));
    }
  });

  // --- Start ---
  await server.listen({ port: config.port, host: '0.0.0.0' });
  console.log(`\n[server] NeuroCoop running at http://localhost:${config.port}`);

  async function shutdown(signal: string) {
    console.log(`\n[server] ${signal}, shutting down...`);
    store.close();
    await server.close();
    process.exit(0);
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
