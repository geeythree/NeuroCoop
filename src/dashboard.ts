export function getDashboardHtml(contractAddress: string, deployerAddress: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NeuroCoop — Neural Data Cooperative</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'SF Mono', 'Fira Code', monospace;
      background: #0a0a0f;
      color: #e0e0e0;
      padding: 24px;
      max-width: 1200px;
      margin: 0 auto;
    }
    h1 { color: #00d4aa; font-size: 1.8rem; margin-bottom: 4px; }
    .subtitle { color: #888; font-size: 0.85rem; margin-bottom: 8px; }
    .track { color: #666; font-size: 0.75rem; margin-bottom: 24px; font-style: italic; }
    .badges { display: flex; gap: 8px; margin-bottom: 24px; flex-wrap: wrap; }
    .badge { padding: 4px 10px; border-radius: 4px; font-size: 0.72rem; font-weight: bold; }
    .badge-filecoin { background: #0090ff22; color: #0090ff; border: 1px solid #0090ff44; }
    .badge-storacha { background: #f5932022; color: #f59320; border: 1px solid #f5932044; }
    .badge-neuro { background: #ec489922; color: #ec4899; border: 1px solid #ec489944; }
    .badge-coop { background: #3b82f622; color: #60a5fa; border: 1px solid #3b82f644; }
    .badge-ethics { background: #a78bfa22; color: #a78bfa; border: 1px solid #a78bfa44; }

    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-bottom: 24px; }
    .stat { background: #12121a; border: 1px solid #1e1e2e; border-radius: 8px; padding: 12px 16px; }
    .stat-label { color: #666; font-size: 0.68rem; text-transform: uppercase; letter-spacing: 1px; }
    .stat-value { color: #00d4aa; font-size: 1.2rem; margin-top: 4px; }

    .panel { background: #12121a; border: 1px solid #1e1e2e; border-radius: 8px; padding: 20px; margin-bottom: 20px; }
    .panel h2 { color: #00d4aa; font-size: 1rem; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #1e1e2e; }
    .panel p.desc { color: #888; font-size: 0.8rem; margin-bottom: 12px; }

    .form-row { display: flex; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; }
    input, textarea, select {
      background: #0a0a0f; border: 1px solid #2a2a3a; color: #e0e0e0;
      padding: 8px 12px; border-radius: 4px; font-family: inherit; font-size: 0.85rem; flex: 1; min-width: 180px;
    }
    input:focus, textarea:focus, select:focus { border-color: #00d4aa; outline: none; }
    textarea { min-height: 60px; resize: vertical; }

    button {
      background: #00d4aa; color: #0a0a0f; border: none; padding: 8px 20px;
      border-radius: 4px; font-family: inherit; font-weight: bold; font-size: 0.85rem;
      cursor: pointer; white-space: nowrap;
    }
    button:hover { background: #00f0c0; }
    button.vote-for { background: #22c55e; color: white; }
    button.vote-against { background: #ef4444; color: white; }
    button.secondary { background: #3b82f6; color: white; }
    button.execute { background: #a78bfa; color: white; }

    .result {
      background: #0a0a0f; border: 1px solid #2a2a3a; border-radius: 4px;
      padding: 12px; margin-top: 12px; font-size: 0.78rem;
      white-space: pre-wrap; word-break: break-all; max-height: 300px; overflow-y: auto;
    }
    .result.success { border-color: #00d4aa44; }
    .result.error { border-color: #ef444444; color: #f87171; }

    table { width: 100%; border-collapse: collapse; font-size: 0.78rem; }
    th { text-align: left; color: #666; font-size: 0.68rem; text-transform: uppercase; letter-spacing: 1px; padding: 8px; border-bottom: 1px solid #1e1e2e; }
    td { padding: 8px; border-bottom: 1px solid #1e1e2e08; }
    .tag { display: inline-block; padding: 2px 8px; border-radius: 3px; font-size: 0.7rem; font-weight: bold; }
    .tag-active { background: #3b82f622; color: #60a5fa; }
    .tag-approved { background: #22c55e22; color: #22c55e; }
    .tag-rejected { background: #ef444422; color: #ef4444; }
    .tag-executed { background: #a78bfa22; color: #a78bfa; }
    a { color: #00d4aa; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .vote-bar { display: flex; height: 6px; border-radius: 3px; overflow: hidden; margin-top: 4px; }
    .vote-for-bar { background: #22c55e; }
    .vote-against-bar { background: #ef4444; }
    .vote-empty { background: #1e1e2e; flex: 1; }
  </style>
</head>
<body>
  <h1>NeuroCoop</h1>
  <p class="subtitle">Neural Data Cooperative Protocol</p>
  <p class="track">Cognition x Coordination x Computation — PL Genesis Neurotech Track</p>

  <div class="badges">
    <span class="badge badge-neuro">Neurotech</span>
    <span class="badge badge-coop">Cooperative</span>
    <span class="badge badge-filecoin">Filecoin FVM</span>
    <span class="badge badge-storacha">Storacha</span>
    <span class="badge badge-ethics">Neurorights</span>
  </div>

  <div class="stats">
    <div class="stat"><div class="stat-label">Members</div><div class="stat-value" id="s-members">0</div></div>
    <div class="stat"><div class="stat-label">Proposals</div><div class="stat-value" id="s-proposals">0</div></div>
    <div class="stat"><div class="stat-label">Status</div><div class="stat-value" id="s-status">...</div></div>
    <div class="stat"><div class="stat-label">Contract</div><div class="stat-value" style="font-size:0.7rem;">${contractAddress.slice(0, 10)}...</div></div>
  </div>

  <!-- Join Cooperative -->
  <div class="panel">
    <h2>Join the Cooperative</h2>
    <p class="desc">Contribute de-identified EEG data to the collective pool. Your data is encrypted with your key and stored on Storacha.</p>
    <div class="form-row">
      <input id="joinKey" type="password" placeholder="Your private key (0x...)" />
      <button onclick="joinCoop()">Join & Upload EEG</button>
    </div>
    <div id="joinResult" class="result" style="display:none;"></div>
  </div>

  <!-- Submit Proposal -->
  <div class="panel">
    <h2>Submit Research Proposal</h2>
    <p class="desc">Researchers propose studies. Members vote on whether to grant access. One member = one vote.</p>
    <div class="form-row">
      <input id="propKey" type="password" placeholder="Researcher private key (0x...)" />
    </div>
    <div class="form-row">
      <input id="propPurpose" placeholder="Purpose ID (e.g., alzheimers-biomarker)" />
      <input id="propDuration" type="number" placeholder="Duration (days)" value="90" style="max-width:120px;" />
    </div>
    <div class="form-row">
      <textarea id="propDesc" placeholder="Describe your research and what data you need..."></textarea>
    </div>
    <div class="form-row">
      <button class="secondary" onclick="submitProposal()">Submit Proposal</button>
    </div>
    <div id="propResult" class="result" style="display:none;"></div>
  </div>

  <!-- Proposals & Voting -->
  <div class="panel">
    <h2>Research Proposals</h2>
    <table>
      <thead><tr><th>#</th><th>Purpose</th><th>Researcher</th><th>Duration</th><th>Votes</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody id="proposalTable"><tr><td colspan="7" style="color:#666;text-align:center;">No proposals yet</td></tr></tbody>
    </table>
  </div>

  <!-- Vote -->
  <div class="panel">
    <h2>Cast Your Vote</h2>
    <p class="desc">As a cooperative member, vote on research proposals. Your vote is recorded on-chain.</p>
    <div class="form-row">
      <input id="voteKey" type="password" placeholder="Your private key (0x...)" />
      <input id="voteId" type="number" placeholder="Proposal #" style="max-width:100px;" />
      <button class="vote-for" onclick="castVote(true)">Vote FOR</button>
      <button class="vote-against" onclick="castVote(false)">Vote AGAINST</button>
    </div>
    <div id="voteResult" class="result" style="display:none;"></div>
  </div>

  <!-- Execute -->
  <div class="panel">
    <h2>Execute Proposal</h2>
    <p class="desc">After voting, anyone can execute the proposal to finalize the outcome.</p>
    <div class="form-row">
      <input id="execKey" type="password" placeholder="Any private key (0x...)" />
      <input id="execId" type="number" placeholder="Proposal #" style="max-width:100px;" />
      <button class="execute" onclick="execProposal()">Execute</button>
    </div>
    <div id="execResult" class="result" style="display:none;"></div>
  </div>

  <!-- Decrypt / Access Data -->
  <div class="panel">
    <h2>Access Pooled Data (Researcher)</h2>
    <p class="desc">If your proposal was approved, access the cooperative's pooled de-identified EEG data.</p>
    <div class="form-row">
      <input id="decryptId" type="number" placeholder="Approved Proposal #" style="max-width:140px;" />
      <input id="decryptAddr" placeholder="Researcher address (0x...)" />
      <button class="secondary" onclick="accessData()">Request Data Access</button>
    </div>
    <div id="decryptResult" class="result" style="display:none;"></div>
  </div>

  <!-- Members -->
  <div class="panel">
    <h2>Cooperative Members</h2>
    <table>
      <thead><tr><th>Address</th><th>Channels</th><th>Sample Rate</th><th>De-identified</th><th>Joined</th></tr></thead>
      <tbody id="memberTable"><tr><td colspan="5" style="color:#666;text-align:center;">No members yet</td></tr></tbody>
    </table>
  </div>

  <!-- Event Log -->
  <div class="panel">
    <h2>Governance Log</h2>
    <table>
      <thead><tr><th>Event</th><th>Details</th><th>Tx</th><th>Time</th></tr></thead>
      <tbody id="eventLog"><tr><td colspan="4" style="color:#666;text-align:center;">No events yet</td></tr></tbody>
    </table>
  </div>

  <p style="color:#444;font-size:0.65rem;text-align:center;margin-top:24px;">
    NeuroCoop — PL Genesis: Frontiers of Collaboration | Neurotech Track<br/>
    Aligned with: Neurorights Foundation, UNESCO 2025, Chile 2021, Colorado HB 24-1058, IEEE P7700<br/>
    Contract: <a href="https://calibration.filfox.info/en/address/${contractAddress}" target="_blank">${contractAddress}</a> on Filecoin Calibration
  </p>

  <script>
    const API = '';
    const statusLabels = ['Voting Open', 'Rejected', 'Access Granted', 'Expired'];
    const statusTags = ['tag-active', 'tag-rejected', 'tag-executed', 'tag-rejected'];

    function show(id, data, err) {
      const el = document.getElementById(id);
      el.style.display = 'block';
      el.className = 'result ' + (err ? 'error' : 'success');
      el.textContent = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    }

    async function fetchHealth() {
      try {
        const r = await fetch(API + '/health');
        const d = await r.json();
        document.getElementById('s-members').textContent = d.cooperative?.members ?? '?';
        document.getElementById('s-proposals').textContent = d.cooperative?.proposals ?? '?';
        document.getElementById('s-status').textContent = d.status;
      } catch(e) {}
    }

    async function fetchProposals() {
      try {
        const r = await fetch(API + '/proposals');
        const d = await r.json();
        const tb = document.getElementById('proposalTable');
        if (!d.proposals?.length) return;
        tb.innerHTML = d.proposals.map(p => {
          const total = p.votesFor + p.votesAgainst;
          const forPct = total > 0 ? (p.votesFor / total * 100) : 0;
          const againstPct = total > 0 ? (p.votesAgainst / total * 100) : 0;
          return '<tr>' +
            '<td>' + p.id + '</td>' +
            '<td><strong>' + p.purpose + '</strong><br/><span style="color:#888;font-size:0.7rem;">' + (p.description||'').slice(0,60) + '</span></td>' +
            '<td>' + (p.researcher||'').slice(0,10) + '...</td>' +
            '<td>' + p.durationDays + 'd</td>' +
            '<td>' + p.votesFor + ' / ' + p.votesAgainst +
              '<div class="vote-bar"><div class="vote-for-bar" style="width:' + forPct + '%"></div><div class="vote-against-bar" style="width:' + againstPct + '%"></div><div class="vote-empty"></div></div></td>' +
            '<td><span class="tag ' + (statusTags[p.status]||'') + '">' + (statusLabels[p.status]||'?') + '</span></td>' +
            '<td>' + (p.status === 0 ? '<span style="color:#888;font-size:0.7rem;">vote below</span>' : '-') + '</td>' +
          '</tr>';
        }).join('');
      } catch(e) {}
    }

    async function fetchMembers() {
      try {
        const r = await fetch(API + '/members');
        const d = await r.json();
        const tb = document.getElementById('memberTable');
        if (!d.members?.length) return;
        tb.innerHTML = d.members.map(m =>
          '<tr><td>' + m.address.slice(0,12) + '...</td><td>' + m.channelCount + '</td><td>' + m.sampleRate + ' Hz</td><td>' + (m.deidentified ? 'Yes' : 'No') + '</td><td>' + new Date(m.joinedAt*1000).toLocaleDateString() + '</td></tr>'
        ).join('');
      } catch(e) {}
    }

    async function fetchEvents() {
      try {
        const r = await fetch(API + '/events');
        const d = await r.json();
        const tb = document.getElementById('eventLog');
        if (!d.events?.length) return;
        tb.innerHTML = d.events.reverse().map(e =>
          '<tr><td><span class="tag tag-active">' + e.type + '</span></td>' +
          '<td style="font-size:0.7rem;">' + JSON.stringify(e.data).slice(0,60) + '</td>' +
          '<td><a href="https://calibration.filfox.info/en/tx/' + e.txHash + '" target="_blank">' + e.txHash.slice(0,10) + '...</a></td>' +
          '<td>' + new Date(e.timestamp).toLocaleTimeString() + '</td></tr>'
        ).join('');
      } catch(e) {}
    }

    async function joinCoop() {
      try {
        const r = await fetch(API + '/join', { method: 'POST', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ privateKey: document.getElementById('joinKey').value }) });
        show('joinResult', await r.json(), !r.ok); refresh();
      } catch(e) { show('joinResult', e.message, true); }
    }

    async function submitProposal() {
      try {
        const r = await fetch(API + '/proposal', { method: 'POST', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({
            privateKey: document.getElementById('propKey').value,
            purpose: document.getElementById('propPurpose').value,
            description: document.getElementById('propDesc').value,
            durationDays: parseInt(document.getElementById('propDuration').value),
          }) });
        show('propResult', await r.json(), !r.ok); refresh();
      } catch(e) { show('propResult', e.message, true); }
    }

    async function castVote(support) {
      try {
        const r = await fetch(API + '/vote', { method: 'POST', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({
            privateKey: document.getElementById('voteKey').value,
            proposalId: parseInt(document.getElementById('voteId').value),
            support,
          }) });
        show('voteResult', await r.json(), !r.ok); refresh();
      } catch(e) { show('voteResult', e.message, true); }
    }

    async function execProposal() {
      try {
        const r = await fetch(API + '/execute', { method: 'POST', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({
            privateKey: document.getElementById('execKey').value,
            proposalId: parseInt(document.getElementById('execId').value),
          }) });
        show('execResult', await r.json(), !r.ok); refresh();
      } catch(e) { show('execResult', e.message, true); }
    }

    async function accessData() {
      try {
        const r = await fetch(API + '/decrypt', { method: 'POST', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({
            proposalId: parseInt(document.getElementById('decryptId').value),
            researcherAddress: document.getElementById('decryptAddr').value,
          }) });
        show('decryptResult', await r.json(), !r.ok);
      } catch(e) { show('decryptResult', e.message, true); }
    }

    function refresh() { fetchHealth(); fetchProposals(); fetchMembers(); fetchEvents(); }
    refresh();
    setInterval(refresh, 8000);
  </script>
</body>
</html>`;
}
