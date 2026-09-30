function validateStock(stock) {
  if (stock === null || typeof stock !== 'object' || Array.isArray(stock)) {
    throw new TypeError('Stock must be a plain object');
  }
  const proto = Object.getPrototypeOf(stock);
  if (proto !== Object.prototype && proto !== null) {
    throw new TypeError('Stock must be a plain object');
  }
  if (Object.getOwnPropertySymbols(stock).length > 0) {
    throw new TypeError('Stock keys cannot contain symbols');
  }
  const keys = Object.getOwnPropertyNames(stock);
  for (const key of keys) {
    if (typeof key !== 'string' || key.length === 0) {
      throw new TypeError('Stock SKU keys must be nonempty strings');
    }
    const val = stock[key];
    if (typeof val !== 'number' || !Number.isSafeInteger(val) || val < 0) {
      throw new TypeError(`Stock quantity for SKU "${key}" must be a nonnegative safe integer`);
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
    if (line === null || typeof line !== 'object' || Array.isArray(line)) {
      return { accepted: false, remaining: { ...stock }, reason: 'invalid_lines' };
    }
    const { sku, quantity } = line;
    if (typeof sku !== 'string' || sku.length === 0) {
      return { accepted: false, remaining: { ...stock }, reason: 'invalid_lines' };
    }
    if (typeof quantity !== 'number' || !Number.isSafeInteger(quantity) || quantity <= 0) {
      return { accepted: false, remaining: { ...stock }, reason: 'invalid_lines' };
    }

    const current = aggregated.get(sku) || 0;
    const sum = current + quantity;
    if (!Number.isSafeInteger(sum) || sum > Number.MAX_SAFE_INTEGER) {
      return { accepted: false, remaining: { ...stock }, reason: 'invalid_lines' };
    }
    aggregated.set(sku, sum);
  }

  for (const [sku, qty] of aggregated.entries()) {
    if (!Object.prototype.hasOwnProperty.call(stock, sku)) {
      return { accepted: false, remaining: { ...stock }, reason: 'insufficient_stock' };
    }
    if (stock[sku] < qty) {
      return { accepted: false, remaining: { ...stock }, reason: 'insufficient_stock' };
    }
  }

  const remaining = { ...stock };
  for (const [sku, qty] of aggregated.entries()) {
    remaining[sku] -= qty;
  }

  return { accepted: true, remaining, reason: null };
}
