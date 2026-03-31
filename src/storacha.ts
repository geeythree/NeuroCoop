import * as Client from '@storacha/client';
import { createHash } from 'crypto';

let storachaClient: Client.Client | null = null;

// IPFS gateways tried in order — w3s.link is Storacha's own gateway (fastest),
// dweb.link and ipfs.io are public fallbacks.
const IPFS_GATEWAYS = [
  (cid: string) => `https://${cid}.ipfs.w3s.link`,
  (cid: string) => `https://${cid}.ipfs.dweb.link`,
  (cid: string) => `https://ipfs.io/ipfs/${cid}`,
];

const GATEWAY_TIMEOUT_MS = 12000;
const MAX_RETRIES = 3;

export async function initStoracha(email: string): Promise<Client.Client> {
  if (storachaClient) return storachaClient;

  console.log('[storacha] Initializing client...');
  const client = await Client.create();

  const spaces = client.spaces();
  if (spaces.length === 0) {
    console.log('[storacha] No space found. Creating "neurocoop" space...');
    const space = await client.createSpace('neurocoop');
    await client.setCurrentSpace(space.did());
    console.log(`[storacha] Space created: ${space.did()}`);
  } else {
    await client.setCurrentSpace(spaces[0].did());
    console.log(`[storacha] Using space: ${spaces[0].did()}`);
  }

  storachaClient = client;
  return client;
}

export async function uploadEncrypted(
  client: Client.Client,
  encryptedData: Uint8Array,
  filename: string
): Promise<string> {
  console.log(`[storacha] Uploading: ${filename} (${encryptedData.length} bytes)`);

  const arrayBuffer = encryptedData.buffer.slice(
    encryptedData.byteOffset,
    encryptedData.byteOffset + encryptedData.byteLength
  ) as ArrayBuffer;
  const blob = new Blob([arrayBuffer], { type: 'application/octet-stream' });
  const cid = await client.uploadFile(blob);
  const cidStr = cid.toString();

  console.log(`[storacha] Pinned to IPFS/Filecoin: ${cidStr}`);
  return cidStr;
}

/**
 * Download content by CID from IPFS/Filecoin.
 *
 * Tries Storacha's own gateway first (fastest, most reliable for recently uploaded content),
 * then falls back to public gateways with exponential backoff.
 * Verifies content integrity via SHA-256 if expectedHash is provided.
 *
 * Throws only if all gateways fail — callers should fall back to local SQLite cache.
 */
export async function downloadByCid(cid: string, expectedHash?: string): Promise<Uint8Array> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const gatewayUrl = IPFS_GATEWAYS[attempt % IPFS_GATEWAYS.length](cid);

    try {
      console.log(`[storacha] Fetch attempt ${attempt + 1}/${MAX_RETRIES}: ${gatewayUrl}`);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), GATEWAY_TIMEOUT_MS);

      const response = await fetch(gatewayUrl, { signal: controller.signal });
      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} from ${gatewayUrl}`);
      }

      const buffer = await response.arrayBuffer();
      const data = new Uint8Array(buffer);

      // Verify content integrity if hash provided
      if (expectedHash) {
        const actualHash = computeDataHash(data);
        if (actualHash !== expectedHash) {
          throw new Error(`Hash mismatch: expected ${expectedHash}, got ${actualHash} — data may be corrupted`);
        }
        console.log(`[storacha] Content verified ✓ CID: ${cid}`);
      }

      return data;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(`[storacha] Attempt ${attempt + 1} failed: ${lastError.message}`);

      // Exponential backoff: 1s, 2s (no wait before first retry)
      if (attempt < MAX_RETRIES - 1) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }

  throw new Error(`All IPFS gateways failed for CID ${cid}: ${lastError?.message}`);
}

/**
 * Verify a CID is retrievable and optionally matches an expected hash.
 * Returns detailed verification status for the /storacha/verify/:cid endpoint.
 */
export async function verifyCid(cid: string, expectedHash?: string): Promise<{
  cid: string;
  reachable: boolean;
  sizeBytes: number | null;
  hashVerified: boolean | null;
  gatewayUrl: string | null;
  error: string | null;
}> {
  for (let attempt = 0; attempt < IPFS_GATEWAYS.length; attempt++) {
    const gatewayUrl = IPFS_GATEWAYS[attempt](cid);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), GATEWAY_TIMEOUT_MS);
      const response = await fetch(gatewayUrl, { signal: controller.signal });
      clearTimeout(timeout);

      if (!response.ok) continue;

      const buffer = await response.arrayBuffer();
      const data = new Uint8Array(buffer);
      const actualHash = computeDataHash(data);
      const hashVerified = expectedHash ? actualHash === expectedHash : null;

      return {
        cid,
        reachable: true,
        sizeBytes: data.length,
        hashVerified,
        gatewayUrl,
        error: null,
      };
    } catch {
      continue;
    }
  }

  return {
    cid,
    reachable: false,
    sizeBytes: null,
    hashVerified: null,
    gatewayUrl: null,
    error: 'All IPFS gateways unreachable',
  };
}

export function computeDataHash(data: Uint8Array | string): string {
  const input = typeof data === 'string' ? Buffer.from(data) : data;
  return createHash('sha256').update(input).digest('hex');
}

export function getGatewayUrl(cid: string): string {
  return IPFS_GATEWAYS[0](cid);
}
