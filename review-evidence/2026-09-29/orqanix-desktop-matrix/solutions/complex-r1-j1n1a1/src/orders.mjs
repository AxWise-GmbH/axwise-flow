import { reserve } from './inventory.mjs';

function copyStock(stock) {
  const proto = Object.getPrototypeOf(stock);
  const copy = proto === null ? Object.create(null) : {};
  return Object.assign(copy, stock);
}

function validateStock(stock) {
  if (stock === null || typeof stock !== 'object' || Array.isArray(stock)) {
    throw new TypeError('Stock must be a plain object');
  }
  const proto = Object.getPrototypeOf(stock);
  if (proto !== Object.prototype && proto !== null) {
    throw new TypeError('Stock must be a plain object');
  }
  if (Object.getOwnPropertySymbols(stock).length > 0) {
    throw new TypeError('Stock must not contain symbol keys');
  }
  for (const key of Object.getOwnPropertyNames(stock)) {
    if (typeof key !== 'string' || key.length === 0) {
      throw new TypeError('Stock keys must be nonempty strings');
    }
    const qty = stock[key];
    if (typeof qty !== 'number' || !Number.isSafeInteger(qty) || qty < 0 || Object.is(qty, -0)) {
      throw new TypeError('Stock quantities must be nonnegative safe integers');
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
      // Ignore later occurrences of an ID entirely (first occurrence wins)
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

  let currentStock = copyStock(stock);
  const acceptedIds = [];
  const reservationFailures = [];

  const processingQueue = [...expeditedOrders, ...normalOrders];

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
