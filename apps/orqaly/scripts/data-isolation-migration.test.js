import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('data-isolation migration clean bootstrap guard', () => {
  const sql = readFileSync(
    resolve(process.cwd(), 'supabase/migrations/183_data_isolation_backfill.sql'),
    'utf8'
  );

  it('allows a clean local database with no fallback owner and no orphan rows', () => {
    expect(sql).toContain('Fallback owner absent and no legacy orphan rows exist');
    expect(sql).toMatch(/if exists \(select 1 from public\.partners where user_id is null\)/i);
    expect(sql).toMatch(/return;\s*end if;/i);
  });

  it('still fails closed when legacy orphan rows need attribution', () => {
    expect(sql).toContain(
      'Fallback owner misters.builder@gmail.com not found in auth.users - aborting; no rows touched.'
    );
    expect(sql).toMatch(/or exists \(select 1 from public\.agent_jobs where user_id is null\)/i);
  });
});
