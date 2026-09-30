const VALID_SEVERITIES = new Set(['urgent', 'normal', 'low']);
const VALID_STATES = new Set(['open', 'closed']);

export function normalizeTicket(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
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
  if (!VALID_SEVERITIES.has(severity)) {
    throw new TypeError("Ticket severity must be 'urgent', 'normal', or 'low'");
  }

  if (typeof raw.state !== 'string') {
    throw new TypeError('Ticket state must be a string');
  }
  const state = raw.state.trim().toLowerCase();
  if (!VALID_STATES.has(state)) {
    throw new TypeError("Ticket state must be 'open' or 'closed'");
  }

  return {
    id,
    title,
    customerId,
    severity,
    state,
  };
}

const SEVERITY_ORDER = {
  urgent: 1,
  normal: 2,
  low: 3,
};

export function summarizeTickets(tickets) {
  if (!Array.isArray(tickets)) {
    throw new TypeError('Tickets must be an array');
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

  const customerIds = Array.from(customerSet).sort((a, b) =>
    a < b ? -1 : a > b ? 1 : 0
  );

  const queue = openTickets
    .slice()
    .sort((a, b) => {
      const orderDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
      if (orderDiff !== 0) {
        return orderDiff;
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
