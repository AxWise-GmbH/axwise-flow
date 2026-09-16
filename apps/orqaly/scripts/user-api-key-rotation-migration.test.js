import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/215_user_api_key_atomic_rotation.sql'),
  'utf8'
);
const sql = migration.replace(/\s+/g, ' ').trim().toLowerCase();

describe('user api key atomic rotation migration', () => {
  it('rotates the old and new metadata rows in one transaction', () => {
    expect(sql).toContain('begin;');
    expect(sql).toContain('create or replace function public.rotate_user_api_key_current');
    expect(sql).toContain('update public.user_api_keys set is_current = false');
    expect(sql).toContain('superseded_by = p_new_id');
    expect(sql).toContain('update public.user_api_keys set is_current = true');
    expect(sql).toMatch(/commit;$/);
  });

  it('validates both exact owner/provider/slot row snapshots under locks', () => {
    expect(sql.match(/for update;/g)).toHaveLength(2);
    for (const predicate of [
      'old_row.user_id <> p_user_id',
      'old_row.provider <> p_provider',
      'old_row.slot <> p_slot',
      'old_row.updated_at <> p_old_updated_at',
      'old_row.vault_secret_id <> p_old_vault_secret_id',
      'old_row.is_current is not true',
      'new_row.user_id <> p_user_id',
      'new_row.provider <> p_provider',
      'new_row.slot <> p_slot',
      'new_row.updated_at <> p_new_updated_at',
      'new_row.vault_secret_id <> p_new_vault_secret_id',
      'new_row.is_current is not false',
    ]) {
      expect(sql).toContain(predicate);
    }
    expect(sql).toContain('and id <> p_old_id');
  });

  it('is a fixed-search-path service-role-only security definer', () => {
    expect(sql).toContain('security definer set search_path =');
    expect(sql).toMatch(/set search_path = ''/);
    for (const role of ['public', 'anon', 'authenticated']) {
      expect(sql).toMatch(
        new RegExp(
          `revoke all on function public\\.rotate_user_api_key_current\\([^)]*\\) from ${role};`
        )
      );
    }
    expect(sql).toMatch(
      /grant execute on function public\.rotate_user_api_key_current\([^)]*\) to service_role;/
    );
  });
});
