import { describe, it, expect } from 'vitest';
import {
  stripTargetPrefix,
  rosterRowFor,
  buildRosterGroups,
  countRosterRows,
  ROSTER_SEARCH_THRESHOLD,
} from './rosterGroups';

describe('stripTargetPrefix', () => {
  it('drops the prefix the hook put on', () => {
    expect(stripTargetPrefix('Team: Ops', 'team')).toBe('Ops');
    expect(stripTargetPrefix('Agent: Worker', 'agent')).toBe('Worker');
  });

  // Matching by type, not by regex: a team really called "Agent: retired" is a
  // name, not a prefix, and a hook that stops prefixing must not lose letters.
  it('leaves a label alone when the prefix is not its own type_s', () => {
    expect(stripTargetPrefix('Agent: retired', 'team')).toBe('Agent: retired');
    expect(stripTargetPrefix('Ops', 'team')).toBe('Ops');
  });

  it('survives a missing label', () => {
    expect(stripTargetPrefix(undefined, 'team')).toBe('');
  });
});

describe('rosterRowFor', () => {
  it('names a team and says what it is', () => {
    expect(rosterRowFor({ type: 'team', id: 't1', label: 'Team: Ops' })).toMatchObject({
      name: 'Ops',
      note: 'Team',
    });
  });

  // "Lead: Alice (Ops)" is one string doing two jobs; the row splits them so the
  // name is readable and the team it leads is the line underneath.
  it('splits a lead_s name from the team it leads', () => {
    expect(rosterRowFor({ type: 'team_lead', id: 'l1', label: 'Lead: Alice (Ops)' })).toMatchObject(
      {
        name: 'Alice',
        note: 'Lead of Ops',
      }
    );
  });

  it('falls back when a lead has no team in parentheses', () => {
    expect(rosterRowFor({ type: 'team_lead', id: 'l1', label: 'Lead: Alice' })).toMatchObject({
      name: 'Alice',
      note: 'Team lead',
    });
  });

  it('keeps parentheses that are part of the name', () => {
    expect(rosterRowFor({ type: 'agent', id: 'a1', label: 'Agent: Pricing (EU)' }).name).toBe(
      'Pricing (EU)'
    );
  });
});

describe('buildRosterGroups', () => {
  const targets = [
    { type: 'team', id: 't1', label: 'Team: Ops' },
    { type: 'team', id: 't2', label: 'Team: Growth' },
    { type: 'team_lead', id: 'l1', label: 'Lead: Alice (Ops)' },
    { type: 'agent', id: 'a1', label: 'Agent: Finance Pricing Specialist' },
  ];

  it('puts teams first, then leads and agents together', () => {
    const groups = buildRosterGroups(targets);
    expect(groups.map((g) => g.key)).toEqual(['teams', 'people']);
    expect(groups[0].rows).toHaveLength(2);
    expect(groups[1].rows.map((r) => r.name)).toEqual(['Alice', 'Finance Pricing Specialist']);
  });

  it('returns everything for an empty query', () => {
    expect(countRosterRows(buildRosterGroups(targets, { query: '   ' }))).toBe(4);
  });

  it('matches on the name, ignoring case and stray spaces', () => {
    const groups = buildRosterGroups(targets, { query: '  GROWTH ' });
    expect(countRosterRows(groups)).toBe(1);
    expect(groups[0].rows[0].name).toBe('Growth');
  });

  // The point of stripping: searching "team" must not match every team through
  // a prefix the user cannot even see.
  it('does not match the prefix that was stripped away', () => {
    const groups = buildRosterGroups(targets, { query: 'ops' });
    expect(countRosterRows(groups)).toBe(2); // Team Ops, and Alice who leads it
    expect(buildRosterGroups(targets, { query: 'Team: ' })).toEqual([]);
  });

  it('matches the line underneath too, so "lead" finds the leads', () => {
    const groups = buildRosterGroups(targets, { query: 'lead' });
    expect(groups.map((g) => g.key)).toEqual(['people']);
    expect(groups[0].rows).toHaveLength(1);
  });

  it('drops a group rather than leaving a heading over nothing', () => {
    const groups = buildRosterGroups(targets, { query: 'finance' });
    expect(groups.map((g) => g.key)).toEqual(['people']);
  });

  it('returns nothing when nothing matches, and copes with no roster at all', () => {
    expect(buildRosterGroups(targets, { query: 'zzz' })).toEqual([]);
    expect(buildRosterGroups(undefined)).toEqual([]);
  });

  it('keeps the target on the row so a click still knows what it picked', () => {
    const [teams] = buildRosterGroups(targets);
    expect(teams.rows[0].target).toMatchObject({ type: 'team', id: 't1' });
    expect(teams.rows[0].key).toBe('team:t1');
  });
});

describe('ROSTER_SEARCH_THRESHOLD', () => {
  it('is high enough that a short roster gets no search box', () => {
    expect(ROSTER_SEARCH_THRESHOLD).toBeGreaterThan(3);
  });
});
