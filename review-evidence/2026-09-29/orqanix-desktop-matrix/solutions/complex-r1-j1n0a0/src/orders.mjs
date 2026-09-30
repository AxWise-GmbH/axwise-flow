import { reserve, validateStock } from './inventory.mjs';

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
    if (typeof order !== 'object' || order === null || Array.isArray(order)) {
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

  let currentStock = { ...stock };
  const acceptedIds = [];
  const reservationFailures = [];

  const processQueue = [...expeditedOrders, ...normalOrders];

  for (const order of processQueue) {
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
