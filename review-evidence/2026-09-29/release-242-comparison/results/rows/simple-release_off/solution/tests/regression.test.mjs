import assert from 'node:assert/strict';
import {describe, test} from 'node:test';
import {lineTotal} from '../src/pricing.ts';

describe('lineTotal regression tests', () => {
  test('standard calculations with default and explicit discounts', () => {
    // Default discount (0 bps)
    assert.equal(lineTotal(1000, 3), 3000);
    assert.equal(lineTotal(1000, 3, 0), 3000);

    // 10% discount (1000 bps)
    assert.equal(lineTotal(1000, 3, 1000), 2700);

    // 25% discount (2500 bps)
    assert.equal(lineTotal(500, 2, 2500), 750);
  });

  test('truncates towards zero using Math.floor', () => {
    // 99 cents * 1 qty at 3333 bps: 99 * 6667 / 10000 = 66.0033 -> 66
    assert.equal(lineTotal(99, 1, 3333), 66);

    // 50 cents * 1 qty at 2501 bps: 50 * 7499 / 10000 = 37.495 -> 37
    assert.equal(lineTotal(50, 1, 2501), 37);

    // 1 cent * 1 qty at 1 bps: 1 * 9999 / 10000 = 0.9999 -> 0 (Math.round would have given 1)
    assert.equal(lineTotal(1, 1, 1), 0);
  });

  test('zero quantity returns positive zero', () => {
    const res1 = lineTotal(100, 0);
    assert.equal(res1, 0);
    assert.equal(Object.is(res1, 0), true);
    assert.equal(Object.is(res1, -0), false);
    assert.equal(1 / res1, Infinity);
    assert.deepStrictEqual(res1, 0);

    const res2 = lineTotal(500, 0, 2000);
    assert.equal(res2, 0);
    assert.equal(Object.is(res2, 0), true);
    assert.deepStrictEqual(res2, 0);
  });

  test('full discount returns positive zero', () => {
    const res1 = lineTotal(500, 2, 10000);
    assert.equal(res1, 0);
    assert.equal(Object.is(res1, 0), true);
    assert.equal(Object.is(res1, -0), false);
    assert.equal(1 / res1, Infinity);
    assert.deepStrictEqual(res1, 0);

    const res2 = lineTotal(0, 5, 10000);
    assert.equal(res2, 0);
    assert.equal(Object.is(res2, 0), true);
    assert.deepStrictEqual(res2, 0);
  });

  test('zero price returns positive zero', () => {
    const res = lineTotal(0, 10);
    assert.equal(res, 0);
    assert.equal(Object.is(res, 0), true);
    assert.deepStrictEqual(res, 0);
  });

  test('rejects invalid priceCents with RangeError', () => {
    assert.throws(() => lineTotal(-1, 1), RangeError);
    assert.throws(() => lineTotal(-100, 1), RangeError);
    assert.throws(() => lineTotal(1.5, 1), RangeError);
    assert.throws(() => lineTotal(NaN, 1), RangeError);
    assert.throws(() => lineTotal(Infinity, 1), RangeError);
    assert.throws(() => lineTotal(-Infinity, 1), RangeError);
    assert.throws(() => lineTotal(Number.MAX_SAFE_INTEGER + 1, 1), RangeError);
    // Non-number values passed through any / untyped JS
    assert.throws(() => lineTotal('100', 1), RangeError);
    assert.throws(() => lineTotal(null, 1), RangeError);
    assert.throws(() => lineTotal(undefined, 1), RangeError);
    assert.throws(() => lineTotal({}, 1), RangeError);
  });

  test('rejects invalid quantity with RangeError', () => {
    assert.throws(() => lineTotal(100, -1), RangeError);
    assert.throws(() => lineTotal(100, -10), RangeError);
    assert.throws(() => lineTotal(100, 2.5), RangeError);
    assert.throws(() => lineTotal(100, NaN), RangeError);
    assert.throws(() => lineTotal(100, Infinity), RangeError);
    assert.throws(() => lineTotal(100, -Infinity), RangeError);
    assert.throws(() => lineTotal(100, Number.MAX_SAFE_INTEGER + 1), RangeError);
    // Non-number values
    assert.throws(() => lineTotal(100, '2'), RangeError);
    assert.throws(() => lineTotal(100, null), RangeError);
    assert.throws(() => lineTotal(100, undefined), RangeError);
    assert.throws(() => lineTotal(100, {}), RangeError);
  });

  test('rejects invalid discountBps with RangeError', () => {
    assert.throws(() => lineTotal(100, 1, -1), RangeError);
    assert.throws(() => lineTotal(100, 1, 10001), RangeError);
    assert.throws(() => lineTotal(100, 1, 50.5), RangeError);
    assert.throws(() => lineTotal(100, 1, NaN), RangeError);
    assert.throws(() => lineTotal(100, 1, Infinity), RangeError);
    assert.throws(() => lineTotal(100, 1, -Infinity), RangeError);
    assert.throws(() => lineTotal(100, 1, Number.MAX_SAFE_INTEGER + 1), RangeError);
    // Non-number values (except undefined which uses default 0)
    assert.throws(() => lineTotal(100, 1, '500'), RangeError);
    assert.throws(() => lineTotal(100, 1, null), RangeError);
    assert.throws(() => lineTotal(100, 1, {}), RangeError);
  });

  test('rejects unsafe integer intermediate priceCents * quantity with RangeError', () => {
    // product exceeds MAX_SAFE_INTEGER
    assert.throws(() => lineTotal(Number.MAX_SAFE_INTEGER, 2, 0), RangeError);
    // Even if discount is 10000, intermediate priceCents * quantity must be safe first
    assert.throws(() => lineTotal(Number.MAX_SAFE_INTEGER, 2, 10000), RangeError);
    assert.throws(() => lineTotal(1e8, 1e8, 0), RangeError);
  });

  test('rejects unsafe integer intermediate product * (10000 - discountBps) with RangeError', () => {
    // 1e12 is safe, but 1e12 * 10000 = 1e16 > MAX_SAFE_INTEGER
    assert.throws(() => lineTotal(1e12, 1, 0), RangeError);

    // Boundary: Math.floor(MAX_SAFE_INTEGER / 10000) = 900719925474
    // 900719925475 * 10000 = 9007199254750000 > MAX_SAFE_INTEGER
    assert.throws(() => lineTotal(900719925475, 1, 0), RangeError);

    // But safe intermediate at boundary succeeds
    const safeProduct = 900719925474;
    assert.equal(lineTotal(safeProduct, 1, 0), 900719925474);

    // And if discount reduces intermediate within safe range, it succeeds
    assert.equal(lineTotal(900719925475, 1, 10000), 0);
  });
});
