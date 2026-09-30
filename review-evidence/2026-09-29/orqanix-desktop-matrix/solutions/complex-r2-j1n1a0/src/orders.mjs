import { reserve, validateStock } from './inventory.mjs';

export function fulfillOrders(stock, orders) {
  validateStock(stock);

  if (!Array.isArray(orders)) {
    throw new TypeError('Invalid orders: orders must be an array');
  }

  let currentStock = { ...stock };
  const seenIds = new Set();
  const invalidOrderRejections = [];
  const expeditedOrders = [];
  const normalOrders = [];

  for (const order of orders) {
    if (
      order === null ||
      typeof order !== 'object' ||
      Array.isArray(order) ||
      typeof order.id !== 'string' ||
      order.id.length === 0
    ) {
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

  const processingQueue = [...expeditedOrders, ...normalOrders];

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
