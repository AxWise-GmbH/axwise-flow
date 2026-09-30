import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lineTotal } from '../src/pricing.ts';

test('ordinary calculations and default discount', () => {
  // Default discount = 0
  assert.equal(lineTotal(500, 2), 1000);
  assert.equal(lineTotal(500, 2, undefined), 1000);
  assert.equal(lineTotal(500, 2, 0), 1000);

  // Exact discount calculation
  assert.equal(lineTotal(100, 1, 2500), 75);

  // Truncation behavior with Math.floor (not Math.round)
  // 100 * 1 * (10000 - 3333) / 10000 = 66.67 -> floor = 66 (round would be 67)
  assert.equal(lineTotal(100, 1, 3333), 66);
  assert.equal(lineTotal(199, 3, 1500), 507);
});

test('zero quantity and full discount return positive zero', () => {
  // Zero quantity returns +0 (fixes old bug where quantity || 1 returned 500)
  const zeroQty1 = lineTotal(500, 0);
  assert.equal(zeroQty1, 0);
  assert.equal(Object.is(zeroQty1, 0), true);
  assert.equal(1 / zeroQty1, Infinity);

  const zeroQty2 = lineTotal(500, 0, 5000);
  assert.equal(zeroQty2, 0);
  assert.equal(Object.is(zeroQty2, 0), true);

  const zeroQty3 = lineTotal(500, 0, 10000);
  assert.equal(zeroQty3, 0);
  assert.equal(Object.is(zeroQty3, 0), true);

  // Full discount (10000 bps) returns +0
  const fullDisc = lineTotal(500, 2, 10000);
  assert.equal(fullDisc, 0);
  assert.equal(Object.is(fullDisc, 0), true);
  assert.equal(1 / fullDisc, Infinity);

  // Zero price returns +0
  const zeroPrice = lineTotal(0, 10, 2000);
  assert.equal(zeroPrice, 0);
  assert.equal(Object.is(zeroPrice, 0), true);

  // Zero price and zero quantity returns +0
  const zeroBoth = lineTotal(0, 0, 0);
  assert.equal(zeroBoth, 0);
  assert.equal(Object.is(zeroBoth, 0), true);
});

test('invalid priceCents throws RangeError', () => {
  const invalidPrices = [
    -1,
    -100,
    -0,
    1.5,
    0.1,
    NaN,
    Infinity,
    -Infinity,
    Number.MAX_SAFE_INTEGER + 1,
    '500',
    null,
    undefined,
    {},
    [],
  ];

  for (const price of invalidPrices) {
    assert.throws(
      () => lineTotal(price, 2, 0),
      RangeError,
      `Expected RangeError for invalid price: ${price}`
    );
  }
});

test('invalid quantity throws RangeError', () => {
  const invalidQuantities = [
    -1,
    -100,
    -0,
    0.5,
    1.5,
    NaN,
    Infinity,
    -Infinity,
    Number.MAX_SAFE_INTEGER + 1,
    '2',
    null,
    undefined,
    {},
    [],
  ];

  for (const qty of invalidQuantities) {
    assert.throws(
      () => lineTotal(500, qty, 0),
      RangeError,
      `Expected RangeError for invalid quantity: ${qty}`
    );
  }
});

test('invalid discountBps throws RangeError', () => {
  const invalidDiscounts = [
    -1,
    -100,
    -0,
    10001,
    20000,
    0.5,
    9999.5,
    NaN,
    Infinity,
    -Infinity,
    Number.MAX_SAFE_INTEGER + 1,
    '1000',
    null,
    {},
    [],
  ];

  for (const discount of invalidDiscounts) {
    assert.throws(
      () => lineTotal(500, 2, discount),
      RangeError,
      `Expected RangeError for invalid discount: ${discount}`
    );
  }
});

test('unsafe integer intermediate priceCents * quantity throws RangeError', () => {
  // Product exceeds safe integer
  assert.throws(
    () => lineTotal(1000000000, 1000000000, 0),
    RangeError
  );
  assert.throws(
    () => lineTotal(Number.MAX_SAFE_INTEGER, 2, 0),
    RangeError
  );
});

test('unsafe integer intermediate product * (10000 - discountBps) throws RangeError', () => {
  // product is safe integer, but product * 10000 exceeds MAX_SAFE_INTEGER
  // MAX_SAFE_INTEGER is 9007199254740991
  // 900719925474 * 10000 = 9007199254740000 (safe)
  // 900719925475 * 10000 = 9007199254750000 > MAX_SAFE_INTEGER (unsafe)
  const safeP = 900719925474;
  const unsafeP = 900719925475;

  assert.equal(lineTotal(safeP, 1, 0), safeP);

  assert.throws(
    () => lineTotal(unsafeP, 1, 0),
    RangeError
  );

  // With full discount (discountBps = 10000), intermediate is product * 0 = 0 (safe!)
  assert.equal(lineTotal(Number.MAX_SAFE_INTEGER, 1, 10000), 0);
  assert.equal(Object.is(lineTotal(Number.MAX_SAFE_INTEGER, 1, 10000), 0), true);
});
