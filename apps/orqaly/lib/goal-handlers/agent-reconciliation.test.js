/**
 * Duplicate agent reconciliation.
 *
 * The separation that matters: punctuation variants are safe to merge
 * automatically, qualified variants are not. "Finance Specialist" sits inside
 * "Finance Pricing Specialist" as a token subset, and merging those two would
 * destroy a real distinction.
 */
import { describe, it, expect } from 'vitest';
import {
  findDuplicateAgentGroups,
  pickSurvivor,
  formatReconciliationReport,
} from './agent-reconciliation.js';

const TRAKTOR = [
  { id: 'a1', name: 'Marketing/ICP Specialist', updated_at: '2026-08-01T00:00:00Z' },
  { id: 'a2', name: 'Marketing ICP Specialist', updated_at: '2026-08-10T00:00:00Z' },
  {
    id: 'a3',
    name: 'Bremen Local Market & ICP Specialist (Marketing)',
    updated_at: '2026-08-05T00:00:00Z',
  },
  { id: 'a4', name: 'Finance Pricing Specialist', updated_at: '2026-08-01T00:00:00Z' },
  { id: 'a5', name: 'B2B Commercial Strategist', updated_at: '2026-08-01T00:00:00Z' },
  { id: 'a6', name: 'German Market Lead Generator', updated_at: '2026-08-01T00:00:00Z' },
  { id: 'a7', name: 'AI Management Consultant', updated_at: '2026-08-01T00:00:00Z' },
];

describe('findDuplicateAgentGroups', () => {
  it('merges only the punctuation variants automatically', () => {
    const { exact } = findDuplicateAgentGroups(TRAKTOR);
    expect(exact).toHaveLength(1);
    expect(exact[0].key).toBe('marketing icp specialist');
    expect(exact[0].keep.id).toBe('a2');
    expect(exact[0].drop.map((d) => d.id)).toEqual(['a1']);
  });

  it('reports the qualified Bremen variant for review rather than merging it', () => {
    const { exact, related } = findDuplicateAgentGroups(TRAKTOR);
    const exactIds = exact.flatMap((g) => [g.keep.id, ...g.drop.map((d) => d.id)]);
    expect(exactIds).not.toContain('a3');
    expect(related.length).toBeGreaterThan(0);
  });

  it('never groups roles that only share a generic word', () => {
    const { exact, related } = findDuplicateAgentGroups([
      { id: 'x1', name: 'Finance Specialist' },
      { id: 'x2', name: 'Marketing Specialist' },
    ]);
    expect(exact).toHaveLength(0);
    expect(related).toHaveLength(0);
  });

  it('flags Finance Specialist against Finance Pricing Specialist for review, not merge', () => {
    const { exact, related } = findDuplicateAgentGroups([
      { id: 'x1', name: 'Finance Specialist' },
      { id: 'x2', name: 'Finance Pricing Specialist' },
    ]);
    // The subset relation holds, so it surfaces — but merging would destroy a
    // real distinction, so it must not appear in `exact`.
    expect(exact).toHaveLength(0);
    expect(related).toHaveLength(1);
  });

  it('ignores agents with no usable role label', () => {
    expect(findDuplicateAgentGroups([{ id: 'x1' }, { id: 'x2' }]).exact).toHaveLength(0);
  });

  it('returns nothing for an empty roster', () => {
    expect(findDuplicateAgentGroups([])).toEqual({ exact: [], related: [] });
  });
});

describe('pickSurvivor', () => {
  it('keeps the most recently touched row', () => {
    expect(
      pickSurvivor([
        { id: 'old', updated_at: '2026-01-01T00:00:00Z' },
        { id: 'new', updated_at: '2026-08-01T00:00:00Z' },
      ]).id
    ).toBe('new');
  });

  it('is deterministic when timestamps tie, so re-runs agree', () => {
    const members = [{ id: 'b' }, { id: 'a' }];
    expect(pickSurvivor(members).id).toBe('a');
    expect(pickSurvivor([...members].reverse()).id).toBe('a');
  });
});

describe('formatReconciliationReport', () => {
  it('separates safe merges from decisions the user must make', () => {
    const report = formatReconciliationReport(findDuplicateAgentGroups(TRAKTOR), 'Traktor');
    expect(report).toContain('SAFE TO MERGE');
    expect(report).toContain('NEEDS YOUR DECISION');
    expect(report).toContain('would be deactivated');
  });

  it('says so plainly when there is nothing to do', () => {
    expect(formatReconciliationReport({ exact: [], related: [] })).toContain('None found.');
  });
});

describe('report noise control', () => {
  it('collapses long related lists, which mean role families not duplicates', () => {
    const related = Array.from({ length: 12 }, (_, i) => ({
      a: { key: `role ${i} alpha`, agents: [] },
      b: { key: `role ${i} beta`, agents: [] },
    }));
    const report = formatReconciliationReport({ exact: [], related });
    expect(report).toContain('and 7 more pair(s)');
    expect(report).toContain('role families');
  });

  it('spells out short related lists in full', () => {
    const related = [{ a: { key: 'one', agents: [] }, b: { key: 'two', agents: [] } }];
    const report = formatReconciliationReport({ exact: [], related });
    expect(report).not.toContain('more pair(s)');
  });
});
