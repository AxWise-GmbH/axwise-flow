import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {lineTotal} from '../src/pricing.ts';

describe('lineTotal regression tests', () => {
  describe('standard calculations', () => {
    it('calculates total with default discount (0 bps)', () => {
      assert.equal(lineTotal(500, 2), 1000);
      assert.equal(lineTotal(500, 2, undefined), 1000);
    });

    it('calculates total with partial discount', () => {
      assert.equal(lineTotal(100, 3, 2000), 240); // 20% discount on 300 cents = 240
      assert.equal(lineTotal(1000, 1, 500), 950); // 5% discount on 1000 cents = 950
    });

    it('floors the result rather than rounding', () => {
      // 100 * 1 * (10000 - 1) / 10000 = 9999 / 100 = 99.99
      // Math.floor gives 99, Math.round would give 100
      assert.equal(lineTotal(100, 1, 1), 99);
      // 99 * 1 * (10000 - 1500) / 10000 = 99 * 8500 / 10000 = 84.15 -> 84
      assert.equal(lineTotal(99, 1, 1500), 84);
    });
  });

  describe('zero quantity and full discount return positive zero', () => {
    it('returns positive zero when quantity is zero', () => {
      const res1 = lineTotal(500, 0);
      assert.equal(res1, 0);
      assert.equal(Object.is(res1, 0), true);
      assert.equal(Object.is(res1, -0), false);

      const res2 = lineTotal(500, 0, 5000);
      assert.equal(res2, 0);
      assert.equal(Object.is(res2, 0), true);
    });

    it('returns positive zero when discount is 100% (10000 bps)', () => {
      const res = lineTotal(500, 2, 10000);
      assert.equal(res, 0);
      assert.equal(Object.is(res, 0), true);
      assert.equal(Object.is(res, -0), false);
    });

    it('returns positive zero when priceCents is zero', () => {
      const res = lineTotal(0, 5, 2000);
      assert.equal(res, 0);
      assert.equal(Object.is(res, 0), true);
    });

    it('returns positive zero when both quantity and price are zero', () => {
      const res = lineTotal(0, 0, 0);
      assert.equal(res, 0);
      assert.equal(Object.is(res, 0), true);
    });
  });

  describe('input validation throws RangeError', () => {
    it('validates priceCents', () => {
      assert.throws(() => lineTotal(-1, 2), RangeError);
      assert.throws(() => lineTotal(10.5, 2), RangeError);
      assert.throws(() => lineTotal(NaN, 2), RangeError);
      assert.throws(() => lineTotal(Infinity, 2), RangeError);
      assert.throws(() => lineTotal(-Infinity, 2), RangeError);
      assert.throws(() => lineTotal(Number.MAX_SAFE_INTEGER + 1, 2), RangeError);
    });

    it('validates quantity', () => {
      assert.throws(() => lineTotal(100, -1), RangeError);
      assert.throws(() => lineTotal(100, 1.5), RangeError);
      assert.throws(() => lineTotal(100, NaN), RangeError);
      assert.throws(() => lineTotal(100, Infinity), RangeError);
      assert.throws(() => lineTotal(100, -Infinity), RangeError);
      assert.throws(() => lineTotal(100, Number.MAX_SAFE_INTEGER + 1), RangeError);
    });

    it('validates discountBps', () => {
      assert.throws(() => lineTotal(100, 1, -1), RangeError);
      assert.throws(() => lineTotal(100, 1, 10001), RangeError);
      assert.throws(() => lineTotal(100, 1, 50.5), RangeError);
      assert.throws(() => lineTotal(100, 1, NaN), RangeError);
      assert.throws(() => lineTotal(100, 1, Infinity), RangeError);
      assert.throws(() => lineTotal(100, 1, -Infinity), RangeError);
      assert.throws(() => lineTotal(100, 1, Number.MAX_SAFE_INTEGER + 1), RangeError);
    });
  });

  describe('unsafe integer intermediates throw RangeError', () => {
    it('throws RangeError when priceCents * quantity is an unsafe integer', () => {
      // 10^8 * 10^8 = 10^16 > Number.MAX_SAFE_INTEGER (9007199254740991)
      assert.throws(() => lineTotal(100_000_000, 100_000_000), RangeError);
      assert.throws(() => lineTotal(Number.MAX_SAFE_INTEGER, 2), RangeError);
    });

    it('throws RangeError when product * (10000 - discountBps) is an unsafe integer', () => {
      // product = 10^12 is a safe integer, but 10^12 * 10000 = 10^16 > Number.MAX_SAFE_INTEGER
      assert.throws(() => lineTotal(1_000_000_000_000, 1, 0), RangeError);
      // 2 * 10^12 * 5000 = 10^16 > Number.MAX_SAFE_INTEGER
      assert.throws(() => lineTotal(2_000_000_000_000, 1, 5000), RangeError);
    });

    it('allows safe intermediate values near the boundary', () => {
      const maxProductAtZeroDiscount = Math.floor(Number.MAX_SAFE_INTEGER / 10000);
      // At boundary: maxProductAtZeroDiscount * 10000 <= Number.MAX_SAFE_INTEGER
      assert.equal(lineTotal(maxProductAtZeroDiscount, 1, 0), maxProductAtZeroDiscount);
      // Just past boundary:
      assert.throws(() => lineTotal(maxProductAtZeroDiscount + 1, 1, 0), RangeError);
    });

    it('allows large product when discount is full (10000 bps) because intermediate is 0', () => {
      // product is safe integer, product * (10000 - 10000) = 0, which is safe
      const res = lineTotal(1_000_000_000_000, 1, 10000);
      assert.equal(res, 0);
      assert.equal(Object.is(res, 0), true);
    });
  });
});
