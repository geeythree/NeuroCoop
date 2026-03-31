import * as Client from '@storacha/client';
import { createHash } from 'crypto';

let storachaClient: Client.Client | null = null;

export async function initStoracha(email: string): Promise<Client.Client> {
  if (storachaClient) return storachaClient;

  console.log('[storacha] Initializing client...');
  const client = await Client.create();

  // For hackathon: if no space exists, create one
  const spaces = client.spaces();
  if (spaces.length === 0) {
    console.log('[storacha] No space found. Creating "neuroconsent" space...');
    const space = await client.createSpace('neuroconsent');
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
  console.log(`[storacha] Uploading encrypted file: ${filename} (${encryptedData.length} bytes)`);

  const blob = new Blob([encryptedData], { type: 'application/octet-stream' });
  const file = new File([blob], `${filename}.encrypted`);

  const cid = await client.uploadFile(file);
  const cidStr = cid.toString();

  console.log(`[storacha] Uploaded to IPFS: ${cidStr}`);
  return cidStr;
}

export function computeDataHash(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

export function getGatewayUrl(cid: string): string {
  return `https://${cid}.ipfs.w3s.link`;
}
