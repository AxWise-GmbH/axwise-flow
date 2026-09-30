export function lineTotal(priceCents: number, quantity: number, discountBps = 0): number {
  if (
    !Number.isSafeInteger(priceCents) ||
    priceCents < 0 ||
    Object.is(priceCents, -0)
  ) {
    throw new RangeError('priceCents must be a nonnegative safe integer');
  }
  if (
    !Number.isSafeInteger(quantity) ||
    quantity < 0 ||
    Object.is(quantity, -0)
  ) {
    throw new RangeError('quantity must be a nonnegative safe integer');
  }
  if (
    !Number.isSafeInteger(discountBps) ||
    discountBps < 0 ||
    discountBps > 10000 ||
    Object.is(discountBps, -0)
  ) {
    throw new RangeError('discountBps must be a safe integer from 0 through 10000');
  }

  const product = priceCents * quantity;
  if (!Number.isSafeInteger(product)) {
    throw new RangeError('priceCents * quantity exceeds safe integer limit');
  }

  const factor = 10000 - discountBps;
  const intermediate = product * factor;
  if (!Number.isSafeInteger(intermediate)) {
    throw new RangeError('product * (10000 - discountBps) exceeds safe integer limit');
  }

  const result = Math.floor(intermediate / 10000);
  return result === 0 ? 0 : result;
}
