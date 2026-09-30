import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lineTotal } from '../src/pricing.ts';

test('ordinary calculations without discount', () => {
  assert.equal(lineTotal(500, 2), 1000);
  assert.equal(lineTotal(500, 2, 0), 1000);
  assert.equal(lineTotal(1234, 3, 0), 3702);
});

test('ordinary calculations with partial discount and truncation', () => {
  // 1000 * 2 = 2000; 2000 * (10000 - 2500) / 10000 = 2000 * 7500 / 10000 = 1500
  assert.equal(lineTotal(1000, 2, 2500), 1500);

  // 99 * 1 = 99; 99 * (10000 - 1500) / 10000 = 99 * 8500 / 10000 = 84.15 -> floor: 84
  assert.equal(lineTotal(99, 1, 1500), 84);

  // 1999 * 3 = 5997; 5997 * (10000 - 3333) / 10000 = 5997 * 6667 / 10000 = 3998.1999 -> floor: 3998
  assert.equal(lineTotal(1999, 3, 3333), 3998);
});

test('zero quantity returns positive zero', () => {
  const r1 = lineTotal(500, 0);
  assert.equal(r1, 0);
  assert.equal(Object.is(r1, 0), true);
  assert.equal(Object.is(r1, -0), false);

  const r2 = lineTotal(500, 0, 5000);
  assert.equal(r2, 0);
  assert.equal(Object.is(r2, 0), true);

  const r3 = lineTotal(500, 0, 10000);
  assert.equal(r3, 0);
  assert.equal(Object.is(r3, 0), true);

  const r4 = lineTotal(0, 0, 0);
  assert.equal(r4, 0);
  assert.equal(Object.is(r4, 0), true);
});

test('full discount returns positive zero', () => {
  const r1 = lineTotal(500, 2, 10000);
  assert.equal(r1, 0);
  assert.equal(Object.is(r1, 0), true);
  assert.equal(Object.is(r1, -0), false);

  const r2 = lineTotal(12345, 10, 10000);
  assert.equal(r2, 0);
  assert.equal(Object.is(r2, 0), true);
});

test('zero price returns positive zero', () => {
  const r1 = lineTotal(0, 5, 0);
  assert.equal(r1, 0);
  assert.equal(Object.is(r1, 0), true);

  const r2 = lineTotal(0, 5, 5000);
  assert.equal(r2, 0);
  assert.equal(Object.is(r2, 0), true);
});

test('invalid priceCents throws RangeError', () => {
  assert.throws(() => lineTotal(-1, 1), RangeError);
  assert.throws(() => lineTotal(1.5, 1), RangeError);
  assert.throws(() => lineTotal(NaN, 1), RangeError);
  assert.throws(() => lineTotal(Infinity, 1), RangeError);
  assert.throws(() => lineTotal(-Infinity, 1), RangeError);
  assert.throws(() => lineTotal(Number.MAX_SAFE_INTEGER + 1, 1), RangeError);
});

test('invalid quantity throws RangeError', () => {
  assert.throws(() => lineTotal(100, -1), RangeError);
  assert.throws(() => lineTotal(100, 1.5), RangeError);
  assert.throws(() => lineTotal(100, NaN), RangeError);
  assert.throws(() => lineTotal(100, Infinity), RangeError);
  assert.throws(() => lineTotal(100, -Infinity), RangeError);
  assert.throws(() => lineTotal(100, Number.MAX_SAFE_INTEGER + 1), RangeError);
});

test('invalid discountBps throws RangeError', () => {
  assert.throws(() => lineTotal(100, 1, -1), RangeError);
  assert.throws(() => lineTotal(100, 1, 10001), RangeError);
  assert.throws(() => lineTotal(100, 1, 20000), RangeError);
  assert.throws(() => lineTotal(100, 1, 50.5), RangeError);
  assert.throws(() => lineTotal(100, 1, NaN), RangeError);
  assert.throws(() => lineTotal(100, 1, Infinity), RangeError);
  assert.throws(() => lineTotal(100, 1, -Infinity), RangeError);
});

test('unsafe intermediate priceCents * quantity throws RangeError', () => {
  // Even with full discount (10000 bps), unsafe priceCents * quantity must throw
  assert.throws(() => lineTotal(Number.MAX_SAFE_INTEGER, 2, 10000), RangeError);
  assert.throws(() => lineTotal(10_000_000_000, 10_000_000_000, 0), RangeError);
  assert.throws(() => lineTotal(3_000_000_001, 3_000_000_001, 5000), RangeError);
});

test('unsafe intermediate product * (10000 - discountBps) throws RangeError', () => {
  const boundarySafeProduct = Math.floor(Number.MAX_SAFE_INTEGER / 10000); // 900719925474

  // boundarySafeProduct * 10000 = 9007199254740000 <= Number.MAX_SAFE_INTEGER (safe!)
  assert.equal(lineTotal(boundarySafeProduct, 1, 0), boundarySafeProduct);

  // (boundarySafeProduct + 1) * 10000 = 9007199254750000 > Number.MAX_SAFE_INTEGER (unsafe intermediate!)
  assert.throws(() => lineTotal(boundarySafeProduct + 1, 1, 0), RangeError);

  // Large product with full discount has intermediate product * 0 = 0 (safe!)
  assert.equal(lineTotal(boundarySafeProduct + 1, 1, 10000), 0);

  // Large safe inputs that individually and as product are safe, but intermediate with factor overflows
  assert.throws(() => lineTotal(1_000_000_000_000, 1, 0), RangeError);
});

test('safe integer boundary conditions with zero quantity', () => {
  // Number.MAX_SAFE_INTEGER * 0 = 0, both input and intermediates safe
  const r = lineTotal(Number.MAX_SAFE_INTEGER, 0, 0);
  assert.equal(r, 0);
  assert.equal(Object.is(r, 0), true);

  // Unsafe priceCents still throws even if quantity is 0
  assert.throws(() => lineTotal(Number.MAX_SAFE_INTEGER + 1, 0, 0), RangeError);
});
