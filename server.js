/*
 * server.js — Express app for the Split Billing Bill.
 *
 * One process serves everything (single container):
 *   - the static vanilla-JS frontend from /public
 *   - a REST CRUD API for saved bills under /api/bills
 *   - a live health probe at /api/health
 *   - a build-time toolchain manifest at /api/meta/toolchain (for the Status page)
 */
'use strict';

const path = require('path');
const express = require('express');
const store = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const START_TIME = Date.now();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---- Health ----------------------------------------------------------------
app.get('/api/health', (req, res) => {
  try {
    const health = store.healthCheck();
    res.json({
      status: health.ok ? 'ok' : 'degraded',
      db: health.ok ? 'connected' : 'error',
      bills: health.bills,
      uptimeSec: Math.floor((Date.now() - START_TIME) / 1000),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(503).json({
      status: 'down',
      db: 'error',
      error: err.message,
      uptimeSec: Math.floor((Date.now() - START_TIME) / 1000),
      timestamp: new Date().toISOString(),
    });
  }
});

// ---- Toolchain manifest (honest list for the Status page) ------------------
app.get('/api/meta/toolchain', (req, res) => {
  res.json({
    used: [
      {
        name: 'superpowers:test-driven-development',
        kind: 'skill',
        role: 'Built the cent-exact split algorithm test-first (17 tests, 2000-case invariant).',
        status: 'used',
      },
      {
        name: 'superpowers:verification-before-completion',
        kind: 'skill',
        role: 'Gate: run tests + API + container before claiming done.',
        status: 'used',
      },
      {
        name: 'frontend-design',
        kind: 'skill',
        role: 'Designed the friendly dashboard, docs, and status UI.',
        status: 'used',
      },
      {
        name: 'superpowers:brainstorming',
        kind: 'skill',
        role: 'Scoped requirements and the plan before coding.',
        status: 'used',
      },
      {
        name: 'claude-mem',
        kind: 'skill',
        role: 'Cross-session memory / plan tooling available in the workspace.',
        status: 'available',
      },
      {
        name: 'Claude_Preview (MCP)',
        kind: 'mcp',
        role: 'Loaded the running pages to verify the UI end-to-end.',
        status: 'used',
      },
      {
        name: 'Docker',
        kind: 'tool',
        role: 'Packaged the whole app (Node + SQLite + static UI) into one container.',
        status: 'used',
      },
      {
        name: 'better-sqlite3',
        kind: 'library',
        role: 'The embedded SQL database — lives inside the single container.',
        status: 'used',
      },
    ],
    consideredButNotNeeded: [
      {
        name: 'Supabase (MCP)',
        reason: 'Hosted Postgres would move the DB outside the container, breaking the single-container requirement. Embedded SQLite keeps it self-contained.',
      },
      {
        name: 'Shopify / Klaviyo / Slack / n8n / Vercel (MCP)',
        reason: 'Commerce, email, chat, automation and deploy integrations are unrelated to a bill splitter.',
      },
    ],
  });
});

// ---- Bills CRUD ------------------------------------------------------------

// List
app.get('/api/bills', (req, res) => {
  res.json(store.listBills());
});

// Read one
app.get('/api/bills/:id', (req, res) => {
  const bill = store.getBill(Number(req.params.id));
  if (!bill) return res.status(404).json({ error: 'Bill not found.' });
  res.json(bill);
});

// Create
app.post('/api/bills', (req, res) => {
  const result = store.createBill(req.body || {});
  if (!result.ok) return res.status(result.status || 400).json({ error: result.error });
  res.status(201).json(result.bill);
});

// Update
app.put('/api/bills/:id', (req, res) => {
  const result = store.updateBill(Number(req.params.id), req.body || {});
  if (!result.ok) return res.status(result.status || 400).json({ error: result.error });
  res.json(result.bill);
});

// Delete
app.delete('/api/bills/:id', (req, res) => {
  const ok = store.deleteBill(Number(req.params.id));
  if (!ok) return res.status(404).json({ error: 'Bill not found.' });
  res.status(204).end();
});

// Fallback JSON 404 for unknown API routes.
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Split Billing Bill running at http://localhost:${PORT}`);
    console.log(`Database: ${store.DB_PATH}`);
  });
}

module.exports = app;
