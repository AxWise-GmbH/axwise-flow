function validateStock(stock) {
  if (typeof stock !== 'object' || stock === null || Array.isArray(stock)) {
    throw new TypeError('Invalid stock: must be a plain object');
  }
  const proto = Object.getPrototypeOf(stock);
  if (proto !== null && proto !== Object.prototype) {
    throw new TypeError('Invalid stock: must be a plain object');
  }
  if (Object.getOwnPropertySymbols(stock).length > 0) {
    throw new TypeError('Invalid stock: symbol keys are not allowed');
  }
  for (const key of Object.getOwnPropertyNames(stock)) {
    if (typeof key !== 'string' || key.length === 0) {
      throw new TypeError('Invalid stock: SKU must be a nonempty string');
    }
    const val = stock[key];
    if (typeof val !== 'number' || !Number.isSafeInteger(val) || val < 0) {
      throw new TypeError('Invalid stock: quantity must be a nonnegative safe integer');
    }
  }
}

function copyStock(stock) {
  const target = Object.getPrototypeOf(stock) === null ? Object.create(null) : {};
  return Object.assign(target, stock);
}

export function reserve(stock, lines) {
  validateStock(stock);

  const invalidLinesResult = {
    accepted: false,
    remaining: copyStock(stock),
    reason: 'invalid_lines',
  };

  if (!Array.isArray(lines) || lines.length === 0) {
    return invalidLinesResult;
  }

  const aggregated = new Map();

  for (const item of lines) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      return invalidLinesResult;
    }
    if (typeof item.sku !== 'string' || item.sku.length === 0) {
      return invalidLinesResult;
    }
    if (
      typeof item.quantity !== 'number' ||
      !Number.isSafeInteger(item.quantity) ||
      item.quantity <= 0
    ) {
      return invalidLinesResult;
    }

    const currentQty = aggregated.get(item.sku) ?? 0;
    const newQty = currentQty + item.quantity;
    if (!Number.isSafeInteger(newQty)) {
      return invalidLinesResult;
    }
    aggregated.set(item.sku, newQty);
  }

  for (const [sku, qty] of aggregated) {
    if (!Object.hasOwn(stock, sku) || stock[sku] < qty) {
      return {
        accepted: false,
        remaining: copyStock(stock),
        reason: 'insufficient_stock',
      };
    }
  }

  const remaining = copyStock(stock);
  for (const [sku, qty] of aggregated) {
    remaining[sku] = stock[sku] - qty;
  }

  return {
    accepted: true,
    remaining,
    reason: null,
  };
}
