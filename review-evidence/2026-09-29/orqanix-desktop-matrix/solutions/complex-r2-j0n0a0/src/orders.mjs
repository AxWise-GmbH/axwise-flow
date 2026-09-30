import { reserve, validateStock } from './inventory.mjs';

export function fulfillOrders(stock, orders) {
  validateStock(stock);

  if (!Array.isArray(orders)) {
    throw new TypeError('orders must be an array');
  }

  const seenIds = new Set();
  const invalidOrderRejections = [];
  const validExpeditedOrders = [];
  const validNormalOrders = [];

  for (const order of orders) {
    const isObject = typeof order === 'object' && order !== null && !Array.isArray(order);
    const hasValidId = isObject && typeof order.id === 'string' && order.id.length > 0;

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
      validExpeditedOrders.push(order);
    } else {
      validNormalOrders.push(order);
    }
  }

  let currentStock = { ...stock };
  const acceptedIds = [];
  const reservationFailures = [];

  const processingQueue = [...validExpeditedOrders, ...validNormalOrders];

  for (const order of processingQueue) {
    const result = reserve(currentStock, order.lines);
    if (result.accepted) {
      acceptedIds.push(order.id);
      currentStock = result.remaining;
    } else {
      reservationFailures.push({ id: order.id, reason: result.reason });
    }
  }

  const rejected = [...invalidOrderRejections, ...reservationFailures];

  return {
    acceptedIds,
    rejected,
    remaining: currentStock,
  };
}
