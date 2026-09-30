export function lineTotal(priceCents: number, quantity: number, discountBps = 0): number {
  if (
    typeof priceCents !== 'number' ||
    !Number.isSafeInteger(priceCents) ||
    priceCents < 0 ||
    Object.is(priceCents, -0)
  ) {
    throw new RangeError('priceCents must be a nonnegative safe integer');
  }

  if (
    typeof quantity !== 'number' ||
    !Number.isSafeInteger(quantity) ||
    quantity < 0 ||
    Object.is(quantity, -0)
  ) {
    throw new RangeError('quantity must be a nonnegative safe integer');
  }

  if (
    typeof discountBps !== 'number' ||
    !Number.isSafeInteger(discountBps) ||
    discountBps < 0 ||
    discountBps > 10000 ||
    Object.is(discountBps, -0)
  ) {
    throw new RangeError('discountBps must be a safe integer from 0 through 10000');
  }

  const product = priceCents * quantity;
  if (!Number.isSafeInteger(product)) {
    throw new RangeError('priceCents * quantity must be a safe integer');
  }

  const discounted = product * (10000 - discountBps);
  if (!Number.isSafeInteger(discounted)) {
    throw new RangeError('product * (10000 - discountBps) must be a safe integer');
  }

  const result = Math.floor(discounted / 10000);
  return result === 0 ? 0 : result;
}
