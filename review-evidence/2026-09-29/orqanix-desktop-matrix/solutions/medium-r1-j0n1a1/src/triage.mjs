export function normalizeTicket(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new TypeError('Ticket must be a non-null object');
  }

  const { id, title, customerId, severity, state } = raw;

  if (
    typeof id !== 'string' ||
    typeof title !== 'string' ||
    typeof customerId !== 'string' ||
    typeof severity !== 'string' ||
    typeof state !== 'string'
  ) {
    throw new TypeError('Ticket properties id, title, customerId, severity, and state must be strings');
  }

  const trimmedId = id.trim();
  const trimmedTitle = title.trim();
  const trimmedCustomerId = customerId.trim();

  if (trimmedId.length === 0 || trimmedTitle.length === 0 || trimmedCustomerId.length === 0) {
    throw new TypeError('id, title, and customerId must be nonempty strings');
  }

  const normalizedSeverity = severity.trim().toLowerCase();
  if (
    normalizedSeverity !== 'urgent' &&
    normalizedSeverity !== 'normal' &&
    normalizedSeverity !== 'low'
  ) {
    throw new TypeError(`Invalid severity: "${severity}". Must be urgent, normal, or low`);
  }

  const normalizedState = state.trim().toLowerCase();
  if (normalizedState !== 'open' && normalizedState !== 'closed') {
    throw new TypeError(`Invalid state: "${state}". Must be open or closed`);
  }

  return {
    id: trimmedId,
    title: trimmedTitle,
    customerId: trimmedCustomerId,
    severity: normalizedSeverity,
    state: normalizedState,
  };
}

export function summarizeTickets(tickets) {
  if (!Array.isArray(tickets)) {
    throw new TypeError('tickets must be an array');
  }

  const byId = new Map();
  for (const raw of tickets) {
    const ticket = normalizeTicket(raw);
    byId.set(ticket.id, ticket);
  }

  const openTickets = [];
  for (const ticket of byId.values()) {
    if (ticket.state === 'open') {
      openTickets.push(ticket);
    }
  }

  const bySeverity = {
    urgent: 0,
    normal: 0,
    low: 0,
  };

  const customerSet = new Set();
  for (const ticket of openTickets) {
    bySeverity[ticket.severity]++;
    customerSet.add(ticket.customerId);
  }

  const customerIds = Array.from(customerSet).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  const severityOrder = {
    urgent: 0,
    normal: 1,
    low: 2,
  };

  const queue = openTickets
    .slice()
    .sort((a, b) => {
      const rankDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (rankDiff !== 0) {
        return rankDiff;
      }
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    })
    .map(ticket => ticket.id);

  return {
    openCount: openTickets.length,
    bySeverity,
    customerIds,
    queue,
  };
}
