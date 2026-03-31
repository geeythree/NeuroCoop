import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  encodePacked,
  type PublicClient,
  type WalletClient,
  type Chain,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { type Config, CONSENT_REGISTRY_ABI } from './config.js';
import type { ConsentEvent, ConsentGrant, DataRecord, DataCategory } from './types.js';

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

export class ConsentClient {
  public readonly publicClient: PublicClient;
  public readonly ownerWallet: WalletClient;
  public readonly ownerAddress: string;
  private readonly contractAddress: `0x${string}`;
  private readonly chain: Chain;
  public readonly events: ConsentEvent[] = [];

  constructor(config: Config) {
    const chain = flowTestnet;

    this.publicClient = createPublicClient({
      chain,
      transport: http(config.flowRpcUrl),
    });

    const account = privateKeyToAccount(config.ownerPrivateKey);
    this.ownerWallet = createWalletClient({
      account,
      chain,
      transport: http(config.flowRpcUrl),
    }) as any;

    this.ownerAddress = account.address;
    this.contractAddress = config.consentRegistryAddress;
    this.chain = chain;
  }

  generateDataId(owner: string, filename: string, timestamp: number): `0x${string}` {
    return keccak256(
      encodePacked(
        ['address', 'string', 'uint256'],
        [owner as `0x${string}`, filename, BigInt(timestamp)]
      )
    );
  }

  async registerData(
    dataId: `0x${string}`,
    storachaCid: string,
    receiptCid: string,
    dataHash: string,
    channelCount: number,
    sampleRate: number,
    deidentified: boolean
  ): Promise<string> {
    const hash = await (this.ownerWallet as any).writeContract({
      address: this.contractAddress,
      abi: CONSENT_REGISTRY_ABI,
      functionName: 'registerData',
      args: [dataId, storachaCid, receiptCid, dataHash, channelCount, BigInt(sampleRate), deidentified],
      chain: this.chain,
    });

    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    console.log(`[consent] Data registered: ${dataId} tx: ${hash}`);

    this.events.push({
      type: 'DataRegistered',
      dataId,
      owner: this.ownerAddress,
      cid: storachaCid,
      timestamp: Date.now(),
      txHash: hash,
      blockNumber: Number(receipt.blockNumber),
    });

    return hash;
  }

  async grantConsent(
    dataId: `0x${string}`,
    researcher: `0x${string}`,
    purpose: string,
    expiresAt: number,
    categories: DataCategory[]
  ): Promise<string> {
    const hash = await (this.ownerWallet as any).writeContract({
      address: this.contractAddress,
      abi: CONSENT_REGISTRY_ABI,
      functionName: 'grantConsent',
      args: [dataId, researcher, purpose, BigInt(expiresAt), categories],
      chain: this.chain,
    });

    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    console.log(`[consent] Consent granted to ${researcher} for "${purpose}" tx: ${hash}`);

    this.events.push({
      type: 'ConsentGranted',
      dataId,
      owner: this.ownerAddress,
      researcher,
      purpose,
      expiresAt,
      timestamp: Date.now(),
      txHash: hash,
      blockNumber: Number(receipt.blockNumber),
    });

    return hash;
  }

  async revokeConsent(
    dataId: `0x${string}`,
    researcher: `0x${string}`,
    reason: string
  ): Promise<string> {
    const hash = await (this.ownerWallet as any).writeContract({
      address: this.contractAddress,
      abi: CONSENT_REGISTRY_ABI,
      functionName: 'revokeConsent',
      args: [dataId, researcher, reason],
      chain: this.chain,
    });

    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    console.log(`[consent] Consent revoked from ${researcher}: ${reason} tx: ${hash}`);

    this.events.push({
      type: 'ConsentRevoked',
      dataId,
      owner: this.ownerAddress,
      researcher,
      reason,
      timestamp: Date.now(),
      txHash: hash,
      blockNumber: Number(receipt.blockNumber),
    });

    return hash;
  }

  async hasConsent(dataId: `0x${string}`, researcher: `0x${string}`): Promise<boolean> {
    return await this.publicClient.readContract({
      address: this.contractAddress,
      abi: CONSENT_REGISTRY_ABI,
      functionName: 'hasConsent',
      args: [dataId, researcher],
    }) as boolean;
  }

  async getConsent(dataId: `0x${string}`, researcher: `0x${string}`): Promise<ConsentGrant | null> {
    const result = await this.publicClient.readContract({
      address: this.contractAddress,
      abi: CONSENT_REGISTRY_ABI,
      functionName: 'getConsent',
      args: [dataId, researcher],
    }) as [string, bigint, bigint, boolean, boolean];

    if (!result[0]) return null;

    return {
      purpose: result[0],
      grantedAt: Number(result[1]),
      expiresAt: Number(result[2]),
      active: result[3],
      expired: result[4],
      categories: [],
    };
  }

  async getRecord(dataId: `0x${string}`): Promise<DataRecord | null> {
    const result = await this.publicClient.readContract({
      address: this.contractAddress,
      abi: CONSENT_REGISTRY_ABI,
      functionName: 'getRecord',
      args: [dataId],
    }) as [string, string, string, string, number, bigint, bigint, boolean];

    if (result[0] === '0x0000000000000000000000000000000000000000') return null;

    return {
      dataId,
      owner: result[0],
      storachaCid: result[1],
      receiptCid: result[2],
      dataHash: result[3],
      channelCount: result[4],
      sampleRate: Number(result[5]),
      uploadedAt: Number(result[6]),
      deidentified: result[7],
    };
  }

  async getGrantedResearchers(dataId: `0x${string}`): Promise<string[]> {
    return await this.publicClient.readContract({
      address: this.contractAddress,
      abi: CONSENT_REGISTRY_ABI,
      functionName: 'getGrantedResearchers',
      args: [dataId],
    }) as string[];
  }

  async getStats(): Promise<{ records: number; consents: number; accesses: number }> {
    const [records, consents, accesses] = await Promise.all([
      this.publicClient.readContract({
        address: this.contractAddress,
        abi: CONSENT_REGISTRY_ABI,
        functionName: 'totalRecords',
      }),
      this.publicClient.readContract({
        address: this.contractAddress,
        abi: CONSENT_REGISTRY_ABI,
        functionName: 'totalConsents',
      }),
      this.publicClient.readContract({
        address: this.contractAddress,
        abi: CONSENT_REGISTRY_ABI,
        functionName: 'totalAccesses',
      }),
    ]);
    return {
      records: Number(records),
      consents: Number(consents),
      accesses: Number(accesses),
    };
  }

  async getBalance(): Promise<string> {
    const balance = await this.publicClient.getBalance({
      address: this.ownerAddress as `0x${string}`,
    });
    return (Number(balance) / 1e18).toFixed(4);
  }
}
