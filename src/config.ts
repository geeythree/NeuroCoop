import dotenv from 'dotenv';
dotenv.config();

export interface Config {
  readonly flowRpcUrl: string;
  readonly flowChainId: number;
  readonly consentRegistryAddress: `0x${string}`;
  readonly ownerPrivateKey: `0x${string}`;
  readonly researcherPrivateKey: `0x${string}`;
  readonly litNetwork: string;
  readonly storachaEmail: string;
  readonly port: number;
}

export function createConfig(): Config {
  return {
    flowRpcUrl: process.env.FLOW_RPC_URL || 'https://testnet.evm.nodes.onflow.org',
    flowChainId: parseInt(process.env.FLOW_CHAIN_ID || '545', 10),
    consentRegistryAddress: (process.env.CONSENT_REGISTRY_ADDRESS || '') as `0x${string}`,
    ownerPrivateKey: (process.env.OWNER_PRIVATE_KEY || '') as `0x${string}`,
    researcherPrivateKey: (process.env.RESEARCHER_PRIVATE_KEY || '') as `0x${string}`,
    litNetwork: process.env.LIT_NETWORK || 'datil-dev',
    storachaEmail: process.env.STORACHA_EMAIL || '',
    port: Number(process.env.PORT ?? 3000),
  };
}

export const CONSENT_REGISTRY_ABI = [
  {
    name: 'registerData',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'dataId', type: 'bytes32' },
      { name: 'storachaCid', type: 'string' },
      { name: 'dataHash', type: 'string' },
    ],
    outputs: [],
  },
  {
    name: 'grantConsent',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'dataId', type: 'bytes32' },
      { name: 'researcher', type: 'address' },
    ],
    outputs: [],
  },
  {
    name: 'revokeConsent',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'dataId', type: 'bytes32' },
      { name: 'researcher', type: 'address' },
    ],
    outputs: [],
  },
  {
    name: 'hasConsent',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'dataId', type: 'bytes32' },
      { name: 'researcher', type: 'address' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'getRecord',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'dataId', type: 'bytes32' }],
    outputs: [
      { name: 'owner', type: 'address' },
      { name: 'storachaCid', type: 'string' },
      { name: 'dataHash', type: 'string' },
      { name: 'uploadedAt', type: 'uint256' },
    ],
  },
  {
    name: 'getGrantedResearchers',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'dataId', type: 'bytes32' }],
    outputs: [{ name: '', type: 'address[]' }],
  },
  {
    name: 'DataRegistered',
    type: 'event',
    inputs: [
      { name: 'dataId', type: 'bytes32', indexed: true },
      { name: 'owner', type: 'address', indexed: true },
      { name: 'cid', type: 'string', indexed: false },
      { name: 'timestamp', type: 'uint256', indexed: false },
    ],
  },
  {
    name: 'ConsentGranted',
    type: 'event',
    inputs: [
      { name: 'dataId', type: 'bytes32', indexed: true },
      { name: 'owner', type: 'address', indexed: true },
      { name: 'researcher', type: 'address', indexed: true },
    ],
  },
  {
    name: 'ConsentRevoked',
    type: 'event',
    inputs: [
      { name: 'dataId', type: 'bytes32', indexed: true },
      { name: 'owner', type: 'address', indexed: true },
      { name: 'researcher', type: 'address', indexed: true },
    ],
  },
] as const;
