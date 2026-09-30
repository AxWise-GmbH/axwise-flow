export function lineTotal(priceCents: number, quantity: number, discountBps = 0): number {
  return Math.round(priceCents * (quantity || 1) * (1 - discountBps / 10000));
}
