import { reserve } from './inventory.mjs';

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

export function fulfillOrders(stock, orders) {
  validateStock(stock);

  if (!Array.isArray(orders)) {
    throw new TypeError('Invalid orders: must be an array');
  }

  const seenIds = new Set();
  const invalidOrders = [];
  const expeditedQueue = [];
  const normalQueue = [];

  for (const order of orders) {
    if (!order || typeof order !== 'object' || Array.isArray(order)) {
      invalidOrders.push({ id: null, reason: 'invalid_order' });
      continue;
    }

    if (typeof order.id !== 'string' || order.id.length === 0) {
      invalidOrders.push({ id: null, reason: 'invalid_order' });
      continue;
    }

    if (seenIds.has(order.id)) {
      // Ignore later occurrences of an ID entirely (first occurrence wins)
      continue;
    }

    seenIds.add(order.id);

    if (order.priority !== 'expedited' && order.priority !== 'normal') {
      invalidOrders.push({ id: order.id, reason: 'invalid_order' });
      continue;
    }

    if (order.priority === 'expedited') {
      expeditedQueue.push(order);
    } else {
      normalQueue.push(order);
    }
  }

  let currentStock = { ...stock };
  const acceptedIds = [];
  const reservationFailures = [];

  const queue = [...expeditedQueue, ...normalQueue];
  for (const order of queue) {
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
    rejected: [...invalidOrders, ...reservationFailures],
    remaining: currentStock,
  };
}
