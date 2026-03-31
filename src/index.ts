import Fastify from 'fastify';
import cors from '@fastify/cors';
import { readFileSync } from 'fs';
import { createConfig } from './config.js';
import { ConsentClient } from './consent.js';
import { initLit, encryptData, decryptData, disconnectLit } from './lit.js';
import { initStoracha, uploadEncrypted, computeDataHash, getGatewayUrl } from './storacha.js';
import { parseEegMetadata, deidentifyEeg, generateDataSummary } from './eeg.js';
import { generateConsentReceipt } from './receipt.js';
import { getDashboardHtml } from './dashboard.js';
import { DataCategory } from './types.js';
import type { EncryptedUpload, ConsentReceipt } from './types.js';

async function main() {
  const config = createConfig();

  if (!config.ownerPrivateKey) {
    console.error('OWNER_PRIVATE_KEY is required');
    process.exit(1);
  }

  if (!config.consentRegistryAddress) {
    console.error('CONSENT_REGISTRY_ADDRESS is required — deploy the contract first');
    process.exit(1);
  }

  // --- Initialize services ---
  console.log('=== NeuroConsent ===');
  console.log('Privacy-preserving consent framework for neural data');
  console.log('');

  const consent = new ConsentClient(config);
  console.log(`[flow] Owner wallet: ${consent.ownerAddress}`);
  console.log(`[flow] Contract: ${config.consentRegistryAddress}`);
  console.log(`[flow] Chain: Flow EVM Testnet (${config.flowChainId})`);

  const balance = await consent.getBalance();
  console.log(`[flow] Balance: ${balance} FLOW`);

  let litClient: Awaited<ReturnType<typeof initLit>> | null = null;
  try {
    litClient = await initLit(config.litNetwork);
  } catch (err) {
    console.error(`[lit] Failed to connect: ${err instanceof Error ? err.message : err}`);
    console.warn('[lit] Continuing without Lit — encryption will be simulated');
  }

  let storachaClient: Awaited<ReturnType<typeof initStoracha>> | null = null;
  try {
    storachaClient = await initStoracha(config.storachaEmail);
  } catch (err) {
    console.error(`[storacha] Failed to initialize: ${err instanceof Error ? err.message : err}`);
    console.warn('[storacha] Continuing without Storacha — uploads will be local only');
  }

  // --- In-memory state ---
  const uploads = new Map<string, EncryptedUpload>();
  const encryptionCache = new Map<string, { ciphertext: string; dataToEncryptHash: string }>();
  const receipts = new Map<string, ConsentReceipt[]>();
  const startTime = Date.now();

  // --- Fastify Server ---
  const server = Fastify({ logger: false, bodyLimit: 2_097_152 }); // 2MB for EEG files
  await server.register(cors, { origin: true });

  // Dashboard
  server.get('/', async (_req, reply) => {
    reply.type('text/html').send(getDashboardHtml(config.consentRegistryAddress, consent.ownerAddress));
  });

  // Health
  server.get('/health', async () => {
    const bal = await consent.getBalance().catch(() => 'unknown');
    let stats = { records: 0, consents: 0, accesses: 0 };
    try { stats = await consent.getStats(); } catch {}
    return {
      status: 'ok',
      uptime: Math.floor((Date.now() - startTime) / 1000),
      owner: consent.ownerAddress,
      balance: `${bal} FLOW`,
      contract: config.consentRegistryAddress,
      chain: `Flow EVM Testnet (${config.flowChainId})`,
      litConnected: !!litClient,
      storachaConnected: !!storachaClient,
      onChainStats: stats,
      localUploads: uploads.size,
      totalEvents: consent.events.length,
    };
  });

  // Upload EEG data with de-identification
  server.post<{
    Body: {
      data?: string;
      filename?: string;
      deidentify?: boolean;
      stripLabels?: boolean;
      noiseEpsilon?: number;
    };
  }>('/upload', async (req, reply) => {
    try {
      const body = req.body || {};
      let rawData: string;
      let filename: string;

      if (body.data) {
        rawData = body.data;
        filename = body.filename || 'upload.csv';
      } else {
        const samplePath = new URL('../sample-data/sample-eeg.csv', import.meta.url);
        rawData = readFileSync(samplePath, 'utf-8');
        filename = 'sample-eeg.csv';
      }

      // Parse EEG metadata
      const metadata = parseEegMetadata(rawData);
      console.log(`[eeg] Parsed: ${metadata.channelCount} channels, ${metadata.sampleRate}Hz, ${metadata.sampleCount} samples`);

      // De-identify if requested (default: true for privacy)
      const shouldDeidentify = body.deidentify !== false;
      let processedData = rawData;
      let deidentificationLog: string[] = [];

      if (shouldDeidentify) {
        const result = deidentifyEeg(rawData, {
          stripLabels: body.stripLabels,
          addNoise: true,
          noiseEpsilon: body.noiseEpsilon || 1.0,
        });
        processedData = result.data;
        deidentificationLog = result.modifications;
        console.log(`[eeg] De-identified: ${deidentificationLog.join(', ')}`);
      }

      const timestamp = Math.floor(Date.now() / 1000);
      const dataId = consent.generateDataId(consent.ownerAddress, filename, timestamp);
      const dataBytes = new TextEncoder().encode(processedData);
      const dataHash = computeDataHash(dataBytes);

      // Step 1: Encrypt with Lit Protocol
      let ciphertext: string;
      let dataToEncryptHash: string;

      if (litClient) {
        const encrypted = await encryptData(
          litClient, dataBytes, dataId,
          config.consentRegistryAddress, config.flowRpcUrl, config.flowChainId
        );
        ciphertext = encrypted.ciphertext;
        dataToEncryptHash = encrypted.dataToEncryptHash;
      } else {
        ciphertext = Buffer.from(dataBytes).toString('base64');
        dataToEncryptHash = dataHash;
        console.warn('[upload] Lit unavailable — using base64 fallback');
      }

      // Step 2: Upload encrypted data to Storacha
      let storachaCid: string;
      if (storachaClient) {
        storachaCid = await uploadEncrypted(storachaClient, new TextEncoder().encode(ciphertext), filename);
      } else {
        storachaCid = `local:${dataHash.substring(0, 16)}`;
        console.warn('[upload] Storacha unavailable — using local reference');
      }

      // Step 3: Register on Flow EVM
      const txHash = await consent.registerData(
        dataId, storachaCid, '', dataHash,
        metadata.channelCount, metadata.sampleRate, shouldDeidentify
      );

      // Cache
      const upload: EncryptedUpload = {
        dataId, storachaCid, receiptCid: '', dataHash, txHash,
        owner: consent.ownerAddress, filename,
        channelCount: metadata.channelCount, sampleRate: metadata.sampleRate,
        deidentified: shouldDeidentify, timestamp,
      };
      uploads.set(dataId, upload);
      encryptionCache.set(dataId, { ciphertext, dataToEncryptHash });

      // Generate data summary (non-revealing)
      const summary = generateDataSummary(rawData);

      return {
        success: true,
        dataId,
        storachaCid,
        storachaUrl: storachaClient ? getGatewayUrl(storachaCid) : null,
        dataHash,
        txHash,
        explorerUrl: `https://evm-testnet.flowscan.io/tx/${txHash}`,
        metadata: {
          channels: metadata.channels,
          channelCount: metadata.channelCount,
          sampleRate: metadata.sampleRate,
          duration: `${metadata.duration.toFixed(1)}s`,
          sampleCount: metadata.sampleCount,
        },
        deidentification: shouldDeidentify ? {
          applied: true,
          modifications: deidentificationLog,
        } : { applied: false },
        summary,
        timestamp,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[upload] Error: ${msg}`);
      reply.code(500);
      return { success: false, error: msg };
    }
  });

  // Grant purpose-limited, time-expiring consent
  server.post<{
    Body: {
      dataId: string;
      researcher: string;
      purpose: string;
      purposeDescription?: string;
      expiresAt?: number; // unix timestamp
      expiresInDays?: number;
      categories?: number[]; // DataCategory enum values
    };
  }>('/consent/grant', async (req, reply) => {
    try {
      const { dataId, researcher, purpose } = req.body;
      if (!dataId || !researcher || !purpose) {
        reply.code(400);
        return { error: 'Required: dataId, researcher, purpose' };
      }

      const categories = req.body.categories?.length
        ? req.body.categories
        : [DataCategory.PROCESSED_FEATURES, DataCategory.INFERENCES];

      let expiresAt = req.body.expiresAt || 0;
      if (!expiresAt && req.body.expiresInDays) {
        expiresAt = Math.floor(Date.now() / 1000) + (req.body.expiresInDays * 86400);
      }

      const txHash = await consent.grantConsent(
        dataId as `0x${string}`,
        researcher as `0x${string}`,
        purpose,
        expiresAt,
        categories
      );

      // Generate W3C consent receipt
      const upload = uploads.get(dataId);
      const receipt = generateConsentReceipt({
        dataId,
        dataOwner: consent.ownerAddress,
        researcher,
        purpose,
        purposeDescription: req.body.purposeDescription || purpose,
        categories,
        expiresAt,
        deidentified: upload?.deidentified ?? false,
        txHash,
        storachaCid: upload?.storachaCid || '',
        contractAddress: config.consentRegistryAddress,
      });

      // Store receipt on Storacha
      let receiptCid = '';
      if (storachaClient) {
        const receiptBytes = new TextEncoder().encode(JSON.stringify(receipt, null, 2));
        receiptCid = await uploadEncrypted(
          storachaClient,
          receiptBytes,
          `receipt-${receipt.receiptId}.json`
        );
        receipt.proofs.storachaCid = receiptCid;
      }

      // Track receipts locally
      if (!receipts.has(dataId)) receipts.set(dataId, []);
      receipts.get(dataId)!.push(receipt);

      return {
        success: true,
        txHash,
        explorerUrl: `https://evm-testnet.flowscan.io/tx/${txHash}`,
        consent: {
          purpose,
          categories: categories.map(c => ({ id: c, label: ['Raw EEG', 'Processed Features', 'Inferences', 'Metadata'][c] })),
          expiresAt: expiresAt > 0 ? new Date(expiresAt * 1000).toISOString() : 'never',
        },
        receipt,
        receiptCid: receiptCid || null,
        receiptUrl: receiptCid ? getGatewayUrl(receiptCid) : null,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      reply.code(500);
      return { success: false, error: msg };
    }
  });

  // Revoke consent with reason
  server.post<{ Body: { dataId: string; researcher: string; reason?: string } }>('/consent/revoke', async (req, reply) => {
    try {
      const { dataId, researcher, reason } = req.body;
      if (!dataId || !researcher) {
        reply.code(400);
        return { error: 'Required: dataId, researcher' };
      }

      const txHash = await consent.revokeConsent(
        dataId as `0x${string}`,
        researcher as `0x${string}`,
        reason || 'Consent withdrawn by data owner'
      );

      return {
        success: true,
        txHash,
        explorerUrl: `https://evm-testnet.flowscan.io/tx/${txHash}`,
        message: `Consent revoked. Reason: ${reason || 'Consent withdrawn by data owner'}`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      reply.code(500);
      return { success: false, error: msg };
    }
  });

  // Check consent status with full detail
  server.get<{ Params: { dataId: string } }>('/consent/:dataId', async (req, reply) => {
    try {
      const { dataId } = req.params;
      const record = await consent.getRecord(dataId as `0x${string}`);
      if (!record) {
        reply.code(404);
        return { error: 'Data record not found' };
      }

      const researchers = await consent.getGrantedResearchers(dataId as `0x${string}`);
      const consentDetails: Record<string, any> = {};

      for (const r of researchers) {
        const grant = await consent.getConsent(dataId as `0x${string}`, r as `0x${string}`);
        const hasAccess = await consent.hasConsent(dataId as `0x${string}`, r as `0x${string}`);
        consentDetails[r] = { ...grant, currentlyValid: hasAccess };
      }

      return {
        record,
        researchers,
        consentDetails,
        receipts: receipts.get(dataId) || [],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      reply.code(500);
      return { error: msg };
    }
  });

  // Decrypt data (researcher endpoint)
  server.post<{ Body: { dataId: string; researcherPrivateKey: string } }>('/decrypt', async (req, reply) => {
    try {
      const { dataId, researcherPrivateKey } = req.body;
      if (!dataId || !researcherPrivateKey) {
        reply.code(400);
        return { success: false, error: 'Required: dataId, researcherPrivateKey' };
      }

      const { privateKeyToAccount } = await import('viem/accounts');
      const researcherAccount = privateKeyToAccount(researcherPrivateKey as `0x${string}`);
      const hasAccess = await consent.hasConsent(
        dataId as `0x${string}`,
        researcherAccount.address
      );

      if (!hasAccess) {
        const consentInfo = await consent.getConsent(
          dataId as `0x${string}`,
          researcherAccount.address
        );
        reply.code(403);
        return {
          success: false,
          error: consentInfo?.expired
            ? 'Consent has expired. Request renewal from the data owner.'
            : 'Consent not granted. The data owner has not authorized your address.',
          researcher: researcherAccount.address,
          dataId,
        };
      }

      const cached = encryptionCache.get(dataId);
      if (!cached) {
        reply.code(404);
        return { success: false, error: 'Encrypted data not found in cache' };
      }

      if (litClient) {
        const decrypted = await decryptData(
          litClient, cached.ciphertext, cached.dataToEncryptHash,
          dataId, config.consentRegistryAddress,
          researcherPrivateKey as `0x${string}`,
          config.flowRpcUrl, config.flowChainId
        );
        return {
          success: true,
          data: new TextDecoder().decode(decrypted),
          dataId,
          researcher: researcherAccount.address,
          message: 'Decryption successful — consent verified on-chain via Lit Protocol',
        };
      } else {
        const decoded = Buffer.from(cached.ciphertext, 'base64').toString('utf-8');
        return {
          success: true,
          data: decoded,
          dataId,
          researcher: researcherAccount.address,
          message: 'Data retrieved (Lit unavailable — consent verified on-chain directly)',
        };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Access control')) {
        reply.code(403);
        return { success: false, error: 'Lit Protocol denied decryption — consent not verified on-chain' };
      }
      reply.code(500);
      return { success: false, error: msg };
    }
  });

  // List all uploads
  server.get('/records', async () => ({
    records: Array.from(uploads.values()),
    total: uploads.size,
  }));

  // Consent event log
  server.get('/events', async () => ({
    events: consent.events.slice(-50),
    total: consent.events.length,
  }));

  // Get consent receipt by dataId
  server.get<{ Params: { dataId: string } }>('/receipts/:dataId', async (req) => ({
    receipts: receipts.get(req.params.dataId) || [],
  }));

  // Start
  await server.listen({ port: config.port, host: '0.0.0.0' });
  console.log(`\n[server] NeuroConsent running at http://localhost:${config.port}`);
  console.log(`[server] Dashboard: http://localhost:${config.port}/`);

  // Graceful shutdown
  async function shutdown(signal: string) {
    console.log(`\n[server] ${signal} received, shutting down...`);
    disconnectLit();
    await server.close();
    process.exit(0);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
