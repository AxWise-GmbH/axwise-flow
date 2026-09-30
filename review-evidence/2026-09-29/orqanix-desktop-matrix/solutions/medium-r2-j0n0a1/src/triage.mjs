const VALID_SEVERITIES = new Set(['urgent', 'normal', 'low']);
const VALID_STATES = new Set(['open', 'closed']);
const SEVERITY_RANK = { urgent: 1, normal: 2, low: 3 };

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
  const normalizedSeverity = severity.trim().toLowerCase();
  const normalizedState = state.trim().toLowerCase();

  if (trimmedId.length === 0 || trimmedTitle.length === 0 || trimmedCustomerId.length === 0) {
    throw new TypeError('id, title, and customerId must be nonempty');
  }

  if (!VALID_SEVERITIES.has(normalizedSeverity)) {
    throw new TypeError(`Invalid severity: ${severity}`);
  }

  if (!VALID_STATES.has(normalizedState)) {
    throw new TypeError(`Invalid state: ${state}`);
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

  const byId = new Map();
  for (const raw of tickets) {
    const normalized = normalizeTicket(raw);
    byId.set(normalized.id, normalized);
  }

  const openTickets = [];
  const bySeverity = { urgent: 0, normal: 0, low: 0 };
  const customerIdSet = new Set();

  for (const ticket of byId.values()) {
    if (ticket.state === 'open') {
      openTickets.push(ticket);
      bySeverity[ticket.severity]++;
      customerIdSet.add(ticket.customerId);
    }
  }

  const customerIds = Array.from(customerIdSet).sort();

  openTickets.sort((a, b) => {
    const rankDiff = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (rankDiff !== 0) return rankDiff;
    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return 0;
  });

  const queue = openTickets.map((t) => t.id);

  return {
    openCount: openTickets.length,
    bySeverity,
    customerIds,
    queue,
  };
}
