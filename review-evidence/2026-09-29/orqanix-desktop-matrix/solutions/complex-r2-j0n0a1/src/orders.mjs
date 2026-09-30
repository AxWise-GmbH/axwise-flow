import { reserve } from './inventory.mjs';

function validateStock(stock) {
  if (stock === null || typeof stock !== 'object' || Array.isArray(stock)) {
    throw new TypeError('Stock must be a plain object');
  }
  const proto = Object.getPrototypeOf(stock);
  if (proto !== Object.prototype && proto !== null) {
    throw new TypeError('Stock must be a plain object');
  }
  if (Object.getOwnPropertySymbols(stock).length > 0) {
    throw new TypeError('Stock keys cannot contain symbols');
  }
  const keys = Object.getOwnPropertyNames(stock);
  for (const key of keys) {
    if (typeof key !== 'string' || key.length === 0) {
      throw new TypeError('Stock SKU keys must be nonempty strings');
    }
    const val = stock[key];
    if (typeof val !== 'number' || !Number.isSafeInteger(val) || val < 0) {
      throw new TypeError(`Stock quantity for SKU "${key}" must be a nonnegative safe integer`);
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
  const expeditedOrders = [];
  const normalOrders = [];

  for (const order of orders) {
    if (order === null || typeof order !== 'object' || Array.isArray(order)) {
      invalidOrderRejections.push({ id: null, reason: 'invalid_order' });
      continue;
    }

    const { id, priority } = order;
    if (typeof id !== 'string' || id.length === 0) {
      invalidOrderRejections.push({ id: null, reason: 'invalid_order' });
      continue;
    }

    if (seenIds.has(id)) {
      // First occurrence wins: ignore later occurrences entirely
      continue;
    }
    seenIds.add(id);

    if (priority !== 'expedited' && priority !== 'normal') {
      invalidOrderRejections.push({ id, reason: 'invalid_order' });
      continue;
    }

    if (priority === 'expedited') {
      expeditedOrders.push(order);
    } else {
      normalOrders.push(order);
    }
  }

  const processingQueue = [...expeditedOrders, ...normalOrders];
  let currentStock = { ...stock };
  const acceptedIds = [];
  const reservationFailures = [];

  for (const order of processingQueue) {
    const res = reserve(currentStock, order.lines);
    if (res.accepted) {
      currentStock = res.remaining;
      acceptedIds.push(order.id);
    } else {
      reservationFailures.push({ id: order.id, reason: res.reason });
    }
  }

  return {
    acceptedIds,
    rejected: [...invalidOrderRejections, ...reservationFailures],
    remaining: currentStock
  };
}
