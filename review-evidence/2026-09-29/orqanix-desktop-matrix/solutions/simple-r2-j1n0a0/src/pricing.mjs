export function lineTotal(priceCents, quantity, discountBps = 0) {
  if (!Number.isSafeInteger(priceCents) || priceCents < 0) {
    throw new RangeError('priceCents must be a nonnegative safe integer');
  }

  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    throw new RangeError('quantity must be a nonnegative safe integer');
  }

  if (!Number.isSafeInteger(discountBps) || discountBps < 0 || discountBps > 10000) {
    throw new RangeError('discountBps must be an integer between 0 and 10000');
  }

  const product = priceCents * quantity;
  if (!Number.isSafeInteger(product)) {
    throw new RangeError('priceCents * quantity must be a safe integer');
  }

  const factor = 10000 - discountBps;
  const discountedProduct = product * factor;
  if (!Number.isSafeInteger(discountedProduct)) {
    throw new RangeError('product * (10000 - discountBps) must be a safe integer');
  }

  return Math.floor(discountedProduct / 10000);
}
