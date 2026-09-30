import { reserve, validateStock, cloneStock } from './inventory.mjs';

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

    const id = order.id;
    if (typeof id !== 'string' || id.length === 0) {
      invalidOrderRejections.push({ id: null, reason: 'invalid_order' });
      continue;
    }

    if (seenIds.has(id)) {
      continue;
    }

    seenIds.add(id);

    const priority = order.priority;
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
  let currentStock = cloneStock(stock);
  const acceptedIds = [];
  const reservationFailures = [];

  for (const order of processingQueue) {
    const reservation = reserve(currentStock, order.lines);
    if (reservation.accepted) {
      acceptedIds.push(order.id);
      currentStock = reservation.remaining;
    } else {
      reservationFailures.push({ id: order.id, reason: reservation.reason });
    }
  }

  return {
    acceptedIds,
    rejected: [...invalidOrderRejections, ...reservationFailures],
    remaining: currentStock,
  };
}
