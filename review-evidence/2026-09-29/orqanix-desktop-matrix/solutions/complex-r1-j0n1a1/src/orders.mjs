import { reserve } from './inventory.mjs';

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

export function fulfillOrders(stock, orders) {
  validateStock(stock);

  if (!Array.isArray(orders)) {
    throw new TypeError('Orders must be an array');
  }

  const seenIds = new Set();
  const invalidOrderRejections = [];
  const validExpeditedOrders = [];
  const validNormalOrders = [];

  for (const order of orders) {
    if (order === null || typeof order !== 'object' || Array.isArray(order)) {
      invalidOrderRejections.push({ id: null, reason: 'invalid_order' });
      continue;
    }

    const hasValidId = typeof order.id === 'string' && order.id.length > 0;
    if (!hasValidId) {
      invalidOrderRejections.push({ id: null, reason: 'invalid_order' });
      continue;
    }

    if (seenIds.has(order.id)) {
      continue;
    }

    seenIds.add(order.id);

    const isValidPriority = order.priority === 'expedited' || order.priority === 'normal';
    if (!isValidPriority) {
      invalidOrderRejections.push({ id: order.id, reason: 'invalid_order' });
      continue;
    }

    if (order.priority === 'expedited') {
      validExpeditedOrders.push(order);
    } else {
      validNormalOrders.push(order);
    }
  }

  const processingQueue = [...validExpeditedOrders, ...validNormalOrders];
  const acceptedIds = [];
  const reservationFailures = [];
  let currentStock = { ...stock };

  for (const order of processingQueue) {
    const result = reserve(currentStock, order.lines);
    if (result.accepted) {
      acceptedIds.push(order.id);
      currentStock = result.remaining;
    } else {
      reservationFailures.push({ id: order.id, reason: result.reason });
    }
  }

  return {
    acceptedIds,
    rejected: [...invalidOrderRejections, ...reservationFailures],
    remaining: currentStock,
  };
}
