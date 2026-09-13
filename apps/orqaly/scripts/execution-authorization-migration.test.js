import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/195_goal_execution_authorization_reservation.sql'),
  'utf8'
);

describe('execution authorization reservation migration', () => {
  it('adds the transient authorization reservation to the complete goal status constraint', () => {
    expect(migration).toMatch(/drop constraint if exists goals_status_check/i);
    expect(migration).toMatch(/add constraint goals_status_check/i);
    expect(migration).toContain("'authorizing_execution'");
    expect(migration).toContain("'awaiting_context_approval'");
    expect(migration).toContain("'awaiting_approval'");
    expect(migration).toContain("'active'");
    expect(migration).toContain("'needs_human'");
  });

  it('documents the state as a transient snapshot-binding reservation', () => {
    expect(migration).toMatch(/transient CAS reservation/i);
    expect(migration).toMatch(/approved execution snapshot is bound to tasks/i);
  });
});
