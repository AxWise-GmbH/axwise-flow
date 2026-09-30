export function lineTotal(priceCents: number, quantity: number, discountBps = 0): number {
  if (
    !Number.isSafeInteger(priceCents) ||
    priceCents < 0 ||
    !Number.isSafeInteger(quantity) ||
    quantity < 0 ||
    !Number.isSafeInteger(discountBps) ||
    discountBps < 0 ||
    discountBps > 10000
  ) {
    throw new RangeError(
      'Invalid input: priceCents and quantity must be nonnegative safe integers, discountBps must be an integer from 0 to 10000'
    );
  }

  const product = priceCents * quantity;
  if (!Number.isSafeInteger(product)) {
    throw new RangeError('Intermediate priceCents * quantity exceeds safe integer limit');
  }

  const discountedProduct = product * (10000 - discountBps);
  if (!Number.isSafeInteger(discountedProduct)) {
    throw new RangeError('Intermediate product * (10000 - discountBps) exceeds safe integer limit');
  }

  const result = Math.floor(discountedProduct / 10000);
  return result === 0 ? 0 : result;
}
