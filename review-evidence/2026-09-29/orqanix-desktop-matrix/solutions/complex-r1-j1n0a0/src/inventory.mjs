export function validateStock(stock) {
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
      throw new TypeError('Stock SKU keys must be nonempty strings');
    }
    const val = stock[key];
    if (typeof val !== 'number' || !Number.isSafeInteger(val) || val < 0) {
      throw new TypeError(`Stock quantity for "${key}" must be a nonnegative safe integer`);
    }
  }
}

export function reserve(stock, lines) {
  validateStock(stock);

  if (!Array.isArray(lines) || lines.length === 0) {
    return { accepted: false, remaining: { ...stock }, reason: 'invalid_lines' };
  }

  const aggregates = new Map();
  for (const line of lines) {
    if (typeof line !== 'object' || line === null || Array.isArray(line)) {
      return { accepted: false, remaining: { ...stock }, reason: 'invalid_lines' };
    }
    const { sku, quantity } = line;
    if (typeof sku !== 'string' || sku.length === 0) {
      return { accepted: false, remaining: { ...stock }, reason: 'invalid_lines' };
    }
    if (typeof quantity !== 'number' || !Number.isSafeInteger(quantity) || quantity <= 0) {
      return { accepted: false, remaining: { ...stock }, reason: 'invalid_lines' };
    }
    const current = aggregates.get(sku) ?? 0;
    const next = current + quantity;
    if (!Number.isSafeInteger(next) || next > Number.MAX_SAFE_INTEGER) {
      return { accepted: false, remaining: { ...stock }, reason: 'invalid_lines' };
    }
    aggregates.set(sku, next);
  }

  for (const [sku, qty] of aggregates.entries()) {
    if (!Object.hasOwn(stock, sku) || stock[sku] < qty) {
      return { accepted: false, remaining: { ...stock }, reason: 'insufficient_stock' };
    }
  }

  const remaining = { ...stock };
  for (const [sku, qty] of aggregates.entries()) {
    remaining[sku] -= qty;
  }

  return { accepted: true, remaining, reason: null };
}
