/*
 * db/index.js — SQLite bootstrap and data-access helpers.
 *
 * Uses Node's built-in `node:sqlite` (no native build step — works the same on
 * the dev machine and inside the container). Opens/creates data/bills.db,
 * applies schema.sql on boot, and exposes a small CRUD API over bills +
 * participants. All money is stored as integer cents; the computed per-person
 * amounts are stored alongside the inputs so a saved bill is self-describing.
 */
'use strict';

const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const { computeSplit } = require('../public/js/split.js');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'bills.db');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

// Apply schema on boot (idempotent — uses IF NOT EXISTS).
const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

/** Prepare a statement that binds bare object keys to @named parameters. */
function prep(sql) {
  const stmt = db.prepare(sql);
  stmt.setAllowBareNamedParameters(true);
  return stmt;
}

/** Run fn inside a transaction (node:sqlite has no transaction() helper). */
function tx(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function nowIso() {
  return new Date().toISOString();
}

const insertBillStmt = prep(
  `INSERT INTO bills (name, total_cents, currency, created_at, updated_at)
   VALUES (@name, @total_cents, @currency, @created_at, @updated_at)`
);
const insertParticipantStmt = prep(
  `INSERT INTO participants (bill_id, name, weight, amount_cents, position)
   VALUES (@bill_id, @name, @weight, @amount_cents, @position)`
);
const updateBillStmt = prep(
  `UPDATE bills SET name = @name, total_cents = @total_cents,
     currency = @currency, updated_at = @updated_at WHERE id = @id`
);
const deleteParticipantsStmt = db.prepare(`DELETE FROM participants WHERE bill_id = ?`);
const selectBillStmt = db.prepare(`SELECT * FROM bills WHERE id = ?`);
const selectParticipantsStmt = db.prepare(
  `SELECT * FROM participants WHERE bill_id = ? ORDER BY position ASC`
);
const listBillsStmt = db.prepare(`SELECT * FROM bills ORDER BY id DESC`);
const deleteBillStmt = db.prepare(`DELETE FROM bills WHERE id = ?`);

function participantRows(billId, allocations) {
  return allocations.map((a, i) => ({
    bill_id: billId,
    name: a.name,
    weight: a.weight,
    amount_cents: a.amountCents,
    position: i,
  }));
}

/**
 * Create a bill. `input` = { name, total, currency?, participants: [{name, weight}] }.
 * Returns { ok, bill? , error? , status? }.
 */
function createBill(input) {
  const split = computeSplit(input.total, input.participants);
  if (!split.ok) return { ok: false, error: split.error, status: 400 };

  const ts = nowIso();
  const billId = tx(() => {
    const info = insertBillStmt.run({
      name: (input.name && String(input.name).trim()) || 'Untitled bill',
      total_cents: split.totalCents,
      currency: input.currency || 'USD',
      created_at: ts,
      updated_at: ts,
    });
    const id = Number(info.lastInsertRowid);
    for (const row of participantRows(id, split.allocations)) {
      insertParticipantStmt.run(row);
    }
    return id;
  });
  return { ok: true, bill: getBill(billId) };
}

/**
 * Replace a bill's contents (recomputes the split). Returns { ok, bill?, error?, status? }.
 */
function updateBill(id, input) {
  const existing = getBill(id);
  if (!existing) return { ok: false, error: 'Bill not found.', status: 404 };

  const split = computeSplit(input.total, input.participants);
  if (!split.ok) return { ok: false, error: split.error, status: 400 };

  tx(() => {
    updateBillStmt.run({
      id,
      name: (input.name && String(input.name).trim()) || 'Untitled bill',
      total_cents: split.totalCents,
      currency: input.currency || existing.currency,
      updated_at: nowIso(),
    });
    deleteParticipantsStmt.run(id);
    for (const row of participantRows(id, split.allocations)) {
      insertParticipantStmt.run(row);
    }
  });
  return { ok: true, bill: getBill(id) };
}

function getBill(id) {
  const bill = selectBillStmt.get(id);
  if (!bill) return null;
  return shapeBill(bill, selectParticipantsStmt.all(id));
}

function listBills() {
  return listBillsStmt
    .all()
    .map((b) => shapeBill(b, selectParticipantsStmt.all(b.id)));
}

function deleteBill(id) {
  const info = deleteBillStmt.run(id);
  return info.changes > 0;
}

/** Convert DB rows into the API/JSON shape (dollars as numbers for convenience). */
function shapeBill(bill, participants) {
  return {
    id: bill.id,
    name: bill.name,
    currency: bill.currency,
    totalCents: bill.total_cents,
    total: bill.total_cents / 100,
    createdAt: bill.created_at,
    updatedAt: bill.updated_at,
    participants: participants.map((p) => ({
      name: p.name,
      weight: p.weight,
      amountCents: p.amount_cents,
      amount: p.amount_cents / 100,
    })),
  };
}

/** Lightweight health probe — proves the DB is reachable. */
function healthCheck() {
  const row = db.prepare('SELECT 1 AS ok').get();
  const count = db.prepare('SELECT COUNT(*) AS n FROM bills').get().n;
  return { ok: row.ok === 1, bills: Number(count) };
}

module.exports = {
  db,
  DB_PATH,
  createBill,
  updateBill,
  getBill,
  listBills,
  deleteBill,
  healthCheck,
};
