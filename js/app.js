/*
 * app.js — dashboard behaviour.
 *
 * Works in TWO deployments from the same file:
 *   • Server build  — talks to the Express REST API (SQLite persistence).
 *   • Static build  — (e.g. GitHub Pages) no backend, so it falls back to
 *                     localStorage. The split math runs in the browser either way.
 *
 * On load it probes /api/health; if that responds with JSON it uses the API,
 * otherwise it switches to the browser-local store.
 */
'use strict';

const CURRENCY_SIGN = { USD: '$', EUR: '€', GBP: '£', JPY: '¥', PHP: '₱' };
const LS_KEY = 'split_bills_v1';

const el = (id) => document.getElementById(id);
const peopleBox = el('people');

let editingId = null;
let store = null;   // set during init()
let MODE = 'server';

// ---------- Storage backends ----------

/** Shape an input into the same object the API returns (used by the local store). */
function computeBillObject(id, input, createdAt, updatedAt) {
  const r = computeSplit(input.total, input.participants); // caller validates first
  return {
    id,
    name: (input.name && String(input.name).trim()) || 'Untitled bill',
    currency: input.currency || 'USD',
    totalCents: r.totalCents,
    total: r.totalCents / 100,
    createdAt,
    updatedAt,
    participants: r.allocations.map((a) => ({
      name: a.name,
      weight: a.weight,
      amountCents: a.amountCents,
      amount: a.amountCents / 100,
    })),
  };
}

const ApiStore = {
  async list() {
    return (await fetch('/api/bills')).json();
  },
  async create(input) {
    const res = await fetch('/api/bills', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not save.');
    return res.json();
  },
  async update(id, input) {
    const res = await fetch(`/api/bills/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not save.');
    return res.json();
  },
  async remove(id) {
    await fetch(`/api/bills/${id}`, { method: 'DELETE' });
  },
};

const LocalStore = {
  _read() {
    try {
      return JSON.parse(localStorage.getItem(LS_KEY)) || [];
    } catch {
      return [];
    }
  },
  _write(arr) {
    localStorage.setItem(LS_KEY, JSON.stringify(arr));
  },
  async list() {
    return this._read().slice().sort((a, b) => b.id - a.id);
  },
  async create(input) {
    const all = this._read();
    const now = new Date().toISOString();
    const bill = computeBillObject(Date.now(), input, now, now);
    all.push(bill);
    this._write(all);
    return bill;
  },
  async update(id, input) {
    const all = this._read();
    const i = all.findIndex((b) => b.id === id);
    if (i < 0) throw new Error('Bill not found.');
    const now = new Date().toISOString();
    all[i] = computeBillObject(id, input, all[i].createdAt, now);
    this._write(all);
    return all[i];
  },
  async remove(id) {
    this._write(this._read().filter((b) => b.id !== id));
  },
};

/** Probe for a live backend; fall back to localStorage on any failure. */
async function detectStore() {
  try {
    const res = await fetch('/api/health', { cache: 'no-store' });
    const ct = res.headers.get('content-type') || '';
    if (res.ok && ct.includes('application/json')) {
      await res.json();
      return { store: ApiStore, mode: 'server' };
    }
  } catch {
    /* fall through */
  }
  return { store: LocalStore, mode: 'local' };
}

// ---------- Participant rows ----------
function personRow(name = '', weight = 1) {
  const row = document.createElement('div');
  row.className = 'person';
  row.innerHTML = `
    <input class="input p-name" type="text" placeholder="Name" autocomplete="off" />
    <div class="wt"><input class="input p-weight" type="number" min="1" step="1" value="1" /></div>
    <button type="button" class="iconbtn p-remove" title="Remove" aria-label="Remove person">×</button>`;
  row.querySelector('.p-name').value = name;
  row.querySelector('.p-weight').value = weight;
  row.querySelector('.p-name').addEventListener('input', render);
  row.querySelector('.p-weight').addEventListener('input', render);
  row.querySelector('.p-remove').addEventListener('click', () => {
    row.remove();
    render();
  });
  return row;
}

function addPerson(name = '', weight = 1) {
  peopleBox.appendChild(personRow(name, weight));
  render();
}

function readParticipants() {
  return [...peopleBox.querySelectorAll('.person')].map((r) => ({
    name: r.querySelector('.p-name').value,
    weight: r.querySelector('.p-weight').value,
  }));
}

function currentInput() {
  return {
    name: el('name').value,
    total: el('total').value,
    currency: el('currency').value,
    participants: readParticipants(),
  };
}

function fmt(amount, currency) {
  const sign = CURRENCY_SIGN[currency] || '';
  return sign + amount.toFixed(currency === 'JPY' ? 0 : 2);
}

// ---------- Live receipt preview ----------
function render() {
  const input = currentInput();
  el('cur-sign').textContent = CURRENCY_SIGN[input.currency] || '$';
  el('people-count').textContent =
    `${input.participants.length} ${input.participants.length === 1 ? 'person' : 'people'}`;

  const receipt = el('receipt');
  const body = el('r-body');
  const stamp = el('stamp');
  el('r-title').textContent = input.name.trim() || 'Your split';

  const result = computeSplit(input.total, input.participants);

  if (!result.ok) {
    receipt.classList.add('empty');
    body.innerHTML =
      `<p style="text-align:center;color:var(--ink-faint);font-family:var(--font-mono);font-size:12.5px;padding:14px 0">${result.error}</p>`;
    el('r-total').textContent = '—';
    stamp.className = 'stamp bad';
    stamp.textContent = '⚠ ' + result.error.replace(/\.$/, '');
    return;
  }

  receipt.classList.remove('empty');
  body.innerHTML = result.allocations
    .map(
      (a) => `
      <div class="r-line">
        <span class="nm">${escapeHtml(a.name)}${a.weight !== 1 ? ` <span class="share">×${a.weight}</span>` : ''}</span>
        <span class="dots"></span>
        <span class="amt">${fmt(a.amountCents / 100, input.currency)}</span>
      </div>`
    )
    .join('');
  el('r-total').textContent = fmt(result.totalCents / 100, input.currency);

  const sum = result.allocations.reduce((s, a) => s + a.amountCents, 0);
  stamp.className = 'stamp';
  stamp.textContent = sum === result.totalCents ? '✓ reconciles exactly' : '✗ mismatch';
  if (sum !== result.totalCents) stamp.className = 'stamp bad';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

// ---------- Errors ----------
function showError(msg) {
  const box = el('err');
  box.textContent = msg;
  box.className = 'alert err show';
}
function clearError() {
  el('err').className = 'alert err';
}

// ---------- Save / update ----------
async function onSubmit(e) {
  e.preventDefault();
  clearError();
  const input = currentInput();
  const check = computeSplit(input.total, input.participants);
  if (!check.ok) {
    showError(check.error);
    return;
  }
  try {
    if (editingId != null) await store.update(editingId, input);
    else await store.create(input);
  } catch (err) {
    showError(err.message || 'Could not save. Please try again.');
    return;
  }
  resetForm();
  await loadBills();
}

// ---------- Form state ----------
function resetForm() {
  editingId = null;
  el('bill-id').value = '';
  el('name').value = '';
  el('total').value = '';
  el('currency').value = 'USD';
  peopleBox.innerHTML = '';
  addPerson('', 1);
  addPerson('', 1);
  el('form-title').textContent = 'New split';
  el('save-btn').textContent = 'Save split';
  clearError();
  render();
}

function loadIntoForm(bill) {
  editingId = bill.id;
  el('bill-id').value = bill.id;
  el('name').value = bill.name;
  el('total').value = (bill.totalCents / 100).toString();
  el('currency').value = bill.currency;
  peopleBox.innerHTML = '';
  bill.participants.forEach((p) => addPerson(p.name, p.weight));
  el('form-title').textContent = 'Edit split';
  el('save-btn').textContent = 'Update split';
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ---------- Saved bills list ----------
async function loadBills() {
  const bills = await store.list();
  const box = el('stubs');
  if (!bills.length) {
    box.innerHTML = '<p class="empty-note">No saved splits yet — create one above.</p>';
    return;
  }
  box.innerHTML = '';
  bills.forEach((b) => {
    const div = document.createElement('div');
    div.className = 'stub';
    const names = b.participants.map((p) => p.name).join(', ');
    div.innerHTML = `
      <div class="s-top">
        <span class="s-name">${escapeHtml(b.name)}</span>
        <span class="s-amt">${fmt(b.totalCents / 100, b.currency)}</span>
      </div>
      <div class="s-meta">${b.participants.length} people · ${new Date(b.createdAt).toLocaleDateString()}</div>
      <div class="s-people">${escapeHtml(names)}</div>
      <div class="s-actions">
        <button class="edit">Edit</button>
        <button class="del">Delete</button>
      </div>`;
    div.querySelector('.edit').addEventListener('click', () => loadIntoForm(b));
    div.querySelector('.del').addEventListener('click', () => deleteBill(b.id));
    box.appendChild(div);
  });
}

async function deleteBill(id) {
  if (!confirm('Delete this saved split?')) return;
  await store.remove(id);
  if (editingId === id) resetForm();
  await loadBills();
}

// ---------- Wire up ----------
el('bill-form').addEventListener('submit', onSubmit);
el('add-person').addEventListener('click', () => addPerson('', 1));
el('reset-btn').addEventListener('click', resetForm);
el('name').addEventListener('input', render);
el('total').addEventListener('input', render);
el('currency').addEventListener('change', render);

// initial UI state
addPerson('', 1);
addPerson('', 1);
render();

// pick a storage backend, then load saved splits
(async function init() {
  const picked = await detectStore();
  store = picked.store;
  MODE = picked.mode;
  const hint = document.querySelector('.saved .hint');
  if (hint) {
    hint.textContent =
      MODE === 'server'
        ? "Everything you've saved, newest first. Stored in SQLite inside the container."
        : "Everything you've saved, newest first. Saved in your browser — this is the static build.";
  }
  await loadBills();
})();
