import { reserve, validateStock, copyStock } from './inventory.mjs';

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

    const id = order.id;
    if (seenIds.has(id)) {
      // Ignore later occurrences of an ID entirely (first occurrence wins)
      continue;
    }
    seenIds.add(id);

    if (order.priority !== 'expedited' && order.priority !== 'normal') {
      invalidOrderRejections.push({ id, reason: 'invalid_order' });
      continue;
    }

    if (order.priority === 'expedited') {
      expeditedOrders.push(order);
    } else {
      normalOrders.push(order);
    }
  }

  const processingQueue = [...expeditedOrders, ...normalOrders];
  let currentStock = copyStock(stock);
  const acceptedIds = [];
  const reservationFailures = [];

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
