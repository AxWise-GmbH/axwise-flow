function validateStock(stock) {
  if (stock === null || typeof stock !== 'object' || Array.isArray(stock)) {
    throw new TypeError('Stock must be a plain object');
  }
  const proto = Object.getPrototypeOf(stock);
  if (proto !== Object.prototype && proto !== null) {
    throw new TypeError('Stock must be a plain object');
  }
  const symbols = Object.getOwnPropertySymbols(stock);
  if (symbols.length > 0) {
    throw new TypeError('Stock keys must be strings');
  }
  const keys = Object.getOwnPropertyNames(stock);
  for (const key of keys) {
    if (typeof key !== 'string' || key.length === 0) {
      throw new TypeError('Stock SKU keys must be nonempty strings');
    }
    const qty = stock[key];
    if (typeof qty !== 'number' || !Number.isSafeInteger(qty) || qty < 0) {
      throw new TypeError(`Stock quantity for "${key}" must be a nonnegative safe integer`);
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
    if (
      line === null ||
      typeof line !== 'object' ||
      Array.isArray(line) ||
      typeof line.sku !== 'string' ||
      line.sku.length === 0 ||
      typeof line.quantity !== 'number' ||
      !Number.isSafeInteger(line.quantity) ||
      line.quantity <= 0
    ) {
      return { accepted: false, remaining: { ...stock }, reason: 'invalid_lines' };
    }

    const current = aggregated.get(line.sku) ?? 0;
    const sum = current + line.quantity;
    if (!Number.isSafeInteger(sum) || sum > Number.MAX_SAFE_INTEGER) {
      return { accepted: false, remaining: { ...stock }, reason: 'invalid_lines' };
    }
    aggregated.set(line.sku, sum);
  }

  for (const [sku, qty] of aggregated.entries()) {
    if (!Object.hasOwn(stock, sku) || stock[sku] < qty) {
      return { accepted: false, remaining: { ...stock }, reason: 'insufficient_stock' };
    }
  }

  const remaining = { ...stock };
  for (const [sku, qty] of aggregated.entries()) {
    remaining[sku] = remaining[sku] - qty;
  }

  return { accepted: true, remaining, reason: null };
}
