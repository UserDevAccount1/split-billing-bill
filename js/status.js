/*
 * status.js — live health badge + toolchain manifest.
 *
 * Server build : polls /api/health and renders live DB status.
 * Static build : /api/health isn't there, so it shows a "static deployment"
 *                panel and reads the saved-bill count from localStorage.
 * The toolchain list comes from /api/meta/toolchain when available, and from
 * an embedded copy otherwise (kept in sync with server.js).
 */
'use strict';

const el = (id) => document.getElementById(id);
const LS_KEY = 'split_bills_v1';

// Embedded fallback — mirrors GET /api/meta/toolchain in server.js.
const FALLBACK_TOOLCHAIN = {
  used: [
    { name: 'superpowers:test-driven-development', kind: 'skill', role: 'Built the cent-exact split algorithm test-first (17 tests, 2000-case invariant).', status: 'used' },
    { name: 'superpowers:verification-before-completion', kind: 'skill', role: 'Gate: run tests + API + container before claiming done.', status: 'used' },
    { name: 'frontend-design', kind: 'skill', role: 'Designed the friendly dashboard, docs, and status UI.', status: 'used' },
    { name: 'superpowers:brainstorming', kind: 'skill', role: 'Scoped requirements and the plan before coding.', status: 'used' },
    { name: 'claude-mem', kind: 'skill', role: 'Cross-session memory / plan tooling available in the workspace.', status: 'available' },
    { name: 'Claude_Preview (MCP)', kind: 'mcp', role: 'Loaded the running pages to verify the UI end-to-end.', status: 'used' },
    { name: 'Docker', kind: 'tool', role: 'Packaged the whole app (Node + SQLite + static UI) into one container.', status: 'used' },
    { name: 'GitHub Pages', kind: 'tool', role: 'Hosts this static build of the frontend.', status: 'used' },
  ],
  consideredButNotNeeded: [
    { name: 'Supabase (MCP)', reason: 'Hosted Postgres would move the DB outside the container, breaking the single-container requirement. Embedded SQLite keeps it self-contained.' },
    { name: 'Shopify / Klaviyo / Slack / n8n / Vercel (MCP)', reason: 'Commerce, email, chat, automation and deploy integrations are unrelated to a bill splitter.' },
  ],
};

function fmtUptime(sec) {
  if (sec == null) return '—';
  if (sec < 60) return sec + 's';
  const m = Math.floor(sec / 60);
  if (m < 60) return m + 'm ' + (sec % 60) + 's';
  const h = Math.floor(m / 60);
  return h + 'h ' + (m % 60) + 'm';
}

function localBillCount() {
  try {
    return (JSON.parse(localStorage.getItem(LS_KEY)) || []).length;
  } catch {
    return 0;
  }
}

let liveMode = null; // true once we know a backend exists, false for static

async function poll() {
  const pulse = el('pulse');
  try {
    const res = await fetch('/api/health', { cache: 'no-store' });
    const ct = res.headers.get('content-type') || '';
    if (!res.ok || !ct.includes('application/json')) throw new Error('no-api');
    const h = await res.json();
    liveMode = true;
    const up = h.status === 'ok';
    pulse.className = 'pulse ' + (up ? 'up' : 'down');
    el('h-status').textContent = up ? 'Service healthy' : 'Service degraded';
    el('h-detail').textContent = up
      ? 'Live backend responding · polling every 5s'
      : (h.error || 'A dependency is not responding');
    el('m-db').textContent = h.db || '—';
    el('m-bills').textContent = h.bills != null ? h.bills : '—';
    el('m-uptime').textContent = fmtUptime(h.uptimeSec);
    el('last-check').textContent = 'last check ' + new Date().toLocaleTimeString();
  } catch (err) {
    // Static deployment (e.g. GitHub Pages) — no backend by design.
    liveMode = false;
    pulse.className = 'pulse warn';
    el('h-status').textContent = 'Static deployment';
    el('h-detail').textContent =
      'No live backend — the calculator and saved splits run entirely in your browser.';
    el('m-db').textContent = 'browser';
    el('m-bills').textContent = localBillCount();
    el('m-uptime').textContent = 'n/a';
    el('last-check').textContent = 'static build · ' + new Date().toLocaleTimeString();
  }
}

async function loadTools() {
  let data = FALLBACK_TOOLCHAIN;
  try {
    const res = await fetch('/api/meta/toolchain');
    const ct = res.headers.get('content-type') || '';
    if (res.ok && ct.includes('application/json')) data = await res.json();
  } catch {
    /* use fallback */
  }

  el('tools').innerHTML = data.used
    .map(
      (t) => `
      <div class="tool">
        <div class="t-top">
          <span class="dot ${t.status === 'used' ? 'used' : 'available'}"></span>
          <span class="t-name">${escapeHtml(t.name)}</span>
          <span class="t-kind">${escapeHtml(t.kind)}</span>
        </div>
        <div class="t-role">${escapeHtml(t.role)}</div>
      </div>`
    )
    .join('');

  el('notneeded').innerHTML = data.consideredButNotNeeded
    .map(
      (n) => `
      <div class="nn">
        <div class="nn-name">${escapeHtml(n.name)}</div>
        <div class="nn-why">${escapeHtml(n.reason)}</div>
      </div>`
    )
    .join('');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

poll();
loadTools();
setInterval(() => {
  // keep polling only while a live backend is present
  if (liveMode !== false) poll();
}, 5000);
