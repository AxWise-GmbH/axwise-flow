import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lineTotal } from '../src/pricing.ts';

test('valid calculations', async (t) => {
  await t.test('calculates line total with default discount (0 bps)', () => {
    assert.equal(lineTotal(500, 2), 1000);
    assert.equal(lineTotal(500, 2, undefined), 1000);
  });

  await t.test('calculates line total with explicit discount', () => {
    // 20% discount (2000 bps) on 1000 cents
    assert.equal(lineTotal(1000, 1, 2000), 800);
    // 15% discount (1500 bps) on 200 cents
    assert.equal(lineTotal(200, 1, 1500), 170);
  });

  await t.test('floors fractional cent results as specified by Math.floor', () => {
    // 105 * 1 * (10000 - 500) / 10000 = 105 * 9500 / 10000 = 99.75 -> Math.floor gives 99
    assert.equal(lineTotal(105, 1, 500), 99);
    // 199 * 1 * (10000 - 1001) / 10000 = 199 * 8999 / 10000 = 179.0801 -> Math.floor gives 179
    assert.equal(lineTotal(199, 1, 1001), 179);
  });

  await t.test('zero quantity returns positive zero', () => {
    const res = lineTotal(500, 0);
    assert.equal(res, 0);
    assert.equal(Object.is(res, 0), true);
    assert.equal(1 / res, Infinity);
  });

  await t.test('zero priceCents returns positive zero', () => {
    const res = lineTotal(0, 10);
    assert.equal(res, 0);
    assert.equal(Object.is(res, 0), true);
    assert.equal(1 / res, Infinity);
  });

  await t.test('full discount (10000 bps) returns positive zero', () => {
    const res = lineTotal(500, 2, 10000);
    assert.equal(res, 0);
    assert.equal(Object.is(res, 0), true);
    assert.equal(1 / res, Infinity);
  });

  await t.test('both zero quantity and full discount return positive zero', () => {
    const res = lineTotal(500, 0, 10000);
    assert.equal(res, 0);
    assert.equal(Object.is(res, 0), true);
    assert.equal(1 / res, Infinity);
  });
});

test('invalid priceCents throws RangeError', () => {
  assert.throws(() => lineTotal(-1, 2), RangeError);
  assert.throws(() => lineTotal(-0, 2), RangeError);
  assert.throws(() => lineTotal(1.5, 2), RangeError);
  assert.throws(() => lineTotal(NaN, 2), RangeError);
  assert.throws(() => lineTotal(Infinity, 2), RangeError);
  assert.throws(() => lineTotal(-Infinity, 2), RangeError);
  assert.throws(() => lineTotal(Number.MAX_SAFE_INTEGER + 1, 2), RangeError);
  assert.throws(() => lineTotal('500', 2), RangeError);
  assert.throws(() => lineTotal(null, 2), RangeError);
  assert.throws(() => lineTotal(undefined, 2), RangeError);
});

test('invalid quantity throws RangeError', () => {
  assert.throws(() => lineTotal(500, -1), RangeError);
  assert.throws(() => lineTotal(500, -0), RangeError);
  assert.throws(() => lineTotal(500, 1.5), RangeError);
  assert.throws(() => lineTotal(500, NaN), RangeError);
  assert.throws(() => lineTotal(500, Infinity), RangeError);
  assert.throws(() => lineTotal(500, -Infinity), RangeError);
  assert.throws(() => lineTotal(500, Number.MAX_SAFE_INTEGER + 1), RangeError);
  assert.throws(() => lineTotal(500, '2'), RangeError);
  assert.throws(() => lineTotal(500, null), RangeError);
  assert.throws(() => lineTotal(500, undefined), RangeError);
});

test('invalid discountBps throws RangeError', () => {
  assert.throws(() => lineTotal(500, 2, -1), RangeError);
  assert.throws(() => lineTotal(500, 2, -0), RangeError);
  assert.throws(() => lineTotal(500, 2, 10001), RangeError);
  assert.throws(() => lineTotal(500, 2, 50.5), RangeError);
  assert.throws(() => lineTotal(500, 2, NaN), RangeError);
  assert.throws(() => lineTotal(500, 2, Infinity), RangeError);
  assert.throws(() => lineTotal(500, 2, -Infinity), RangeError);
  assert.throws(() => lineTotal(500, 2, Number.MAX_SAFE_INTEGER + 1), RangeError);
  assert.throws(() => lineTotal(500, 2, '500'), RangeError);
  assert.throws(() => lineTotal(500, 2, null), RangeError);
});

test('unsafe integer intermediate priceCents * quantity throws RangeError', () => {
  assert.throws(() => lineTotal(Number.MAX_SAFE_INTEGER, 2), RangeError);
  assert.throws(() => lineTotal(100_000_000, 100_000_000), RangeError);
});

test('unsafe integer intermediate product * (10000 - discountBps) throws RangeError', () => {
  // product is safe (10^12 <= Number.MAX_SAFE_INTEGER = 9.007e15),
  // but product * (10000 - 0) = 10^16 > Number.MAX_SAFE_INTEGER
  assert.throws(() => lineTotal(1_000_000_000_000, 1, 0), RangeError);
  assert.throws(() => lineTotal(1_000_000, 1_000_000, 0), RangeError);
});
