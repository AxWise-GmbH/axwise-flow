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
    throw new TypeError('Ticket fields must be strings');
  }

  const trimmedId = id.trim();
  const trimmedTitle = title.trim();
  const trimmedCustomerId = customerId.trim();
  const trimmedSeverity = severity.trim().toLowerCase();
  const trimmedState = state.trim().toLowerCase();

  if (trimmedId.length === 0) {
    throw new TypeError('Ticket id must be non-empty');
  }
  if (trimmedTitle.length === 0) {
    throw new TypeError('Ticket title must be non-empty');
  }
  if (trimmedCustomerId.length === 0) {
    throw new TypeError('Ticket customerId must be non-empty');
  }

  if (trimmedSeverity !== 'urgent' && trimmedSeverity !== 'normal' && trimmedSeverity !== 'low') {
    throw new TypeError(`Invalid severity: "${trimmedSeverity}". Expected urgent, normal, or low.`);
  }

  if (trimmedState !== 'open' && trimmedState !== 'closed') {
    throw new TypeError(`Invalid state: "${trimmedState}". Expected open or closed.`);
  }

  return {
    id: trimmedId,
    title: trimmedTitle,
    customerId: trimmedCustomerId,
    severity: trimmedSeverity,
    state: trimmedState
  };
}

const SEVERITY_RANK = {
  urgent: 1,
  normal: 2,
  low: 3
};

export function summarizeTickets(tickets) {
  if (!Array.isArray(tickets)) {
    throw new TypeError('tickets must be an array');
  }

  const byId = new Map();
  for (const raw of tickets) {
    const normalized = normalizeTicket(raw);
    byId.set(normalized.id, normalized);
  }

  const openTickets = Array.from(byId.values()).filter(t => t.state === 'open');

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

  const sortedQueueTickets = openTickets.slice().sort((a, b) => {
    const rankDiff = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (rankDiff !== 0) {
      return rankDiff;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  const queue = sortedQueueTickets.map(t => t.id);

  return {
    openCount: openTickets.length,
    bySeverity,
    customerIds,
    queue
  };
}
