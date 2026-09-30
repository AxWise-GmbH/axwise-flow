function copyStock(stock) {
  const proto = Object.getPrototypeOf(stock);
  const copy = proto === null ? Object.create(null) : {};
  return Object.assign(copy, stock);
}

function validateStock(stock) {
  if (stock === null || typeof stock !== 'object' || Array.isArray(stock)) {
    throw new TypeError('Stock must be a plain object');
  }
  const proto = Object.getPrototypeOf(stock);
  if (proto !== Object.prototype && proto !== null) {
    throw new TypeError('Stock must be a plain object');
  }
  if (Object.getOwnPropertySymbols(stock).length > 0) {
    throw new TypeError('Stock must not contain symbol keys');
  }
  for (const key of Object.getOwnPropertyNames(stock)) {
    if (typeof key !== 'string' || key.length === 0) {
      throw new TypeError('Stock keys must be nonempty strings');
    }
    const qty = stock[key];
    if (typeof qty !== 'number' || !Number.isSafeInteger(qty) || qty < 0 || Object.is(qty, -0)) {
      throw new TypeError('Stock quantities must be nonnegative safe integers');
    }
  }
}

export function reserve(stock, lines) {
  validateStock(stock);

  if (!Array.isArray(lines) || lines.length === 0) {
    return { accepted: false, remaining: copyStock(stock), reason: 'invalid_lines' };
  }

  const aggregated = new Map();

  for (const line of lines) {
    if (line === null || typeof line !== 'object' || Array.isArray(line)) {
      return { accepted: false, remaining: copyStock(stock), reason: 'invalid_lines' };
    }
    const { sku, quantity } = line;
    if (typeof sku !== 'string' || sku.length === 0) {
      return { accepted: false, remaining: copyStock(stock), reason: 'invalid_lines' };
    }
    if (typeof quantity !== 'number' || !Number.isSafeInteger(quantity) || quantity <= 0) {
      return { accepted: false, remaining: copyStock(stock), reason: 'invalid_lines' };
    }
    const current = aggregated.get(sku) ?? 0;
    const total = current + quantity;
    if (!Number.isSafeInteger(total) || total > Number.MAX_SAFE_INTEGER) {
      return { accepted: false, remaining: copyStock(stock), reason: 'invalid_lines' };
    }
    aggregated.set(sku, total);
  }

  for (const [sku, totalQty] of aggregated.entries()) {
    if (!Object.hasOwn(stock, sku) || stock[sku] < totalQty) {
      return { accepted: false, remaining: copyStock(stock), reason: 'insufficient_stock' };
    }
  }

  const remaining = copyStock(stock);
  for (const [sku, totalQty] of aggregated.entries()) {
    remaining[sku] = stock[sku] - totalQty;
  }

  return { accepted: true, remaining, reason: null };
}
