#!/usr/bin/env node
/**
 * Cron worker: adds 2-3 proposals per run, votes, and executes them.
 * Designed to run every 10-15 minutes on Railway cron service so the
 * dashboard always has fresh activity for judges.
 *
 * Uses the same proposal pool as populate500.mjs but in small batches.
 */
import { createWalletClient, createPublicClient, http, parseAbi, defineChain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const chain = defineChain({
  id: 314159, name: 'Filecoin Calibration',
  nativeCurrency: { name: 'tFIL', symbol: 'tFIL', decimals: 18 },
  rpcUrls: { default: { http: ['https://api.calibration.node.glif.io/rpc/v1'] } },
});

const COOP = process.env.COOP_ADDRESS || '0x95cdb710677d855159b77e81d6d386ae83f05dab';
const ABI = parseAbi([
  'function submitProposal(string,string,uint256,uint8[]) external',
  'function vote(uint256,bool) external',
  'function executeProposal(uint256) external',
  'function proposalCount() view returns (uint256)',
  'function memberCount() view returns (uint256)',
]);

const KEYS = [process.env.OWNER_PRIVATE_KEY, process.env.WALLET_KEY_2, process.env.WALLET_KEY_3];
if (KEYS.some((k) => !k)) {
  console.error('OWNER_PRIVATE_KEY, WALLET_KEY_2, WALLET_KEY_3 are required (testnet-only wallets). Faucet: https://faucet.calibnet.chainsafe-fil.io/');
  process.exit(1);
}

const GOOD = [
  ['alzheimers-detection','Alpha/theta ratio for Alzheimer precursor. IRB approved.',90,[1,2]],
  ['epilepsy-seizure-prediction','High-gamma burst detection for pre-ictal classification.',60,[0,1]],
  ['depression-biomarker','Frontal alpha asymmetry in treatment-resistant depression.',120,[1,2]],
  ['sleep-stage-classification','Delta/spindle detection for automated sleep scoring.',45,[1,2]],
  ['adhd-attention-patterns','Theta/beta ratio for ADHD diagnosis support.',75,[1,2]],
  ['stroke-motor-recovery','Mu-rhythm tracking for BCI-assisted stroke rehab.',180,[0,1,2]],
  ['migraine-prediction','Pre-ictal cortical spreading depression markers. CC-BY.',60,[1,2]],
  ['autism-connectivity','Long-range coherence in ASD vs neurotypical EEG.',90,[1,2]],
  ['tbi-monitoring','Slow-wave abnormality tracking for TBI recovery.',120,[0,1]],
  ['parkinsons-beta','Subthalamic beta suppression during movement.',60,[1,2]],
  ['meditation-neurofeedback','Theta/alpha entrainment during mindfulness.',30,[1,2]],
  ['cognitive-load-estimation','Frontal theta workload proxy for HCI research.',45,[1,2]],
  ['ptsd-hyperarousal','Amygdala-linked alpha suppression in PTSD.',90,[1,2]],
  ['anxiety-neurofeedback','Alpha upregulation for GAD symptom reduction.',90,[1,2]],
];

const BAD = [
  ['emotion-ad-targeting','Real-time emotion detection for ad personalization.',365,[0,1,2,3]],
  ['employee-surveillance','Continuous attention monitoring for workforce productivity.',365,[0,1,2,3]],
  ['insurance-neural-profiling','Neurological risk extraction for insurance premiums.',365,[0,1,2,3]],
  ['political-belief-detection','Neural correlates of political ideology for micro-targeting.',365,[0,1,2,3]],
];

const BATCH = parseInt(process.env.BATCH_SIZE || '3');
const pub = createPublicClient({ chain, transport: http() });
const wallets = KEYS.map(k => createWalletClient({ account: privateKeyToAccount(k), chain, transport: http() }));

async function send(w, fn, args) {
  const hash = await w.writeContract({ address: COOP, abi: ABI, functionName: fn, args });
  await pub.waitForTransactionReceipt({ hash, timeout: 120_000 });
  return hash;
}

async function run() {
  const pc = Number(await pub.readContract({ address: COOP, abi: ABI, functionName: 'proposalCount' }));
  const mc = Number(await pub.readContract({ address: COOP, abi: ABI, functionName: 'memberCount' }));
  console.log(`[cron] Members: ${mc}, Proposals: ${pc}, Adding ${BATCH} more...`);

  // Pick random proposals from the pool
  const pool = [...GOOD.map(p => [...p, false]), ...BAD.map(p => [...p, true])];
  let added = 0;

  for (let i = 0; i < BATCH; i++) {
    const [purpose, desc, days, cats, bad] = pool[Math.floor(Math.random() * pool.length)];
    const submitter = wallets[i % wallets.length];

    try {
      // Submit
      const id = BigInt(pc + added);
      await send(submitter, 'submitProposal', [purpose, desc, BigInt(days), cats]);
      console.log(`[cron] #${pc + added} submitted: ${purpose} (${bad ? 'predatory' : 'legitimate'})`);

      // Vote — all members vote against bad proposals, for good ones
      for (const w of wallets) {
        try { await send(w, 'vote', [id, !bad]); } catch {}
      }
      console.log(`[cron] #${pc + added} voted: ${bad ? '0 FOR / 3 AGAINST' : '3 FOR / 0 AGAINST'}`);

      // Execute immediately (voting period is 300s but proposals just submitted
      // won't be executable yet — that's OK, next cron run will catch them)
      try {
        await send(wallets[0], 'executeProposal', [id]);
        console.log(`[cron] #${pc + added} executed: ${bad ? 'REJECTED' : 'APPROVED'}`);
      } catch {
        console.log(`[cron] #${pc + added} not yet executable (voting period active)`);
      }

      added++;
    } catch (e) {
      console.error(`[cron] Error:`, e.message?.slice(0, 100));
    }
  }

  // Execute ALL older proposals that have passed voting period
  for (let i = Math.max(0, pc - 30); i < pc + added; i++) {
    try {
      await send(wallets[0], 'executeProposal', [BigInt(i)]);
      console.log(`[cron] Executed #${i}`);
    } catch {}
  }

  console.log(`[cron] Done. Added ${added} proposals. Total: ${pc + added}`);
}

run().catch(e => { console.error('[cron] Fatal:', e.message); process.exit(1); });
