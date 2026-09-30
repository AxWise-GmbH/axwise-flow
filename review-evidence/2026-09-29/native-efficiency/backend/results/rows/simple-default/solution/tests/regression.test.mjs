import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lineTotal } from '../src/pricing.ts';

test('basic calculations and default discount', () => {
  assert.equal(lineTotal(500, 2), 1000);
  assert.equal(lineTotal(500, 2, undefined), 1000);
  assert.equal(lineTotal(500, 2, 0), 1000);
  assert.equal(lineTotal(1000, 3, 2000), 2400);
  assert.equal(lineTotal(1234, 5, 1000), 5553);
});

test('floor rounding behavior', () => {
  // 99 * 1 * (10000 - 1450) / 10000 = 84.645 -> 84
  assert.equal(lineTotal(99, 1, 1450), 84);
  // 10 * 1 * (10000 - 3333) / 10000 = 6.667 -> 6
  assert.equal(lineTotal(10, 1, 3333), 6);
  // 100 * 1 * (10000 - 1) / 10000 = 99.99 -> 99
  assert.equal(lineTotal(100, 1, 1), 99);
});

test('zero quantity and full discount return positive zero', () => {
  const zeroQty = lineTotal(500, 0);
  assert.equal(zeroQty, 0);
  assert.equal(Object.is(zeroQty, 0), true);
  assert.equal(Object.is(zeroQty, -0), false);

  const zeroQtyWithDiscount = lineTotal(500, 0, 5000);
  assert.equal(zeroQtyWithDiscount, 0);
  assert.equal(Object.is(zeroQtyWithDiscount, 0), true);

  const fullDiscount = lineTotal(500, 2, 10000);
  assert.equal(fullDiscount, 0);
  assert.equal(Object.is(fullDiscount, 0), true);
  assert.equal(Object.is(fullDiscount, -0), false);

  const zeroPrice = lineTotal(0, 10, 0);
  assert.equal(zeroPrice, 0);
  assert.equal(Object.is(zeroPrice, 0), true);

  const allZero = lineTotal(0, 0, 10000);
  assert.equal(allZero, 0);
  assert.equal(Object.is(allZero, 0), true);
});

test('invalid priceCents throws RangeError', () => {
  assert.throws(() => lineTotal(-1, 1), RangeError);
  assert.throws(() => lineTotal(-100, 1), RangeError);
  assert.throws(() => lineTotal(1.5, 1), RangeError);
  assert.throws(() => lineTotal(NaN, 1), RangeError);
  assert.throws(() => lineTotal(Infinity, 1), RangeError);
  assert.throws(() => lineTotal(-Infinity, 1), RangeError);
  assert.throws(() => lineTotal(Number.MAX_SAFE_INTEGER + 1, 1), RangeError);
  assert.throws(() => lineTotal('100', 1), RangeError);
  assert.throws(() => lineTotal(null, 1), RangeError);
});

test('invalid quantity throws RangeError', () => {
  assert.throws(() => lineTotal(100, -1), RangeError);
  assert.throws(() => lineTotal(100, 2.5), RangeError);
  assert.throws(() => lineTotal(100, NaN), RangeError);
  assert.throws(() => lineTotal(100, Infinity), RangeError);
  assert.throws(() => lineTotal(100, -Infinity), RangeError);
  assert.throws(() => lineTotal(100, Number.MAX_SAFE_INTEGER + 1), RangeError);
  assert.throws(() => lineTotal(100, '2'), RangeError);
  assert.throws(() => lineTotal(100, null), RangeError);
});

test('invalid discountBps throws RangeError', () => {
  assert.throws(() => lineTotal(100, 1, -1), RangeError);
  assert.throws(() => lineTotal(100, 1, 10001), RangeError);
  assert.throws(() => lineTotal(100, 1, 50.5), RangeError);
  assert.throws(() => lineTotal(100, 1, NaN), RangeError);
  assert.throws(() => lineTotal(100, 1, Infinity), RangeError);
  assert.throws(() => lineTotal(100, 1, -Infinity), RangeError);
  assert.throws(() => lineTotal(100, 1, Number.MAX_SAFE_INTEGER + 1), RangeError);
  assert.throws(() => lineTotal(100, 1, '500'), RangeError);
  assert.throws(() => lineTotal(100, 1, null), RangeError);
});

test('unsafe priceCents * quantity intermediate throws RangeError', () => {
  assert.throws(() => lineTotal(Number.MAX_SAFE_INTEGER, 2, 0), RangeError);
  assert.throws(() => lineTotal(2, Number.MAX_SAFE_INTEGER, 0), RangeError);
  assert.throws(() => lineTotal(10_000_000, 1_000_000_000, 0), RangeError);
  // Unsafe product must throw even if discount is full
  assert.throws(() => lineTotal(Number.MAX_SAFE_INTEGER, 2, 10000), RangeError);
});

test('unsafe product * (10000 - discountBps) intermediate throws RangeError', () => {
  // Safe product: 1e9 * 1e6 = 1e15 (<= MAX_SAFE_INTEGER)
  // But product * 10000 = 1e19 (> MAX_SAFE_INTEGER)
  assert.throws(() => lineTotal(1_000_000_000, 1_000_000, 0), RangeError);
  assert.throws(() => lineTotal(Number.MAX_SAFE_INTEGER, 1, 0), RangeError);

  // Boundary check: max product that is safe when multiplied by 10000
  const maxProd = Math.floor(Number.MAX_SAFE_INTEGER / 10000); // 900719925474
  assert.equal(lineTotal(maxProd, 1, 0), maxProd);
  assert.throws(() => lineTotal(maxProd + 1, 1, 0), RangeError);

  // But with 10000 discount, product * 0 is 0, which is safe
  assert.equal(lineTotal(Number.MAX_SAFE_INTEGER, 1, 10000), 0);
  assert.equal(lineTotal(maxProd + 1, 1, 10000), 0);
});
