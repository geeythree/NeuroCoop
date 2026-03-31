export function getDashboardHtml(contractAddress: string, ownerAddress: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NeuroConsent — Neural Data Consent on Flow</title>
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
    .subtitle { color: #888; font-size: 0.85rem; margin-bottom: 24px; }
    .badges { display: flex; gap: 8px; margin-bottom: 24px; flex-wrap: wrap; }
    .badge {
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: bold;
    }
    .badge-flow { background: #00ef8b22; color: #00ef8b; border: 1px solid #00ef8b44; }
    .badge-lit { background: #7c3aed22; color: #a78bfa; border: 1px solid #7c3aed44; }
    .badge-storacha { background: #f5932022; color: #f59320; border: 1px solid #f5932044; }
    .badge-neuro { background: #ec489922; color: #ec4899; border: 1px solid #ec489944; }

    .status-bar {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 12px;
      margin-bottom: 24px;
    }
    .stat {
      background: #12121a;
      border: 1px solid #1e1e2e;
      border-radius: 8px;
      padding: 12px 16px;
    }
    .stat-label { color: #666; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 1px; }
    .stat-value { color: #00d4aa; font-size: 1.1rem; margin-top: 4px; word-break: break-all; }
    .stat-value.warn { color: #f59320; }

    .panel {
      background: #12121a;
      border: 1px solid #1e1e2e;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 20px;
    }
    .panel h2 {
      color: #00d4aa;
      font-size: 1rem;
      margin-bottom: 16px;
      padding-bottom: 8px;
      border-bottom: 1px solid #1e1e2e;
    }

    .form-row { display: flex; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; }
    input, textarea {
      background: #0a0a0f;
      border: 1px solid #2a2a3a;
      color: #e0e0e0;
      padding: 8px 12px;
      border-radius: 4px;
      font-family: inherit;
      font-size: 0.85rem;
      flex: 1;
      min-width: 200px;
    }
    input:focus, textarea:focus { border-color: #00d4aa; outline: none; }
    textarea { min-height: 80px; resize: vertical; }

    button {
      background: #00d4aa;
      color: #0a0a0f;
      border: none;
      padding: 8px 20px;
      border-radius: 4px;
      font-family: inherit;
      font-weight: bold;
      font-size: 0.85rem;
      cursor: pointer;
      white-space: nowrap;
    }
    button:hover { background: #00f0c0; }
    button.danger { background: #ef4444; color: white; }
    button.danger:hover { background: #f87171; }
    button.secondary { background: #7c3aed; color: white; }
    button.secondary:hover { background: #8b5cf6; }

    .result {
      background: #0a0a0f;
      border: 1px solid #2a2a3a;
      border-radius: 4px;
      padding: 12px;
      margin-top: 12px;
      font-size: 0.8rem;
      white-space: pre-wrap;
      word-break: break-all;
      max-height: 300px;
      overflow-y: auto;
    }
    .result.success { border-color: #00d4aa44; }
    .result.error { border-color: #ef444444; color: #f87171; }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.8rem;
    }
    th {
      text-align: left;
      color: #666;
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 1px;
      padding: 8px;
      border-bottom: 1px solid #1e1e2e;
    }
    td {
      padding: 8px;
      border-bottom: 1px solid #1e1e2e08;
      word-break: break-all;
    }
    .tag {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 0.7rem;
      font-weight: bold;
    }
    .tag-registered { background: #00d4aa22; color: #00d4aa; }
    .tag-granted { background: #00ef8b22; color: #00ef8b; }
    .tag-revoked { background: #ef444422; color: #ef4444; }

    a { color: #00d4aa; text-decoration: none; }
    a:hover { text-decoration: underline; }

    .architecture {
      background: #0a0a0f;
      border: 1px solid #2a2a3a;
      border-radius: 4px;
      padding: 16px;
      font-size: 0.75rem;
      line-height: 1.6;
      color: #888;
      white-space: pre;
      overflow-x: auto;
    }
  </style>
</head>
<body>
  <h1>NeuroConsent</h1>
  <p class="subtitle">Privacy-preserving consent framework for neural data on the blockchain</p>

  <div class="badges">
    <span class="badge badge-flow">Flow EVM</span>
    <span class="badge badge-lit">Lit Protocol</span>
    <span class="badge badge-storacha">Storacha</span>
    <span class="badge badge-neuro">Neurotech</span>
  </div>

  <div class="status-bar" id="statusBar">
    <div class="stat"><div class="stat-label">Status</div><div class="stat-value" id="s-status">loading...</div></div>
    <div class="stat"><div class="stat-label">Owner</div><div class="stat-value" id="s-owner">${ownerAddress.slice(0, 10)}...</div></div>
    <div class="stat"><div class="stat-label">Balance</div><div class="stat-value" id="s-balance">...</div></div>
    <div class="stat"><div class="stat-label">Uploads</div><div class="stat-value" id="s-uploads">0</div></div>
    <div class="stat"><div class="stat-label">Events</div><div class="stat-value" id="s-events">0</div></div>
    <div class="stat"><div class="stat-label">Lit</div><div class="stat-value" id="s-lit">...</div></div>
  </div>

  <!-- Upload Panel -->
  <div class="panel">
    <h2>Upload Neural Data</h2>
    <p style="color: #888; font-size: 0.8rem; margin-bottom: 12px;">
      Upload EEG data — it will be encrypted via Lit Protocol, stored on Storacha, and registered on Flow EVM.
    </p>
    <div class="form-row">
      <textarea id="eegData" placeholder="Paste EEG/CSV data here, or leave empty to use sample data"></textarea>
    </div>
    <div class="form-row">
      <input id="filename" placeholder="Filename (e.g., session-001.csv)" value="sample-eeg.csv" />
      <button onclick="uploadData()">Encrypt & Upload</button>
    </div>
    <div id="uploadResult" class="result" style="display:none;"></div>
  </div>

  <!-- Consent Manager -->
  <div class="panel">
    <h2>Consent Manager</h2>
    <p style="color: #888; font-size: 0.8rem; margin-bottom: 12px;">
      Grant or revoke researcher access to your neural data. Changes are immediate and on-chain.
    </p>
    <div class="form-row">
      <input id="consentDataId" placeholder="Data ID (0x...)" />
      <input id="researcherAddr" placeholder="Researcher address (0x...)" />
    </div>
    <div class="form-row">
      <button onclick="grantConsent()">Grant Consent</button>
      <button class="danger" onclick="revokeConsent()">Revoke Consent</button>
      <button class="secondary" onclick="checkConsent()">Check Status</button>
    </div>
    <div id="consentResult" class="result" style="display:none;"></div>
  </div>

  <!-- Researcher Decrypt -->
  <div class="panel">
    <h2>Researcher — Request Decryption</h2>
    <p style="color: #888; font-size: 0.8rem; margin-bottom: 12px;">
      If you have been granted consent, Lit Protocol will verify your access on-chain and decrypt the data.
    </p>
    <div class="form-row">
      <input id="decryptDataId" placeholder="Data ID (0x...)" />
      <input id="researcherKey" type="password" placeholder="Your private key (0x...)" />
    </div>
    <div class="form-row">
      <button class="secondary" onclick="decryptData()">Request Decryption</button>
    </div>
    <div id="decryptResult" class="result" style="display:none;"></div>
  </div>

  <!-- Event Log -->
  <div class="panel">
    <h2>On-Chain Consent Events</h2>
    <table>
      <thead>
        <tr><th>Type</th><th>Data ID</th><th>Researcher</th><th>Tx</th><th>Time</th></tr>
      </thead>
      <tbody id="eventLog">
        <tr><td colspan="5" style="color:#666; text-align:center;">No events yet</td></tr>
      </tbody>
    </table>
  </div>

  <!-- Architecture -->
  <div class="panel">
    <h2>Architecture</h2>
    <div class="architecture">User uploads EEG data
       │
       ▼
  ┌─────────────────┐     ┌──────────────┐     ┌─────────────────┐
  │  Lit Protocol    │     │   Storacha   │     │   Flow EVM      │
  │  (Encryption)    │────▶│   (Storage)  │────▶│  (Consent Reg.) │
  │                  │     │              │     │                  │
  │ Encrypt with     │     │ Store on     │     │ registerData()   │
  │ access control   │     │ IPFS/Filecoin│     │ grantConsent()   │
  │ conditions       │     │              │     │ revokeConsent()  │
  └─────────────────┘     └──────────────┘     └─────────────────┘
       │                                              │
       │◀─────────── Decryption Request ──────────────┘
       │         Lit checks hasConsent()
       │         on Flow EVM contract
       ▼
  Researcher gets decrypted data
  (only if consent is active on-chain)</div>
  </div>

  <p style="color: #444; font-size: 0.7rem; text-align: center; margin-top: 24px;">
    NeuroConsent — PL Genesis: Frontiers of Collaboration | Neurotech Track
    <br/>
    Contract: <a href="https://evm-testnet.flowscan.io/address/${contractAddress}" target="_blank">${contractAddress.slice(0, 10)}...${contractAddress.slice(-8)}</a>
  </p>

  <script>
    const API = '';

    async function fetchHealth() {
      try {
        const r = await fetch(API + '/health');
        const d = await r.json();
        document.getElementById('s-status').textContent = d.status;
        document.getElementById('s-balance').textContent = d.balance;
        document.getElementById('s-uploads').textContent = d.totalUploads;
        document.getElementById('s-events').textContent = d.totalEvents;
        document.getElementById('s-lit').textContent = d.litConnected ? 'connected' : 'offline';
        if (!d.litConnected) document.getElementById('s-lit').classList.add('warn');
      } catch(e) { console.error(e); }
    }

    async function fetchEvents() {
      try {
        const r = await fetch(API + '/events');
        const d = await r.json();
        const tbody = document.getElementById('eventLog');
        if (d.events.length === 0) return;
        tbody.innerHTML = d.events.reverse().map(e => {
          const tagClass = e.type === 'DataRegistered' ? 'tag-registered' :
                          e.type === 'ConsentGranted' ? 'tag-granted' : 'tag-revoked';
          return '<tr>' +
            '<td><span class="tag ' + tagClass + '">' + e.type.replace('Consent','').replace('Data','') + '</span></td>' +
            '<td>' + e.dataId.slice(0,10) + '...</td>' +
            '<td>' + (e.researcher ? e.researcher.slice(0,10) + '...' : '-') + '</td>' +
            '<td><a href="https://evm-testnet.flowscan.io/tx/' + e.txHash + '" target="_blank">' + e.txHash.slice(0,10) + '...</a></td>' +
            '<td>' + new Date(e.timestamp).toLocaleTimeString() + '</td>' +
          '</tr>';
        }).join('');
      } catch(e) { console.error(e); }
    }

    function showResult(id, data, isError) {
      const el = document.getElementById(id);
      el.style.display = 'block';
      el.className = 'result ' + (isError ? 'error' : 'success');
      el.textContent = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    }

    async function uploadData() {
      try {
        const data = document.getElementById('eegData').value;
        const filename = document.getElementById('filename').value || 'sample-eeg.csv';
        const body = data ? { data, filename } : { filename };
        const r = await fetch(API + '/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const d = await r.json();
        showResult('uploadResult', d, !d.success);
        if (d.dataId) {
          document.getElementById('consentDataId').value = d.dataId;
          document.getElementById('decryptDataId').value = d.dataId;
        }
        fetchHealth(); fetchEvents();
      } catch(e) { showResult('uploadResult', e.message, true); }
    }

    async function grantConsent() {
      try {
        const dataId = document.getElementById('consentDataId').value;
        const researcher = document.getElementById('researcherAddr').value;
        const r = await fetch(API + '/consent/grant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataId, researcher }),
        });
        const d = await r.json();
        showResult('consentResult', d, !d.success);
        fetchHealth(); fetchEvents();
      } catch(e) { showResult('consentResult', e.message, true); }
    }

    async function revokeConsent() {
      try {
        const dataId = document.getElementById('consentDataId').value;
        const researcher = document.getElementById('researcherAddr').value;
        const r = await fetch(API + '/consent/revoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataId, researcher }),
        });
        const d = await r.json();
        showResult('consentResult', d, !d.success);
        fetchHealth(); fetchEvents();
      } catch(e) { showResult('consentResult', e.message, true); }
    }

    async function checkConsent() {
      try {
        const dataId = document.getElementById('consentDataId').value;
        const r = await fetch(API + '/consent/' + dataId);
        const d = await r.json();
        showResult('consentResult', d, !!d.error);
      } catch(e) { showResult('consentResult', e.message, true); }
    }

    async function decryptData() {
      try {
        const dataId = document.getElementById('decryptDataId').value;
        const researcherPrivateKey = document.getElementById('researcherKey').value;
        const r = await fetch(API + '/decrypt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataId, researcherPrivateKey }),
        });
        const d = await r.json();
        showResult('decryptResult', d, !d.success);
      } catch(e) { showResult('decryptResult', e.message, true); }
    }

    fetchHealth();
    fetchEvents();
    setInterval(() => { fetchHealth(); fetchEvents(); }, 10000);
  </script>
</body>
</html>`;
}
