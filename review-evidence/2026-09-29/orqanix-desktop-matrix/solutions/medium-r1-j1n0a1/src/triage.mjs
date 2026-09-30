const VALID_SEVERITIES = new Set(['urgent', 'normal', 'low']);
const VALID_STATES = new Set(['open', 'closed']);

const SEVERITY_ORDER = {
  urgent: 1,
  normal: 2,
  low: 3,
};

export function normalizeTicket(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
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
    throw new TypeError('Ticket fields id, title, customerId, severity, and state must be strings');
  }

  const trimmedId = id.trim();
  const trimmedTitle = title.trim();
  const trimmedCustomerId = customerId.trim();
  const normalizedSeverity = severity.trim().toLowerCase();
  const normalizedState = state.trim().toLowerCase();

  if (trimmedId === '' || trimmedTitle === '' || trimmedCustomerId === '') {
    throw new TypeError('id, title, and customerId must be nonempty');
  }

  if (!VALID_SEVERITIES.has(normalizedSeverity)) {
    throw new TypeError(`Invalid severity: "${severity}". Expected urgent, normal, or low.`);
  }

  if (!VALID_STATES.has(normalizedState)) {
    throw new TypeError(`Invalid state: "${state}". Expected open or closed.`);
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

  const normalized = tickets.map(normalizeTicket);

  const latestById = new Map();
  for (const ticket of normalized) {
    latestById.set(ticket.id, ticket);
  }

  const openTickets = Array.from(latestById.values()).filter(t => t.state === 'open');

  const bySeverity = {
    urgent: 0,
    normal: 0,
    low: 0,
  };

  for (const ticket of openTickets) {
    bySeverity[ticket.severity] += 1;
  }

  const customerIdSet = new Set();
  for (const ticket of openTickets) {
    customerIdSet.add(ticket.customerId);
  }
  const customerIds = Array.from(customerIdSet).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  const sortedQueue = [...openTickets].sort((a, b) => {
    const diff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (diff !== 0) return diff;
    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return 0;
  });

  const queue = sortedQueue.map(t => t.id);

  return {
    openCount: openTickets.length,
    bySeverity,
    customerIds,
    queue,
  };
}
