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
    throw new RangeError('priceCents, quantity, and discountBps must be safe integers within valid ranges');
  }

  const product = priceCents * quantity;
  if (!Number.isSafeInteger(product)) {
    throw new RangeError('Intermediate priceCents * quantity exceeds safe integer limit');
  }

  const intermediate = product * (10000 - discountBps);
  if (!Number.isSafeInteger(intermediate)) {
    throw new RangeError('Intermediate product * (10000 - discountBps) exceeds safe integer limit');
  }

  const total = Math.floor(intermediate / 10000);
  return total === 0 ? 0 : total;
}
