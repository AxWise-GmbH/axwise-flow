const VALID_SEVERITIES = new Set(['urgent', 'normal', 'low']);
const VALID_STATES = new Set(['open', 'closed']);

const SEVERITY_ORDER = {
  urgent: 1,
  normal: 2,
  low: 3,
};

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
    throw new TypeError(`Invalid severity: "${raw.severity}"`);
  }

  if (typeof raw.state !== 'string') {
    throw new TypeError('Ticket state must be a string');
  }
  const state = raw.state.trim().toLowerCase();
  if (!VALID_STATES.has(state)) {
    throw new TypeError(`Invalid state: "${raw.state}"`);
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
    throw new TypeError('tickets must be an array');
  }

  const normalized = tickets.map(t => normalizeTicket(t));
  const latestById = new Map();
  for (const ticket of normalized) {
    latestById.set(ticket.id, ticket);
  }

  const openTickets = Array.from(latestById.values()).filter(t => t.state === 'open');

  const openCount = openTickets.length;

  const bySeverity = {
    urgent: 0,
    normal: 0,
    low: 0,
  };
  for (const ticket of openTickets) {
    bySeverity[ticket.severity]++;
  }

  const customerIds = Array.from(new Set(openTickets.map(t => t.customerId))).sort((a, b) =>
    a < b ? -1 : a > b ? 1 : 0
  );

  const queue = [...openTickets]
    .sort((a, b) => {
      const orderDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
      if (orderDiff !== 0) {
        return orderDiff;
      }
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    })
    .map(t => t.id);

  return {
    openCount,
    bySeverity,
    customerIds,
    queue,
  };
}
