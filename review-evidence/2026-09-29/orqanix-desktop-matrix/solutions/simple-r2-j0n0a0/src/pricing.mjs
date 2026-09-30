export function lineTotal(priceCents, quantity, discountBps = 0) {
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
    throw new RangeError('discountBps must be a safe integer between 0 and 10000');
  }

  const product = priceCents * quantity;
  if (!Number.isSafeInteger(product)) {
    throw new RangeError('Intermediate priceCents * quantity is not a safe integer');
  }

  const factor = 10000 - discountBps;
  const discounted = product * factor;
  if (!Number.isSafeInteger(discounted)) {
    throw new RangeError('Intermediate product * (10000 - discountBps) is not a safe integer');
  }

  const total = Math.floor(discounted / 10000);
  return total === 0 ? 0 : total;
}
