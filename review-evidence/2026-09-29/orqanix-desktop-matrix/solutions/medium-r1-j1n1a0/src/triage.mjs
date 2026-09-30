export function normalizeTicket(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new TypeError('Ticket must be a non-null object');
  }

  const { id, title, customerId, severity, state } = raw;

  if (typeof id !== 'string' || typeof title !== 'string' || typeof customerId !== 'string') {
    throw new TypeError('id, title, and customerId must be strings');
  }

  if (typeof severity !== 'string' || typeof state !== 'string') {
    throw new TypeError('severity and state must be strings');
  }

  const trimmedId = id.trim();
  const trimmedTitle = title.trim();
  const trimmedCustomerId = customerId.trim();

  if (trimmedId.length === 0 || trimmedTitle.length === 0 || trimmedCustomerId.length === 0) {
    throw new TypeError('id, title, and customerId must be nonempty strings');
  }

  const lowerSeverity = severity.trim().toLowerCase();
  if (lowerSeverity !== 'urgent' && lowerSeverity !== 'normal' && lowerSeverity !== 'low') {
    throw new TypeError(`Invalid severity: ${severity}. Must be urgent, normal, or low`);
  }

  const lowerState = state.trim().toLowerCase();
  if (lowerState !== 'open' && lowerState !== 'closed') {
    throw new TypeError(`Invalid state: ${state}. Must be open or closed`);
  }

  return {
    id: trimmedId,
    title: trimmedTitle,
    customerId: trimmedCustomerId,
    severity: lowerSeverity,
    state: lowerState
  };
}

export function summarizeTickets(tickets) {
  if (!Array.isArray(tickets)) {
    throw new TypeError('Expected an array of tickets');
  }

  const byId = new Map();
  for (const raw of tickets) {
    const normalized = normalizeTicket(raw);
    byId.set(normalized.id, normalized);
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
    low: 0
  };

  const customerSet = new Set();

  for (const ticket of openTickets) {
    bySeverity[ticket.severity]++;
    customerSet.add(ticket.customerId);
  }

  const customerIds = Array.from(customerSet).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  const severityOrder = {
    urgent: 1,
    normal: 2,
    low: 3
  };

  const sortedQueue = [...openTickets].sort((a, b) => {
    const sevDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (sevDiff !== 0) {
      return sevDiff;
    }
    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return 0;
  });

  const queue = sortedQueue.map(t => t.id);

  return {
    openCount: openTickets.length,
    bySeverity,
    customerIds,
    queue
  };
}
