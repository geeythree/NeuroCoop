import { createWalletClient, createPublicClient, http, parseAbi, defineChain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const chain = defineChain({
  id: 314159, name: 'Filecoin Calibration',
  nativeCurrency: { name: 'tFIL', symbol: 'tFIL', decimals: 18 },
  rpcUrls: { default: { http: ['https://api.calibration.node.glif.io/rpc/v1'] } },
});
const COOP = '0x95cdb710677d855159b77e81d6d386ae83f05dab';
const ABI = parseAbi([
  'function submitProposal(string,string,uint256,uint8[]) external',
  'function vote(uint256,bool) external',
  'function executeProposal(uint256) external',
  'function proposalCount() view returns (uint256)',
]);
const KEYS = [
  process.env.WALLET_KEY_1 || '0x7096129d010cb538ed827abad1931480a9b3d02af1a907ccc483e136440ceafe',
  process.env.WALLET_KEY_2 || '0xae5374ce56e1f61d98c4b6d3ada9d189d535a90808f514ce2fde2004877cb4fb',
  process.env.WALLET_KEY_3 || '0x4f811878b064165e578bc70c3e65e12934688073186fd5e6226290b8efdee8d8',
];

// --batch N flag: only add N proposals per run (for scheduled CI jobs)
const batchArg = process.argv.indexOf('--batch');
const BATCH = batchArg !== -1 ? parseInt(process.argv[batchArg + 1]) : 500;
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
  ['schizophrenia-gamma','ASSR 40Hz gamma entrainment deficits.',90,[1,2]],
  ['parkinsons-beta','Subthalamic beta suppression during movement.',60,[1,2]],
  ['meditation-neurofeedback','Theta/alpha entrainment during mindfulness.',30,[1,2]],
  ['neonatal-monitoring','Burst-suppression for neonatal hypoxic encephalopathy.',90,[0,1]],
  ['chronic-pain-signature','Thalamocortical dysrhythmia in chronic pain.',60,[1,2]],
  ['cognitive-load-estimation','Frontal theta workload proxy for HCI research.',45,[1,2]],
  ['als-bci-communication','P300/SSVEP hybrid BCI for ALS communication.',180,[0,1,2]],
  ['ptsd-hyperarousal','Amygdala-linked alpha suppression in PTSD.',90,[1,2]],
  ['dyslexia-reading','Posterior alpha/beta during phonological processing.',60,[1,2]],
  ['anesthesia-depth','Burst suppression tracking for anesthesia depth.',45,[0,1]],
  ['anxiety-neurofeedback','Alpha upregulation for GAD symptom reduction.',90,[1,2]],
];
const BAD = [
  ['emotion-ad-targeting','Real-time emotion detection for ad personalization and purchase intent.',365,[0,1,2,3]],
  ['employee-surveillance','Continuous attention monitoring for workforce productivity scoring.',365,[0,1,2,3]],
  ['insurance-neural-profiling','Neurological risk extraction for insurance premium calculation.',365,[0,1,2,3]],
  ['political-belief-detection','Neural correlates of political ideology for voter micro-targeting.',365,[0,1,2,3]],
];

const pub = createPublicClient({ chain, transport: http() });
const wallets = KEYS.map(k => createWalletClient({ account: privateKeyToAccount(k), chain, transport: http() }));

async function send(w, fn, args) {
  const hash = await w.writeContract({ address: COOP, abi: ABI, functionName: fn, args });
  await pub.waitForTransactionReceipt({ hash, timeout: 120000 });
  return hash;
}

const start = Number(await pub.readContract({ address: COOP, abi: ABI, functionName: 'proposalCount' }));
console.log(`Starting at #${start}`);

const all = [];
while (all.length < BATCH) {
  for (const p of GOOD) all.push([...p, false]);
  for (const p of BAD) all.push([...p, true]);
}
all.length = BATCH;

let done = 0;
for (const [purpose, desc, days, cats, bad] of all) {
  try {
    await send(wallets[done % 3], 'submitProposal', [purpose, desc, BigInt(days), cats]);
    const id = BigInt(start + done);
    const voters = bad ? wallets : wallets.slice(0, 2 + (done % 2));
    for (const w of voters) try { await send(w, 'vote', [id, !bad]); } catch {}
    await send(wallets[0], 'executeProposal', [id]);
    done++;
    if (done % 10 === 0) process.stdout.write(`${done} `);
  } catch(e) {
    process.stdout.write(`!`);
    await new Promise(r => setTimeout(r, 2000));
  }
}
console.log(`\nDone. ${done} proposals added. Total: ${start + done}`);
