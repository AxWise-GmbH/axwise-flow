export function validateStock(stock) {
  if (typeof stock !== 'object' || stock === null || Array.isArray(stock)) {
    throw new TypeError('Stock must be a plain object');
  }
  const proto = Object.getPrototypeOf(stock);
  if (proto !== Object.prototype && proto !== null) {
    throw new TypeError('Stock must be a plain object');
  }
  if (Object.getOwnPropertySymbols(stock).length > 0) {
    throw new TypeError('Stock must not contain symbol keys');
  }
  const keys = Object.getOwnPropertyNames(stock);
  for (const key of keys) {
    if (typeof key !== 'string' || key.length === 0) {
      throw new TypeError('SKU key must be a nonempty string');
    }
    const val = stock[key];
    if (typeof val !== 'number' || !Number.isSafeInteger(val) || val < 0) {
      throw new TypeError(`Stock value for SKU "${key}" must be a nonnegative safe integer`);
    }
  }
}

export function cloneStock(stock) {
  const proto = Object.getPrototypeOf(stock);
  const copy = proto === null ? Object.create(null) : {};
  for (const key of Object.getOwnPropertyNames(stock)) {
    copy[key] = stock[key];
  }
  return copy;
}

export function reserve(stock, lines) {
  validateStock(stock);

  const originalRemaining = cloneStock(stock);

  if (!Array.isArray(lines) || lines.length === 0) {
    return {
      accepted: false,
      remaining: originalRemaining,
      reason: 'invalid_lines',
    };
  }

  const aggregated = new Map();

  for (const line of lines) {
    if (typeof line !== 'object' || line === null || Array.isArray(line)) {
      return {
        accepted: false,
        remaining: originalRemaining,
        reason: 'invalid_lines',
      };
    }

    const { sku, quantity } = line;

    if (typeof sku !== 'string' || sku.length === 0) {
      return {
        accepted: false,
        remaining: originalRemaining,
        reason: 'invalid_lines',
      };
    }

    if (typeof quantity !== 'number' || !Number.isSafeInteger(quantity) || quantity <= 0) {
      return {
        accepted: false,
        remaining: originalRemaining,
        reason: 'invalid_lines',
      };
    }

    const currentQty = aggregated.get(sku) ?? 0;
    const nextQty = currentQty + quantity;

    if (!Number.isSafeInteger(nextQty)) {
      return {
        accepted: false,
        remaining: originalRemaining,
        reason: 'invalid_lines',
      };
    }

    aggregated.set(sku, nextQty);
  }

  for (const [sku, qty] of aggregated.entries()) {
    if (!Object.prototype.hasOwnProperty.call(stock, sku) || stock[sku] < qty) {
      return {
        accepted: false,
        remaining: originalRemaining,
        reason: 'insufficient_stock',
      };
    }
  }

  const remaining = cloneStock(stock);
  for (const [sku, qty] of aggregated.entries()) {
    remaining[sku] -= qty;
  }

  return {
    accepted: true,
    remaining,
    reason: null,
  };
}
