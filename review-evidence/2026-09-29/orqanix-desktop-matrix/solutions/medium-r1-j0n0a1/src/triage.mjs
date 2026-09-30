const VALID_SEVERITIES = new Set(['urgent', 'normal', 'low']);
const VALID_STATES = new Set(['open', 'closed']);
const SEVERITY_RANK = {
  urgent: 1,
  normal: 2,
  low: 3,
};

export function normalizeTicket(raw) {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
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
    throw new TypeError('All ticket fields must be strings');
  }

  const trimmedId = id.trim();
  const trimmedTitle = title.trim();
  const trimmedCustomerId = customerId.trim();
  const lowerSeverity = severity.trim().toLowerCase();
  const lowerState = state.trim().toLowerCase();

  if (trimmedId.length === 0) {
    throw new TypeError('Ticket id must be non-empty');
  }
  if (trimmedTitle.length === 0) {
    throw new TypeError('Ticket title must be non-empty');
  }
  if (trimmedCustomerId.length === 0) {
    throw new TypeError('Ticket customerId must be non-empty');
  }
  if (!VALID_SEVERITIES.has(lowerSeverity)) {
    throw new TypeError(`Ticket severity must be urgent, normal, or low; received: ${severity}`);
  }
  if (!VALID_STATES.has(lowerState)) {
    throw new TypeError(`Ticket state must be open or closed; received: ${state}`);
  }

  return {
    id: trimmedId,
    title: trimmedTitle,
    customerId: trimmedCustomerId,
    severity: lowerSeverity,
    state: lowerState,
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

  const openTickets = Array.from(byId.values()).filter((t) => t.state === 'open');

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
    const rankDiff = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (rankDiff !== 0) {
      return rankDiff;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  const queue = sortedTickets.map((t) => t.id);

  return {
    openCount: openTickets.length,
    bySeverity,
    customerIds,
    queue,
  };
}
