function validateStock(stock) {
  if (stock === null || typeof stock !== 'object' || Array.isArray(stock)) {
    throw new TypeError('Invalid stock: must be a plain object');
  }
  const proto = Object.getPrototypeOf(stock);
  if (proto !== Object.prototype && proto !== null) {
    throw new TypeError('Invalid stock: must be a plain object');
  }
  if (Object.getOwnPropertySymbols(stock).length > 0) {
    throw new TypeError('Invalid stock: symbol keys not allowed');
  }
  for (const key of Object.getOwnPropertyNames(stock)) {
    if (key.length === 0) {
      throw new TypeError('Invalid stock: SKU key cannot be empty');
    }
    const desc = Object.getOwnPropertyDescriptor(stock, key);
    if (desc && (desc.get || desc.set)) {
      throw new TypeError('Invalid stock: getters/setters not allowed');
    }
    const val = stock[key];
    if (typeof val !== 'number' || !Number.isSafeInteger(val) || val < 0) {
      throw new TypeError('Invalid stock: value must be a non-negative safe integer');
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
    if (!line || typeof line !== 'object' || Array.isArray(line)) {
      return { accepted: false, remaining: { ...stock }, reason: 'invalid_lines' };
    }
    if (typeof line.sku !== 'string' || line.sku.length === 0) {
      return { accepted: false, remaining: { ...stock }, reason: 'invalid_lines' };
    }
    if (typeof line.quantity !== 'number' || !Number.isSafeInteger(line.quantity) || line.quantity <= 0) {
      return { accepted: false, remaining: { ...stock }, reason: 'invalid_lines' };
    }

    const current = aggregated.get(line.sku) ?? 0;
    const next = current + line.quantity;
    if (!Number.isSafeInteger(next)) {
      return { accepted: false, remaining: { ...stock }, reason: 'invalid_lines' };
    }
    aggregated.set(line.sku, next);
  }

  for (const [sku, qty] of aggregated.entries()) {
    if (!Object.hasOwn(stock, sku) || stock[sku] < qty) {
      return { accepted: false, remaining: { ...stock }, reason: 'insufficient_stock' };
    }
  }

  const remaining = { ...stock };
  for (const [sku, qty] of aggregated.entries()) {
    remaining[sku] = stock[sku] - qty;
  }

  return { accepted: true, remaining, reason: null };
}
