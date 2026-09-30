import { reserve } from './inventory.mjs';

function validateStock(stock) {
  if (stock === null || typeof stock !== 'object' || Array.isArray(stock)) {
    throw new TypeError('Stock must be a plain object');
  }
  const proto = Object.getPrototypeOf(stock);
  if (proto !== Object.prototype && proto !== null) {
    throw new TypeError('Stock must be a plain object');
  }
  const symbols = Object.getOwnPropertySymbols(stock);
  if (symbols.length > 0) {
    throw new TypeError('Stock keys must be strings');
  }
  const keys = Object.getOwnPropertyNames(stock);
  for (const key of keys) {
    if (typeof key !== 'string' || key.length === 0) {
      throw new TypeError('Stock SKU keys must be nonempty strings');
    }
    const qty = stock[key];
    if (typeof qty !== 'number' || !Number.isSafeInteger(qty) || qty < 0) {
      throw new TypeError(`Stock quantity for "${key}" must be a nonnegative safe integer`);
    }
  }
}

export function fulfillOrders(stock, orders) {
  validateStock(stock);

  if (!Array.isArray(orders)) {
    throw new TypeError('Orders must be an array');
  }

  const acceptedIds = [];
  const invalidOrderRejections = [];
  const reservationFailures = [];
  let currentStock = { ...stock };

  const seenIds = new Set();
  const expeditedQueue = [];
  const normalQueue = [];

  for (const order of orders) {
    const isObject = order !== null && typeof order === 'object' && !Array.isArray(order);
    const hasStringId = isObject && typeof order.id === 'string' && order.id.length > 0;

    if (!hasStringId) {
      invalidOrderRejections.push({ id: null, reason: 'invalid_order' });
      continue;
    }

    const id = order.id;
    if (seenIds.has(id)) {
      continue;
    }
    seenIds.add(id);

    if (order.priority === 'expedited') {
      expeditedQueue.push(order);
    } else if (order.priority === 'normal') {
      normalQueue.push(order);
    } else {
      invalidOrderRejections.push({ id, reason: 'invalid_order' });
    }
  }

  for (const order of expeditedQueue) {
    const result = reserve(currentStock, order.lines);
    if (result.accepted) {
      acceptedIds.push(order.id);
      currentStock = result.remaining;
    } else {
      reservationFailures.push({ id: order.id, reason: result.reason });
    }
  }

  for (const order of normalQueue) {
    const result = reserve(currentStock, order.lines);
    if (result.accepted) {
      acceptedIds.push(order.id);
      currentStock = result.remaining;
    } else {
      reservationFailures.push({ id: order.id, reason: result.reason });
    }
  }

  const rejected = [...invalidOrderRejections, ...reservationFailures];
  return { acceptedIds, rejected, remaining: currentStock };
}
