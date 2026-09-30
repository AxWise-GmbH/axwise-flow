export function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function validateStock(stock) {
  if (!isPlainObject(stock)) {
    throw new TypeError('Invalid stock: stock must be a plain object');
  }
  if (Object.getOwnPropertySymbols(stock).length > 0) {
    throw new TypeError('Invalid stock: symbol keys are not permitted');
  }
  for (const key of Object.getOwnPropertyNames(stock)) {
    if (typeof key !== 'string' || key.length === 0) {
      throw new TypeError('Invalid stock: SKU keys must be nonempty strings');
    }
    const val = stock[key];
    if (!Number.isSafeInteger(val) || val < 0) {
      throw new TypeError(`Invalid stock: quantity for SKU "${key}" must be a nonnegative safe integer`);
    }
  }
}

export function reserve(stock, lines) {
  validateStock(stock);

  const stockCopy = { ...stock };

  if (!Array.isArray(lines) || lines.length === 0) {
    return { accepted: false, remaining: stockCopy, reason: 'invalid_lines' };
  }

  const aggregated = new Map();

  for (const line of lines) {
    if (
      line === null ||
      typeof line !== 'object' ||
      Array.isArray(line) ||
      typeof line.sku !== 'string' ||
      line.sku.length === 0 ||
      !Number.isSafeInteger(line.quantity) ||
      line.quantity <= 0
    ) {
      return { accepted: false, remaining: stockCopy, reason: 'invalid_lines' };
    }

    const current = aggregated.get(line.sku) || 0;
    const next = current + line.quantity;
    if (!Number.isSafeInteger(next) || next > Number.MAX_SAFE_INTEGER) {
      return { accepted: false, remaining: stockCopy, reason: 'invalid_lines' };
    }
    aggregated.set(line.sku, next);
  }

  for (const [sku, requiredQty] of aggregated.entries()) {
    if (!Object.prototype.hasOwnProperty.call(stock, sku) || stock[sku] < requiredQty) {
      return { accepted: false, remaining: stockCopy, reason: 'insufficient_stock' };
    }
  }

  const remaining = { ...stock };
  for (const [sku, requiredQty] of aggregated.entries()) {
    remaining[sku] -= requiredQty;
  }

  return { accepted: true, remaining, reason: null };
}
