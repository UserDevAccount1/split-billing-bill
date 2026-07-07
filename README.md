# 🧾 Split Billing Bill

Split any bill fairly across people — with uneven **shares** — and have every amount
round to the cent while **always** adding back up to the exact total. No missing or
extra pennies, ever.

Vanilla JS + static HTML frontend · Express REST API · embedded SQLite · **one Docker container**.

**🔗 Live demo (static build):** https://userdevaccount1.github.io/split-billing-bill/

> The live demo is the **static** build on GitHub Pages — the calculator runs fully in your
> browser and saved splits persist to `localStorage` (no backend). Run the Docker container
> below for the full build with the Express API and SQLite persistence.

---

## Features

- **Total + people**, with optional per-person **weight/share** (one person can cover 2×, 3×, …).
- **Exact-cent splitting** via the largest-remainder (Hamilton) method, computed in integer cents.
- **Live receipt preview** that updates as you type, with a “reconciles exactly” stamp.
- **CRUD** over saved splits: create, list, edit, delete — persisted in SQLite.
- **Sensible validation** for empty / zero / negative / non-numeric input, on both client and server.
- Three pages: **Dashboard**, **How it works** (manual + math), **Status** (live health + honest toolchain).

## Run it — one container

```bash
docker build -t split-billing-bill .
docker run -p 3000:3000 split-billing-bill
# open http://localhost:3000
```

Everything (server, UI, and the SQLite database) lives inside that single container.
To keep saved splits across restarts, mount a volume:

```bash
docker run -p 3000:3000 -v split-data:/app/data split-billing-bill
```

## Run it — without Docker

Requires **Node 22.5+** (for the built-in `node:sqlite` — no native build step).

```bash
npm install
npm start     # http://localhost:3000
npm test      # split-algorithm test suite (17 tests incl. a 2,000-case invariant)
```

## Project layout

```
server.js            Express: static hosting + REST API + /api/health
db/
  schema.sql         bills + participants tables
  index.js           node:sqlite bootstrap + CRUD data access
public/
  index.html         Dashboard (splitter + saved-bills CRUD)
  docs.html          How it works (manual + the math + API reference)
  status.html        Live health + toolchain status
  css/styles.css     Warm receipt/ledger theme
  js/split.js        Canonical split algorithm (shared by server + browser)
  js/app.js          Dashboard logic
  js/status.js       Health polling + toolchain rendering
test/split.test.js   Algorithm + validation + reconciliation invariant
Dockerfile           Single-container image
```

## The math, briefly

Splitting `$100.00` three ways gives `$33.333…` each. Naive rounding either loses a
cent (`$99.99`) or invents one (`$100.02`). Split works in whole cents, floors each
person's exact share, then hands the few leftover cents to the people with the largest
fractional parts — so the per-person totals always reconcile to the exact bill. See the
**How it works** page for worked examples.

## API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/bills` | list saved splits |
| GET | `/api/bills/:id` | read one |
| POST | `/api/bills` | validate + compute + create |
| PUT | `/api/bills/:id` | update (recomputes) |
| DELETE | `/api/bills/:id` | delete |
| GET | `/api/health` | liveness + DB status |
| GET | `/api/meta/toolchain` | build-time skills/tools manifest |

## License

MIT
