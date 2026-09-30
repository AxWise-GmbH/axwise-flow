function validateStock(stock) {
  if (typeof stock !== 'object' || stock === null || Array.isArray(stock)) {
    throw new TypeError('Stock must be a plain object');
  }
  const proto = Object.getPrototypeOf(stock);
  if (proto !== null && proto !== Object.prototype) {
    throw new TypeError('Stock must be a plain object');
  }
  if (Object.getOwnPropertySymbols(stock).length > 0) {
    throw new TypeError('Stock must not contain symbol keys');
  }
  for (const key of Object.getOwnPropertyNames(stock)) {
    if (typeof key !== 'string' || key.length === 0) {
      throw new TypeError('SKU keys must be nonempty strings');
    }
    const val = stock[key];
    if (typeof val !== 'number' || !Number.isSafeInteger(val) || val < 0) {
      throw new TypeError('Stock quantities must be nonnegative safe integers');
    }
  }
}

export function reserve(stock, lines) {
  validateStock(stock);

  if (!Array.isArray(lines) || lines.length === 0) {
    return { accepted: false, remaining: { ...stock }, reason: 'invalid_lines' };
  }

  const aggregated = new Map();
  for (const line of lines) {
    if (typeof line !== 'object' || line === null || Array.isArray(line)) {
      return { accepted: false, remaining: { ...stock }, reason: 'invalid_lines' };
    }
    if (typeof line.sku !== 'string' || line.sku.length === 0) {
      return { accepted: false, remaining: { ...stock }, reason: 'invalid_lines' };
    }
    if (typeof line.quantity !== 'number' || !Number.isSafeInteger(line.quantity) || line.quantity <= 0) {
      return { accepted: false, remaining: { ...stock }, reason: 'invalid_lines' };
    }

    const current = aggregated.get(line.sku) || 0;
    const next = current + line.quantity;
    if (!Number.isSafeInteger(next)) {
      return { accepted: false, remaining: { ...stock }, reason: 'invalid_lines' };
    }
    aggregated.set(line.sku, next);
  }

  for (const [sku, qty] of aggregated) {
    if (!Object.hasOwn(stock, sku) || stock[sku] < qty) {
      return { accepted: false, remaining: { ...stock }, reason: 'insufficient_stock' };
    }
  }

  const remaining = { ...stock };
  for (const [sku, qty] of aggregated) {
    remaining[sku] -= qty;
  }

  return { accepted: true, remaining, reason: null };
}
