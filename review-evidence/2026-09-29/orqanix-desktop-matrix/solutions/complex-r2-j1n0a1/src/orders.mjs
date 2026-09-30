import { reserve } from './inventory.mjs';

function validateStock(stock) {
  if (typeof stock !== 'object' || stock === null || Array.isArray(stock)) {
    throw new TypeError('Stock must be a plain object');
  }
  const proto = Object.getPrototypeOf(stock);
  if (proto !== null && proto !== Object.prototype) {
    throw new TypeError('Stock must be a plain object');
  }
  if (Object.getOwnPropertySymbols(stock).length > 0) {
    throw new TypeError('Stock must not contain symbol keys');
  }
  for (const key of Object.getOwnPropertyNames(stock)) {
    if (typeof key !== 'string' || key.length === 0) {
      throw new TypeError('SKU keys must be nonempty strings');
    }
    const val = stock[key];
    if (typeof val !== 'number' || !Number.isSafeInteger(val) || val < 0) {
      throw new TypeError('Stock quantities must be nonnegative safe integers');
    }
  }
}

export function fulfillOrders(stock, orders) {
  validateStock(stock);

  if (!Array.isArray(orders)) {
    throw new TypeError('orders must be an array');
  }

  const seenIds = new Set();
  const invalidOrderRejections = [];
  const expeditedOrders = [];
  const normalOrders = [];

  for (const order of orders) {
    if (typeof order !== 'object' || order === null || Array.isArray(order)) {
      invalidOrderRejections.push({ id: null, reason: 'invalid_order' });
      continue;
    }

    if (typeof order.id !== 'string' || order.id.length === 0) {
      invalidOrderRejections.push({ id: null, reason: 'invalid_order' });
      continue;
    }

    if (seenIds.has(order.id)) {
      continue;
    }

    seenIds.add(order.id);

    if (order.priority === 'expedited') {
      expeditedOrders.push(order);
    } else if (order.priority === 'normal') {
      normalOrders.push(order);
    } else {
      invalidOrderRejections.push({ id: order.id, reason: 'invalid_order' });
    }
  }

  let currentStock = { ...stock };
  const acceptedIds = [];
  const reservationFailures = [];

  for (const order of expeditedOrders) {
    const res = reserve(currentStock, order.lines);
    if (res.accepted) {
      acceptedIds.push(order.id);
      currentStock = res.remaining;
    } else {
      reservationFailures.push({ id: order.id, reason: res.reason });
    }
  }

  for (const order of normalOrders) {
    const res = reserve(currentStock, order.lines);
    if (res.accepted) {
      acceptedIds.push(order.id);
      currentStock = res.remaining;
    } else {
      reservationFailures.push({ id: order.id, reason: res.reason });
    }
  }

  return {
    acceptedIds,
    rejected: [...invalidOrderRejections, ...reservationFailures],
    remaining: currentStock,
  };
}
