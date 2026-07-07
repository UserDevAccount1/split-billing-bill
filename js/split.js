/*
 * split.js — canonical bill-splitting algorithm.
 *
 * Single source of truth used by BOTH the Node server (authoritative compute
 * on save) and the browser (live preview). It exports via CommonJS for Node
 * and attaches `computeSplit` to the global object for the browser.
 *
 * Strategy: work entirely in integer cents and use the Largest Remainder
 * (Hamilton) method so the per-person amounts always sum to the exact total —
 * no cent is ever lost or invented.
 */
(function (root) {
  'use strict';

  /**
   * Parse a value into a finite number, or return NaN. Accepts numbers and
   * numeric strings; treats empty/whitespace-only strings as invalid.
   */
  function toNumber(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
    if (typeof value === 'string') {
      if (value.trim() === '') return NaN;
      const n = Number(value);
      return Number.isFinite(n) ? n : NaN;
    }
    return NaN;
  }

  /**
   * Validate inputs. Returns null when valid, or an error string.
   * @param {number} total
   * @param {Array<{name?:string, weight?:number|string}>} participants
   */
  function validate(total, participants) {
    const t = toNumber(total);
    if (Number.isNaN(t)) {
      return 'Total must be a valid number.';
    }
    if (t <= 0) {
      return 'Total must be greater than 0.';
    }
    if (!Array.isArray(participants) || participants.length === 0) {
      return 'Add at least one person to split between.';
    }
    for (let i = 0; i < participants.length; i++) {
      const raw = participants[i] ? participants[i].weight : undefined;
      const w = raw === undefined || raw === null || raw === '' ? 1 : toNumber(raw);
      if (Number.isNaN(w)) {
        return `Weight for person ${i + 1} must be a valid number.`;
      }
      if (w <= 0) {
        return `Weight for person ${i + 1} must be greater than 0.`;
      }
    }
    return null;
  }

  /**
   * Compute the split.
   * @returns {{ok:true, totalCents:number, allocations:Array<{name:string, weight:number, amountCents:number}>}
   *          | {ok:false, error:string}}
   */
  function computeSplit(total, participants) {
    const error = validate(total, participants);
    if (error) return { ok: false, error };

    const totalCents = Math.round(toNumber(total) * 100);

    const weights = participants.map((p) => {
      const raw = p ? p.weight : undefined;
      return raw === undefined || raw === null || raw === '' ? 1 : toNumber(raw);
    });
    const totalWeight = weights.reduce((s, w) => s + w, 0);

    // Exact (fractional) share for each person, in cents.
    const raw = weights.map((w) => (totalCents * w) / totalWeight);
    const floors = raw.map(Math.floor);
    const allocated = floors.reduce((s, x) => s + x, 0);
    let remainder = totalCents - allocated; // 0 .. n-1 leftover cents

    // Distribute leftover cents to the largest fractional parts.
    // Stable tie-break by original index so results are deterministic.
    const order = raw
      .map((r, i) => ({ i, frac: r - floors[i] }))
      .sort((a, b) => (b.frac - a.frac) || (a.i - b.i));

    const cents = floors.slice();
    for (let k = 0; k < remainder; k++) {
      cents[order[k].i] += 1;
    }

    const allocations = participants.map((p, i) => ({
      name: (p && p.name != null && String(p.name).trim() !== '')
        ? String(p.name)
        : `Person ${i + 1}`,
      weight: weights[i],
      amountCents: cents[i],
    }));

    return { ok: true, totalCents, allocations };
  }

  const api = { computeSplit, validate, toNumber };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api; // Node
  }
  root.computeSplit = computeSplit; // Browser global
  root.SplitBill = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
