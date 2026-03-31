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
      { name: 'receiptCid', type: 'string' },
      { name: 'dataHash', type: 'string' },
      { name: 'channelCount', type: 'uint8' },
      { name: 'sampleRate', type: 'uint256' },
      { name: 'deidentified', type: 'bool' },
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
      { name: 'purpose', type: 'string' },
      { name: 'expiresAt', type: 'uint256' },
      { name: 'categories', type: 'uint8[]' },
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
      { name: 'reason', type: 'string' },
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
    name: 'logAccess',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'dataId', type: 'bytes32' },
      { name: 'purpose', type: 'string' },
    ],
    outputs: [],
  },
  {
    name: 'getRecord',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'dataId', type: 'bytes32' }],
    outputs: [
      { name: 'owner', type: 'address' },
      { name: 'storachaCid', type: 'string' },
      { name: 'receiptCid', type: 'string' },
      { name: 'dataHash', type: 'string' },
      { name: 'channelCount', type: 'uint8' },
      { name: 'sampleRate', type: 'uint256' },
      { name: 'uploadedAt', type: 'uint256' },
      { name: 'deidentified', type: 'bool' },
    ],
  },
  {
    name: 'getConsent',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'dataId', type: 'bytes32' },
      { name: 'researcher', type: 'address' },
    ],
    outputs: [
      { name: 'purpose', type: 'string' },
      { name: 'grantedAt', type: 'uint256' },
      { name: 'expiresAt', type: 'uint256' },
      { name: 'active', type: 'bool' },
      { name: 'expired', type: 'bool' },
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
    name: 'getAccessLog',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'dataId', type: 'bytes32' }],
    outputs: [{
      name: '',
      type: 'tuple[]',
      components: [
        { name: 'researcher', type: 'address' },
        { name: 'accessedAt', type: 'uint256' },
        { name: 'purpose', type: 'string' },
      ],
    }],
  },
  {
    name: 'totalRecords',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'totalConsents',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'totalAccesses',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'DataRegistered',
    type: 'event',
    inputs: [
      { name: 'dataId', type: 'bytes32', indexed: true },
      { name: 'owner', type: 'address', indexed: true },
      { name: 'cid', type: 'string', indexed: false },
      { name: 'receiptCid', type: 'string', indexed: false },
      { name: 'channelCount', type: 'uint8', indexed: false },
      { name: 'sampleRate', type: 'uint256', indexed: false },
      { name: 'deidentified', type: 'bool', indexed: false },
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
      { name: 'purpose', type: 'string', indexed: false },
      { name: 'expiresAt', type: 'uint256', indexed: false },
    ],
  },
  {
    name: 'ConsentRevoked',
    type: 'event',
    inputs: [
      { name: 'dataId', type: 'bytes32', indexed: true },
      { name: 'owner', type: 'address', indexed: true },
      { name: 'researcher', type: 'address', indexed: true },
      { name: 'reason', type: 'string', indexed: false },
    ],
  },
  {
    name: 'DataAccessed',
    type: 'event',
    inputs: [
      { name: 'dataId', type: 'bytes32', indexed: true },
      { name: 'researcher', type: 'address', indexed: true },
      { name: 'purpose', type: 'string', indexed: false },
      { name: 'timestamp', type: 'uint256', indexed: false },
    ],
  },
] as const;
