'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { computeSplit } = require('../public/js/split.js');

// Helper: sum the allocated cents
function sumCents(result) {
  return result.allocations.reduce((s, a) => s + a.amountCents, 0);
}

test('even split of 100 across 3 people reconciles to the exact total', () => {
  const r = computeSplit(100, [{ name: 'A' }, { name: 'B' }, { name: 'C' }]);
  assert.equal(r.ok, true);
  assert.equal(r.totalCents, 10000);
  assert.deepEqual(r.allocations.map((a) => a.amountCents), [3334, 3333, 3333]);
  assert.equal(sumCents(r), 10000);
});

test('weighted split 100 with weights 2,1,1 gives 50,25,25', () => {
  const r = computeSplit(100, [
    { name: 'A', weight: 2 },
    { name: 'B', weight: 1 },
    { name: 'C', weight: 1 },
  ]);
  assert.equal(r.ok, true);
  assert.deepEqual(r.allocations.map((a) => a.amountCents), [5000, 2500, 2500]);
  assert.equal(sumCents(r), 10000);
});

test('tiny remainder: 0.01 across 3 people gives 1,0,0 cents', () => {
  const r = computeSplit(0.01, [{ name: 'A' }, { name: 'B' }, { name: 'C' }]);
  assert.equal(r.ok, true);
  assert.deepEqual(r.allocations.map((a) => a.amountCents), [1, 0, 0]);
  assert.equal(sumCents(r), 1);
});

test('leftover cents go to the largest fractional parts first', () => {
  // 10.00 across weights 1,1,1 -> raw 333.33.. each, remainder 1 cent to first
  const r = computeSplit(10, [{ name: 'A' }, { name: 'B' }, { name: 'C' }]);
  assert.deepEqual(r.allocations.map((a) => a.amountCents), [334, 333, 333]);
});

test('rounds a total with sub-cent precision to the nearest cent', () => {
  const r = computeSplit(10.999, [{ name: 'A' }]);
  assert.equal(r.ok, true);
  assert.equal(r.totalCents, 1100);
  assert.equal(r.allocations[0].amountCents, 1100);
});

test('accepts a numeric string total', () => {
  const r = computeSplit('42.50', [{ name: 'A' }, { name: 'B' }]);
  assert.equal(r.ok, true);
  assert.equal(r.totalCents, 4250);
  assert.equal(sumCents(r), 4250);
});

test('INVARIANT: allocations always sum to the exact total (randomized)', () => {
  // Deterministic PRNG so the test is reproducible (no Math.random).
  let seed = 123456789;
  const rand = () => {
    seed = (1103515245 * seed + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let i = 0; i < 2000; i++) {
    const n = 1 + Math.floor(rand() * 8); // 1..8 people
    const totalCents = 1 + Math.floor(rand() * 1000000); // 1c .. 10,000.00
    const total = totalCents / 100;
    const people = Array.from({ length: n }, () => ({
      weight: 1 + Math.floor(rand() * 5), // weight 1..5
    }));
    const r = computeSplit(total, people);
    assert.equal(r.ok, true, `case ${i} should be valid`);
    assert.equal(
      sumCents(r),
      r.totalCents,
      `case ${i}: sum ${sumCents(r)} != total ${r.totalCents}`
    );
    // no negative allocations
    assert.ok(r.allocations.every((a) => a.amountCents >= 0));
  }
});

test('defaults a missing weight to 1', () => {
  const r = computeSplit(30, [{ name: 'A' }, { name: 'B', weight: 2 }]);
  assert.deepEqual(r.allocations.map((a) => a.amountCents), [1000, 2000]);
});

// ---- Validation: bad inputs return ok:false with a clear message, never throw ----

test('rejects an empty total', () => {
  const r = computeSplit('', [{ name: 'A' }]);
  assert.equal(r.ok, false);
  assert.match(r.error, /total/i);
});

test('rejects a zero total', () => {
  const r = computeSplit(0, [{ name: 'A' }]);
  assert.equal(r.ok, false);
  assert.match(r.error, /greater than 0|positive/i);
});

test('rejects a negative total', () => {
  const r = computeSplit(-5, [{ name: 'A' }]);
  assert.equal(r.ok, false);
  assert.match(r.error, /greater than 0|positive/i);
});

test('rejects a non-numeric total', () => {
  const r = computeSplit('abc', [{ name: 'A' }]);
  assert.equal(r.ok, false);
  assert.match(r.error, /number|numeric/i);
});

test('rejects zero people', () => {
  const r = computeSplit(100, []);
  assert.equal(r.ok, false);
  assert.match(r.error, /at least one person|people/i);
});

test('rejects a non-array participants argument', () => {
  const r = computeSplit(100, null);
  assert.equal(r.ok, false);
  assert.match(r.error, /at least one person|people/i);
});

test('rejects a zero or negative weight', () => {
  const r = computeSplit(100, [{ name: 'A', weight: 0 }, { name: 'B', weight: 1 }]);
  assert.equal(r.ok, false);
  assert.match(r.error, /weight/i);
});

test('rejects a non-numeric weight', () => {
  const r = computeSplit(100, [{ name: 'A', weight: 'x' }]);
  assert.equal(r.ok, false);
  assert.match(r.error, /weight/i);
});

test('does not throw on wildly bad input', () => {
  assert.doesNotThrow(() => computeSplit(undefined, undefined));
});
