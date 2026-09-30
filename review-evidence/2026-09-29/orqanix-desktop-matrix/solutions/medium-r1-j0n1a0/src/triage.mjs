export function normalizeTicket(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new TypeError('Invalid ticket: expected a non-null object');
  }

  const { id, title, customerId, severity, state } = raw;

  if (
    typeof id !== 'string' ||
    typeof title !== 'string' ||
    typeof customerId !== 'string' ||
    typeof severity !== 'string' ||
    typeof state !== 'string'
  ) {
    throw new TypeError('Invalid ticket: all required fields must be strings');
  }

  const trimmedId = id.trim();
  const trimmedTitle = title.trim();
  const trimmedCustomerId = customerId.trim();
  const trimmedSeverity = severity.trim().toLowerCase();
  const trimmedState = state.trim().toLowerCase();

  if (trimmedId.length === 0 || trimmedTitle.length === 0 || trimmedCustomerId.length === 0) {
    throw new TypeError('Invalid ticket: id, title, and customerId must be nonempty strings');
  }

  if (trimmedSeverity !== 'urgent' && trimmedSeverity !== 'normal' && trimmedSeverity !== 'low') {
    throw new TypeError('Invalid ticket: severity must be urgent, normal, or low');
  }

  if (trimmedState !== 'open' && trimmedState !== 'closed') {
    throw new TypeError('Invalid ticket: state must be open or closed');
  }

  return {
    id: trimmedId,
    title: trimmedTitle,
    customerId: trimmedCustomerId,
    severity: trimmedSeverity,
    state: trimmedState
  };
}

export function summarizeTickets(tickets) {
  if (!Array.isArray(tickets)) {
    throw new TypeError('Invalid tickets: expected an array');
  }

  const byId = new Map();
  for (const raw of tickets) {
    const normalized = normalizeTicket(raw);
    byId.set(normalized.id, normalized);
  }

  const openTickets = [];
  const bySeverity = {
    urgent: 0,
    normal: 0,
    low: 0
  };

  for (const ticket of byId.values()) {
    if (ticket.state === 'open') {
      openTickets.push(ticket);
      bySeverity[ticket.severity] += 1;
    }
  }

  const customerSet = new Set();
  for (const ticket of openTickets) {
    customerSet.add(ticket.customerId);
  }
  const customerIds = Array.from(customerSet).sort();

  const severityRank = {
    urgent: 0,
    normal: 1,
    low: 2
  };

  const queue = [...openTickets]
    .sort((a, b) => {
      const diff = severityRank[a.severity] - severityRank[b.severity];
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
    queue
  };
}
