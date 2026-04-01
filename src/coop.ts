import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  encodePacked,
  type PublicClient,
  type Chain,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { type Config, NEUROCOOP_ABI } from './config.js';
import type { CoopEvent, CoopMember, Proposal, ProposalStatus } from './types.js';

// Filecoin Calibration testnet — Protocol Labs native chain.
// FVM is EVM-compatible: all EVM Solidity runs unchanged.
// Testnet faucet: https://faucet.calibnet.chainsafe-fil.io/
// Explorer:       https://calibration.filfox.info
// RPC:            https://api.calibration.node.glif.io/rpc/v1
const filecoinCalibration: Chain = {
  id: 314159,
  name: 'Filecoin Calibration',
  nativeCurrency: { name: 'testnet filecoin', symbol: 'tFIL', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://api.calibration.node.glif.io/rpc/v1'] },
    public:  { http: ['https://api.calibration.node.glif.io/rpc/v1'] },
  },
  blockExplorers: {
    default: { name: 'Filfox', url: 'https://calibration.filfox.info' },
  },
};

// Filecoin mainnet — use for production / mainnet judging
// Chain ID: 314 | RPC: https://api.node.glif.io/rpc/v1
const filecoinMainnet: Chain = {
  id: 314,
  name: 'Filecoin',
  nativeCurrency: { name: 'filecoin', symbol: 'FIL', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://api.node.glif.io/rpc/v1'] },
    public:  { http: ['https://api.node.glif.io/rpc/v1'] },
  },
  blockExplorers: {
    default: { name: 'Filfox', url: 'https://filfox.info' },
  },
};

export class CoopClient {
  public readonly publicClient: PublicClient;
  private readonly walletClients: Map<string, any> = new Map();
  private readonly chain: Chain;
  private readonly coopAddress: `0x${string}`;
  private readonly rpcUrl: string;
  public readonly events: CoopEvent[] = [];

  constructor(config: Config) {
    this.chain = config.filecoinNetwork === 'mainnet' ? filecoinMainnet : filecoinCalibration;
    this.coopAddress = config.coopAddress as `0x${string}`;
    this.rpcUrl = config.filecoinRpcUrl;

    this.publicClient = createPublicClient({
      chain: this.chain,
      transport: http(config.filecoinRpcUrl),
    });
  }

  /** Register a wallet for signing transactions */
  registerWallet(privateKey: `0x${string}`): string {
    const account = privateKeyToAccount(privateKey);
    const client = createWalletClient({
      account,
      chain: this.chain,
      transport: http(this.rpcUrl),
    });
    this.walletClients.set(account.address.toLowerCase(), client);
    return account.address;
  }

  private getWallet(address: string): any {
    const wallet = this.walletClients.get(address.toLowerCase());
    if (!wallet) throw new Error(`No wallet registered for ${address}`);
    return wallet;
  }

  generateDataId(owner: string, filename: string, timestamp: number): `0x${string}` {
    return keccak256(
      encodePacked(
        ['address', 'string', 'uint256'],
        [owner as `0x${string}`, filename, BigInt(timestamp)]
      )
    );
  }

  // --- Member Functions ---

  async joinCooperative(
    memberAddress: string,
    dataId: `0x${string}`,
    storachaCid: string,
    dataHash: string,
    channelCount: number,
    sampleRate: number,
    deidentified: boolean
  ): Promise<string> {
    const wallet = this.getWallet(memberAddress);
    const hash = await wallet.writeContract({
      address: this.coopAddress,
      abi: NEUROCOOP_ABI,
      functionName: 'joinCooperative',
      args: [dataId, storachaCid, dataHash, channelCount, BigInt(sampleRate), deidentified],
      chain: this.chain,
    });
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    console.log(`[coop] Member joined: ${memberAddress} tx: ${hash}`);

    this.events.push({
      type: 'MemberJoined',
      data: { member: memberAddress, dataId, cid: storachaCid },
      timestamp: Date.now(),
      txHash: hash,
      blockNumber: Number(receipt.blockNumber),
    });
    return hash;
  }

  // --- Proposal Functions ---

  async submitProposal(
    researcherAddress: string,
    purpose: string,
    description: string,
    durationDays: number,
    categories: number[]
  ): Promise<{ txHash: string; proposalId: number }> {
    const wallet = this.getWallet(researcherAddress);
    const countBefore = await this.getProposalCount();

    const hash = await wallet.writeContract({
      address: this.coopAddress,
      abi: NEUROCOOP_ABI,
      functionName: 'submitProposal',
      args: [purpose, description, BigInt(durationDays), categories],
      chain: this.chain,
    });
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    const proposalId = countBefore; // 0-indexed

    console.log(`[coop] Proposal #${proposalId} created by ${researcherAddress}: "${purpose}" tx: ${hash}`);

    this.events.push({
      type: 'ProposalCreated',
      data: { proposalId, researcher: researcherAddress, purpose, durationDays },
      timestamp: Date.now(),
      txHash: hash,
      blockNumber: Number(receipt.blockNumber),
    });
    return { txHash: hash, proposalId };
  }

  async vote(voterAddress: string, proposalId: number, support: boolean): Promise<string> {
    const wallet = this.getWallet(voterAddress);
    const hash = await wallet.writeContract({
      address: this.coopAddress,
      abi: NEUROCOOP_ABI,
      functionName: 'vote',
      args: [BigInt(proposalId), support],
      chain: this.chain,
    });
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });

    console.log(`[coop] Vote: ${voterAddress} voted ${support ? 'FOR' : 'AGAINST'} proposal #${proposalId} tx: ${hash}`);

    this.events.push({
      type: 'VoteCast',
      data: { proposalId, voter: voterAddress, support },
      timestamp: Date.now(),
      txHash: hash,
      blockNumber: Number(receipt.blockNumber),
    });
    return hash;
  }

  async executeProposal(callerAddress: string, proposalId: number): Promise<string> {
    const wallet = this.getWallet(callerAddress);
    const hash = await wallet.writeContract({
      address: this.coopAddress,
      abi: NEUROCOOP_ABI,
      functionName: 'executeProposal',
      args: [BigInt(proposalId)],
      chain: this.chain,
    });
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });

    const proposal = await this.getProposal(proposalId);
    const eventType = proposal.status === 2 ? 'ProposalExecuted' : 'ProposalRejected';
    console.log(`[coop] Proposal #${proposalId} ${eventType === 'ProposalExecuted' ? 'APPROVED' : 'REJECTED'} tx: ${hash}`);

    this.events.push({
      type: eventType,
      data: { proposalId },
      timestamp: Date.now(),
      txHash: hash,
      blockNumber: Number(receipt.blockNumber),
    });
    return hash;
  }

  async expireProposal(callerAddress: string, proposalId: number): Promise<string> {
    const wallet = this.getWallet(callerAddress);
    const hash = await wallet.writeContract({
      address: this.coopAddress,
      abi: NEUROCOOP_ABI,
      functionName: 'expireProposal',
      args: [BigInt(proposalId)],
      chain: this.chain,
    });
    await this.publicClient.waitForTransactionReceipt({ hash });
    console.log(`[coop] Proposal #${proposalId} expired, tx: ${hash}`);
    this.events.push({
      type: 'ProposalRejected',
      data: { proposalId, reason: 'expired' },
      timestamp: Date.now(),
      txHash: hash,
      blockNumber: 0,
    });
    return hash;
  }

  async setVotingPeriod(callerAddress: string, seconds: number): Promise<string> {
    const wallet = this.getWallet(callerAddress);
    const hash = await wallet.writeContract({
      address: this.coopAddress,
      abi: NEUROCOOP_ABI,
      functionName: 'setVotingPeriod',
      args: [BigInt(seconds)],
      chain: this.chain,
    });
    await this.publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  // --- View Functions ---

  async hasAccess(proposalId: number, researcherAddress: string): Promise<boolean> {
    return await this.publicClient.readContract({
      address: this.coopAddress,
      abi: NEUROCOOP_ABI,
      functionName: 'hasAccess',
      args: [BigInt(proposalId), researcherAddress as `0x${string}`],
    }) as boolean;
  }

  async getMemberCount(): Promise<number> {
    const count = await this.publicClient.readContract({
      address: this.coopAddress,
      abi: NEUROCOOP_ABI,
      functionName: 'memberCount',
    });
    return Number(count);
  }

  async getProposalCount(): Promise<number> {
    const count = await this.publicClient.readContract({
      address: this.coopAddress,
      abi: NEUROCOOP_ABI,
      functionName: 'proposalCount',
    });
    return Number(count);
  }

  async getProposal(proposalId: number): Promise<Proposal> {
    const [r, categories] = await Promise.all([
      this.publicClient.readContract({
        address: this.coopAddress,
        abi: NEUROCOOP_ABI,
        functionName: 'getProposal',
        args: [BigInt(proposalId)],
      }) as Promise<unknown>,
      this.getProposalCategories(proposalId),
    ]);
    const result = r as any[];
    return {
      id: proposalId,
      researcher: result[0],
      purpose: result[1],
      description: result[2],
      durationDays: Number(result[3]),
      votesFor: Number(result[4]),
      votesAgainst: Number(result[5]),
      totalVoters: Number(result[6]),
      status: Number(result[7]) as ProposalStatus,
      createdAt: Number(result[8]),
      deadline: Number(result[9]),
      accessExpiresAt: Number(result[10]),
      categories,
    };
  }

  async getMember(address: string): Promise<CoopMember | null> {
    const r = await this.publicClient.readContract({
      address: this.coopAddress,
      abi: NEUROCOOP_ABI,
      functionName: 'getMember',
      args: [address as `0x${string}`],
    }) as unknown as any[];
    if (!r[6]) return null; // not active
    return {
      address,
      dataId: r[0],
      storachaCid: r[1],
      channelCount: Number(r[2]),
      sampleRate: Number(r[3]),
      deidentified: r[4],
      joinedAt: Number(r[5]),
      active: r[6],
    };
  }

  async getMemberList(): Promise<string[]> {
    return await this.publicClient.readContract({
      address: this.coopAddress,
      abi: NEUROCOOP_ABI,
      functionName: 'getMemberList',
    }) as string[];
  }

  async getActiveMembers(): Promise<string[]> {
    return await this.publicClient.readContract({
      address: this.coopAddress,
      abi: NEUROCOOP_ABI,
      functionName: 'getActiveMembers',
    }) as string[];
  }

  async getProposalCategories(proposalId: number): Promise<number[]> {
    const result = await this.publicClient.readContract({
      address: this.coopAddress,
      abi: NEUROCOOP_ABI,
      functionName: 'getProposalCategories',
      args: [BigInt(proposalId)],
    }) as number[];
    return Array.from(result).map(Number);
  }

  async getBalance(address: string): Promise<string> {
    const balance = await this.publicClient.getBalance({
      address: address as `0x${string}`,
    });
    return (Number(balance) / 1e18).toFixed(4);
  }
}
