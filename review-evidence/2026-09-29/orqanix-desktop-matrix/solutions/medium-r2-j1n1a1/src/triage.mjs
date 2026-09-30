export function normalizeTicket(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new TypeError('Ticket must be a non-null object');
  }

  const { id, title, customerId, severity, state } = raw;

  if (typeof id !== 'string') {
    throw new TypeError('Ticket id must be a string');
  }
  const trimmedId = id.trim();
  if (trimmedId.length === 0) {
    throw new TypeError('Ticket id must not be empty');
  }

  if (typeof title !== 'string') {
    throw new TypeError('Ticket title must be a string');
  }
  const trimmedTitle = title.trim();
  if (trimmedTitle.length === 0) {
    throw new TypeError('Ticket title must not be empty');
  }

  if (typeof customerId !== 'string') {
    throw new TypeError('Ticket customerId must be a string');
  }
  const trimmedCustomerId = customerId.trim();
  if (trimmedCustomerId.length === 0) {
    throw new TypeError('Ticket customerId must not be empty');
  }

  if (typeof severity !== 'string') {
    throw new TypeError('Ticket severity must be a string');
  }
  const normalizedSeverity = severity.trim().toLowerCase();
  if (
    normalizedSeverity !== 'urgent' &&
    normalizedSeverity !== 'normal' &&
    normalizedSeverity !== 'low'
  ) {
    throw new TypeError('Ticket severity must be urgent, normal, or low');
  }

  if (typeof state !== 'string') {
    throw new TypeError('Ticket state must be a string');
  }
  const normalizedState = state.trim().toLowerCase();
  if (normalizedState !== 'open' && normalizedState !== 'closed') {
    throw new TypeError('Ticket state must be open or closed');
  }

  return {
    id: trimmedId,
    title: trimmedTitle,
    customerId: trimmedCustomerId,
    severity: normalizedSeverity,
    state: normalizedState,
  };
}

const SEVERITY_ORDER = {
  urgent: 0,
  normal: 1,
  low: 2,
};

export function summarizeTickets(tickets) {
  if (!Array.isArray(tickets)) {
    throw new TypeError('Tickets must be an array');
  }

  const byId = new Map();
  for (const raw of tickets) {
    const normalized = normalizeTicket(raw);
    byId.set(normalized.id, normalized);
  }

  const openTickets = Array.from(byId.values()).filter(
    (ticket) => ticket.state === 'open'
  );

  const bySeverity = {
    urgent: 0,
    normal: 0,
    low: 0,
  };

  const customerIdSet = new Set();

  for (const ticket of openTickets) {
    bySeverity[ticket.severity]++;
    customerIdSet.add(ticket.customerId);
  }

  const customerIds = Array.from(customerIdSet).sort((a, b) =>
    a < b ? -1 : a > b ? 1 : 0
  );

  const sortedTickets = [...openTickets].sort((a, b) => {
    const diff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (diff !== 0) return diff;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  const queue = sortedTickets.map((ticket) => ticket.id);

  return {
    openCount: openTickets.length,
    bySeverity,
    customerIds,
    queue,
  };
}
