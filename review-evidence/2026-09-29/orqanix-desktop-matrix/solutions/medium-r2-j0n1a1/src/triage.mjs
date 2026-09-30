export function normalizeTicket(raw) {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new TypeError('Invalid ticket: raw must be an object');
  }

  const { id, title, customerId, severity, state } = raw;

  if (
    typeof id !== 'string' ||
    typeof title !== 'string' ||
    typeof customerId !== 'string' ||
    typeof severity !== 'string' ||
    typeof state !== 'string'
  ) {
    throw new TypeError('Invalid ticket: all fields must be strings');
  }

  const trimmedId = id.trim();
  const trimmedTitle = title.trim();
  const trimmedCustomerId = customerId.trim();
  const normalizedSeverity = severity.trim().toLowerCase();
  const normalizedState = state.trim().toLowerCase();

  if (!trimmedId || !trimmedTitle || !trimmedCustomerId) {
    throw new TypeError('Invalid ticket: id, title, and customerId must be nonempty');
  }

  if (
    normalizedSeverity !== 'urgent' &&
    normalizedSeverity !== 'normal' &&
    normalizedSeverity !== 'low'
  ) {
    throw new TypeError(`Invalid ticket severity: ${severity}`);
  }

  if (normalizedState !== 'open' && normalizedState !== 'closed') {
    throw new TypeError(`Invalid ticket state: ${state}`);
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
    throw new TypeError('Invalid tickets: expected an array');
  }

  const latestById = new Map();
  for (const raw of tickets) {
    const normalized = normalizeTicket(raw);
    latestById.set(normalized.id, normalized);
  }

  const openTickets = [];
  for (const ticket of latestById.values()) {
    if (ticket.state === 'open') {
      openTickets.push(ticket);
    }
  }

  const bySeverity = { urgent: 0, normal: 0, low: 0 };
  for (const ticket of openTickets) {
    bySeverity[ticket.severity]++;
  }

  const customerIds = Array.from(new Set(openTickets.map(t => t.customerId)))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  const severityOrder = { urgent: 1, normal: 2, low: 3 };
  const sortedTickets = [...openTickets].sort((a, b) => {
    const diff = severityOrder[a.severity] - severityOrder[b.severity];
    if (diff !== 0) return diff;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  const queue = sortedTickets.map(t => t.id);

  return {
    openCount: openTickets.length,
    bySeverity,
    customerIds,
    queue,
  };
}
