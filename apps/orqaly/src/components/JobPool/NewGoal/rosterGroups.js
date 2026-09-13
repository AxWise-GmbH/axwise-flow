/**
 * The workspace roster, arranged so a person can read it.
 *
 * `useOrgRoster` hands back one flat list whose labels carry their own type as a
 * prefix - "Team: Goal: create a business plan topic - shop", "Agent: Finance
 * Pricing Specialist". In a 400px column that is a list of forty-odd rows all
 * starting with the same word and all cut off before they say anything.
 *
 * The prefix is stripped here rather than in the hook: the prefixed label is
 * what `useGoalSetup` stores and what the drawer header ("Runs on: …") and
 * `useOrgCommander`'s transcript line both read back, so it has to survive
 * outside this list. Presentation is this module's business, not the hook's.
 */

/** What `useOrgRoster` prepends, per target type. */
export const ROSTER_LABEL_PREFIX = Object.freeze({
  team: 'Team: ',
  team_lead: 'Lead: ',
  agent: 'Agent: ',
  consilium: 'Consilium: ',
});

/** Below this many rows a search field is noise, not help. */
export const ROSTER_SEARCH_THRESHOLD = 8;

const GROUP_ORDER = [
  { key: 'teams', title: 'Teams', types: ['team'] },
  { key: 'people', title: 'Leads & agents', types: ['team_lead', 'agent'] },
];

const TYPE_NOTE = {
  team: 'Team',
  team_lead: 'Team lead',
  agent: 'Agent',
  consilium: 'Consilium',
};

/**
 * Drop the type prefix, but only the one that belongs to this target's type and
 * only when it is really there. Matching by type rather than by regex means a
 * team actually called "Agent: retired" keeps its name, and a hook that stops
 * prefixing one day does not start eating the first six characters instead.
 */
export function stripTargetPrefix(label, type) {
  const text = String(label ?? '');
  const prefix = ROSTER_LABEL_PREFIX[type];
  return prefix && text.startsWith(prefix) ? text.slice(prefix.length) : text;
}

/**
 * One roster row: what to call it, and what it is.
 *
 * A lead arrives as "Lead: Alice (Ops)" - one string doing two jobs. Split on
 * the last parenthesis so the name is the name and the team it leads becomes
 * the line underneath, where it can be read.
 */
export function rosterRowFor(target) {
  const type = target?.type;
  const stripped = stripTargetPrefix(target?.label, type);

  if (type === 'team_lead') {
    const open = stripped.lastIndexOf(' (');
    if (open > 0 && stripped.endsWith(')')) {
      return {
        key: `${type}:${target.id}`,
        target,
        name: stripped.slice(0, open),
        note: `Lead of ${stripped.slice(open + 2, -1)}`,
      };
    }
  }

  return {
    key: `${type}:${target?.id}`,
    target,
    name: stripped,
    note: TYPE_NOTE[type] || '',
  };
}

/**
 * Group the roster into Teams and Leads & agents, filtered by `query`.
 * Empty groups are dropped so a search never leaves a heading over nothing.
 */
export function buildRosterGroups(targets, { query = '' } = {}) {
  const rows = (Array.isArray(targets) ? targets : []).map(rosterRowFor);
  const needle = String(query || '')
    .trim()
    .toLowerCase();
  const matches = (row) =>
    !needle || row.name.toLowerCase().includes(needle) || row.note.toLowerCase().includes(needle);

  return GROUP_ORDER.map((group) => ({
    key: group.key,
    title: group.title,
    rows: rows.filter((row) => group.types.includes(row.target?.type) && matches(row)),
  })).filter((group) => group.rows.length > 0);
}

/** How many rows the roster holds in total, before any grouping. */
export function countRosterRows(groups) {
  return groups.reduce((total, group) => total + group.rows.length, 0);
}
