import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { readFileSync } from 'fs';
import { createConfig } from './config.js';
import { ConsentClient } from './consent.js';
import { initLit, encryptData, decryptData, disconnectLit } from './lit.js';
import { initStoracha, uploadEncrypted, computeDataHash, getGatewayUrl } from './storacha.js';
import { getDashboardHtml } from './dashboard.js';
import type { EncryptedUpload } from './types.js';

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
  const startTime = Date.now();

  // --- Fastify Server ---
  const server = Fastify({ logger: false, bodyLimit: 1_048_576 }); // 1MB
  await server.register(cors, { origin: true });
  await server.register(multipart, { limits: { fileSize: 1_048_576 } });

  // Dashboard
  server.get('/', async (_req, reply) => {
    reply.type('text/html').send(getDashboardHtml(config.consentRegistryAddress, consent.ownerAddress));
  });

  // Health
  server.get('/health', async () => {
    const bal = await consent.getBalance().catch(() => 'unknown');
    return {
      status: 'ok',
      uptime: Math.floor((Date.now() - startTime) / 1000),
      owner: consent.ownerAddress,
      balance: `${bal} FLOW`,
      contract: config.consentRegistryAddress,
      chain: `Flow EVM Testnet (${config.flowChainId})`,
      litConnected: !!litClient,
      storachaConnected: !!storachaClient,
      totalUploads: uploads.size,
      totalEvents: consent.events.length,
    };
  });

  // Upload EEG data: encrypt → store → register on-chain
  server.post('/upload', async (req, reply) => {
    try {
      const body = req.body as { data?: string; filename?: string };
      let rawData: Uint8Array;
      let filename: string;

      if (body?.data && body?.filename) {
        rawData = new TextEncoder().encode(body.data);
        filename = body.filename;
      } else {
        // Try reading sample data
        const samplePath = new URL('../sample-data/sample-eeg.csv', import.meta.url);
        rawData = new Uint8Array(readFileSync(samplePath));
        filename = 'sample-eeg.csv';
      }

      const timestamp = Math.floor(Date.now() / 1000);
      const dataId = consent.generateDataId(consent.ownerAddress, filename, timestamp);
      const dataHash = computeDataHash(rawData);

      // Step 1: Encrypt with Lit Protocol
      let ciphertext: string;
      let dataToEncryptHash: string;

      if (litClient) {
        const encrypted = await encryptData(
          litClient,
          rawData,
          dataId,
          config.consentRegistryAddress,
          config.flowRpcUrl,
          config.flowChainId
        );
        ciphertext = encrypted.ciphertext;
        dataToEncryptHash = encrypted.dataToEncryptHash;
      } else {
        // Fallback: base64 encode (not secure, for demo when Lit unavailable)
        ciphertext = Buffer.from(rawData).toString('base64');
        dataToEncryptHash = dataHash;
        console.warn('[upload] Lit unavailable — using base64 fallback (not encrypted)');
      }

      // Step 2: Upload encrypted data to Storacha
      let storachaCid: string;
      if (storachaClient) {
        storachaCid = await uploadEncrypted(
          storachaClient,
          new TextEncoder().encode(ciphertext),
          filename
        );
      } else {
        // Fallback: generate a mock CID
        storachaCid = `local:${dataHash.substring(0, 16)}`;
        console.warn('[upload] Storacha unavailable — using local reference');
      }

      // Step 3: Register on Flow EVM
      const txHash = await consent.registerData(dataId, storachaCid, dataHash);

      // Cache
      const upload: EncryptedUpload = {
        dataId,
        storachaCid,
        dataHash,
        txHash,
        owner: consent.ownerAddress,
        filename,
        timestamp,
      };
      uploads.set(dataId, upload);
      encryptionCache.set(dataId, { ciphertext, dataToEncryptHash });

      return {
        success: true,
        dataId,
        storachaCid,
        storachaUrl: storachaClient ? getGatewayUrl(storachaCid) : null,
        dataHash,
        txHash,
        explorerUrl: `https://evm-testnet.flowscan.io/tx/${txHash}`,
        timestamp,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[upload] Error: ${msg}`);
      reply.code(500);
      return { success: false, error: msg };
    }
  });

  // Grant consent
  server.post<{ Body: { dataId: string; researcher: string } }>('/consent/grant', async (req, reply) => {
    try {
      const { dataId, researcher } = req.body;
      if (!dataId || !researcher) {
        reply.code(400);
        return { error: 'Required: dataId, researcher' };
      }

      const txHash = await consent.grantConsent(
        dataId as `0x${string}`,
        researcher as `0x${string}`
      );

      return {
        success: true,
        txHash,
        explorerUrl: `https://evm-testnet.flowscan.io/tx/${txHash}`,
        message: `Consent granted to ${researcher} for ${dataId}`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      reply.code(500);
      return { success: false, error: msg };
    }
  });

  // Revoke consent
  server.post<{ Body: { dataId: string; researcher: string } }>('/consent/revoke', async (req, reply) => {
    try {
      const { dataId, researcher } = req.body;
      if (!dataId || !researcher) {
        reply.code(400);
        return { error: 'Required: dataId, researcher' };
      }

      const txHash = await consent.revokeConsent(
        dataId as `0x${string}`,
        researcher as `0x${string}`
      );

      return {
        success: true,
        txHash,
        explorerUrl: `https://evm-testnet.flowscan.io/tx/${txHash}`,
        message: `Consent revoked from ${researcher} for ${dataId}`,
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
      const consentStatus: Record<string, boolean> = {};
      for (const r of researchers) {
        consentStatus[r] = await consent.hasConsent(dataId as `0x${string}`, r as `0x${string}`);
      }

      return { record, researchers, consentStatus };
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

      // Check on-chain consent first
      const { privateKeyToAccount } = await import('viem/accounts');
      const researcherAccount = privateKeyToAccount(researcherPrivateKey as `0x${string}`);
      const hasAccess = await consent.hasConsent(
        dataId as `0x${string}`,
        researcherAccount.address
      );

      if (!hasAccess) {
        reply.code(403);
        return {
          success: false,
          error: 'Consent not granted. The data owner has not authorized your address.',
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
          litClient,
          cached.ciphertext,
          cached.dataToEncryptHash,
          dataId,
          config.consentRegistryAddress,
          researcherPrivateKey as `0x${string}`,
          config.flowRpcUrl,
          config.flowChainId
        );

        return {
          success: true,
          data: new TextDecoder().decode(decrypted),
          dataId,
          researcher: researcherAccount.address,
          message: 'Decryption successful — consent verified on-chain via Lit Protocol',
        };
      } else {
        // Fallback: base64 decode
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
