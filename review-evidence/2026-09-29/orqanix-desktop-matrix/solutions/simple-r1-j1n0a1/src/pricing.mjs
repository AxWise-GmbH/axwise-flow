export function lineTotal(priceCents, quantity, discountBps = 0) {
  if (
    !Number.isSafeInteger(priceCents) ||
    !Number.isSafeInteger(quantity) ||
    !Number.isSafeInteger(discountBps)
  ) {
    throw new RangeError('All inputs must be safe integers');
  }

  if (priceCents < 0 || quantity < 0) {
    throw new RangeError('priceCents and quantity must be nonnegative');
  }

  if (discountBps < 0 || discountBps > 10000) {
    throw new RangeError('discountBps must be between 0 and 10000');
  }

  const product = priceCents * quantity;
  if (!Number.isSafeInteger(product)) {
    throw new RangeError('Intermediate priceCents * quantity must be a safe integer');
  }

  const discountedProduct = product * (10000 - discountBps);
  if (!Number.isSafeInteger(discountedProduct)) {
    throw new RangeError('Intermediate product * (10000 - discountBps) must be a safe integer');
  }

  if (quantity === 0 || discountBps === 10000) {
    return 0;
  }

  const total = Math.floor(discountedProduct / 10000);
  return total === 0 ? 0 : total;
}
