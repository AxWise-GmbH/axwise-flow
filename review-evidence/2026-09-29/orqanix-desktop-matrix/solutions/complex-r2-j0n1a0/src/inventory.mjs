export function copyStock(stock) {
  const proto = Object.getPrototypeOf(stock);
  const copy = Object.create(proto);
  for (const key of Object.getOwnPropertyNames(stock)) {
    Object.defineProperty(copy, key, {
      value: stock[key],
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }
  return copy;
}

export function validateStock(stock) {
  if (typeof stock !== 'object' || stock === null || Array.isArray(stock)) {
    throw new TypeError('Invalid stock: must be a plain object');
  }
  const proto = Object.getPrototypeOf(stock);
  if (proto !== Object.prototype && proto !== null) {
    throw new TypeError('Invalid stock: must be a plain object');
  }
  if (Object.getOwnPropertySymbols(stock).length > 0) {
    throw new TypeError('Invalid stock: symbol keys are not allowed');
  }
  const keys = Object.getOwnPropertyNames(stock);
  for (const key of keys) {
    if (key.length === 0) {
      throw new TypeError('Invalid stock: SKU keys must be nonempty strings');
    }
    const qty = stock[key];
    if (typeof qty !== 'number' || !Number.isSafeInteger(qty) || qty < 0) {
      throw new TypeError('Invalid stock: quantities must be nonnegative safe integers');
    }
  }
}

export function reserve(stock, lines) {
  validateStock(stock);

  const stockCopy = copyStock(stock);

  if (!Array.isArray(lines) || lines.length === 0) {
    return { accepted: false, remaining: stockCopy, reason: 'invalid_lines' };
  }

  const aggregated = new Map();
  for (const line of lines) {
    if (typeof line !== 'object' || line === null || Array.isArray(line)) {
      return { accepted: false, remaining: stockCopy, reason: 'invalid_lines' };
    }
    if (typeof line.sku !== 'string' || line.sku.length === 0) {
      return { accepted: false, remaining: stockCopy, reason: 'invalid_lines' };
    }
    if (typeof line.quantity !== 'number' || !Number.isSafeInteger(line.quantity) || line.quantity <= 0) {
      return { accepted: false, remaining: stockCopy, reason: 'invalid_lines' };
    }

    const current = aggregated.get(line.sku) ?? 0;
    const next = current + line.quantity;
    if (!Number.isSafeInteger(next)) {
      return { accepted: false, remaining: stockCopy, reason: 'invalid_lines' };
    }
    aggregated.set(line.sku, next);
  }

  for (const [sku, qty] of aggregated.entries()) {
    if (!Object.hasOwn(stock, sku)) {
      return { accepted: false, remaining: stockCopy, reason: 'insufficient_stock' };
    }
    if (stock[sku] < qty) {
      return { accepted: false, remaining: stockCopy, reason: 'insufficient_stock' };
    }
  }

  const remaining = copyStock(stock);
  for (const [sku, qty] of aggregated.entries()) {
    remaining[sku] -= qty;
  }

  return { accepted: true, remaining, reason: null };
}
