export function normalizeTicket(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new TypeError('Ticket must be a non-null object');
  }

  if (
    typeof raw.id !== 'string' ||
    typeof raw.title !== 'string' ||
    typeof raw.customerId !== 'string' ||
    typeof raw.severity !== 'string' ||
    typeof raw.state !== 'string'
  ) {
    throw new TypeError('Ticket fields must be strings');
  }

  const id = raw.id.trim();
  const title = raw.title.trim();
  const customerId = raw.customerId.trim();
  const severity = raw.severity.trim().toLowerCase();
  const state = raw.state.trim().toLowerCase();

  if (id.length === 0 || title.length === 0 || customerId.length === 0) {
    throw new TypeError('id, title, and customerId must not be empty');
  }

  if (severity !== 'urgent' && severity !== 'normal' && severity !== 'low') {
    throw new TypeError('severity must be urgent, normal, or low');
  }

  if (state !== 'open' && state !== 'closed') {
    throw new TypeError('state must be open or closed');
  }

  return {
    id,
    title,
    customerId,
    severity,
    state
  };
}

export function summarizeTickets(tickets) {
  if (!Array.isArray(tickets)) {
    throw new TypeError('tickets must be an array');
  }

  const normalized = tickets.map(normalizeTicket);

  const byId = new Map();
  for (const ticket of normalized) {
    byId.set(ticket.id, ticket);
  }

  const openTickets = Array.from(byId.values()).filter(ticket => ticket.state === 'open');

  const bySeverity = {
    urgent: 0,
    normal: 0,
    low: 0
  };

  for (const ticket of openTickets) {
    bySeverity[ticket.severity]++;
  }

  const customerIds = Array.from(new Set(openTickets.map(ticket => ticket.customerId))).sort((a, b) =>
    a < b ? -1 : a > b ? 1 : 0
  );

  const severityRank = {
    urgent: 0,
    normal: 1,
    low: 2
  };

  const sortedQueue = [...openTickets].sort((a, b) => {
    const rankDiff = severityRank[a.severity] - severityRank[b.severity];
    if (rankDiff !== 0) return rankDiff;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  const queue = sortedQueue.map(ticket => ticket.id);

  return {
    openCount: openTickets.length,
    bySeverity,
    customerIds,
    queue
  };
}
