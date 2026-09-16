import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/217_user_api_keys_server_write_boundary.sql'),
  'utf8'
);
const sql = migration.replace(/\s+/g, ' ').trim().toLowerCase();

describe('user api keys server write boundary migration', () => {
  it('removes every authenticated mutation path', () => {
    for (const operation of ['insert', 'update', 'delete']) {
      expect(sql).toContain(`drop policy if exists "users ${operation} own api keys"`);
    }
    expect(sql).toContain(
      'revoke all privileges on table public.user_api_keys from public, anon, authenticated;'
    );
  });

  it('retains owner metadata reads and trusted service writes', () => {
    expect(sql).not.toMatch(/drop policy[^;]*users read own api keys/);
    expect(sql).toContain('grant select on table public.user_api_keys to authenticated;');
    expect(sql).toContain('grant all privileges on table public.user_api_keys to service_role;');
  });
});
