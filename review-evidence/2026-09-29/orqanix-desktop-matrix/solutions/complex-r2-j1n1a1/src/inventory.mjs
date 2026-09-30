function isPlainObject(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
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
    throw new TypeError('Stock cannot contain symbol keys');
  }
  for (const key of Object.getOwnPropertyNames(stock)) {
    if (typeof key !== 'string' || key.length === 0) {
      throw new TypeError('Stock SKU keys must be nonempty strings');
    }
    const val = stock[key];
    if (
      typeof val !== 'number' ||
      !Number.isSafeInteger(val) ||
      val < 0 ||
      Object.is(val, -0)
    ) {
      throw new TypeError(`Stock quantity for "${key}" must be a nonnegative safe integer`);
    }
  }
}

export function copyStock(stock) {
  const copy = Object.create(Object.getPrototypeOf(stock));
  return Object.assign(copy, stock);
}

export function reserve(stock, lines) {
  validateStock(stock);

  if (!Array.isArray(lines) || lines.length === 0) {
    return {
      accepted: false,
      remaining: copyStock(stock),
      reason: 'invalid_lines',
    };
  }

  const aggregated = new Map();
  for (const line of lines) {
    if (typeof line !== 'object' || line === null || Array.isArray(line)) {
      return {
        accepted: false,
        remaining: copyStock(stock),
        reason: 'invalid_lines',
      };
    }
    if (typeof line.sku !== 'string' || line.sku.length === 0) {
      return {
        accepted: false,
        remaining: copyStock(stock),
        reason: 'invalid_lines',
      };
    }
    if (
      typeof line.quantity !== 'number' ||
      !Number.isSafeInteger(line.quantity) ||
      line.quantity <= 0
    ) {
      return {
        accepted: false,
        remaining: copyStock(stock),
        reason: 'invalid_lines',
      };
    }

    const current = aggregated.get(line.sku) ?? 0;
    const next = current + line.quantity;
    if (!Number.isSafeInteger(next) || next <= 0) {
      return {
        accepted: false,
        remaining: copyStock(stock),
        reason: 'invalid_lines',
      };
    }
    aggregated.set(line.sku, next);
  }

  for (const [sku, qty] of aggregated.entries()) {
    if (!Object.hasOwn(stock, sku) || stock[sku] < qty) {
      return {
        accepted: false,
        remaining: copyStock(stock),
        reason: 'insufficient_stock',
      };
    }
  }

  const remaining = copyStock(stock);
  for (const [sku, qty] of aggregated.entries()) {
    remaining[sku] -= qty;
  }

  return {
    accepted: true,
    remaining,
    reason: null,
  };
}
