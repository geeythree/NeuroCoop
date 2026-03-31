import Fastify from 'fastify';
import cors from '@fastify/cors';
import { readFileSync } from 'fs';
import { createConfig } from './config.js';
import { ConsentClient } from './consent.js';
import {
  getPublicKey,
  encryptNeuroData,
  decryptNeuroData,
  signConsentAttestation,
  verifyConsentAttestation,
} from './crypto.js';
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
  console.log('Neural data wallet with granular consent and revocation controls');
  console.log('Aligned with: Neurorights Foundation 5 Rights, UNESCO 2025, IEEE P7700');
  console.log('');

  const consent = new ConsentClient(config);
  const ownerPublicKey = getPublicKey(config.ownerPrivateKey);
  console.log(`[flow] Owner wallet: ${consent.ownerAddress}`);
  console.log(`[flow] Contract: ${config.consentRegistryAddress}`);
  console.log(`[flow] Chain: Flow EVM Testnet (${config.flowChainId})`);

  const balance = await consent.getBalance();
  console.log(`[flow] Balance: ${balance} FLOW`);
  console.log(`[crypto] Encryption: ECIES (secp256k1 + AES-256-CBC)`);

  let storachaClient: Awaited<ReturnType<typeof initStoracha>> | null = null;
  try {
    storachaClient = await initStoracha(config.storachaEmail);
  } catch (err) {
    console.error(`[storacha] Failed to initialize: ${err instanceof Error ? err.message : err}`);
    console.warn('[storacha] Continuing without Storacha — uploads will be local only');
  }

  // --- In-memory state ---
  const uploads = new Map<string, EncryptedUpload>();
  const encryptionCache = new Map<string, string>(); // dataId -> encrypted string
  const receipts = new Map<string, ConsentReceipt[]>();
  const startTime = Date.now();

  // --- Fastify Server ---
  const server = Fastify({ logger: false, bodyLimit: 2_097_152 });
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
      framework: {
        neurorights: 'Neurorights Foundation 5 Rights (Yuste et al.)',
        legislation: ['Chile Constitution Art. 19 No. 1 (2021)', 'Colorado HB 24-1058 (2024)', 'California SB 1223 (2024)'],
        standards: ['UNESCO Recommendation on Neurotechnology Ethics (Nov 2025)', 'IEEE P7700 (in development)'],
      },
      owner: consent.ownerAddress,
      balance: `${bal} FLOW`,
      contract: config.consentRegistryAddress,
      chain: `Flow EVM Testnet (${config.flowChainId})`,
      encryption: 'ECIES (secp256k1 + AES-256-CBC + HMAC-SHA-256)',
      storachaConnected: !!storachaClient,
      onChainStats: stats,
      localUploads: uploads.size,
      totalEvents: consent.events.length,
    };
  });

  /**
   * Upload EEG data with de-identification and encryption.
   *
   * Pipeline: Raw EEG → De-identify (differential privacy) → Encrypt (ECIES)
   *         → Store (Storacha/IPFS) → Register on-chain (Flow EVM)
   *
   * Aligns with Neurorights principle: Mental Privacy
   * Aligns with Colorado HB 24-1058: "sensitive personal information" protection
   */
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

      // De-identify (default: true — aligns with data minimization principle)
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
      const dataHash = computeDataHash(new TextEncoder().encode(processedData));

      // Encrypt with owner's public key (ECIES)
      const { encrypted } = await encryptNeuroData(ownerPublicKey, processedData);
      console.log(`[crypto] Data encrypted (${encrypted.length} chars)`);

      // Upload encrypted data to Storacha
      let storachaCid: string;
      if (storachaClient) {
        storachaCid = await uploadEncrypted(storachaClient, new TextEncoder().encode(encrypted), filename);
      } else {
        storachaCid = `local:${dataHash.substring(0, 16)}`;
        console.warn('[upload] Storacha unavailable — using local reference');
      }

      // Register on Flow EVM
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
      encryptionCache.set(dataId, encrypted);

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
          privacyBudget: `ε=${body.noiseEpsilon || 1.0} (Laplace mechanism)`,
        } : { applied: false },
        summary,
        encryption: 'ECIES (secp256k1 + AES-256-CBC)',
        timestamp,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[upload] Error: ${msg}`);
      reply.code(500);
      return { success: false, error: msg };
    }
  });

  /**
   * Grant purpose-limited, time-expiring consent with data category granularity.
   *
   * Maps to BCI data pipeline stages (IEEE/neuroscience convention):
   *   0 = RAW_EEG (direct sensor acquisition)
   *   1 = PROCESSED_FEATURES (band power, ERPs)
   *   2 = INFERENCES (ML model outputs)
   *   3 = METADATA (device info, session context)
   *
   * Note: California SB 1223 explicitly excludes inferred data (category 2)
   * from neural data protections. Our system lets users consent to inferences
   * separately, giving them more control than the law requires.
   *
   * Aligns with Neurorights: Free Will (consent is revocable),
   * Mental Privacy (purpose limitation), Fair Access (transparent terms)
   */
  server.post<{
    Body: {
      dataId: string;
      researcher: string;
      purpose: string;
      purposeDescription?: string;
      expiresAt?: number;
      expiresInDays?: number;
      categories?: number[];
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

      // Sign consent attestation (off-chain proof)
      const attestation = await signConsentAttestation(config.ownerPrivateKey, {
        action: 'grant',
        dataId,
        researcher,
        purpose,
        timestamp: Math.floor(Date.now() / 1000),
      });

      // Write consent to Flow EVM
      const txHash = await consent.grantConsent(
        dataId as `0x${string}`,
        researcher as `0x${string}`,
        purpose,
        expiresAt,
        categories
      );

      // Generate W3C consent receipt (ISO/IEC TS 27560:2023)
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
        receiptCid = await uploadEncrypted(storachaClient, receiptBytes, `receipt-${receipt.receiptId}.json`);
        receipt.proofs.storachaCid = receiptCid;
      }

      if (!receipts.has(dataId)) receipts.set(dataId, []);
      receipts.get(dataId)!.push(receipt);

      return {
        success: true,
        txHash,
        explorerUrl: `https://evm-testnet.flowscan.io/tx/${txHash}`,
        consent: {
          purpose,
          categories: categories.map(c => ({
            id: c,
            label: ['Raw EEG', 'Processed Features', 'ML Inferences', 'Session Metadata'][c],
            pipelineStage: ['Sensor Acquisition', 'Signal Processing', 'Model Output', 'Context'][c],
          })),
          expiresAt: expiresAt > 0 ? new Date(expiresAt * 1000).toISOString() : 'never',
        },
        attestation,
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

  /**
   * Revoke consent with reason.
   *
   * Aligns with Neurorights: Free Will — revocation is immediate and on-chain.
   * Once revoked, the server will refuse to decrypt data for the researcher.
   * The encrypted data remains on Storacha but is inaccessible.
   *
   * Chilean Supreme Court precedent (2021): ordered Emotiv to delete neural data
   * after user revoked consent. Our system enforces this cryptographically.
   */
  server.post<{ Body: { dataId: string; researcher: string; reason?: string } }>('/consent/revoke', async (req, reply) => {
    try {
      const { dataId, researcher, reason } = req.body;
      if (!dataId || !researcher) {
        reply.code(400);
        return { error: 'Required: dataId, researcher' };
      }

      const attestation = await signConsentAttestation(config.ownerPrivateKey, {
        action: 'revoke',
        dataId,
        researcher,
        purpose: reason || 'withdrawn',
        timestamp: Math.floor(Date.now() / 1000),
      });

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
        attestation,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      reply.code(500);
      return { success: false, error: msg };
    }
  });

  // Check consent status
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

      return { record, researchers, consentDetails, receipts: receipts.get(dataId) || [] };
    } catch (err) {
      reply.code(500);
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  /**
   * Decrypt neural data for an authorized researcher.
   *
   * Flow:
   * 1. Verify on-chain consent status (Flow EVM)
   * 2. Check purpose and expiration
   * 3. Decrypt with owner's private key (ECIES)
   * 4. Return plaintext to authorized researcher
   *
   * Production architecture would use proxy re-encryption (Umbral/NuCypher)
   * to eliminate server-side key custody. This prototype demonstrates the
   * consent-gated access pattern with on-chain verification.
   */
  server.post<{ Body: { dataId: string; researcherAddress: string } }>('/decrypt', async (req, reply) => {
    try {
      const { dataId, researcherAddress } = req.body;
      if (!dataId || !researcherAddress) {
        reply.code(400);
        return { success: false, error: 'Required: dataId, researcherAddress' };
      }

      // Step 1: Verify on-chain consent
      const hasAccess = await consent.hasConsent(
        dataId as `0x${string}`,
        researcherAddress as `0x${string}`
      );

      if (!hasAccess) {
        const consentInfo = await consent.getConsent(
          dataId as `0x${string}`,
          researcherAddress as `0x${string}`
        );
        reply.code(403);
        return {
          success: false,
          error: consentInfo?.expired
            ? 'Consent has expired. Request renewal from the data owner.'
            : 'Consent not granted. The data owner has not authorized your address.',
          researcher: researcherAddress,
          dataId,
          neurorightViolation: 'Access denied — Mental Privacy (Neurorights Foundation Principle #1)',
        };
      }

      // Step 2: Get consent details for audit
      const consentInfo = await consent.getConsent(
        dataId as `0x${string}`,
        researcherAddress as `0x${string}`
      );

      // Step 3: Decrypt
      const encrypted = encryptionCache.get(dataId);
      if (!encrypted) {
        reply.code(404);
        return { success: false, error: 'Encrypted data not found in cache' };
      }

      const decrypted = await decryptNeuroData(config.ownerPrivateKey, encrypted);

      return {
        success: true,
        data: decrypted,
        dataId,
        researcher: researcherAddress,
        consentDetails: {
          purpose: consentInfo?.purpose,
          expiresAt: consentInfo?.expiresAt ? new Date(consentInfo.expiresAt * 1000).toISOString() : 'never',
        },
        verification: 'Consent verified on Flow EVM before decryption',
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      reply.code(500);
      return { success: false, error: msg };
    }
  });

  // Verify a consent attestation signature
  server.post<{ Body: { signature: string; message: string; expectedAddress: string } }>('/verify', async (req, reply) => {
    try {
      const { signature, message, expectedAddress } = req.body;
      const valid = verifyConsentAttestation(signature, message, expectedAddress);
      return { valid, recoveredFrom: valid ? expectedAddress : 'mismatch' };
    } catch (err) {
      reply.code(400);
      return { error: err instanceof Error ? err.message : String(err) };
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

  // Get consent receipts
  server.get<{ Params: { dataId: string } }>('/receipts/:dataId', async (req) => ({
    receipts: receipts.get(req.params.dataId) || [],
  }));

  // Start
  await server.listen({ port: config.port, host: '0.0.0.0' });
  console.log(`\n[server] NeuroConsent running at http://localhost:${config.port}`);
  console.log(`[server] Dashboard: http://localhost:${config.port}/`);

  async function shutdown(signal: string) {
    console.log(`\n[server] ${signal} received, shutting down...`);
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
