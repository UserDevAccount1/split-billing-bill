-- Schema for the Split Billing Bill app (SQLite).
-- Two tables: a bill and its participants (1-to-many, cascade on delete).

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS bills (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  total_cents INTEGER NOT NULL,
  currency    TEXT    NOT NULL DEFAULT 'USD',
  created_at  TEXT    NOT NULL,
  updated_at  TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS participants (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_id      INTEGER NOT NULL,
  name         TEXT    NOT NULL,
  weight       REAL    NOT NULL,
  amount_cents INTEGER NOT NULL,
  position     INTEGER NOT NULL,
  FOREIGN KEY (bill_id) REFERENCES bills (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_participants_bill ON participants (bill_id);
