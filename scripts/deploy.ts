import { createPublicClient, createWalletClient, http, type Chain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import solc from 'solc';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

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

async function main() {
  const privateKey = process.env.OWNER_PRIVATE_KEY;
  if (!privateKey || !privateKey.startsWith('0x') || privateKey.length !== 66) {
    console.error('Set OWNER_PRIVATE_KEY in .env (66-char hex string starting with 0x)');
    process.exit(1);
  }

  const network = (process.env.FILECOIN_NETWORK || 'calibration') as 'calibration' | 'mainnet';
  const chain = network === 'mainnet' ? filecoinMainnet : filecoinCalibration;
  const explorerBase = network === 'mainnet'
    ? 'https://filfox.info/en'
    : 'https://calibration.filfox.info/en';
  const faucet = 'https://faucet.calibnet.chainsafe-fil.io/';

  console.log(`Deploying to: ${chain.name} (Chain ID ${chain.id})`);

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  console.log(`Deployer: ${account.address}`);
  if (network === 'calibration') {
    console.log(`Fund at faucet if needed: ${faucet}`);
  }

  const rpcUrl = process.env.FILECOIN_RPC_URL || chain.rpcUrls.default.http[0];
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });

  const balance = await publicClient.getBalance({ address: account.address });
  console.log(`Balance: ${Number(balance) / 1e18} ${chain.nativeCurrency.symbol}`);

  if (balance === 0n) {
    console.error(`No balance! Fund this address: ${account.address}`);
    if (network === 'calibration') console.error(`Faucet: ${faucet}`);
    process.exit(1);
  }

  // Compile contract
  console.log('\nCompiling NeuroCoop.sol...');
  const source = readFileSync('./contracts/NeuroCoop.sol', 'utf-8');

  const input = {
    language: 'Solidity',
    sources: { 'NeuroCoop.sol': { content: source } },
    settings: {
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
      optimizer: { enabled: true, runs: 200 },
    },
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input)));

  if (output.errors) {
    const errors = output.errors.filter((e: any) => e.severity === 'error');
    if (errors.length > 0) {
      console.error('Compilation errors:');
      errors.forEach((e: any) => console.error(e.formattedMessage));
      process.exit(1);
    }
  }

  const contract = output.contracts['NeuroCoop.sol']['NeuroCoop'];
  const abi = contract.abi;
  const bytecode = '0x' + contract.evm.bytecode.object;

  console.log(`Compiled. Bytecode: ${bytecode.length} chars, ABI: ${abi.length} entries`);

  // Deploy
  console.log(`\nDeploying to ${chain.name}...`);
  const hash = await walletClient.deployContract({
    abi,
    bytecode: bytecode as `0x${string}`,
  });

  console.log(`Tx hash: ${hash}`);
  console.log(`Explorer: ${explorerBase}/tx/${hash}`);

  console.log('\nWaiting for confirmation...');
  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  console.log(`\n✅ Contract deployed!`);
  console.log(`Address: ${receipt.contractAddress}`);
  console.log(`Block: ${receipt.blockNumber}`);
  console.log(`Gas used: ${receipt.gasUsed}`);
  console.log(`Explorer: ${explorerBase}/address/${receipt.contractAddress}`);

  const deploymentOutput = {
    address: receipt.contractAddress,
    abi,
    deployer: account.address,
    blockNumber: Number(receipt.blockNumber),
    gasUsed: Number(receipt.gasUsed),
    txHash: hash,
    timestamp: new Date().toISOString(),
    network: `${chain.name} (${chain.id})`,
  };
  mkdirSync('./deployments', { recursive: true });
  writeFileSync('./deployments/latest.json', JSON.stringify(deploymentOutput, null, 2));
  console.log(`\nDeployment output written to deployments/latest.json`);

  console.log(`\nAdd to your .env:`);
  console.log(`COOP_ADDRESS=${receipt.contractAddress}`);
}

main().catch((err) => {
  console.error('Deploy failed:', err.message || err);
  process.exit(1);
});
