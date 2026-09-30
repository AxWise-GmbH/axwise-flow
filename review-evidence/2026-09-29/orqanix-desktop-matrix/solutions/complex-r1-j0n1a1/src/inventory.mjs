function isPlainObject(obj) {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    return false;
  }
  const proto = Object.getPrototypeOf(obj);
  return proto === null || proto === Object.prototype;
}

function validateStock(stock) {
  if (!isPlainObject(stock)) {
    throw new TypeError('Stock must be a plain object');
  }
  if (Object.getOwnPropertySymbols(stock).length > 0) {
    throw new TypeError('Stock cannot have Symbol keys');
  }
  const keys = Object.getOwnPropertyNames(stock);
  for (const key of keys) {
    if (typeof key !== 'string' || key.length === 0) {
      throw new TypeError('Stock SKU keys must be nonempty strings');
    }
    const val = stock[key];
    if (typeof val !== 'number' || !Number.isSafeInteger(val) || val < 0) {
      throw new TypeError(`Stock value for SKU "${key}" must be a nonnegative safe integer`);
    }
  }
}

export function reserve(stock, lines) {
  validateStock(stock);

  const copyStock = () => ({ ...stock });

  if (!Array.isArray(lines) || lines.length === 0) {
    return { accepted: false, remaining: copyStock(), reason: 'invalid_lines' };
  }

  const aggregated = new Map();

  for (const line of lines) {
    if (line === null || typeof line !== 'object' || Array.isArray(line)) {
      return { accepted: false, remaining: copyStock(), reason: 'invalid_lines' };
    }
    if (typeof line.sku !== 'string' || line.sku.length === 0) {
      return { accepted: false, remaining: copyStock(), reason: 'invalid_lines' };
    }
    if (typeof line.quantity !== 'number' || !Number.isSafeInteger(line.quantity) || line.quantity <= 0) {
      return { accepted: false, remaining: copyStock(), reason: 'invalid_lines' };
    }

    const currentQty = aggregated.get(line.sku) || 0;
    const nextQty = currentQty + line.quantity;
    if (!Number.isSafeInteger(nextQty)) {
      return { accepted: false, remaining: copyStock(), reason: 'invalid_lines' };
    }
    aggregated.set(line.sku, nextQty);
  }

  for (const [sku, requiredQty] of aggregated) {
    if (!Object.prototype.hasOwnProperty.call(stock, sku)) {
      return { accepted: false, remaining: copyStock(), reason: 'insufficient_stock' };
    }
    if (stock[sku] < requiredQty) {
      return { accepted: false, remaining: copyStock(), reason: 'insufficient_stock' };
    }
  }

  const remaining = copyStock();
  for (const [sku, requiredQty] of aggregated) {
    remaining[sku] = remaining[sku] - requiredQty;
  }

  return { accepted: true, remaining, reason: null };
}
