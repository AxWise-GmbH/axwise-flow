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
    throw new RangeError(
      'Invalid input: priceCents and quantity must be nonnegative safe integers, discountBps must be in range 0..10000.'
    );
  }

  const product = priceCents * quantity;
  if (!Number.isSafeInteger(product)) {
    throw new RangeError('Intermediate priceCents * quantity is not a safe integer.');
  }

  const intermediate = product * (10000 - discountBps);
  if (!Number.isSafeInteger(intermediate)) {
    throw new RangeError(
      'Intermediate product * (10000 - discountBps) is not a safe integer.'
    );
  }

  return Math.floor(intermediate / 10000);
}
