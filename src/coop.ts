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

const flowTestnet: Chain = {
  id: 545,
  name: 'Flow EVM Testnet',
  nativeCurrency: { name: 'Flow', symbol: 'FLOW', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://testnet.evm.nodes.onflow.org'] },
  },
  blockExplorers: {
    default: { name: 'FlowScan', url: 'https://evm-testnet.flowscan.io' },
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
    this.chain = flowTestnet;
    this.coopAddress = config.coopAddress;
    this.rpcUrl = config.flowRpcUrl;

    this.publicClient = createPublicClient({
      chain: this.chain,
      transport: http(config.flowRpcUrl),
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
    await this.publicClient.waitForTransactionReceipt({ hash });
    const proposalId = countBefore; // 0-indexed

    console.log(`[coop] Proposal #${proposalId} created by ${researcherAddress}: "${purpose}" tx: ${hash}`);

    this.events.push({
      type: 'ProposalCreated',
      data: { proposalId, researcher: researcherAddress, purpose, durationDays },
      timestamp: Date.now(),
      txHash: hash,
      blockNumber: 0,
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
    await this.publicClient.waitForTransactionReceipt({ hash });

    console.log(`[coop] Vote: ${voterAddress} voted ${support ? 'FOR' : 'AGAINST'} proposal #${proposalId} tx: ${hash}`);

    this.events.push({
      type: 'VoteCast',
      data: { proposalId, voter: voterAddress, support },
      timestamp: Date.now(),
      txHash: hash,
      blockNumber: 0,
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
    await this.publicClient.waitForTransactionReceipt({ hash });

    const proposal = await this.getProposal(proposalId);
    const eventType = proposal.status === 3 ? 'ProposalExecuted' : 'ProposalRejected';
    console.log(`[coop] Proposal #${proposalId} ${eventType === 'ProposalExecuted' ? 'APPROVED' : 'REJECTED'} tx: ${hash}`);

    this.events.push({
      type: eventType,
      data: { proposalId },
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

  async hasAccess(proposalId: number): Promise<boolean> {
    return await this.publicClient.readContract({
      address: this.coopAddress,
      abi: NEUROCOOP_ABI,
      functionName: 'hasAccess',
      args: [BigInt(proposalId)],
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
    const r = await this.publicClient.readContract({
      address: this.coopAddress,
      abi: NEUROCOOP_ABI,
      functionName: 'getProposal',
      args: [BigInt(proposalId)],
    }) as unknown as any[];
    return {
      id: proposalId,
      researcher: r[0],
      purpose: r[1],
      description: r[2],
      durationDays: Number(r[3]),
      votesFor: Number(r[4]),
      votesAgainst: Number(r[5]),
      totalVoters: Number(r[6]),
      status: Number(r[7]) as ProposalStatus,
      createdAt: Number(r[8]),
      deadline: Number(r[9]),
      accessExpiresAt: Number(r[10]),
      categories: [],
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

  async getBalance(address: string): Promise<string> {
    const balance = await this.publicClient.getBalance({
      address: address as `0x${string}`,
    });
    return (Number(balance) / 1e18).toFixed(4);
  }
}
