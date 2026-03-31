import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  encodePacked,
  type PublicClient,
  type WalletClient,
  type Chain,
  type Log,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { type Config, CONSENT_REGISTRY_ABI } from './config.js';
import type { DataRecord, ConsentEvent } from './types.js';

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
  public readonly events: ConsentEvent[] = [];

  constructor(config: Config) {
    const chain = config.flowChainId === 545 ? flowTestnet : flowTestnet;

    this.publicClient = createPublicClient({
      chain,
      transport: http(config.flowRpcUrl),
    });

    const account = privateKeyToAccount(config.ownerPrivateKey);
    this.ownerWallet = createWalletClient({
      account,
      chain,
      transport: http(config.flowRpcUrl),
    });

    this.ownerAddress = account.address;
    this.contractAddress = config.consentRegistryAddress;
  }

  generateDataId(owner: string, filename: string, timestamp: number): `0x${string}` {
    return keccak256(
      encodePacked(
        ['address', 'string', 'uint256'],
        [owner as `0x${string}`, filename, BigInt(timestamp)]
      )
    );
  }

  async registerData(dataId: `0x${string}`, storachaCid: string, dataHash: string): Promise<string> {
    const hash = await this.ownerWallet.writeContract({
      address: this.contractAddress,
      abi: CONSENT_REGISTRY_ABI,
      functionName: 'registerData',
      args: [dataId, storachaCid, dataHash],
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

  async grantConsent(dataId: `0x${string}`, researcher: `0x${string}`): Promise<string> {
    const hash = await this.ownerWallet.writeContract({
      address: this.contractAddress,
      abi: CONSENT_REGISTRY_ABI,
      functionName: 'grantConsent',
      args: [dataId, researcher],
    });

    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    console.log(`[consent] Consent granted to ${researcher} for ${dataId} tx: ${hash}`);

    this.events.push({
      type: 'ConsentGranted',
      dataId,
      owner: this.ownerAddress,
      researcher,
      timestamp: Date.now(),
      txHash: hash,
      blockNumber: Number(receipt.blockNumber),
    });

    return hash;
  }

  async revokeConsent(dataId: `0x${string}`, researcher: `0x${string}`): Promise<string> {
    const hash = await this.ownerWallet.writeContract({
      address: this.contractAddress,
      abi: CONSENT_REGISTRY_ABI,
      functionName: 'revokeConsent',
      args: [dataId, researcher],
    });

    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    console.log(`[consent] Consent revoked from ${researcher} for ${dataId} tx: ${hash}`);

    this.events.push({
      type: 'ConsentRevoked',
      dataId,
      owner: this.ownerAddress,
      researcher,
      timestamp: Date.now(),
      txHash: hash,
      blockNumber: Number(receipt.blockNumber),
    });

    return hash;
  }

  async hasConsent(dataId: `0x${string}`, researcher: `0x${string}`): Promise<boolean> {
    const result = await this.publicClient.readContract({
      address: this.contractAddress,
      abi: CONSENT_REGISTRY_ABI,
      functionName: 'hasConsent',
      args: [dataId, researcher],
    });
    return result as boolean;
  }

  async getRecord(dataId: `0x${string}`): Promise<DataRecord | null> {
    const result = await this.publicClient.readContract({
      address: this.contractAddress,
      abi: CONSENT_REGISTRY_ABI,
      functionName: 'getRecord',
      args: [dataId],
    }) as [string, string, string, bigint];

    if (result[0] === '0x0000000000000000000000000000000000000000') return null;

    return {
      dataId,
      owner: result[0],
      storachaCid: result[1],
      dataHash: result[2],
      uploadedAt: Number(result[3]),
    };
  }

  async getGrantedResearchers(dataId: `0x${string}`): Promise<string[]> {
    const result = await this.publicClient.readContract({
      address: this.contractAddress,
      abi: CONSENT_REGISTRY_ABI,
      functionName: 'getGrantedResearchers',
      args: [dataId],
    });
    return result as string[];
  }

  async getBalance(): Promise<string> {
    const balance = await this.publicClient.getBalance({
      address: this.ownerAddress as `0x${string}`,
    });
    return (Number(balance) / 1e18).toFixed(4);
  }
}
