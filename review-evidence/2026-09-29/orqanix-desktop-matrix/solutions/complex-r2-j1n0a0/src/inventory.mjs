function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function validateStock(stock) {
  if (!isPlainObject(stock)) {
    throw new TypeError('Stock must be a plain object');
  }
  if (Object.getOwnPropertySymbols(stock).length > 0) {
    throw new TypeError('Stock must not contain symbol properties');
  }
  for (const key of Object.getOwnPropertyNames(stock)) {
    if (typeof key !== 'string' || key.length === 0) {
      throw new TypeError('SKU key must be a non-empty string');
    }
    const val = stock[key];
    if (typeof val !== 'number' || !Number.isSafeInteger(val) || val < 0) {
      throw new TypeError(`Stock for SKU "${key}" must be a non-negative safe integer`);
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

    const currentQty = aggregated.get(sku) || 0;
    const newQty = currentQty + quantity;
    if (!Number.isSafeInteger(newQty)) {
      return { accepted: false, remaining: { ...stock }, reason: 'invalid_lines' };
    }
    aggregated.set(sku, newQty);
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
