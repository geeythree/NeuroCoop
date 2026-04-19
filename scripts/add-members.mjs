#!/usr/bin/env node
/**
 * Bulk-add members to NeuroCoop. Funds wallets sequentially (nonce-safe),
 * then joins in parallel batches.
 */
import { createPublicClient, createWalletClient, http, parseEther, keccak256, encodePacked, defineChain } from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';

const chain = defineChain({
  id: 314159, name: 'Filecoin Calibration',
  nativeCurrency: { name: 'tFIL', symbol: 'tFIL', decimals: 18 },
  rpcUrls: { default: { http: ['https://api.calibration.node.glif.io/rpc/v1'] } },
});

const COOP = process.env.COOP_ADDRESS || '0x95cdb710677d855159b77e81d6d386ae83f05dab';
const DEPLOYER_KEY = process.env.OWNER_PRIVATE_KEY;
if (!DEPLOYER_KEY) {
  console.error('OWNER_PRIVATE_KEY is required (testnet-only wallet). Faucet: https://faucet.calibnet.chainsafe-fil.io/');
  process.exit(1);
}
const ABI = [
  { name: 'joinCooperative', type: 'function', stateMutability: 'nonpayable',
    inputs: [
      { name: 'dataId', type: 'bytes32' }, { name: 'storachaCid', type: 'string' },
      { name: 'dataHash', type: 'string' }, { name: 'channelCount', type: 'uint8' },
      { name: 'sampleRate', type: 'uint256' }, { name: 'deidentified', type: 'bool' },
    ], outputs: [] },
  { name: 'memberCount', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
];

const countArg = process.argv.indexOf('--count');
const TARGET = countArg !== -1 ? parseInt(process.argv[countArg + 1]) : 500;
const FUND_AMOUNT = parseEther('0.02');
const JOIN_BATCH = 5; // parallel join calls

const PROFILES = [
  { channels: 64, rate: 160 }, { channels: 32, rate: 256 },
  { channels: 16, rate: 512 }, { channels: 8, rate: 250 },
  { channels: 4, rate: 128 }, { channels: 128, rate: 1000 },
  { channels: 24, rate: 500 }, { channels: 14, rate: 256 },
];
const CIDS = [
  'bafkreid25u7m5ba2gu3vkqiwwxm4ne3orvqyew2oestsomalyc2hdsg7vm',
  'bafkreif7aqi5s4r3akynhxfl2rlbwxtkfcrxhevc6kzfvdconds55nwwfq',
  'bafkreihdwdcefgh4dqkjv67uzcmw7ojee2xntpw46c56myb2rfgwxxdoom',
];

const pub = createPublicClient({ chain, transport: http() });
const deployer = privateKeyToAccount(DEPLOYER_KEY);
const deployerWallet = createWalletClient({ account: deployer, chain, transport: http() });

async function main() {
  const startCount = Number(await pub.readContract({ address: COOP, abi: ABI, functionName: 'memberCount' }));
  const balance = Number(await pub.getBalance({ address: deployer.address })) / 1e18;
  console.log(`Members: ${startCount}, Target: +${TARGET}, Balance: ${balance.toFixed(1)} tFIL`);

  // Phase 1: Generate keys and fund sequentially
  console.log(`\nPhase 1: Generating and funding ${TARGET} wallets...`);
  const wallets = [];
  let funded = 0;

  for (let i = 0; i < TARGET; i++) {
    const pk = generatePrivateKey();
    const account = privateKeyToAccount(pk);
    try {
      const hash = await deployerWallet.sendTransaction({
        to: account.address, value: FUND_AMOUNT, chain,
      });
      await pub.waitForTransactionReceipt({ hash, timeout: 90_000 });
      wallets.push({ pk, account, wallet: createWalletClient({ account, chain, transport: http() }) });
      funded++;
      if (funded % 25 === 0) console.log(`  Funded: ${funded}/${TARGET}`);
      else process.stdout.write('.');
    } catch (e) {
      process.stdout.write('!');
      // Wait and retry once
      await new Promise(r => setTimeout(r, 3000));
      try {
        const hash = await deployerWallet.sendTransaction({
          to: account.address, value: FUND_AMOUNT, chain,
        });
        await pub.waitForTransactionReceipt({ hash, timeout: 90_000 });
        wallets.push({ pk, account, wallet: createWalletClient({ account, chain, transport: http() }) });
        funded++;
      } catch { process.stdout.write('X'); }
    }
  }
  console.log(`\n  Funded: ${funded} wallets`);

  // Phase 2: Join cooperative in parallel batches
  console.log(`\nPhase 2: Joining cooperative (batch size ${JOIN_BATCH})...`);
  let joined = 0;

  for (let batch = 0; batch < wallets.length; batch += JOIN_BATCH) {
    const batchWallets = wallets.slice(batch, batch + JOIN_BATCH);
    const results = await Promise.allSettled(batchWallets.map(async (w, i) => {
      const idx = batch + i;
      const profile = PROFILES[idx % PROFILES.length];
      const ts = BigInt(Math.floor(Date.now() / 1000) + idx);
      const dataId = keccak256(encodePacked(
        ['address', 'string', 'uint256'],
        [w.account.address, `eeg-${idx}.edf`, ts]
      ));
      const hash = await w.wallet.writeContract({
        address: COOP, abi: ABI, functionName: 'joinCooperative',
        args: [dataId, CIDS[idx % CIDS.length], `sha256:m${idx}`, profile.channels, BigInt(profile.rate), true],
        chain,
      });
      await pub.waitForTransactionReceipt({ hash, timeout: 90_000 });
      return w.account.address;
    }));

    joined += results.filter(r => r.status === 'fulfilled').length;
    const fails = results.filter(r => r.status === 'rejected').length;
    if (fails) process.stdout.write(`!${fails}`);
    else process.stdout.write('+');
    if (joined % 50 === 0) console.log(` | ${joined} joined`);
  }

  const finalCount = Number(await pub.readContract({ address: COOP, abi: ABI, functionName: 'memberCount' }));
  console.log(`\n\nDone. Members: ${startCount} → ${finalCount} (+${finalCount - startCount})`);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
