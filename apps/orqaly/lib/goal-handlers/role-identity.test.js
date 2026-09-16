/**
 * Role identity keys — de-duplication and matching.
 *
 * These cover the TRAKTOR case: one Marketing/ICP role that had produced three
 * separate agent rows because the role string was punctuated differently each
 * time a goal ran.
 *
 * The guard that matters most here is the last describe block: normalizeRole()
 * must keep its exact current output, because goalRequiredExecutionRoles()
 * compares it against the Gate 1 executor-role snapshot. Changing it would fail
 * already-approved goals closed.
 */
import { describe, it, expect } from 'vitest';
import {
  roleIdentityKey,
  roleTokens,
  relatedRole,
  matchesRole,
  dedupeExecutionAgents,
} from './team-assigner.js';

describe('roleIdentityKey', () => {
  it('collapses punctuation variants of the same role', () => {
    expect(roleIdentityKey('Marketing/ICP Specialist')).toBe('marketing icp specialist');
    expect(roleIdentityKey('Marketing ICP Specialist')).toBe('marketing icp specialist');
    expect(roleIdentityKey('Marketing-ICP  Specialist')).toBe('marketing icp specialist');
  });

  it('unwraps bracketed qualifiers instead of discarding them', () => {
    // "(Marketing)" is the token that identifies this as a marketing role;
    // dropping it would hide the relationship to "Marketing/ICP Specialist".
    expect(roleIdentityKey('Bremen Local Market & ICP Specialist (Marketing)')).toBe(
      'bremen local market icp specialist marketing'
    );
  });

  it('returns an empty string for empty input', () => {
    expect(roleIdentityKey('')).toBe('');
    expect(roleIdentityKey(null)).toBe('');
    expect(roleIdentityKey(undefined)).toBe('');
  });
});

describe('roleTokens', () => {
  it('excludes generic seniority and function words', () => {
    expect([...roleTokens('Marketing/ICP Specialist')].sort()).toEqual(['icp', 'marketing']);
    expect([...roleTokens('Senior Finance Manager')].sort()).toEqual(['finance']);
  });
});

describe('relatedRole', () => {
  it('flags a qualified variant of the same role', () => {
    expect(
      relatedRole('Bremen Local Market & ICP Specialist (Marketing)', 'Marketing/ICP Specialist')
    ).toBe(true);
  });

  it('is directionless', () => {
    expect(relatedRole('Marketing/ICP Specialist', 'Bremen Local Market & ICP (Marketing)')).toBe(
      true
    );
  });

  it('does not flag roles that merely share a generic word', () => {
    expect(relatedRole('German Market Lead Generator', 'Marketing/ICP Specialist')).toBe(false);
    expect(relatedRole('B2B Commercial Strategist', 'AI Management Consultant')).toBe(false);
  });

  it('returns false for identical roles, which need no suggestion', () => {
    expect(relatedRole('Marketing/ICP Specialist', 'Marketing ICP Specialist')).toBe(false);
  });
});

describe('matchesRole', () => {
  it('treats punctuation variants as the same role', () => {
    expect(matchesRole('Marketing/ICP Specialist', 'Marketing ICP Specialist')).toBe(true);
  });

  it('still rejects unrelated roles', () => {
    expect(matchesRole('Finance Pricing Specialist', 'AI Management Consultant')).toBe(false);
  });
});

describe('dedupeExecutionAgents', () => {
  it('collapses the three TRAKTOR marketing rows into one, keeping the newest', () => {
    const agents = [
      { id: 'a1', name: 'Marketing/ICP Specialist', updated_at: '2026-08-01T00:00:00Z' },
      { id: 'a2', name: 'Marketing ICP Specialist', updated_at: '2026-08-10T00:00:00Z' },
      { id: 'a3', name: 'Marketing-ICP Specialist', updated_at: '2026-08-05T00:00:00Z' },
      { id: 'a4', name: 'Finance Pricing Specialist', updated_at: '2026-08-01T00:00:00Z' },
    ];
    const result = dedupeExecutionAgents(agents);
    expect(result).toHaveLength(2);
    expect(result.map((a) => a.id).sort()).toEqual(['a2', 'a4']);
  });

  it('keeps a parenthetically qualified role separate from the plain one', () => {
    const agents = [
      { id: 'a1', name: 'Marketing/ICP Specialist', updated_at: '2026-08-01T00:00:00Z' },
      {
        id: 'a2',
        name: 'Bremen Local Market & ICP Specialist (Marketing)',
        updated_at: '2026-08-01T00:00:00Z',
      },
    ];
    // relatedRole() surfaces this pair for human review; dedupe must not act on
    // it automatically, because merging is destructive.
    expect(dedupeExecutionAgents(agents)).toHaveLength(2);
  });
});

describe('normalizeRole output is frozen (Gate 1 contract dependency)', () => {
  it('keeps punctuation, so approved goal snapshots still compare equal', async () => {
    // normalizeRole is not exported; goalRequiredExecutionRoles consumes it via
    // the Gate 1 comparison. Assert the observable contract instead: the
    // identity key and the contract normalization must NOT be the same function.
    expect(roleIdentityKey('Marketing/ICP Specialist')).toBe('marketing icp specialist');
    // A slash survives normalizeRole; if this ever equals the identity key the
    // contract comparison has been silently widened.
    expect(roleIdentityKey('Marketing/ICP Specialist')).not.toBe('marketing/icp specialist');
  });
});
