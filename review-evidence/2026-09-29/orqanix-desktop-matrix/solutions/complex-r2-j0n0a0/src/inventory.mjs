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

  const keys = Object.keys(stock);
  if (Object.getOwnPropertyNames(stock).length !== keys.length) {
    throw new TypeError('Invalid stock: non-enumerable properties are not allowed');
  }

  for (const key of keys) {
    if (typeof key !== 'string' || key.length === 0) {
      throw new TypeError('Invalid stock: SKU key must be a nonempty string');
    }
    const val = stock[key];
    if (typeof val !== 'number' || !Number.isSafeInteger(val) || val < 0 || Object.is(val, -0)) {
      throw new TypeError(`Invalid stock: value for SKU "${key}" must be a nonnegative safe integer`);
    }
  }
}

export function reserve(stock, lines) {
  validateStock(stock);

  const copyStock = { ...stock };

  if (!Array.isArray(lines) || lines.length === 0) {
    return { accepted: false, remaining: copyStock, reason: 'invalid_lines' };
  }

  const aggregated = new Map();

  for (const line of lines) {
    if (typeof line !== 'object' || line === null || Array.isArray(line)) {
      return { accepted: false, remaining: copyStock, reason: 'invalid_lines' };
    }
    if (typeof line.sku !== 'string' || line.sku.length === 0) {
      return { accepted: false, remaining: copyStock, reason: 'invalid_lines' };
    }
    if (typeof line.quantity !== 'number' || !Number.isSafeInteger(line.quantity) || line.quantity <= 0 || Object.is(line.quantity, -0)) {
      return { accepted: false, remaining: copyStock, reason: 'invalid_lines' };
    }

    const current = aggregated.get(line.sku) || 0;
    const total = current + line.quantity;
    if (!Number.isSafeInteger(total)) {
      return { accepted: false, remaining: copyStock, reason: 'invalid_lines' };
    }
    aggregated.set(line.sku, total);
  }

  for (const [sku, quantity] of aggregated) {
    if (!Object.prototype.hasOwnProperty.call(stock, sku) || stock[sku] < quantity) {
      return { accepted: false, remaining: copyStock, reason: 'insufficient_stock' };
    }
  }

  const remaining = { ...stock };
  for (const [sku, quantity] of aggregated) {
    remaining[sku] -= quantity;
  }

  return { accepted: true, remaining, reason: null };
}
