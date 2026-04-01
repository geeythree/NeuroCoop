export function getDashboardHtml(contractAddress: string, deployerAddress: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NeuroCoop — Neural Data Cooperative</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'SF Mono', 'Fira Code', monospace; background: #0a0a0f; color: #e0e0e0; padding: 24px; max-width: 1200px; margin: 0 auto; }
    h1 { color: #00d4aa; font-size: 1.8rem; margin-bottom: 4px; }
    .subtitle { color: #888; font-size: 0.85rem; margin-bottom: 4px; }
    .track { color: #666; font-size: 0.75rem; margin-bottom: 16px; font-style: italic; }
    .badges { display: flex; gap: 8px; margin-bottom: 20px; flex-wrap: wrap; }
    .badge { padding: 4px 10px; border-radius: 4px; font-size: 0.72rem; font-weight: bold; }
    .badge-filecoin { background: #0090ff22; color: #0090ff; border: 1px solid #0090ff44; }
    .badge-storacha { background: #f5932022; color: #f59320; border: 1px solid #f5932044; }
    .badge-neuro    { background: #ec489922; color: #ec4899; border: 1px solid #ec489944; }
    .badge-coop     { background: #3b82f622; color: #60a5fa; border: 1px solid #3b82f644; }
    .badge-ethics   { background: #a78bfa22; color: #a78bfa; border: 1px solid #a78bfa44; }

    /* Architecture diagram */
    .arch { background: #0d0d18; border: 1px solid #1e1e2e; border-radius: 8px; padding: 16px 20px; margin-bottom: 20px; font-size: 0.76rem; color: #888; line-height: 1.8; }
    .arch strong { color: #00d4aa; }
    .arch .arrow { color: #444; }

    /* Demo mode banner */
    .demo-banner { background: #1a1a0a; border: 1px solid #f59320aa; border-radius: 8px; padding: 14px 18px; margin-bottom: 20px; }
    .demo-banner h3 { color: #f59320; font-size: 0.9rem; margin-bottom: 8px; }
    .demo-banner p { font-size: 0.78rem; color: #aaa; margin-bottom: 10px; }
    .demo-banner .wallets { font-size: 0.72rem; color: #666; line-height: 1.8; }
    .demo-banner .wallets span { color: #f59320; }
    button.demo-fill { background: #f59320; color: #0a0a0f; margin-top: 8px; }

    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-bottom: 20px; }
    .stat { background: #12121a; border: 1px solid #1e1e2e; border-radius: 8px; padding: 12px 16px; }
    .stat-label { color: #666; font-size: 0.68rem; text-transform: uppercase; letter-spacing: 1px; }
    .stat-value { color: #00d4aa; font-size: 1.2rem; margin-top: 4px; }

    .panel { background: #12121a; border: 1px solid #1e1e2e; border-radius: 8px; padding: 20px; margin-bottom: 16px; }
    .panel h2 { color: #00d4aa; font-size: 1rem; margin-bottom: 6px; padding-bottom: 8px; border-bottom: 1px solid #1e1e2e; }
    .panel .how { color: #555; font-size: 0.72rem; margin-bottom: 10px; font-style: italic; }
    .panel p.desc { color: #888; font-size: 0.78rem; margin-bottom: 12px; }

    .form-row { display: flex; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; }
    input, textarea, select {
      background: #0a0a0f; border: 1px solid #2a2a3a; color: #e0e0e0;
      padding: 8px 12px; border-radius: 4px; font-family: inherit; font-size: 0.82rem; flex: 1; min-width: 180px;
    }
    input:focus, textarea:focus, select:focus { border-color: #00d4aa; outline: none; }
    textarea { min-height: 60px; resize: vertical; }
    button {
      background: #00d4aa; color: #0a0a0f; border: none; padding: 8px 18px;
      border-radius: 4px; font-family: inherit; font-weight: bold; font-size: 0.82rem; cursor: pointer; white-space: nowrap;
    }
    button:hover { opacity: 0.85; }
    button.vote-for    { background: #22c55e; color: white; }
    button.vote-against{ background: #ef4444; color: white; }
    button.secondary   { background: #3b82f6; color: white; }
    button.execute     { background: #a78bfa; color: white; }

    .result { background: #0a0a0f; border: 1px solid #2a2a3a; border-radius: 4px; padding: 12px; margin-top: 12px; font-size: 0.74rem; white-space: pre-wrap; word-break: break-all; max-height: 340px; overflow-y: auto; }
    .result.success { border-color: #00d4aa55; }
    .result.error   { border-color: #ef444455; color: #f87171; }
    .result.info    { border-color: #3b82f655; color: #93c5fd; }

    table { width: 100%; border-collapse: collapse; font-size: 0.76rem; }
    th { text-align: left; color: #555; font-size: 0.65rem; text-transform: uppercase; letter-spacing: 1px; padding: 8px; border-bottom: 1px solid #1e1e2e; }
    td { padding: 8px; border-bottom: 1px solid #1e1e2e11; vertical-align: top; }
    .tag { display: inline-block; padding: 2px 8px; border-radius: 3px; font-size: 0.68rem; font-weight: bold; }
    .tag-active   { background: #3b82f622; color: #60a5fa; }
    .tag-approved { background: #22c55e22; color: #22c55e; }
    .tag-rejected { background: #ef444422; color: #ef4444; }
    .tag-executed { background: #a78bfa22; color: #a78bfa; }
    a { color: #00d4aa; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .vote-bar { display: flex; height: 5px; border-radius: 3px; overflow: hidden; margin-top: 4px; background: #1e1e2e; }
    .vote-for-bar     { background: #22c55e; transition: width 0.3s; }
    .vote-against-bar { background: #ef4444; transition: width 0.3s; }
    .risk-low      { color: #22c55e; }
    .risk-medium   { color: #f59320; }
    .risk-high     { color: #ef4444; }
    .risk-critical { color: #dc2626; font-weight: bold; }
  </style>
</head>
<body>
  <h1>NeuroCoop</h1>
  <p class="subtitle">Neural Data Cooperative Protocol — collective governance of BCI/EEG data</p>
  <p class="track">Cognition × Coordination × Computation — PL Genesis Neurotech Track</p>

  <div class="badges">
    <span class="badge badge-neuro">Neurotech</span>
    <span class="badge badge-coop">Cooperative Governance</span>
    <span class="badge badge-filecoin">Filecoin FVM</span>
    <span class="badge badge-storacha">Storacha · IPFS</span>
    <span class="badge badge-ethics">Neurorights Foundation</span>
  </div>

  <!-- Architecture -->
  <div class="arch">
    <strong>How it works:</strong>&nbsp;
    BCI user uploads de-identified EEG <span class="arrow">→</span>
    Encrypted with ECIES &amp; stored on <strong>Storacha</strong> (IPFS/Filecoin) <span class="arrow">→</span>
    CID registered on <strong>Filecoin FVM</strong> contract <span class="arrow">→</span>
    Researcher submits proposal <span class="arrow">→</span>
    <strong>Venice AI</strong> screens ethics before voting opens <span class="arrow">→</span>
    Members vote (one member, one vote) <span class="arrow">→</span>
    Contract enforces outcome — researcher gets UCAN delegation + data access only if approved
    <br/><br/>
    <strong>Contract:</strong> <a href="https://calibration.filfox.info/en/address/${contractAddress}" target="_blank">${contractAddress}</a> on Filecoin Calibration (chain ID 314159)
  </div>

  <!-- Demo mode -->
  <div class="demo-banner">
    <h3>Demo Mode — Testnet Wallets</h3>
    <p>Pre-fill forms with testnet-only wallets to explore the full lifecycle. These keys have no real value.</p>
    <div class="wallets">
      <span>Member A:</span> 0xdf599beac33f34d81e1c7fb8e76c15f68538152f198da156268cbe72f74266ab &nbsp;|&nbsp;
      <span>Member B:</span> 0x7016002340be3593ea4a526b0c7fbe269676ac342cb8284a8d6fda25c6e292e0 &nbsp;|&nbsp;
      <span>Member C:</span> 0x7096129d010cb538ed827abad1931480a9b3d02af1a907ccc483e136440ceafe &nbsp;|&nbsp;
      <span>Researcher:</span> 0x4f811878b064165e578bc70c3e65e12934688073186fd5e6226290b8efdee8d8
    </div>
    <button class="demo-fill" onclick="fillDemoWallets()">Fill All Forms with Demo Wallets</button>
  </div>

  <!-- Live demo runner -->
  <div class="panel" style="border-color:#00d4aa44;">
    <h2 style="color:#00d4aa;">Run Live Demo</h2>
    <p class="desc">Executes the complete NeuroCoop lifecycle against the live Filecoin FVM contract — EEG processing, de-identification, cooperative join, AI ethics screening, voting, and execution. Uses testnet-only demo wallets. Transactions are real and visible on Filfox.</p>
    <p class="how">Requires tFIL at: <a href="https://faucet.calibnet.chainsafe-fil.io/" target="_blank">faucet.calibnet.chainsafe-fil.io</a> for the demo wallets.</p>
    <button id="demoBtn" onclick="runDemo()" style="font-size:0.9rem;padding:10px 28px;">Run Full Lifecycle Demo</button>
    <div id="demoResult" style="display:none;margin-top:14px;"></div>
  </div>

  <!-- Live stats -->
  <div class="stats">
    <div class="stat"><div class="stat-label">Members</div><div class="stat-value" id="s-members">—</div></div>
    <div class="stat"><div class="stat-label">Proposals</div><div class="stat-value" id="s-proposals">—</div></div>
    <div class="stat"><div class="stat-label">Chain</div><div class="stat-value" style="font-size:0.75rem;">Filecoin Cal.</div></div>
    <div class="stat"><div class="stat-label">Storage</div><div class="stat-value" id="s-storage" style="font-size:0.75rem;">—</div></div>
  </div>

  <!-- Live: Proposals table -->
  <div class="panel">
    <h2>Research Proposals <span style="color:#444;font-size:0.75rem;font-weight:normal;">(live · auto-refreshes)</span></h2>
    <table>
      <thead><tr><th>#</th><th>Purpose</th><th>Researcher</th><th>Duration</th><th>Votes (For / Against)</th><th>Status</th></tr></thead>
      <tbody id="proposalTable"><tr><td colspan="6" style="color:#555;text-align:center;padding:20px;">Loading from Filecoin...</td></tr></tbody>
    </table>
  </div>

  <!-- AI Ethics Analysis -->
  <div class="panel">
    <h2>AI Ethics Pre-Screening</h2>
    <p class="desc">Before voting opens, Venice AI (llama-3.3-70b, zero data retention) screens proposals for risks members may miss. Only the proposal text is sent — no neural data.</p>
    <p class="how">Enter a proposal ID to analyse, or paste proposal details directly.</p>
    <div class="form-row">
      <input id="aiProposalId" type="number" placeholder="Proposal ID (0, 1, 2…)" style="max-width:160px;" />
      <button class="secondary" onclick="analyseProposal()">Analyse Ethics</button>
    </div>
    <div id="aiResult" class="result" style="display:none;"></div>
  </div>

  <!-- Join Cooperative -->
  <div class="panel">
    <h2>Join the Cooperative</h2>
    <p class="desc">Upload de-identified EEG data. It is encrypted with your public key before being stored on Storacha (IPFS/Filecoin). The raw data never leaves your possession unencrypted.</p>
    <p class="how">Step 1 of 3: Join → Submit Proposal → Vote</p>
    <div class="form-row">
      <input id="joinKey" type="password" placeholder="Private key (0x…)" />
      <button onclick="joinCoop()">Join &amp; Upload EEG</button>
    </div>
    <div id="joinResult" class="result" style="display:none;"></div>
  </div>

  <!-- Submit Proposal -->
  <div class="panel">
    <h2>Submit Research Proposal</h2>
    <p class="desc">Any address can submit a proposal. Members vote on whether to grant access. Proposals are recorded on-chain.</p>
    <p class="how">Step 2 of 3: After joining, submit a proposal as a researcher.</p>
    <div class="form-row">
      <input id="propKey" type="password" placeholder="Researcher private key (0x…)" />
    </div>
    <div class="form-row">
      <input id="propPurpose" placeholder="Purpose (e.g., alzheimers-biomarker-study)" />
      <input id="propDuration" type="number" placeholder="Days" value="30" style="max-width:100px;" />
    </div>
    <div class="form-row">
      <textarea id="propDesc" placeholder="Describe the study and what data you need…"></textarea>
    </div>
    <button class="secondary" onclick="submitProposal()">Submit Proposal</button>
    <div id="propResult" class="result" style="display:none;"></div>
  </div>

  <!-- Vote -->
  <div class="panel">
    <h2>Cast Your Vote</h2>
    <p class="desc">One member = one vote. Cognitive equality — no token weighting. Quorum: 50% of members must vote for a result to be binding.</p>
    <p class="how">Step 3 of 3: Vote on a proposal, then execute it to finalise the outcome.</p>
    <div class="form-row">
      <input id="voteKey" type="password" placeholder="Member private key (0x…)" />
      <input id="voteId" type="number" placeholder="Proposal #" style="max-width:100px;" />
      <button class="vote-for" onclick="castVote(true)">Vote FOR</button>
      <button class="vote-against" onclick="castVote(false)">Vote AGAINST</button>
    </div>
    <div id="voteResult" class="result" style="display:none;"></div>
  </div>

  <!-- Execute -->
  <div class="panel">
    <h2>Execute Proposal</h2>
    <p class="desc">After the voting period, anyone can execute the proposal. The contract checks quorum and majority, then permanently records the outcome on-chain.</p>
    <div class="form-row">
      <input id="execKey" type="password" placeholder="Any private key (0x…)" />
      <input id="execId" type="number" placeholder="Proposal #" style="max-width:100px;" />
      <button class="execute" onclick="execProposal()">Execute</button>
    </div>
    <div id="execResult" class="result" style="display:none;"></div>
  </div>

  <!-- Researcher data access (with signature challenge) -->
  <div class="panel">
    <h2>Access Pooled Data (Researcher)</h2>
    <p class="desc">If your proposal was approved on-chain, access the cooperative's pooled de-identified EEG data. Identity is verified via cryptographic signature — proving you control the researcher address without transmitting a private key.</p>
    <p class="how">Flow: get challenge → sign it → submit. The contract enforces access expiry.</p>
    <div class="form-row">
      <input id="decryptId" type="number" placeholder="Approved proposal #" style="max-width:140px;" />
      <input id="decryptAddr" placeholder="Researcher address (0x…)" />
      <button class="secondary" onclick="getChallenge()">1. Get Challenge</button>
    </div>
    <div id="challengeBox" style="display:none;">
      <div class="result info" id="challengeMsg" style="margin-bottom:8px;"></div>
      <div class="form-row">
        <input id="researcherKey" type="password" placeholder="Researcher private key — signs locally, never sent" />
        <button onclick="signAndAccess()">2. Sign &amp; Access Data</button>
      </div>
    </div>
    <div id="decryptResult" class="result" style="display:none;"></div>
  </div>

  <!-- Live: Members -->
  <div class="panel">
    <h2>Cooperative Members <span style="color:#444;font-size:0.75rem;font-weight:normal;">(live)</span></h2>
    <table>
      <thead><tr><th>Address</th><th>Channels</th><th>Sample Rate</th><th>De-identified</th><th>CID (Storacha)</th><th>Joined</th></tr></thead>
      <tbody id="memberTable"><tr><td colspan="6" style="color:#555;text-align:center;padding:20px;">Loading...</td></tr></tbody>
    </table>
  </div>

  <!-- Live: Governance log -->
  <div class="panel">
    <h2>Governance Log <span style="color:#444;font-size:0.75rem;font-weight:normal;">(live)</span></h2>
    <table>
      <thead><tr><th>Event</th><th>Details</th><th>Tx (Filfox)</th><th>Time</th></tr></thead>
      <tbody id="eventLog"><tr><td colspan="4" style="color:#555;text-align:center;padding:20px;">Loading...</td></tr></tbody>
    </table>
  </div>

  <p style="color:#333;font-size:0.65rem;text-align:center;margin-top:24px;">
    NeuroCoop — PL Genesis: Frontiers of Collaboration · Neurotech Track<br/>
    Aligned with: Neurorights Foundation (Yuste et al.) · UNESCO Nov 2025 · Chile Art. 19 (2021) · Colorado HB 24-1058 · IEEE P7700<br/>
    MIT License · <a href="https://calibration.filfox.info/en/address/${contractAddress}" target="_blank">View contract on Filfox</a>
  </p>

  <script>
    const API = '';
    const STATUS_LABELS = ['Voting Open', 'Rejected', 'Access Granted', 'Expired'];
    const STATUS_TAGS   = ['tag-active', 'tag-rejected', 'tag-executed', 'tag-rejected'];

    // Demo wallets (testnet only)
    const DEMO = {
      memberA:    '0xdf599beac33f34d81e1c7fb8e76c15f68538152f198da156268cbe72f74266ab',
      memberB:    '0x7016002340be3593ea4a526b0c7fbe269676ac342cb8284a8d6fda25c6e292e0',
      researcher: '0x4f811878b064165e578bc70c3e65e12934688073186fd5e6226290b8efdee8d8',
    };

    function fillDemoWallets() {
      document.getElementById('joinKey').value    = DEMO.memberB;
      document.getElementById('propKey').value    = DEMO.researcher;
      document.getElementById('voteKey').value    = DEMO.memberA;
      document.getElementById('execKey').value    = DEMO.memberA;
      document.getElementById('researcherKey').value = DEMO.researcher;
      document.getElementById('propPurpose').value   = 'seizure-detection-validation';
      document.getElementById('propDuration').value  = '30';
      document.getElementById('propDesc').value      = 'Validate a seizure-detection ML model against de-identified EEG. Results published open-access under CC-BY 4.0.';
    }

    function show(id, data, type) {
      const el = document.getElementById(id);
      el.style.display = 'block';
      el.className = 'result ' + (type || (data?.success === false ? 'error' : 'success'));
      el.textContent = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    }

    // ── Read-only views ──────────────────────────────────────────────────────

    async function fetchHealth() {
      try {
        const d = await fetch(API + '/health').then(r => r.json());
        document.getElementById('s-members').textContent   = d.cooperative?.members ?? '?';
        document.getElementById('s-proposals').textContent = d.cooperative?.proposals ?? '?';
        document.getElementById('s-storage').textContent   = d.storage || '?';
      } catch(e) {}
    }

    async function fetchProposals() {
      try {
        const d = await fetch(API + '/proposals').then(r => r.json());
        const tb = document.getElementById('proposalTable');
        if (!d.proposals?.length) { tb.innerHTML = '<tr><td colspan="6" style="color:#555;text-align:center;padding:20px;">No proposals yet — submit one below</td></tr>'; return; }
        tb.innerHTML = d.proposals.map(p => {
          const total   = (p.votesFor || 0) + (p.votesAgainst || 0);
          const forPct  = total > 0 ? Math.round(p.votesFor / total * 100) : 0;
          const agPct   = total > 0 ? Math.round(p.votesAgainst / total * 100) : 0;
          return '<tr>' +
            '<td style="color:#888;">' + p.id + '</td>' +
            '<td><strong style="color:#e0e0e0;">' + (p.purpose||'') + '</strong><br/><span style="color:#555;font-size:0.7rem;">' + (p.description||'').slice(0,80) + (p.description?.length > 80 ? '…' : '') + '</span></td>' +
            '<td style="color:#888;">' + (p.researcher||'').slice(0,10) + '…</td>' +
            '<td style="color:#888;">' + (p.durationDays||'?') + 'd</td>' +
            '<td>' + (p.votesFor||0) + ' / ' + (p.votesAgainst||0) +
              '<div class="vote-bar"><div class="vote-for-bar" style="width:' + forPct + '%"></div><div class="vote-against-bar" style="width:' + agPct + '%"></div></div></td>' +
            '<td><span class="tag ' + (STATUS_TAGS[p.status]||'') + '">' + (STATUS_LABELS[p.status]||'?') + '</span></td>' +
          '</tr>';
        }).join('');
      } catch(e) {}
    }

    async function fetchMembers() {
      try {
        const d = await fetch(API + '/members').then(r => r.json());
        const tb = document.getElementById('memberTable');
        if (!d.members?.length) { tb.innerHTML = '<tr><td colspan="6" style="color:#555;text-align:center;padding:20px;">No members yet — join below</td></tr>'; return; }
        tb.innerHTML = d.members.map(m => {
          const cid = m.storachaCid || '';
          const cidDisplay = cid.startsWith('local:')
            ? '<span style="color:#555;" title="Storacha auth required">local cache</span>'
            : '<a href="https://' + cid + '.ipfs.w3s.link" target="_blank" title="View on IPFS">' + cid.slice(0,14) + '…</a>';
          return '<tr>' +
            '<td style="font-size:0.7rem;color:#888;">' + (m.address||'').slice(0,14) + '…</td>' +
            '<td>' + (m.channelCount||'?') + '</td>' +
            '<td>' + (m.sampleRate||'?') + ' Hz</td>' +
            '<td>' + (m.deidentified ? '<span style="color:#22c55e;">Yes</span>' : '<span style="color:#f59320;">No</span>') + '</td>' +
            '<td style="font-size:0.7rem;">' + cidDisplay + '</td>' +
            '<td style="color:#666;font-size:0.7rem;">' + (m.joinedAt ? new Date(m.joinedAt*1000).toLocaleDateString() : '?') + '</td>' +
          '</tr>';
        }).join('');
      } catch(e) {}
    }

    async function fetchEvents() {
      try {
        const d = await fetch(API + '/events').then(r => r.json());
        const tb = document.getElementById('eventLog');
        if (!d.events?.length) { tb.innerHTML = '<tr><td colspan="4" style="color:#555;text-align:center;padding:20px;">No events yet</td></tr>'; return; }
        tb.innerHTML = [...d.events].reverse().slice(0,20).map(e =>
          '<tr>' +
          '<td><span class="tag tag-active">' + e.type + '</span></td>' +
          '<td style="font-size:0.7rem;color:#888;">' + JSON.stringify(e.data||{}).slice(0,70) + '</td>' +
          '<td style="font-size:0.7rem;"><a href="https://calibration.filfox.info/en/tx/' + e.txHash + '" target="_blank">' + (e.txHash||'').slice(0,12) + '…</a></td>' +
          '<td style="color:#555;font-size:0.7rem;">' + (e.timestamp ? new Date(e.timestamp).toLocaleTimeString() : '') + '</td>' +
          '</tr>'
        ).join('');
      } catch(e) {}
    }

    // ── AI ethics analysis ────────────────────────────────────────────────────

    async function analyseProposal() {
      const id = parseInt(document.getElementById('aiProposalId').value);
      const el = document.getElementById('aiResult');
      if (isNaN(id)) { show('aiResult', 'Enter a proposal ID first.', 'error'); return; }
      el.style.display = 'block'; el.className = 'result info'; el.textContent = 'Sending to Venice AI (zero data retention)…';
      try {
        const r = await fetch(API + '/cognition/analyze-proposal', {
          method: 'POST', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ proposalId: id }),
        });
        const d = await r.json();
        if (!r.ok) { show('aiResult', d, 'error'); return; }
        const a = d.analysis;
        if (!a) { show('aiResult', d, 'info'); return; }
        const riskClass = 'risk-' + (a.riskLevel || 'medium');
        el.className = 'result success';
        el.innerHTML =
          '<strong style="color:#00d4aa;">Ethics Score: ' + a.ethicsScore + '/100</strong>  ' +
          'Risk: <span class="' + riskClass + '">' + (a.riskLevel||'').toUpperCase() + '</span>  ' +
          'Recommendation: <strong>' + (a.recommendation||'').toUpperCase() + '</strong>\\n\\n' +
          (a.reasoning ? '<em style="color:#aaa;">' + a.reasoning + '</em>\\n\\n' : '') +
          (a.concerns?.length  ? 'Concerns:\\n' + a.concerns.map(c => '  • ' + c).join('\\n') + '\\n\\n' : '') +
          (a.redFlags?.length  ? 'Red Flags:\\n' + a.redFlags.map(f => '  ⚠ ' + f).join('\\n') + '\\n\\n' : '') +
          (a.strengths?.length ? 'Strengths:\\n' + a.strengths.map(s => '  ✓ ' + s).join('\\n') + '\\n\\n' : '') +
          'Neurorights alignment:\\n' +
          Object.entries(a.alignmentScore||{}).map(([k,v]) => '  ' + k + ': ' + v + '/100').join('\\n') +
          '\\n\\nModel: ' + d.model;
      } catch(e) { show('aiResult', e.message, 'error'); }
    }

    // ── Write operations ──────────────────────────────────────────────────────

    async function joinCoop() {
      try {
        const r = await fetch(API + '/join', {
          method: 'POST', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ privateKey: document.getElementById('joinKey').value }),
        });
        show('joinResult', await r.json()); refresh();
      } catch(e) { show('joinResult', e.message, 'error'); }
    }

    async function submitProposal() {
      try {
        const r = await fetch(API + '/proposal', {
          method: 'POST', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({
            privateKey:  document.getElementById('propKey').value,
            purpose:     document.getElementById('propPurpose').value,
            description: document.getElementById('propDesc').value,
            durationDays: parseInt(document.getElementById('propDuration').value),
          }),
        });
        show('propResult', await r.json()); refresh();
      } catch(e) { show('propResult', e.message, 'error'); }
    }

    async function castVote(support) {
      try {
        const r = await fetch(API + '/vote', {
          method: 'POST', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({
            privateKey: document.getElementById('voteKey').value,
            proposalId: parseInt(document.getElementById('voteId').value),
            support,
          }),
        });
        show('voteResult', await r.json()); refresh();
      } catch(e) { show('voteResult', e.message, 'error'); }
    }

    async function execProposal() {
      try {
        const r = await fetch(API + '/execute', {
          method: 'POST', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({
            privateKey: document.getElementById('execKey').value,
            proposalId: parseInt(document.getElementById('execId').value),
          }),
        });
        show('execResult', await r.json()); refresh();
      } catch(e) { show('execResult', e.message, 'error'); }
    }

    // ── Researcher data access (proper challenge/sign flow) ───────────────────

    let _challenge = null;

    async function getChallenge() {
      const id   = document.getElementById('decryptId').value;
      const addr = document.getElementById('decryptAddr').value;
      if (!id || !addr) { show('decryptResult', 'Enter proposal ID and researcher address first.', 'error'); return; }
      try {
        const d = await fetch(API + '/challenge/' + id).then(r => r.json());
        _challenge = d;
        document.getElementById('challengeBox').style.display = 'block';
        document.getElementById('challengeMsg').textContent = 'Challenge: ' + d.message + '\\n\\nSign this message with your private key, then click Sign & Access.';
        document.getElementById('decryptResult').style.display = 'none';
      } catch(e) { show('decryptResult', e.message, 'error'); }
    }

    async function signAndAccess() {
      if (!_challenge) { show('decryptResult', 'Get a challenge first.', 'error'); return; }
      const proposalId = parseInt(document.getElementById('decryptId').value);
      const researcherAddress = document.getElementById('decryptAddr').value;
      const privateKey = document.getElementById('researcherKey').value;
      if (!privateKey) { show('decryptResult', 'Enter your private key to sign the challenge.', 'error'); return; }

      // Sign via server helper (avoids shipping ethers.js to the browser)
      try {
        const sigResp = await fetch(API + '/sign-challenge', {
          method: 'POST', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ privateKey, message: _challenge.message }),
        });
        const sigData = await sigResp.json();
        if (!sigResp.ok) { show('decryptResult', sigData, 'error'); return; }

        const r = await fetch(API + '/decrypt', {
          method: 'POST', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({
            proposalId,
            researcherAddress,
            signature: sigData.signature,
            message:   _challenge.message,
          }),
        });
        show('decryptResult', await r.json());
        document.getElementById('challengeBox').style.display = 'none';
        _challenge = null;
      } catch(e) { show('decryptResult', e.message, 'error'); }
    }

    // ── Live demo runner ──────────────────────────────────────────────────────

    async function runDemo() {
      const btn = document.getElementById('demoBtn');
      const out = document.getElementById('demoResult');
      btn.disabled = true;
      btn.textContent = 'Running…';
      out.style.display = 'block';
      out.className = 'result info';
      out.textContent = 'Submitting transactions to Filecoin Calibration…\\nThis takes ~60s (one block per step). Please wait.';

      try {
        const r = await fetch(API + '/demo/run', { method: 'POST', headers: {'Content-Type':'application/json'}, body: '{}' });
        const d = await r.json();

        if (!r.ok || !d.success) {
          out.className = 'result error';
          out.textContent = 'Demo failed:\\n' + (d.error || JSON.stringify(d, null, 2));
          return;
        }

        out.className = 'result success';
        let txt = 'Demo complete — ' + d.steps.filter(s => s.status === 'ok').length + ' steps succeeded\\n\\n';

        for (const s of d.steps) {
          const icon = s.status === 'ok' ? '✓' : s.status === 'skipped' ? '→' : '✗';
          const color = s.status === 'ok' ? '#22c55e' : s.status === 'skipped' ? '#888' : '#ef4444';
          txt += icon + ' Step ' + s.step + ': ' + s.name + '\\n';
          txt += '   ' + s.detail + '\\n';
          if (s.txHash) txt += '   Tx: ' + s.txHash + '\\n';
          txt += '\\n';
        }

        if (d.summary) {
          const sm = d.summary;
          txt += '─────────────────────────────────\\n';
          txt += 'Members:   ' + sm.members + '\\n';
          txt += 'Proposals: ' + sm.proposals + '\\n';
          txt += 'Outcome:   ' + (sm.outcome || '?') + '\\n';
          txt += 'Contract:  ' + sm.contract + '\\n';
          txt += 'Explorer:  ' + sm.contractExplorer + '\\n\\n';
          txt += 'Stack:\\n';
          for (const [k, v] of Object.entries(sm.stack || d.stack || {})) {
            txt += '  ' + k + ': ' + v + '\\n';
          }
        }

        out.textContent = txt;
        refresh(); // re-fetch live tables
      } catch(e) {
        out.className = 'result error';
        out.textContent = 'Demo error: ' + e.message;
      } finally {
        btn.disabled = false;
        btn.textContent = 'Run Full Lifecycle Demo';
      }
    }

    function refresh() { fetchHealth(); fetchProposals(); fetchMembers(); fetchEvents(); }
    refresh();
    setInterval(refresh, 10000);
  </script>
</body>
</html>`;
}
