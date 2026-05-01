'use strict';

const { app, BrowserWindow, ipcMain, safeStorage } = require('electron');
const https = require('https');
const http = require('http');
const path = require('path');
const fs = require('fs');

// ── Connection state ────────────────────────────────────────
const state = { baseUrl: '', sid: '', skipSslVerify: false };

// ── HTTP/HTTPS helper ───────────────────────────────────────
function apiRequest(urlPath, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    if (!state.baseUrl) return reject(new Error('Not connected'));

    let fullUrl;
    try { fullUrl = new URL(urlPath, state.baseUrl); }
    catch (e) { return reject(e); }

    const isHttps = fullUrl.protocol === 'https:';
    const lib = isHttps ? https : http;
    const bodyStr = body ? JSON.stringify(body) : null;

    const options = {
      hostname: fullUrl.hostname,
      port: fullUrl.port || (isHttps ? 443 : 80),
      path: fullUrl.pathname + (fullUrl.search || ''),
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(state.sid && { sid: state.sid }),
        ...(bodyStr && { 'Content-Length': Buffer.byteLength(bodyStr) }),
      },
      ...(isHttps && { rejectUnauthorized: !state.skipSslVerify }),
      timeout: 15000,
    };

    const req = lib.request(options, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        let data = null;
        try { data = raw ? JSON.parse(raw) : null; } catch {}
        resolve({ status: res.statusCode, data });
      });
    });

    req.on('timeout', () => req.destroy(new Error('Request timed out (15s)')));
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// ── IPC: connect / disconnect ───────────────────────────────
ipcMain.handle('connect', async (_, { baseUrl, password, skipSslVerify }) => {
  state.baseUrl = baseUrl.replace(/\/+$/, '');
  state.skipSslVerify = Boolean(skipSslVerify);
  state.sid = '';
  try {
    const res = await apiRequest('/api/auth', 'POST', { password });
    if (res.status === 200 && res.data?.session?.sid) {
      state.sid = res.data.session.sid;
      return { ok: true };
    }
    const msg = res.data?.error?.message ?? res.data?.error ?? `HTTP ${res.status}`;
    return { ok: false, error: String(msg) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('disconnect', async () => {
  if (state.sid) {
    try { await apiRequest('/api/auth', 'DELETE'); } catch {}
    state.sid = '';
  }
  return { ok: true };
});

// ── IPC: A records ──────────────────────────────────────────
ipcMain.handle('get-a-records', async () => {
  try {
    const res = await apiRequest('/api/config/dns/hosts');
    if (res.status !== 200) return { ok: false, error: `HTTP ${res.status}` };
    const raw = res.data?.config?.dns?.hosts
      ?? res.data?.hosts
      ?? (Array.isArray(res.data) ? res.data : []);
    const records = raw
      .filter(Boolean)
      .map((entry) => {
        const parts = String(entry).trim().split(/\s+/);
        return { ip: parts[0], hostname: parts.slice(1).join(' ') };
      })
      .filter((r) => r.ip && r.hostname);
    return { ok: true, records };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('add-a-record', async (_, { hostname, ip }) => {
  try {
    const encoded = encodeURIComponent(`${ip} ${hostname}`);
    const res = await apiRequest(`/api/config/dns/hosts/${encoded}`, 'POST');
    if ([200, 201, 204].includes(res.status)) return { ok: true };
    return { ok: false, error: res.data?.error?.message ?? `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('delete-a-record', async (_, { hostname, ip }) => {
  try {
    const encoded = encodeURIComponent(`${ip} ${hostname}`);
    const res = await apiRequest(`/api/config/dns/hosts/${encoded}`, 'DELETE');
    if ([200, 204].includes(res.status)) return { ok: true };
    return { ok: false, error: res.data?.error?.message ?? `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ── IPC: CNAME records ──────────────────────────────────────
ipcMain.handle('get-cnames', async () => {
  try {
    const res = await apiRequest('/api/config/dns/cnameRecords');
    if (res.status !== 200) return { ok: false, error: `HTTP ${res.status}` };
    const raw = res.data?.config?.dns?.cnameRecords
      ?? res.data?.cnameRecords
      ?? (Array.isArray(res.data) ? res.data : []);
    const records = raw
      .filter(Boolean)
      .map((entry) => {
        const parts = String(entry).trim().split(',');
        return { alias: parts[0], target: parts.slice(1).join(',') };
      })
      .filter((r) => r.alias && r.target);
    return { ok: true, records };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('add-cname', async (_, { alias, target }) => {
  try {
    const encoded = encodeURIComponent(`${alias},${target}`);
    const res = await apiRequest(`/api/config/dns/cnameRecords/${encoded}`, 'POST');
    if ([200, 201, 204].includes(res.status)) return { ok: true };
    return { ok: false, error: res.data?.error?.message ?? `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('delete-cname', async (_, { alias, target }) => {
  try {
    const encoded = encodeURIComponent(`${alias},${target}`);
    const res = await apiRequest(`/api/config/dns/cnameRecords/${encoded}`, 'DELETE');
    if ([200, 204].includes(res.status)) return { ok: true };
    return { ok: false, error: res.data?.error?.message ?? `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ── Config persistence ──────────────────────────────────────
function configPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

ipcMain.handle('load-config', () => {
  try {
    const raw = fs.readFileSync(configPath(), 'utf8');
    const cfg = JSON.parse(raw);
    let password = '';
    if (cfg.passwordEnc) {
      try {
        password = safeStorage.isEncryptionAvailable()
          ? safeStorage.decryptString(Buffer.from(cfg.passwordEnc, 'base64'))
          : Buffer.from(cfg.passwordEnc, 'base64').toString('utf8');
      } catch {}
    }
    return { ok: true, url: cfg.url ?? '', skipSsl: cfg.skipSsl ?? false, password };
  } catch {
    return { ok: false };
  }
});

ipcMain.handle('save-config', (_, { url, password, skipSsl }) => {
  try {
    const encrypted = safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(password).toString('base64')
      : Buffer.from(password, 'utf8').toString('base64');
    fs.mkdirSync(path.dirname(configPath()), { recursive: true });
    fs.writeFileSync(configPath(), JSON.stringify({
      url,
      skipSsl: Boolean(skipSsl),
      passwordEnc: encrypted,
      savedAt: new Date().toISOString(),
    }, null, 2), { mode: 0o600 });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('delete-config', () => {
  try {
    if (fs.existsSync(configPath())) fs.unlinkSync(configPath());
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ── Window ──────────────────────────────────────────────────
app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 920,
    height: 680,
    minWidth: 720,
    minHeight: 520,
    backgroundColor: '#0f0f0f',
    autoHideMenuBar: true,
    title: 'Pi-hole DNS Manager',
    icon: path.join(__dirname, '..', 'assets', 'pihole.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),  // src/preload.js
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  // Prevent navigation away from the local file
  win.webContents.on('will-navigate', (event, navUrl) => {
    if (!navUrl.startsWith('file://')) event.preventDefault();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
