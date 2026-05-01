'use strict';

// ── DOM refs ───────────────────────────────────────────────
const urlInput     = document.getElementById('url-input');
const pwInput      = document.getElementById('pw-input');
const skipSslChk   = document.getElementById('skip-ssl');
const connectBtn   = document.getElementById('connect-btn');
const forgetBtn    = document.getElementById('forget-btn');
const refreshBtn   = document.getElementById('refresh-btn');
const statusDot    = document.getElementById('status-dot');
const statusText   = document.getElementById('status-text');
const toastCont    = document.getElementById('toast-container');

const aTbody       = document.getElementById('a-tbody');
const aEmpty       = document.getElementById('a-empty');
const aLoading     = document.getElementById('a-loading');
const aHostname    = document.getElementById('a-hostname');
const aIp          = document.getElementById('a-ip');
const aAddBtn      = document.getElementById('a-add-btn');
const aSearch      = document.getElementById('a-search');
const aCount       = document.getElementById('a-count');

const cnameTbody   = document.getElementById('cname-tbody');
const cnameEmpty   = document.getElementById('cname-empty');
const cnameLoading = document.getElementById('cname-loading');
const cnameAlias   = document.getElementById('cname-alias');
const cnameTarget  = document.getElementById('cname-target');
const cnameAddBtn  = document.getElementById('cname-add-btn');
const cnameSearch  = document.getElementById('cname-search');
const cnameCount   = document.getElementById('cname-count');

// ── App state ──────────────────────────────────────────
let connected   = false;
let aCache      = [];
let cnameCache  = [];

// ── Utilities ─────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escAttr(str) {
  return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── Status ─────────────────────────────────────────────────
function setStatus(state, text) {
  statusDot.dataset.state = state;
  statusText.textContent = text;
}

// ── Toast ──────────────────────────────────────────────────
function toast(message, type = 'info', duration = 3200) {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  toastCont.appendChild(el);
  setTimeout(() => {
    el.classList.add('fade-out');
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }, duration);
}

// ── Tab switching ──────────────────────────────────────────
document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`panel-${tab.dataset.tab}`).classList.add('active');
  });
});

// ── Connect / Disconnect ───────────────────────────────────
connectBtn.addEventListener('click', () => {
  if (connected) disconnect(); else connect();
});

forgetBtn.addEventListener('click', async () => {
  await window.pihole.deleteConfig();
  forgetBtn.hidden = true;
  urlInput.value = 'http://pi.hole';
  pwInput.value = '';
  skipSslChk.checked = true;
  toast('Saved credentials removed', 'info');
});

pwInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') connect(); });

async function connect() {
  const baseUrl = urlInput.value.trim();
  const password = pwInput.value;
  const skipSslVerify = skipSslChk.checked;

  if (!baseUrl) { toast('Please enter a Pi-hole URL.', 'error'); return; }

  connectBtn.disabled = true;
  setStatus('connecting', 'Connecting\u2026');

  const res = await window.pihole.connect({ baseUrl, password, skipSslVerify });

  if (res.ok) {
    connected = true;
    connectBtn.textContent = 'Disconnect';
    connectBtn.classList.replace('btn-primary', 'btn-ghost');
    connectBtn.disabled = false;
    refreshBtn.disabled = false;
    aAddBtn.disabled = false;
    cnameAddBtn.disabled = false;
    aSearch.disabled = false;
    cnameSearch.disabled = false;

    let host = baseUrl;
    try { host = new URL(baseUrl).hostname; } catch {}
    setStatus('connected', `Connected to ${host}`);
    toast(`Connected to ${host}`, 'success');
    await window.pihole.saveConfig({ url: baseUrl, password, skipSsl: skipSslVerify });
    forgetBtn.hidden = false;
    loadAll();
  } else {
    connectBtn.disabled = false;
    setStatus('error', `Connection failed: ${res.error}`);
    toast(`Connection failed: ${res.error}`, 'error', 6000);
  }
}

async function disconnect() {
  await window.pihole.disconnect();
  connected = false;
  connectBtn.textContent = 'Connect';
  connectBtn.classList.replace('btn-ghost', 'btn-primary');
  refreshBtn.disabled = true;
  aAddBtn.disabled = true;
  cnameAddBtn.disabled = true;
  aSearch.disabled = true;
  aSearch.value = '';
  cnameSearch.disabled = true;
  cnameSearch.value = '';
  aCount.textContent = '';
  cnameCount.textContent = '';
  aLoading.hidden = true;
  cnameLoading.hidden = true;
  renderARecords([]);
  renderCnames([]);
  setStatus('idle', 'Not connected');
  toast('Disconnected', 'info');
}

// ── Load All ───────────────────────────────────────────────
function loadAll() {
  loadARecords();
  loadCnames();
}

refreshBtn.addEventListener('click', loadAll);

// ── A Records ─────────────────────────────────────────────
async function loadARecords() {
  aLoading.hidden = false;
  aEmpty.hidden = true;
  aTbody.innerHTML = '';

  const res = await window.pihole.getARecords();
  aLoading.hidden = true;

  if (!res.ok) {
    aEmpty.textContent = `Error: ${res.error}`;
    aEmpty.hidden = false;
    toast(`Failed to load A records: ${res.error}`, 'error');
    return;
  }

  renderARecords(res.records);
  updateCnameTargets(res.records);
}

aSearch.addEventListener('input', () => filterARecords());

function filterARecords() {
  const q = aSearch.value.trim().toLowerCase();
  const filtered = q
    ? aCache.filter(r => r.hostname.toLowerCase().includes(q) || r.ip.toLowerCase().includes(q))
    : aCache;
  renderARecords(filtered, q);
}

function renderARecords(records, query = '') {
  aTbody.innerHTML = '';
  // update cache only when not filtering
  if (!query) aCache = records;

  const total = aCache.length;
  aCount.textContent = query
    ? `${records.length} of ${total} record${total !== 1 ? 's' : ''}`
    : `${total} record${total !== 1 ? 's' : ''}`;

  if (records.length === 0) {
    aEmpty.textContent = query ? 'No matching records.' : (connected ? 'No A records found.' : '');
    aEmpty.hidden = !connected && !query;
    return;
  }

  aEmpty.hidden = true;
  records.forEach(({ hostname, ip }) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escHtml(hostname)}</td>
      <td class="mono">${escHtml(ip)}</td>
      <td class="col-action">
        <button class="btn btn-danger"
          data-hostname="${escAttr(hostname)}"
          data-ip="${escAttr(ip)}">Delete</button>
      </td>`;
    aTbody.appendChild(tr);
  });

  aTbody.querySelectorAll('button[data-hostname]').forEach((btn) => {
    btn.addEventListener('click', () => deleteARecord(btn.dataset.hostname, btn.dataset.ip));
  });
}

async function deleteARecord(hostname, ip) {
  if (!confirm(`Delete A record?\n\n${hostname}  \u2192  ${ip}`)) return;
  const res = await window.pihole.deleteARecord({ hostname, ip });
  if (res.ok) {
    toast(`Deleted ${hostname}`, 'success');
    loadARecords();
  } else {
    toast(`Delete failed: ${res.error}`, 'error');
  }
}

aAddBtn.addEventListener('click', addARecord);
aHostname.addEventListener('keydown', (e) => { if (e.key === 'Enter') addARecord(); });
aIp.addEventListener('keydown', (e) => { if (e.key === 'Enter') addARecord(); });

async function addARecord() {
  const hostname = aHostname.value.trim();
  const ip = aIp.value.trim();
  if (!hostname || !ip) { toast('Hostname and IP are required.', 'error'); return; }

  aAddBtn.disabled = true;
  const res = await window.pihole.addARecord({ hostname, ip });
  aAddBtn.disabled = false;

  if (res.ok) {
    toast(`Added ${hostname} \u2192 ${ip}`, 'success');
    aHostname.value = '';
    aIp.value = '';
    loadARecords();
  } else {
    toast(`Add failed: ${res.error}`, 'error');
  }
}

// ── CNAME Records ─────────────────────────────────────────
async function loadCnames() {
  cnameLoading.hidden = false;
  cnameEmpty.hidden = true;
  cnameTbody.innerHTML = '';

  const res = await window.pihole.getCnames();
  cnameLoading.hidden = true;

  if (!res.ok) {
    cnameEmpty.textContent = `Error: ${res.error}`;
    cnameEmpty.hidden = false;
    toast(`Failed to load CNAME records: ${res.error}`, 'error');
    return;
  }

  renderCnames(res.records);
}

cnameSearch.addEventListener('input', () => filterCnames());

function filterCnames() {
  const q = cnameSearch.value.trim().toLowerCase();
  const filtered = q
    ? cnameCache.filter(r => r.alias.toLowerCase().includes(q) || r.target.toLowerCase().includes(q))
    : cnameCache;
  renderCnames(filtered, q);
}

function renderCnames(records, query = '') {
  cnameTbody.innerHTML = '';
  if (!query) cnameCache = records;

  const total = cnameCache.length;
  cnameCount.textContent = query
    ? `${records.length} of ${total} record${total !== 1 ? 's' : ''}`
    : `${total} record${total !== 1 ? 's' : ''}`;

  if (records.length === 0) {
    cnameEmpty.textContent = query ? 'No matching records.' : (connected ? 'No CNAME records found.' : '');
    cnameEmpty.hidden = !connected && !query;
    return;
  }

  cnameEmpty.hidden = true;
  records.forEach(({ alias, target }) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="mono">${escHtml(alias)}</td>
      <td class="mono">${escHtml(target)}</td>
      <td class="col-action">
        <button class="btn btn-danger"
          data-alias="${escAttr(alias)}"
          data-target="${escAttr(target)}">Delete</button>
      </td>`;
    cnameTbody.appendChild(tr);
  });

  cnameTbody.querySelectorAll('button[data-alias]').forEach((btn) => {
    btn.addEventListener('click', () => deleteCname(btn.dataset.alias, btn.dataset.target));
  });
}

function updateCnameTargets(aRecords) {
  const current = cnameTarget.value;
  cnameTarget.innerHTML = '<option value="">\u2014 select A record \u2014</option>';
  aRecords.forEach(({ hostname }) => {
    const opt = document.createElement('option');
    opt.value = hostname;
    opt.textContent = hostname;
    if (hostname === current) opt.selected = true;
    cnameTarget.appendChild(opt);
  });
}

async function deleteCname(alias, target) {
  if (!confirm(`Delete CNAME record?\n\n${alias}  \u2192  ${target}`)) return;
  const res = await window.pihole.deleteCname({ alias, target });
  if (res.ok) {
    toast(`Deleted CNAME ${alias}`, 'success');
    loadCnames();
  } else {
    toast(`Delete failed: ${res.error}`, 'error');
  }
}

cnameAddBtn.addEventListener('click', addCname);
cnameAlias.addEventListener('keydown', (e) => { if (e.key === 'Enter') addCname(); });

async function addCname() {
  const alias = cnameAlias.value.trim();
  const target = cnameTarget.value;
  if (!alias || !target) { toast('Alias and target are required.', 'error'); return; }

  cnameAddBtn.disabled = true;
  const res = await window.pihole.addCname({ alias, target });
  cnameAddBtn.disabled = false;

  if (res.ok) {
    toast(`Added ${alias} \u2192 ${target}`, 'success');
    cnameAlias.value = '';
    cnameTarget.value = '';
    loadCnames();
  } else {
    toast(`Add failed: ${res.error}`, 'error');
  }
}

// ── Startup: load saved config ─────────────────────────────
(async () => {
  const cfg = await window.pihole.loadConfig();
  if (cfg.ok) {
    urlInput.value     = cfg.url;
    pwInput.value      = cfg.password;
    skipSslChk.checked = cfg.skipSsl;
    forgetBtn.hidden   = false;
  }
})();
