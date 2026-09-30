export function lineTotal(priceCents, quantity, discountBps = 0) {
  if (
    !Number.isSafeInteger(priceCents) || priceCents < 0 ||
    !Number.isSafeInteger(quantity) || quantity < 0 ||
    !Number.isSafeInteger(discountBps) || discountBps < 0 || discountBps > 10000
  ) {
    throw new RangeError('Inputs must be safe integers: priceCents >= 0, quantity >= 0, and 0 <= discountBps <= 10000');
  }

  const product = priceCents * quantity;
  if (!Number.isSafeInteger(product)) {
    throw new RangeError('Intermediate priceCents * quantity exceeds safe integer limit');
  }

  const discounted = product * (10000 - discountBps);
  if (!Number.isSafeInteger(discounted)) {
    throw new RangeError('Intermediate product * (10000 - discountBps) exceeds safe integer limit');
  }

  const result = Math.floor(discounted / 10000);
  return result === 0 ? 0 : result;
}
