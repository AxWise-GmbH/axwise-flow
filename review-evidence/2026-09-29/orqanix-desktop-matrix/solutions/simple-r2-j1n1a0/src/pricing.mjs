export function lineTotal(priceCents, quantity, discountBps = 0) {
  if (
    !Number.isSafeInteger(priceCents) ||
    priceCents < 0 ||
    !Number.isSafeInteger(quantity) ||
    quantity < 0 ||
    !Number.isSafeInteger(discountBps) ||
    discountBps < 0 ||
    discountBps > 10000
  ) {
    throw new RangeError('Invalid input arguments');
  }

  const product = priceCents * quantity;
  if (!Number.isSafeInteger(product)) {
    throw new RangeError('priceCents * quantity exceeds safe integer limit');
  }

  const discountedProduct = product * (10000 - discountBps);
  if (!Number.isSafeInteger(discountedProduct)) {
    throw new RangeError('product * (10000 - discountBps) exceeds safe integer limit');
  }

  return Math.floor(discountedProduct / 10000) + 0;
}
