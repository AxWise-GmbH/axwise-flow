import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lineTotal } from '../src/pricing.ts';

test('zero quantity returns positive zero', () => {
  const result = lineTotal(500, 0);
  assert.equal(result, 0);
  assert.equal(Object.is(result, 0), true);
  assert.equal(Object.is(result, -0), false);
});

test('zero quantity bug regression: quantity || 1 did not allow zero quantity', () => {
  assert.equal(lineTotal(1234, 0), 0);
  assert.equal(lineTotal(9999, 0, 5000), 0);
});

test('full discount (10000 bps) returns positive zero', () => {
  const result = lineTotal(500, 3, 10000);
  assert.equal(result, 0);
  assert.equal(Object.is(result, 0), true);
  assert.equal(Object.is(result, -0), false);
});

test('zero price returns positive zero', () => {
  const result = lineTotal(0, 5, 2000);
  assert.equal(result, 0);
  assert.equal(Object.is(result, 0), true);
});

test('default discount parameter defaults to 0', () => {
  assert.equal(lineTotal(500, 2), 1000);
  assert.equal(lineTotal(250, 4, undefined), 1000);
});

test('partial discount calculation', () => {
  // 1000 cents * 3 * (10000 - 1500) / 10000 = 3000 * 8500 / 10000 = 2550
  assert.equal(lineTotal(1000, 3, 1500), 2550);
});

test('rounding uses Math.floor, not Math.round', () => {
  // product = 10, intermediate = 10 * (10000 - 3333) = 66670
  // 66670 / 10000 = 6.667 -> floor is 6 (round would be 7)
  assert.equal(lineTotal(10, 1, 3333), 6);

  // product = 199, intermediate = 199 * 9000 = 1791000 -> 179.1 -> floor is 179
  assert.equal(lineTotal(199, 1, 1000), 179);

  // product = 99, intermediate = 99 * 9999 = 989901 -> 98.9901 -> floor is 98
  assert.equal(lineTotal(99, 1, 1), 98);
});

test('invalid inputs throw RangeError', () => {
  // Negative values
  assert.throws(() => lineTotal(-1, 2, 0), RangeError);
  assert.throws(() => lineTotal(500, -1, 0), RangeError);
  assert.throws(() => lineTotal(500, 2, -1), RangeError);

  // Discount above 10000
  assert.throws(() => lineTotal(500, 2, 10001), RangeError);

  // Non-integers
  assert.throws(() => lineTotal(10.5, 2, 0), RangeError);
  assert.throws(() => lineTotal(500, 1.5, 0), RangeError);
  assert.throws(() => lineTotal(500, 2, 50.5), RangeError);

  // NaN and Infinities
  assert.throws(() => lineTotal(NaN, 1, 0), RangeError);
  assert.throws(() => lineTotal(500, NaN, 0), RangeError);
  assert.throws(() => lineTotal(500, 1, NaN), RangeError);
  assert.throws(() => lineTotal(Infinity, 1, 0), RangeError);
  assert.throws(() => lineTotal(500, Infinity, 0), RangeError);
  assert.throws(() => lineTotal(500, 1, Infinity), RangeError);
  assert.throws(() => lineTotal(-Infinity, 1, 0), RangeError);

  // Unsafe integers as inputs
  assert.throws(() => lineTotal(Number.MAX_SAFE_INTEGER + 1, 1, 0), RangeError);
  assert.throws(() => lineTotal(1, Number.MAX_SAFE_INTEGER + 1, 0), RangeError);
  assert.throws(() => lineTotal(1, 1, Number.MAX_SAFE_INTEGER + 1), RangeError);

  // Non-numbers
  assert.throws(() => lineTotal('500', 1, 0), RangeError);
  assert.throws(() => lineTotal(500, null, 0), RangeError);
  assert.throws(() => lineTotal(500, 1, null), RangeError);
});

test('unsafe intermediate priceCents * quantity throws RangeError', () => {
  // MAX_SAFE_INTEGER * 2 exceeds safe integer range
  assert.throws(() => lineTotal(Number.MAX_SAFE_INTEGER, 2, 10000), RangeError);
  assert.throws(() => lineTotal(100_000_000, 100_000_000, 0), RangeError);
});

test('unsafe intermediate product * (10000 - discountBps) throws RangeError', () => {
  const safeP = Math.floor(Number.MAX_SAFE_INTEGER / 10000); // 900719925474

  // safeP * 10000 = 9007199254740000 <= MAX_SAFE_INTEGER (safe)
  assert.equal(lineTotal(safeP, 1, 0), safeP);

  // (safeP + 1) * 10000 = 9007199254750000 > MAX_SAFE_INTEGER (unsafe)
  assert.throws(() => lineTotal(safeP + 1, 1, 0), RangeError);

  // Product is safe, but discount factor 10000 overflows safe integers
  assert.throws(() => lineTotal(1_000_000_000_000, 1, 0), RangeError);
});

test('boundary: MAX_SAFE_INTEGER with full discount', () => {
  // product = MAX_SAFE_INTEGER * 1 = MAX_SAFE_INTEGER (safe)
  // intermediate = MAX_SAFE_INTEGER * (10000 - 10000) = 0 (safe)
  assert.equal(lineTotal(Number.MAX_SAFE_INTEGER, 1, 10000), 0);
});
