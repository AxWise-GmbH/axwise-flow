/**
 * Client/server role-key contract.
 *
 * The Enhancement tab writes conditioning to a scope identified by role key,
 * and execute-task.js reads it back using roleIdentityKey() on the server. If
 * the two normalizations drift, the UI silently edits a scope that execution
 * never loads — the failure would look like "my conditioning does nothing".
 *
 * These assertions lock the two implementations together.
 */
import { describe, it, expect } from 'vitest';
import { roleKeyOf } from './roleKey';
import { roleIdentityKey } from '../../../lib/goal-handlers/team-assigner.js';

const AGENT_NAMES = [
  'Marketing/ICP Specialist',
  'Marketing ICP Specialist',
  'Bremen Local Market & ICP Specialist (Marketing)',
  'Finance Pricing Specialist',
  'B2B Commercial Strategist',
  'German Market Lead Generator',
  'AI Management Consultant',
  'Team Lead',
];

describe('roleKeyOf matches the server roleIdentityKey', () => {
  it.each(AGENT_NAMES)('agrees on %s', (name) => {
    expect(roleKeyOf({ name })).toBe(roleIdentityKey(name));
  });

  it('collapses the punctuation variants the same way the server does', () => {
    expect(roleKeyOf({ name: 'Marketing/ICP Specialist' })).toBe(
      roleKeyOf({ name: 'Marketing ICP Specialist' })
    );
  });

  it('prefers category over name, matching how agents are stored', () => {
    expect(roleKeyOf({ category: 'Designer', name: 'Some Display Name' })).toBe('designer');
  });

  it('returns an empty key for an agent with no identifying fields', () => {
    expect(roleKeyOf({})).toBe('');
    expect(roleKeyOf(null)).toBe('');
  });
});
