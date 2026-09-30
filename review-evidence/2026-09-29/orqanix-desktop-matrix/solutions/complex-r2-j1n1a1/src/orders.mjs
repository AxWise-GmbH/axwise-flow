import { reserve, validateStock, copyStock } from './inventory.mjs';

export function fulfillOrders(stock, orders) {
  validateStock(stock);

  if (!Array.isArray(orders)) {
    throw new TypeError('Orders must be an array');
  }

  let currentStock = copyStock(stock);
  const seenIds = new Set();
  const invalidOrderRejections = [];
  const validExpedited = [];
  const validNormal = [];

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
      // Ignore later occurrences of an ID entirely (first occurrence wins)
      continue;
    }

    seenIds.add(order.id);

    if (order.priority !== 'expedited' && order.priority !== 'normal') {
      invalidOrderRejections.push({ id: order.id, reason: 'invalid_order' });
      continue;
    }

    if (order.priority === 'expedited') {
      validExpedited.push(order);
    } else {
      validNormal.push(order);
    }
  }

  const acceptedIds = [];
  const reservationFailures = [];

  const processingQueue = [...validExpedited, ...validNormal];
  for (const order of processingQueue) {
    const result = reserve(currentStock, order.lines);
    if (result.accepted) {
      currentStock = result.remaining;
      acceptedIds.push(order.id);
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
