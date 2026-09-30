export function normalizeTicket(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new TypeError('Ticket must be a non-null object');
  }

  if (typeof raw.id !== 'string') {
    throw new TypeError('Ticket id must be a string');
  }
  const id = raw.id.trim();
  if (id.length === 0) {
    throw new TypeError('Ticket id must not be empty');
  }

  if (typeof raw.title !== 'string') {
    throw new TypeError('Ticket title must be a string');
  }
  const title = raw.title.trim();
  if (title.length === 0) {
    throw new TypeError('Ticket title must not be empty');
  }

  if (typeof raw.customerId !== 'string') {
    throw new TypeError('Ticket customerId must be a string');
  }
  const customerId = raw.customerId.trim();
  if (customerId.length === 0) {
    throw new TypeError('Ticket customerId must not be empty');
  }

  if (typeof raw.severity !== 'string') {
    throw new TypeError('Ticket severity must be a string');
  }
  const severity = raw.severity.trim().toLowerCase();
  if (severity !== 'urgent' && severity !== 'normal' && severity !== 'low') {
    throw new TypeError(`Invalid severity: ${raw.severity}`);
  }

  if (typeof raw.state !== 'string') {
    throw new TypeError('Ticket state must be a string');
  }
  const state = raw.state.trim().toLowerCase();
  if (state !== 'open' && state !== 'closed') {
    throw new TypeError(`Invalid state: ${raw.state}`);
  }

  return {
    id,
    title,
    customerId,
    severity,
    state,
  };
}

export function summarizeTickets(tickets) {
  if (!Array.isArray(tickets)) {
    throw new TypeError('Tickets must be an array');
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
    low: 0,
  };

  const customerSet = new Set();

  for (const ticket of openTickets) {
    bySeverity[ticket.severity] += 1;
    customerSet.add(ticket.customerId);
  }

  const customerIds = Array.from(customerSet).sort((a, b) => {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  });

  const severityOrder = {
    urgent: 1,
    normal: 2,
    low: 3,
  };

  const queue = openTickets
    .slice()
    .sort((a, b) => {
      const diff = severityOrder[a.severity] - severityOrder[b.severity];
      if (diff !== 0) return diff;
      if (a.id < b.id) return -1;
      if (a.id > b.id) return 1;
      return 0;
    })
    .map(ticket => ticket.id);

  return {
    openCount: openTickets.length,
    bySeverity,
    customerIds,
    queue,
  };
}
