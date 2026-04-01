export function getDashboardHtml(contractAddress: string, deployerAddress: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NeuroCoop — Neural Data Cooperative</title>
  <style>
    :root { --bg: #0a0a0f; --card: #12121a; --border: #1e1e2e; --accent: #00d4aa; --text: #e0e0e0; --muted: #888; --dim: #555; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--bg); color: var(--text); max-width: 960px; margin: 0 auto; padding: 32px 20px; }

    header { margin-bottom: 32px; }
    header h1 { color: var(--accent); font-size: 2rem; margin-bottom: 6px; letter-spacing: -0.5px; }
    header p { color: var(--muted); font-size: 0.9rem; line-height: 1.5; }
    .tags { display: flex; gap: 6px; margin-top: 12px; flex-wrap: wrap; }
    .tag { padding: 3px 10px; border-radius: 20px; font-size: 0.7rem; font-weight: 600; }
    .tag-fil { background: #0090ff18; color: #4da6ff; }
    .tag-stor { background: #f5932018; color: #f59320; }
    .tag-neur { background: #ec489918; color: #ec4899; }
    .tag-ven { background: #a78bfa18; color: #a78bfa; }
    .tag-coop { background: #22c55e18; color: #22c55e; }

    /* Stats bar */
    .stats-bar { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 28px; }
    .stat-card { background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 16px; text-align: center; }
    .stat-card .num { font-size: 1.6rem; font-weight: 700; color: var(--accent); }
    .stat-card .lbl { font-size: 0.68rem; color: var(--dim); text-transform: uppercase; letter-spacing: 1px; margin-top: 4px; }

    /* Flow pipeline */
    .pipeline { background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 20px; margin-bottom: 28px; }
    .pipeline h3 { color: var(--accent); font-size: 0.85rem; margin-bottom: 12px; }
    .pipe-steps { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
    .pipe-step { padding: 6px 14px; border-radius: 6px; font-size: 0.75rem; font-weight: 600; white-space: nowrap; }
    .pipe-step.active { background: var(--accent); color: var(--bg); }
    .pipe-step.done { background: #22c55e22; color: #22c55e; }
    .pipe-step.pending { background: #ffffff08; color: var(--dim); }
    .pipe-arrow { color: #333; font-size: 0.9rem; }

    /* Cards */
    .card { background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 24px; margin-bottom: 16px; }
    .card h2 { font-size: 1.05rem; color: var(--text); margin-bottom: 4px; }
    .card .sub { font-size: 0.78rem; color: var(--muted); margin-bottom: 16px; line-height: 1.4; }
    .card-row { display: flex; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; align-items: center; }

    input, textarea, select { background: #0d0d18; border: 1px solid #2a2a3a; color: var(--text); padding: 10px 14px; border-radius: 6px; font-size: 0.85rem; font-family: inherit; flex: 1; min-width: 160px; }
    input:focus, textarea:focus { border-color: var(--accent); outline: none; }
    textarea { min-height: 70px; resize: vertical; }

    .btn { border: none; padding: 10px 20px; border-radius: 6px; font-size: 0.85rem; font-weight: 600; cursor: pointer; font-family: inherit; transition: opacity 0.15s; white-space: nowrap; }
    .btn:hover { opacity: 0.85; }
    .btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .btn-primary { background: var(--accent); color: var(--bg); }
    .btn-blue { background: #3b82f6; color: white; }
    .btn-green { background: #22c55e; color: white; }
    .btn-red { background: #ef4444; color: white; }
    .btn-purple { background: #a78bfa; color: white; }
    .btn-orange { background: #f59320; color: var(--bg); }
    .btn-sm { padding: 6px 14px; font-size: 0.78rem; }

    /* Response boxes */
    .resp { border-radius: 8px; padding: 14px 16px; margin-top: 12px; font-size: 0.82rem; line-height: 1.5; display: none; }
    .resp.ok { display: block; background: #22c55e0a; border: 1px solid #22c55e33; }
    .resp.err { display: block; background: #ef44440a; border: 1px solid #ef444433; color: #f87171; }
    .resp.loading { display: block; background: #3b82f60a; border: 1px solid #3b82f633; color: #93c5fd; }
    .resp .label { font-weight: 600; color: var(--accent); display: block; margin-bottom: 6px; }
    .resp .field { color: var(--muted); font-size: 0.78rem; margin: 2px 0; }
    .resp .tx-link { color: var(--accent); font-size: 0.75rem; word-break: break-all; }

    /* Tables */
    table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
    th { text-align: left; color: var(--dim); font-size: 0.65rem; text-transform: uppercase; letter-spacing: 1px; padding: 10px 8px; border-bottom: 1px solid var(--border); }
    td { padding: 10px 8px; border-bottom: 1px solid #ffffff06; vertical-align: top; }
    .status { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 0.7rem; font-weight: 600; }
    .status-active { background: #3b82f618; color: #60a5fa; }
    .status-approved { background: #22c55e18; color: #22c55e; }
    .status-rejected { background: #ef444418; color: #ef4444; }

    .vote-bar { display: flex; height: 4px; border-radius: 2px; overflow: hidden; margin-top: 6px; background: #1e1e2e; }
    .vb-for { background: #22c55e; transition: width 0.3s; }
    .vb-against { background: #ef4444; transition: width 0.3s; }

    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
    footer { color: #333; font-size: 0.65rem; text-align: center; margin-top: 40px; line-height: 1.7; }

    /* AI result */
    .ai-result { padding: 16px; border-radius: 8px; background: #0d0d18; border: 1px solid var(--border); }
    .ai-score { font-size: 2rem; font-weight: 700; }
    .ai-score.low { color: #22c55e; }
    .ai-score.med { color: #f59320; }
    .ai-score.high { color: #ef4444; }
    .ai-rec { display: inline-block; padding: 4px 12px; border-radius: 4px; font-weight: 700; font-size: 0.78rem; margin-left: 12px; }
    .ai-rec.approve { background: #22c55e22; color: #22c55e; }
    .ai-rec.scrutinize { background: #f5932022; color: #f59320; }
    .ai-rec.reject { background: #ef444422; color: #ef4444; }
    .ai-detail { margin-top: 12px; font-size: 0.8rem; color: var(--muted); line-height: 1.6; }
    .ai-list { margin: 6px 0; padding-left: 16px; }
    .ai-list li { margin: 3px 0; }
    .align-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 10px; }
    .align-item { font-size: 0.75rem; color: var(--muted); }
    .align-bar { height: 3px; border-radius: 2px; background: #1e1e2e; margin-top: 3px; }
    .align-fill { height: 100%; border-radius: 2px; background: var(--accent); }

    @media (max-width: 640px) {
      .stats-bar { grid-template-columns: repeat(2, 1fr); }
      .pipe-steps { flex-direction: column; align-items: flex-start; }
      .pipe-arrow { display: none; }
    }
  </style>
</head>
<body>

<header>
  <h1>NeuroCoop</h1>
  <p>Neural Data Cooperative Protocol — BCI users pool de-identified EEG data, vote on research access, and receive AI-assisted ethics screening before every decision.</p>
  <div class="tags">
    <span class="tag tag-neur">Neurotech</span>
    <span class="tag tag-coop">Cooperative Governance</span>
    <span class="tag tag-fil">Filecoin FVM</span>
    <span class="tag tag-stor">Storacha / IPFS</span>
    <span class="tag tag-ven">Venice AI Ethics</span>
  </div>
</header>

<!-- Stats -->
<div class="stats-bar">
  <div class="stat-card"><div class="num" id="s-members">-</div><div class="lbl">Members</div></div>
  <div class="stat-card"><div class="num" id="s-proposals">-</div><div class="lbl">Proposals</div></div>
  <div class="stat-card"><div class="num" style="font-size:0.85rem;color:#4da6ff;" id="s-contract">${contractAddress.slice(0,8)}...</div><div class="lbl">Contract</div></div>
  <div class="stat-card"><div class="num" style="font-size:0.85rem;" id="s-status">-</div><div class="lbl">Status</div></div>
</div>

<!-- Pipeline visualisation -->
<div class="pipeline">
  <h3>Protocol Flow</h3>
  <div class="pipe-steps">
    <div class="pipe-step active">Upload EEG</div><span class="pipe-arrow">&rarr;</span>
    <div class="pipe-step active">De-identify + Encrypt</div><span class="pipe-arrow">&rarr;</span>
    <div class="pipe-step active">Store on Storacha</div><span class="pipe-arrow">&rarr;</span>
    <div class="pipe-step active">Join on Filecoin</div><span class="pipe-arrow">&rarr;</span>
    <div class="pipe-step active">Propose Research</div><span class="pipe-arrow">&rarr;</span>
    <div class="pipe-step active">AI Ethics Screen</div><span class="pipe-arrow">&rarr;</span>
    <div class="pipe-step active">Vote (1 member = 1 vote)</div><span class="pipe-arrow">&rarr;</span>
    <div class="pipe-step active">Access Granted / Denied</div>
  </div>
</div>

<!-- Live Proposals -->
<div class="card">
  <h2>Research Proposals</h2>
  <div class="sub">Live from Filecoin Calibration. Auto-refreshes. Latest first.</div>
  <div style="max-height:420px;overflow-y:auto;border:1px solid var(--border);border-radius:6px;">
  <table>
    <thead style="position:sticky;top:0;background:var(--card);z-index:1;"><tr><th>#</th><th>Purpose</th><th>Researcher</th><th>Duration</th><th>Votes</th><th>Status</th><th></th></tr></thead>
    <tbody id="proposalTable"><tr><td colspan="7" style="color:var(--dim);text-align:center;padding:20px;">Loading...</td></tr></tbody>
  </table>
  </div>
</div>

<!-- EEG Band Power — zero input -->
<div class="card">
  <h2>EEG Signal Analysis</h2>
  <div class="sub">Real signal processing on 64-channel clinical EEG from PhysioNet EEGMMIDB (CC0). Extracts delta/theta/alpha/beta/gamma band power. No external API -- runs in-process.</div>
  <button class="btn btn-blue" onclick="runBandPower()">Run Band Power Analysis</button>
  <div id="bandResp" class="resp"></div>
</div>

<!-- AI Ethics — pre-filled -->
<div class="card" id="aiCard">
  <h2>AI Ethics Pre-Screening</h2>
  <div class="sub">Venice AI (llama-3.3-70b, zero data retention) screens proposals against Neurorights principles. Only proposal text is sent -- never neural data. The AI advises; the cooperative decides.</div>
  <div class="card-row">
    <input id="aiId" type="number" value="0" style="max-width:120px;" />
    <span style="color:var(--dim);font-size:0.78rem;padding:10px 0;">Proposal # to analyse (try 0)</span>
    <button class="btn btn-purple" onclick="analyseEthics()">Run Ethics Analysis</button>
  </div>
  <div id="aiResp" class="resp"></div>
</div>

<!-- Step 1: Join -->
<div class="card">
  <h2>Step 1: Join the Cooperative</h2>
  <div class="sub">De-identifies EEG (Laplace noise + PII strip), encrypts (ECIES secp256k1), stores on Storacha, registers on Filecoin. ~30s for on-chain confirmation.</div>
  <div style="font-size:0.75rem;color:var(--dim);margin-bottom:8px;">Testnet wallet (pre-filled) -- has no real value. <a href="https://faucet.calibnet.chainsafe-fil.io/" target="_blank">Faucet</a></div>
  <div class="card-row">
    <input id="joinKey" type="text" value="0x7096129d010cb538ed827abad1931480a9b3d02af1a907ccc483e136440ceafe" style="font-size:0.72rem;font-family:monospace;color:var(--dim);" />
    <button class="btn btn-primary" onclick="doJoin()">Join & Upload EEG</button>
  </div>
  <div id="joinResp" class="resp"></div>
</div>

<!-- Step 2: Propose -->
<div class="card">
  <h2>Step 2: Submit Research Proposal</h2>
  <div class="sub">Researchers describe their study. Members vote after AI ethics screening.</div>
  <div style="font-size:0.75rem;color:var(--dim);margin-bottom:8px;">Testnet researcher wallet (pre-filled)</div>
  <div class="card-row">
    <input id="propKey" type="text" value="0x4f811878b064165e578bc70c3e65e12934688073186fd5e6226290b8efdee8d8" style="font-size:0.72rem;font-family:monospace;color:var(--dim);" />
  </div>
  <div class="card-row">
    <input id="propPurpose" value="cognitive-profiling-for-ad-targeting" placeholder="Purpose" />
    <input id="propDays" type="number" value="365" style="max-width:90px;" />
  </div>
  <div class="card-row">
    <textarea id="propDesc">Continuous monitoring of attention and emotional state for personalised advertising. We will build predictive models of purchase intent from neural oscillation patterns.</textarea>
  </div>
  <div style="font-size:0.72rem;color:#f59320;margin-bottom:8px;">This is a deliberately predatory proposal -- run AI Ethics on it after submitting to see it flagged.</div>
  <div class="card-row">
    <button class="btn btn-blue" onclick="doPropose()">Submit Proposal</button>
  </div>
  <div id="propResp" class="resp"></div>
</div>

<!-- Step 3: Vote -->
<div class="card">
  <h2>Step 3: Vote</h2>
  <div class="sub">One member = one vote. No token weighting (cognitive equality). 50% quorum required for a binding result.</div>
  <div style="font-size:0.75rem;color:var(--dim);margin-bottom:8px;">Use any registered member's key. Proposal # is pre-filled with the latest.</div>
  <div class="card-row">
    <input id="voteKey" type="text" value="0xae5374ce56e1f61d98c4b6d3ada9d189d535a90808f514ce2fde2004877cb4fb" style="font-size:0.72rem;font-family:monospace;color:var(--dim);" />
    <input id="voteId" type="number" value="0" style="max-width:100px;" />
    <button class="btn btn-green" onclick="doVote(true)">Vote FOR</button>
    <button class="btn btn-red" onclick="doVote(false)">Vote AGAINST</button>
  </div>
  <div id="voteResp" class="resp"></div>
</div>

<!-- Step 4: Execute -->
<div class="card">
  <h2>Step 4: Execute Proposal</h2>
  <div class="sub">After the voting period (5 min), anyone can trigger execution. The contract checks quorum + majority and permanently records the outcome on-chain.</div>
  <div class="card-row">
    <input id="execKey" type="text" value="0xae5374ce56e1f61d98c4b6d3ada9d189d535a90808f514ce2fde2004877cb4fb" style="font-size:0.72rem;font-family:monospace;color:var(--dim);" />
    <input id="execId" type="number" value="0" style="max-width:100px;" />
    <button class="btn btn-purple" onclick="doExec()">Execute</button>
  </div>
  <div id="execResp" class="resp"></div>
</div>

<!-- Members -->
<div class="card">
  <h2>Cooperative Members</h2>
  <div class="sub">Live from Filecoin.</div>
  <table>
    <thead><tr><th>Address</th><th>Channels</th><th>Rate</th><th>De-ID</th><th>Storacha CID</th><th>Joined</th></tr></thead>
    <tbody id="memberTable"><tr><td colspan="6" style="color:var(--dim);text-align:center;padding:20px;">Loading...</td></tr></tbody>
  </table>
</div>

<!-- Events -->
<div class="card">
  <h2>Governance Log</h2>
  <table>
    <thead><tr><th>Event</th><th>Details</th><th>Tx</th><th>Time</th></tr></thead>
    <tbody id="eventLog"><tr><td colspan="4" style="color:var(--dim);text-align:center;padding:20px;">Loading...</td></tr></tbody>
  </table>
</div>

<footer>
  NeuroCoop -- PL Genesis: Frontiers of Collaboration &middot; Neurotech Track<br/>
  Aligned with Neurorights Foundation &middot; UNESCO 2025 &middot; Chile Art. 19 &middot; Colorado HB 24-1058 &middot; IEEE P7700<br/>
  <a href="https://calibration.filfox.info/en/address/${contractAddress}" target="_blank">View contract on Filfox</a>
</footer>

<script>
const API = '';
const SL = ['Voting Open','Rejected','Access Granted','Expired'];
const SC = ['status-active','status-rejected','status-approved','status-rejected'];

function fmtAddr(a) { return a ? a.slice(0,6)+'...'+a.slice(-4) : '?'; }
function fmtErr(d) {
  if (typeof d === 'string') return d;
  let msg = d?.error || d?.message || JSON.stringify(d);
  // Extract contract revert reason from viem errors
  const revert = msg.match(/reverted with the following reason:\\s*(.+?)\\s*(?:\\n|Contract Call|$)/);
  if (revert) return revert[1];
  const reason = msg.match(/revert reason=\\[Error\\(([^)]+)\\)\\]/);
  if (reason) return reason[1];
  const simple = msg.match(/Error\\(([^)]+)\\)/);
  if (simple) return simple[1];
  // Trim long messages
  if (msg.length > 200) msg = msg.slice(0, 200) + '...';
  return msg;
}

function showResp(id, data, ok) {
  const el = document.getElementById(id);
  if (ok === 'loading') { el.className='resp loading'; el.innerHTML=data; return; }
  el.className = ok ? 'resp ok' : 'resp err';
  el.innerHTML = ok ? data : fmtErr(data);
}

// ── Reads ──

async function refresh() {
  try {
    const h = await fetch(API+'/health').then(r=>r.json());
    document.getElementById('s-members').textContent = h.cooperative?.members ?? '?';
    document.getElementById('s-proposals').textContent = h.cooperative?.proposals ?? '?';
    document.getElementById('s-status').textContent = h.contractReady ? 'Live' : 'Deploying';
  } catch(e) {}
  fetchProposals(); fetchMembers(); fetchEvents();
}

async function fetchProposals() {
  try {
    const d = await fetch(API+'/proposals').then(r=>r.json());
    const tb = document.getElementById('proposalTable');
    if (!d.proposals?.length) { tb.innerHTML='<tr><td colspan="7" style="color:var(--dim);text-align:center;padding:20px;">No proposals yet</td></tr>'; return; }
    // Hide expired proposals with 0 votes (testing noise), sort latest first
    const meaningful = d.proposals.filter(p => p.status !== 3 || (p.votesFor||0)+(p.votesAgainst||0) > 0).reverse();
    if (!meaningful.length) { tb.innerHTML='<tr><td colspan="7" style="color:var(--dim);text-align:center;padding:20px;">No proposals yet</td></tr>'; return; }
    tb.innerHTML = meaningful.map(p => {
      const t = (p.votesFor||0)+(p.votesAgainst||0);
      const fp = t>0 ? Math.round(p.votesFor/t*100) : 0;
      const ap = t>0 ? Math.round(p.votesAgainst/t*100) : 0;
      return '<tr><td style="color:var(--muted);">'+p.id+'</td>'+
        '<td><strong>'+esc(p.purpose||'')+'</strong><br/><span style="color:var(--dim);font-size:0.75rem;">'+esc((p.description||'').slice(0,80))+'</span></td>'+
        '<td style="color:var(--muted);font-size:0.78rem;">'+fmtAddr(p.researcher)+'</td>'+
        '<td>'+p.durationDays+'d</td>'+
        '<td>'+(p.votesFor||0)+' / '+(p.votesAgainst||0)+'<div class="vote-bar"><div class="vb-for" style="width:'+fp+'%"></div><div class="vb-against" style="width:'+ap+'%"></div></div></td>'+
        '<td><span class="status '+(SC[p.status]||'')+'">'+(SL[p.status]||'?')+'</span></td>'+
        '<td>'+(p.status===0?'<button class="btn btn-purple btn-sm" onclick="document.getElementById(\\'aiId\\').value='+p.id+';analyseEthics()">AI Screen</button>':'')+'</td></tr>';
    }).join('');
  } catch(e) {}
}

async function fetchMembers() {
  try {
    const d = await fetch(API+'/members').then(r=>r.json());
    const tb = document.getElementById('memberTable');
    if (!d.members?.length) { tb.innerHTML='<tr><td colspan="6" style="color:var(--dim);text-align:center;padding:20px;">No members yet</td></tr>'; return; }
    tb.innerHTML = d.members.map(m => {
      const cid = m.storachaCid||'';
      const cidHtml = cid.startsWith('local:')
        ? '<span style="color:var(--dim);">local</span>'
        : '<a href="https://'+cid+'.ipfs.w3s.link" target="_blank">'+cid.slice(0,12)+'...</a>';
      return '<tr><td style="font-size:0.78rem;">'+fmtAddr(m.address)+'</td><td>'+m.channelCount+'</td><td>'+m.sampleRate+' Hz</td>'+
        '<td>'+(m.deidentified?'<span style="color:#22c55e;">Yes</span>':'No')+'</td><td style="font-size:0.75rem;">'+cidHtml+'</td>'+
        '<td style="color:var(--dim);font-size:0.75rem;">'+(m.joinedAt?new Date(m.joinedAt*1000).toLocaleDateString():'')+'</td></tr>';
    }).join('');
  } catch(e) {}
}

async function fetchEvents() {
  try {
    const d = await fetch(API+'/events').then(r=>r.json());
    const tb = document.getElementById('eventLog');
    if (!d.events?.length) { tb.innerHTML='<tr><td colspan="4" style="color:var(--dim);text-align:center;padding:20px;">No events yet</td></tr>'; return; }
    tb.innerHTML = [...d.events].reverse().slice(0,15).map(e =>
      '<tr><td><span class="status status-active">'+e.type+'</span></td>'+
      '<td style="font-size:0.75rem;color:var(--muted);">'+esc(JSON.stringify(e.data||{}).slice(0,60))+'</td>'+
      '<td><a href="https://calibration.filfox.info/en/tx/'+e.txHash+'" target="_blank" style="font-size:0.72rem;">'+(e.txHash||'').slice(0,10)+'...</a></td>'+
      '<td style="color:var(--dim);font-size:0.72rem;">'+(e.timestamp?new Date(e.timestamp).toLocaleTimeString():'')+'</td></tr>'
    ).join('');
  } catch(e) {}
}

// ── AI Ethics ──

async function analyseEthics() {
  const id = parseInt(document.getElementById('aiId').value);
  if (isNaN(id)) { showResp('aiResp','Enter a proposal number first.',false); return; }
  showResp('aiResp','Sending to Venice AI (zero data retention)...','loading');
  try {
    const r = await fetch(API+'/cognition/analyze-proposal',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({proposalId:id})});
    const d = await r.json();
    if (!r.ok || !d.analysis) { showResp('aiResp',d,false); return; }
    const a = d.analysis;
    const sc = a.ethicsScore >= 70 ? 'low' : a.ethicsScore >= 40 ? 'med' : 'high';
    const rc = a.recommendation || 'scrutinize';
    let html = '<div class="ai-result"><span class="ai-score '+sc+'">'+a.ethicsScore+'</span><span style="color:var(--dim);font-size:0.85rem;">/100</span>';
    html += '<span class="ai-rec '+rc+'">'+rc.toUpperCase()+'</span>';
    html += '<div class="ai-detail">'+esc(a.reasoning||'')+'</div>';
    if (a.concerns?.length) html += '<div class="ai-detail"><strong style="color:#f59320;">Concerns:</strong><ul class="ai-list">'+a.concerns.map(c=>'<li>'+esc(c)+'</li>').join('')+'</ul></div>';
    if (a.redFlags?.length) html += '<div class="ai-detail"><strong style="color:#ef4444;">Red Flags:</strong><ul class="ai-list">'+a.redFlags.map(f=>'<li>'+esc(f)+'</li>').join('')+'</ul></div>';
    if (a.strengths?.length) html += '<div class="ai-detail"><strong style="color:#22c55e;">Strengths:</strong><ul class="ai-list">'+a.strengths.map(s=>'<li>'+esc(s)+'</li>').join('')+'</ul></div>';
    if (a.alignmentScore) {
      html += '<div class="align-grid">';
      for (const [k,v] of Object.entries(a.alignmentScore)) {
        html += '<div class="align-item">'+k.replace(/([A-Z])/g,' $1').trim()+' <strong>'+v+'</strong><div class="align-bar"><div class="align-fill" style="width:'+v+'%"></div></div></div>';
      }
      html += '</div>';
    }
    html += '<div style="color:var(--dim);font-size:0.7rem;margin-top:12px;">Model: '+esc(d.model||'')+'</div></div>';
    const el = document.getElementById('aiResp');
    el.className = 'resp ok'; el.innerHTML = html;
  } catch(e) { showResp('aiResp',e.message,false); }
}

// ── Band Power ──

async function runBandPower() {
  showResp('bandResp','Processing 64-channel EEG (160 Hz, 61s)...','loading');
  try {
    const r = await fetch(API+'/cognition/eeg-bands',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
    const d = await r.json();
    if (!d.success) { showResp('bandResp',d,false); return; }
    const b = d.bandPower;
    const rp = b.relativePowerPercent||{};
    const bands = ['delta','theta','alpha','beta','gamma'];
    const colors = {delta:'#3b82f6',theta:'#22c55e',alpha:'#f59320',beta:'#ef4444',gamma:'#a78bfa'};
    let html = '<div class="ai-result"><strong style="color:var(--accent);">Dominant band: '+b.dominantBand+'</strong>';
    html += '<div class="ai-detail">'+esc(b.interpretation||'')+'</div>';
    html += '<div style="display:flex;gap:8px;margin-top:14px;align-items:flex-end;height:80px;">';
    for (const band of bands) {
      const pct = rp[band]||0;
      html += '<div style="flex:1;text-align:center;"><div style="background:'+colors[band]+';height:'+Math.max(4,pct*0.8)+'px;border-radius:3px 3px 0 0;margin:0 auto;width:80%;"></div><div style="font-size:0.65rem;color:var(--dim);margin-top:4px;">'+band+'<br/>'+pct+'%</div></div>';
    }
    html += '</div>';
    html += '<div style="color:var(--dim);font-size:0.7rem;margin-top:10px;">Source: '+esc(d.source||'')+'</div>';
    html += '</div>';
    const el = document.getElementById('bandResp');
    el.className = 'resp ok'; el.innerHTML = html;
  } catch(e) { showResp('bandResp',e.message,false); }
}

// ── Write ops ──

async function post(url, body) {
  const r = await fetch(API+url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  return {data: await r.json(), ok: r.ok};
}

function fmtResult(d) {
  let html = '';
  if (d.txHash) html += '<span class="label">Transaction confirmed</span>';
  if (d.explorerUrl) html += '<div class="field"><a href="'+d.explorerUrl+'" target="_blank" class="tx-link">View on Filfox &rarr;</a></div>';
  if (d.member) html += '<div class="field">Member: '+fmtAddr(d.member)+'</div>';
  if (d.proposalId !== undefined) html += '<div class="field">Proposal #'+d.proposalId+'</div>';
  if (d.purpose) html += '<div class="field">Purpose: '+esc(d.purpose)+'</div>';
  if (d.voter) html += '<div class="field">Voter: '+fmtAddr(d.voter)+'</div>';
  if (d.support !== undefined) html += '<div class="field">Vote: '+(d.support?'<span style="color:#22c55e;">FOR</span>':'<span style="color:#ef4444;">AGAINST</span>')+'</div>';
  if (d.currentTally) html += '<div class="field">Tally: '+d.currentTally.for+' for / '+d.currentTally.against+' against</div>';
  if (d.outcome) html += '<div class="field">Outcome: <strong>'+d.outcome+'</strong></div>';
  if (d.message) html += '<div class="field" style="color:var(--accent);">'+esc(d.message)+'</div>';
  return html || '<pre>'+esc(JSON.stringify(d,null,2))+'</pre>';
}

async function doJoin() {
  const key = document.getElementById('joinKey').value;
  if (!key) { showResp('joinResp','Enter a private key to join.',false); return; }
  showResp('joinResp','Submitting to Filecoin... (takes ~30s)','loading');
  try {
    const {data,ok} = await post('/join',{privateKey:key});
    if (ok && data.success) { showResp('joinResp',fmtResult(data),true); refresh(); }
    else showResp('joinResp',data,false);
  } catch(e) { showResp('joinResp',e.message,false); }
}

async function doPropose() {
  const key = document.getElementById('propKey').value;
  const purpose = document.getElementById('propPurpose').value;
  const desc = document.getElementById('propDesc').value;
  const days = parseInt(document.getElementById('propDays').value);
  if (!key||!purpose) { showResp('propResp','Fill in all fields.',false); return; }
  showResp('propResp','Submitting proposal to Filecoin...','loading');
  try {
    const {data,ok} = await post('/proposal',{privateKey:key,purpose,description:desc,durationDays:days});
    if (ok && data.success) { showResp('propResp',fmtResult(data),true); refresh(); }
    else showResp('propResp',data,false);
  } catch(e) { showResp('propResp',e.message,false); }
}

async function doVote(support) {
  const key = document.getElementById('voteKey').value;
  const id = parseInt(document.getElementById('voteId').value);
  if (!key||isNaN(id)) { showResp('voteResp','Enter key and proposal number.',false); return; }
  showResp('voteResp','Casting vote on Filecoin...','loading');
  try {
    const {data,ok} = await post('/vote',{privateKey:key,proposalId:id,support});
    if (ok && data.success) { showResp('voteResp',fmtResult(data),true); refresh(); }
    else showResp('voteResp',data,false);
  } catch(e) { showResp('voteResp',e.message,false); }
}

async function doExec() {
  const key = document.getElementById('execKey').value;
  const id = parseInt(document.getElementById('execId').value);
  if (!key||isNaN(id)) { showResp('execResp','Enter key and proposal number.',false); return; }
  showResp('execResp','Executing proposal...','loading');
  try {
    const {data,ok} = await post('/execute',{privateKey:key,proposalId:id});
    if (ok && data.success) { showResp('execResp',fmtResult(data),true); refresh(); }
    else showResp('execResp',data,false);
  } catch(e) { showResp('execResp',e.message,false); }
}

function esc(s) { const d=document.createElement('div'); d.textContent=s; return d.innerHTML; }

refresh();
setInterval(refresh, 10000);
</script>
</body>
</html>`;
}
