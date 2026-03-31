import { LitNodeClient } from '@lit-protocol/lit-node-client';
import { LitNetwork } from '@lit-protocol/constants';
import {
  createSiweMessage,
  generateAuthSig,
  LitAbility,
  LitActionResource,
} from '@lit-protocol/auth-helpers';
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

let litClient: LitNodeClient | null = null;

export async function initLit(network: string): Promise<LitNodeClient> {
  if (litClient?.ready) return litClient;

  console.log(`[lit] Connecting to Lit network: ${network}...`);
  const client = new LitNodeClient({
    litNetwork: network as LitNetwork,
    debug: false,
  });

  await client.connect();
  console.log('[lit] Connected to Lit network');
  litClient = client;
  return client;
}

function getAccessControlConditions(
  contractAddress: string,
  dataId: string,
  chainId: number
): any[] {
  return [
    {
      contractAddress,
      chain: 'flowTestnet',
      standardContractType: '',
      method: 'hasConsent',
      parameters: [dataId, ':userAddress'],
      returnValueTest: {
        comparator: '=',
        value: 'true',
      },
      functionAbi: {
        name: 'hasConsent',
        inputs: [
          { name: 'dataId', type: 'bytes32' },
          { name: 'researcher', type: 'address' },
        ],
        outputs: [{ name: '', type: 'bool' }],
        stateMutability: 'view',
        type: 'function',
      },
    },
  ];
}

// Fallback: Use EVM access control with custom chain config
function getEvmAccessControlConditions(
  contractAddress: string,
  dataId: string,
  rpcUrl: string,
  chainId: number
): any[] {
  return [
    {
      contractAddress,
      chain: chainId.toString(),
      standardContractType: '',
      method: 'hasConsent',
      parameters: [dataId, ':userAddress'],
      returnValueTest: {
        comparator: '=',
        value: 'true',
      },
      functionAbi: {
        name: 'hasConsent',
        inputs: [
          { name: 'dataId', type: 'bytes32' },
          { name: 'researcher', type: 'address' },
        ],
        outputs: [{ name: '', type: 'bool' }],
        stateMutability: 'view',
        type: 'function',
      },
    },
  ];
}

export async function getSessionSigs(
  client: LitNodeClient,
  privateKey: `0x${string}`,
  chainId: number
) {
  const account = privateKeyToAccount(privateKey);
  const walletClient = createWalletClient({
    account,
    transport: http(),
  });

  const sessionSigs = await client.getSessionSigs({
    chain: 'ethereum',
    expiration: new Date(Date.now() + 1000 * 60 * 10).toISOString(),
    resourceAbilityRequests: [
      {
        resource: new LitActionResource('*'),
        ability: LitAbility.LitActionExecution,
      },
    ],
    authNeededCallback: async ({ uri, expiration, resourceAbilityRequests }) => {
      const toSign = await createSiweMessage({
        uri: uri!,
        expiration: expiration!,
        resources: resourceAbilityRequests!,
        walletAddress: account.address,
        nonce: await client.getLatestBlockhash(),
        chainId: 1,
        domain: 'localhost',
      });

      return await generateAuthSig({
        signer: {
          signMessage: async (message: { message: string }) => {
            return await walletClient.signMessage({ message: message.message });
          },
          getAddress: async () => account.address,
        },
        toSign,
      });
    },
  });

  return sessionSigs;
}

export async function encryptData(
  client: LitNodeClient,
  data: Uint8Array,
  dataId: string,
  contractAddress: string,
  rpcUrl: string,
  chainId: number
): Promise<{ ciphertext: string; dataToEncryptHash: string }> {
  console.log(`[lit] Encrypting data for dataId: ${dataId}`);

  const accessControlConditions = getAccessControlConditions(
    contractAddress,
    dataId,
    chainId
  );

  const dataString = Buffer.from(data).toString('base64');

  const { ciphertext, dataToEncryptHash } = await client.encrypt({
    accessControlConditions,
    dataToEncrypt: new TextEncoder().encode(dataString),
  });

  console.log(`[lit] Data encrypted. Hash: ${dataToEncryptHash}`);
  return { ciphertext, dataToEncryptHash };
}

export async function decryptData(
  client: LitNodeClient,
  ciphertext: string,
  dataToEncryptHash: string,
  dataId: string,
  contractAddress: string,
  researcherPrivateKey: `0x${string}`,
  rpcUrl: string,
  chainId: number
): Promise<Uint8Array> {
  console.log(`[lit] Attempting decryption for dataId: ${dataId}`);

  const accessControlConditions = getAccessControlConditions(
    contractAddress,
    dataId,
    chainId
  );

  const sessionSigs = await getSessionSigs(client, researcherPrivateKey, chainId);

  const { decryptedData } = await client.decrypt({
    accessControlConditions,
    ciphertext,
    dataToEncryptHash,
    chain: 'flowTestnet',
    sessionSigs,
  });

  const base64String = new TextDecoder().decode(decryptedData);
  const originalData = Buffer.from(base64String, 'base64');

  console.log(`[lit] Data decrypted successfully (${originalData.length} bytes)`);
  return new Uint8Array(originalData);
}

export function disconnectLit() {
  if (litClient) {
    litClient.disconnect();
    litClient = null;
    console.log('[lit] Disconnected');
  }
}
