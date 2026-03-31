import { createPublicClient, createWalletClient, http, type Chain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import solc from 'solc';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const flowTestnet: Chain = {
  id: 545,
  name: 'Flow EVM Testnet',
  nativeCurrency: { name: 'Flow', symbol: 'FLOW', decimals: 18 },
  rpcUrls: { default: { http: ['https://testnet.evm.nodes.onflow.org'] } },
  blockExplorers: { default: { name: 'FlowScan', url: 'https://evm-testnet.flowscan.io' } },
};

async function main() {
  const privateKey = process.env.OWNER_PRIVATE_KEY;
  if (!privateKey) {
    console.error('Set OWNER_PRIVATE_KEY in .env');
    process.exit(1);
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  console.log(`Deployer: ${account.address}`);

  const publicClient = createPublicClient({ chain: flowTestnet, transport: http() });
  const walletClient = createWalletClient({ account, chain: flowTestnet, transport: http() });

  const balance = await publicClient.getBalance({ address: account.address });
  console.log(`Balance: ${Number(balance) / 1e18} FLOW`);

  if (balance === 0n) {
    console.error('No FLOW balance! Fund this address: ' + account.address);
    console.error('Faucet: https://faucet.flow.com/');
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
  console.log('\nDeploying to Flow EVM Testnet...');
  const hash = await walletClient.deployContract({
    abi,
    bytecode: bytecode as `0x${string}`,
  });

  console.log(`Tx hash: ${hash}`);
  console.log(`Explorer: https://evm-testnet.flowscan.io/tx/${hash}`);

  console.log('\nWaiting for confirmation...');
  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  console.log(`\n✅ Contract deployed!`);
  console.log(`Address: ${receipt.contractAddress}`);
  console.log(`Block: ${receipt.blockNumber}`);
  console.log(`Gas used: ${receipt.gasUsed}`);
  console.log(`Explorer: https://evm-testnet.flowscan.io/address/${receipt.contractAddress}`);

  // Write deployment output to file
  const deploymentOutput = {
    address: receipt.contractAddress,
    abi,
    deployer: account.address,
    blockNumber: Number(receipt.blockNumber),
    gasUsed: Number(receipt.gasUsed),
    txHash: hash,
    timestamp: new Date().toISOString(),
    network: 'Flow EVM Testnet (545)',
  };
  mkdirSync('./deployments', { recursive: true });
  writeFileSync(
    './deployments/latest.json',
    JSON.stringify(deploymentOutput, null, 2)
  );
  console.log(`\nDeployment output written to deployments/latest.json`);

  console.log(`\nAdd to your .env:`);
  console.log(`COOP_ADDRESS=${receipt.contractAddress}`);
}

main().catch((err) => {
  console.error('Deploy failed:', err.message || err);
  process.exit(1);
});
