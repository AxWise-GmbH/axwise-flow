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
    throw new RangeError('priceCents * quantity must be a safe integer');
  }

  const discounted = product * (10000 - discountBps);
  if (!Number.isSafeInteger(discounted)) {
    throw new RangeError('product * (10000 - discountBps) must be a safe integer');
  }

  const result = Math.floor(discounted / 10000);
  return result === 0 ? 0 : result;
}
