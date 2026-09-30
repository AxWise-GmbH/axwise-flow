export function lineTotal(priceCents, quantity, discountBps = 0) {
  if (!Number.isSafeInteger(priceCents) || priceCents < 0) {
    throw new RangeError('priceCents must be a non-negative safe integer');
  }
  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    throw new RangeError('quantity must be a non-negative safe integer');
  }
  if (!Number.isSafeInteger(discountBps) || discountBps < 0 || discountBps > 10000) {
    throw new RangeError('discountBps must be an integer between 0 and 10000');
  }

  const product = priceCents * quantity;
  if (!Number.isSafeInteger(product)) {
    throw new RangeError('Intermediate priceCents*quantity exceeds safe integer range');
  }

  const total = product * (10000 - discountBps);
  if (!Number.isSafeInteger(total)) {
    throw new RangeError('Intermediate product*(10000-discountBps) exceeds safe integer range');
  }

  return Math.floor(total / 10000);
}
