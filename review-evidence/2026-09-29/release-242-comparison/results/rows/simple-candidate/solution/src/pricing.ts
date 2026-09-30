export function lineTotal(priceCents: number, quantity: number, discountBps = 0): number {
  if (!Number.isSafeInteger(priceCents) || priceCents < 0) {
    throw new RangeError('priceCents must be a nonnegative safe integer');
  }
  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    throw new RangeError('quantity must be a nonnegative safe integer');
  }
  if (!Number.isSafeInteger(discountBps) || discountBps < 0 || discountBps > 10000) {
    throw new RangeError('discountBps must be a safe integer from 0 through 10000');
  }

  const product = priceCents * quantity;
  if (!Number.isSafeInteger(product)) {
    throw new RangeError('Intermediate priceCents * quantity is not a safe integer');
  }

  const intermediate = product * (10000 - discountBps);
  if (!Number.isSafeInteger(intermediate)) {
    throw new RangeError('Intermediate product * (10000 - discountBps) is not a safe integer');
  }

  const total = Math.floor(intermediate / 10000);
  return total === 0 ? 0 : total;
}
