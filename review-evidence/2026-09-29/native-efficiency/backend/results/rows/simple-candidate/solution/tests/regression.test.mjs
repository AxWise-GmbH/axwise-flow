import assert from 'node:assert/strict';
import {test} from 'node:test';
import {lineTotal} from '../src/pricing.ts';

test('zero quantity returns positive zero', () => {
  const cases = [
    [0, 0, 0],
    [500, 0, 0],
    [500, 0, 5000],
    [10000, 0, 10000],
  ];
  for (const [price, qty, discount] of cases) {
    const total = lineTotal(price, qty, discount);
    assert.strictEqual(total, 0);
    assert.strictEqual(Object.is(total, 0), true);
    assert.strictEqual(1 / total, Infinity);
  }
});

test('full discount (10000 bps) returns positive zero', () => {
  const cases = [
    [0, 10],
    [500, 2],
    [99999, 100],
    [Number.MAX_SAFE_INTEGER, 1],
  ];
  for (const [price, qty] of cases) {
    const total = lineTotal(price, qty, 10000);
    assert.strictEqual(total, 0);
    assert.strictEqual(Object.is(total, 0), true);
    assert.strictEqual(1 / total, Infinity);
  }
});

test('default discountBps is 0', () => {
  assert.strictEqual(lineTotal(500, 2), 1000);
  assert.strictEqual(lineTotal(500, 2, undefined), 1000);
});

test('applies discount with Math.floor truncation', () => {
  // 1000 cents * 2 = 2000 cents; 25% discount (2500 bps) -> 1500
  assert.strictEqual(lineTotal(1000, 2, 2500), 1500);

  // 99 cents * 1 = 99; 33.33% discount (3333 bps) -> 99 * 6667 / 10000 = 66.0033 -> 66
  assert.strictEqual(lineTotal(99, 1, 3333), 66);

  // 100 cents * 1; 1 bps discount (0.01%) -> 100 * 9999 / 10000 = 99.99 -> 99
  assert.strictEqual(lineTotal(100, 1, 1), 99);

  // 100 cents * 1; 9999 bps discount (99.99%) -> 100 * 1 / 10000 = 0.01 -> 0
  const nearlyFree = lineTotal(100, 1, 9999);
  assert.strictEqual(nearlyFree, 0);
  assert.strictEqual(Object.is(nearlyFree, 0), true);
});

test('invalid priceCents throws RangeError', () => {
  const invalidPrices = [-1, -500, 1.5, 0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, '100', null, undefined];
  for (const price of invalidPrices) {
    assert.throws(() => lineTotal(price, 1, 0), RangeError);
  }
});

test('invalid quantity throws RangeError', () => {
  const invalidQuantities = [-1, -50, 1.5, 0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, '2', null, undefined];
  for (const qty of invalidQuantities) {
    assert.throws(() => lineTotal(100, qty, 0), RangeError);
  }
});

test('invalid discountBps throws RangeError', () => {
  const invalidDiscounts = [-1, 10001, 10000.5, 50.5, -0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, '100', null];
  for (const discount of invalidDiscounts) {
    assert.throws(() => lineTotal(100, 1, discount), RangeError);
  }
});

test('unsafe intermediate priceCents * quantity throws RangeError', () => {
  // MAX_SAFE_INTEGER * 2 is not a safe integer
  assert.throws(() => lineTotal(Number.MAX_SAFE_INTEGER, 2, 0), RangeError);
  // Even with 10000 discount, intermediate priceCents * quantity fails first
  assert.throws(() => lineTotal(Number.MAX_SAFE_INTEGER, 2, 10000), RangeError);
  // Just above MAX_SAFE_INTEGER
  const half = Math.floor(Number.MAX_SAFE_INTEGER / 2);
  assert.throws(() => lineTotal(half + 1, 2, 0), RangeError);
});

test('unsafe intermediate product * (10000 - discountBps) throws RangeError', () => {
  const maxSafeP = Math.floor(Number.MAX_SAFE_INTEGER / 10000);
  // Boundary safe check: maxSafeP * 1 * 10000 <= MAX_SAFE_INTEGER
  assert.strictEqual(lineTotal(maxSafeP, 1, 0), maxSafeP);

  // Boundary unsafe check: (maxSafeP + 1) * 1 * 10000 > MAX_SAFE_INTEGER
  assert.throws(() => lineTotal(maxSafeP + 1, 1, 0), RangeError);

  // Same unsafe check with smaller discount factor
  // product * (10000 - 5000) = product * 5000
  const maxSafeFor5000 = Math.floor(Number.MAX_SAFE_INTEGER / 5000);
  assert.strictEqual(lineTotal(maxSafeFor5000, 1, 5000), Math.floor((maxSafeFor5000 * 5000) / 10000));
  assert.throws(() => lineTotal(maxSafeFor5000 + 1, 1, 5000), RangeError);
});
