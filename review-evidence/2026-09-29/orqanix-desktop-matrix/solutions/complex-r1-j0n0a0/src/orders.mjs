import { reserve } from './inventory.mjs';

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

export function fulfillOrders(stock, orders) {
  validateStock(stock);
  if (!Array.isArray(orders)) {
    throw new TypeError('Invalid orders: must be an array');
  }

  const seenIds = new Set();
  const invalidOrderRejections = [];
  const expeditedOrders = [];
  const normalOrders = [];

  for (const order of orders) {
    const hasValidId =
      typeof order === 'object' &&
      order !== null &&
      typeof order.id === 'string' &&
      order.id.length > 0;

    if (!hasValidId) {
      invalidOrderRejections.push({ id: null, reason: 'invalid_order' });
      continue;
    }

    if (seenIds.has(order.id)) {
      continue;
    }
    seenIds.add(order.id);

    if (order.priority !== 'expedited' && order.priority !== 'normal') {
      invalidOrderRejections.push({ id: order.id, reason: 'invalid_order' });
      continue;
    }

    if (order.priority === 'expedited') {
      expeditedOrders.push(order);
    } else {
      normalOrders.push(order);
    }
  }

  const acceptedIds = [];
  const reservationFailures = [];
  let currentStock = copyStock(stock);

  const processingQueue = [...expeditedOrders, ...normalOrders];

  for (const order of processingQueue) {
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
