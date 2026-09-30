const SEVERITY_RANK = {
  urgent: 0,
  normal: 1,
  low: 2,
};

export function normalizeTicket(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new TypeError('Invalid ticket: input must be an object');
  }

  if (typeof raw.id !== 'string') {
    throw new TypeError('Invalid ticket: id must be a string');
  }
  const id = raw.id.trim();
  if (id.length === 0) {
    throw new TypeError('Invalid ticket: id must not be empty');
  }

  if (typeof raw.title !== 'string') {
    throw new TypeError('Invalid ticket: title must be a string');
  }
  const title = raw.title.trim();
  if (title.length === 0) {
    throw new TypeError('Invalid ticket: title must not be empty');
  }

  if (typeof raw.customerId !== 'string') {
    throw new TypeError('Invalid ticket: customerId must be a string');
  }
  const customerId = raw.customerId.trim();
  if (customerId.length === 0) {
    throw new TypeError('Invalid ticket: customerId must not be empty');
  }

  if (typeof raw.severity !== 'string') {
    throw new TypeError('Invalid ticket: severity must be a string');
  }
  const severity = raw.severity.trim().toLowerCase();
  if (severity !== 'urgent' && severity !== 'normal' && severity !== 'low') {
    throw new TypeError('Invalid ticket: severity must be urgent, normal, or low');
  }

  if (typeof raw.state !== 'string') {
    throw new TypeError('Invalid ticket: state must be a string');
  }
  const state = raw.state.trim().toLowerCase();
  if (state !== 'open' && state !== 'closed') {
    throw new TypeError('Invalid ticket: state must be open or closed');
  }

  return { id, title, customerId, severity, state };
}

export function summarizeTickets(tickets) {
  if (!Array.isArray(tickets)) {
    throw new TypeError('Invalid tickets: input must be an array');
  }

  const normalized = tickets.map(raw => normalizeTicket(raw));

  const latestById = new Map();
  for (const ticket of normalized) {
    latestById.set(ticket.id, ticket);
  }

  const openTickets = [];
  for (const ticket of latestById.values()) {
    if (ticket.state === 'open') {
      openTickets.push(ticket);
    }
  }

  const bySeverity = {
    urgent: 0,
    normal: 0,
    low: 0,
  };

  for (const ticket of openTickets) {
    bySeverity[ticket.severity] += 1;
  }

  const customerIds = Array.from(new Set(openTickets.map(t => t.customerId))).sort((a, b) =>
    a < b ? -1 : a > b ? 1 : 0
  );

  const sorted = [...openTickets].sort((a, b) => {
    const rankDiff = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (rankDiff !== 0) return rankDiff;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  const queue = sorted.map(t => t.id);

  return {
    openCount: openTickets.length,
    bySeverity,
    customerIds,
    queue,
  };
}
