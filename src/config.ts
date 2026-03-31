import dotenv from 'dotenv';
dotenv.config();

export interface Config {
  readonly flowRpcUrl: string;
  readonly flowChainId: number;
  readonly coopAddress: `0x${string}`;
  readonly ownerPrivateKey: `0x${string}`;
  readonly storachaEmail: string;
  readonly port: number;
}

export function createConfig(): Config {
  return {
    flowRpcUrl: process.env.FLOW_RPC_URL || 'https://testnet.evm.nodes.onflow.org',
    flowChainId: parseInt(process.env.FLOW_CHAIN_ID || '545', 10),
    coopAddress: (process.env.COOP_ADDRESS || '') as `0x${string}`,
    ownerPrivateKey: (process.env.OWNER_PRIVATE_KEY || '') as `0x${string}`,
    storachaEmail: process.env.STORACHA_EMAIL || '',
    port: Number(process.env.PORT ?? 3000),
  };
}

export const NEUROCOOP_ABI = [
  // --- Member Functions ---
  {
    name: 'joinCooperative',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'dataId', type: 'bytes32' },
      { name: 'storachaCid', type: 'string' },
      { name: 'dataHash', type: 'string' },
      { name: 'channelCount', type: 'uint8' },
      { name: 'sampleRate', type: 'uint256' },
      { name: 'deidentified', type: 'bool' },
    ],
    outputs: [],
  },
  {
    name: 'leaveCooperative',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  // --- Proposal Functions ---
  {
    name: 'submitProposal',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'purpose', type: 'string' },
      { name: 'description', type: 'string' },
      { name: 'durationDays', type: 'uint256' },
      { name: 'categories', type: 'uint8[]' },
    ],
    outputs: [],
  },
  {
    name: 'vote',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'proposalId', type: 'uint256' },
      { name: 'support', type: 'bool' },
    ],
    outputs: [],
  },
  {
    name: 'executeProposal',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'proposalId', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'setVotingPeriod',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: '_seconds', type: 'uint256' }],
    outputs: [],
  },
  // --- View Functions ---
  {
    name: 'hasAccess',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'proposalId', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'memberCount',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'proposalCount',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'getProposal',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'proposalId', type: 'uint256' }],
    outputs: [
      { name: 'researcher', type: 'address' },
      { name: 'purpose', type: 'string' },
      { name: 'description', type: 'string' },
      { name: 'durationDays', type: 'uint256' },
      { name: 'votesFor', type: 'uint256' },
      { name: 'votesAgainst', type: 'uint256' },
      { name: 'totalVoters', type: 'uint256' },
      { name: 'status', type: 'uint8' },
      { name: 'createdAt', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
      { name: 'accessExpiresAt', type: 'uint256' },
    ],
  },
  {
    name: 'getMember',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'addr', type: 'address' }],
    outputs: [
      { name: 'dataId', type: 'bytes32' },
      { name: 'storachaCid', type: 'string' },
      { name: 'channelCount', type: 'uint8' },
      { name: 'sampleRate', type: 'uint256' },
      { name: 'deidentified', type: 'bool' },
      { name: 'joinedAt', type: 'uint256' },
      { name: 'active', type: 'bool' },
    ],
  },
  {
    name: 'getMemberList',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address[]' }],
  },
  {
    name: 'hasVoted',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'proposalId', type: 'uint256' },
      { name: 'voter', type: 'address' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  // --- Events ---
  {
    name: 'MemberJoined',
    type: 'event',
    inputs: [
      { name: 'member', type: 'address', indexed: true },
      { name: 'dataId', type: 'bytes32' },
      { name: 'cid', type: 'string' },
      { name: 'timestamp', type: 'uint256' },
    ],
  },
  {
    name: 'ProposalCreated',
    type: 'event',
    inputs: [
      { name: 'proposalId', type: 'uint256', indexed: true },
      { name: 'researcher', type: 'address', indexed: true },
      { name: 'purpose', type: 'string' },
      { name: 'durationDays', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
  },
  {
    name: 'VoteCast',
    type: 'event',
    inputs: [
      { name: 'proposalId', type: 'uint256', indexed: true },
      { name: 'voter', type: 'address', indexed: true },
      { name: 'support', type: 'bool' },
      { name: 'votesFor', type: 'uint256' },
      { name: 'votesAgainst', type: 'uint256' },
    ],
  },
  {
    name: 'ProposalExecuted',
    type: 'event',
    inputs: [
      { name: 'proposalId', type: 'uint256', indexed: true },
      { name: 'researcher', type: 'address', indexed: true },
      { name: 'accessExpiresAt', type: 'uint256' },
    ],
  },
  {
    name: 'ProposalRejected',
    type: 'event',
    inputs: [
      { name: 'proposalId', type: 'uint256', indexed: true },
    ],
  },
] as const;
