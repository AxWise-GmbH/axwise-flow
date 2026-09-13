import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/214_tools_owner_and_credential_coordination_guard.sql'
  ),
  'utf8'
);
const sql = migration.replace(/\s+/g, ' ').trim().toLowerCase();

describe('tools owner and credential coordination migration', () => {
  it('replaces the cross-tenant FOR ALL policy with owner-scoped CRUD', () => {
    expect(sql).toContain('drop policy if exists "users can manage tools" on public.tools;');
    expect(sql).toMatch(
      /create policy "tools_owner_select" on public\.tools for select to authenticated using \(auth\.uid\(\) = user_id\);/
    );
    expect(sql).toMatch(
      /create policy "tools_owner_insert" on public\.tools for insert to authenticated with check \(auth\.uid\(\) = user_id\);/
    );
    expect(sql).toMatch(
      /create policy "tools_owner_update" on public\.tools for update to authenticated using \(auth\.uid\(\) = user_id\) with check \(auth\.uid\(\) = user_id\);/
    );
    expect(sql).toMatch(
      /create policy "tools_owner_delete" on public\.tools for delete to authenticated using \(auth\.uid\(\) = user_id\);/
    );
    expect(sql).not.toMatch(
      /create policy[^;]*for all to authenticated[^;]*using \(auth\.role\(\) = 'authenticated'\)/
    );
  });

  it('keeps service-role writes trusted without relying on request headers', () => {
    expect(sql).toMatch(
      /create policy "tools_service" on public\.tools for all to service_role using \(true\) with check \(true\);/
    );
    expect(sql).toContain("request_role text := nullif(auth.role(), '');");
    expect(sql).toContain("coalesce(request_role = 'service_role', false)");
    expect(sql).toContain("current_user in ('postgres', 'supabase_admin')");
    expect(sql).not.toContain('request.headers');
    expect(sql).not.toContain('request.jwt.claims');
    expect(sql).toContain('security invoker');
  });

  it('blocks browser creation, mutation, or deletion of server coordination state', () => {
    expect(sql).toContain("reservation_field constant text := 'credential_write_reservation'");
    expect(sql).toContain("version_field constant text := 'credential_write_version'");
    expect(sql).toMatch(
      /if tg_op = 'insert'.*?new\.data.*?reservation_field.*?new\.data.*?version_field/is
    );
    expect(sql).toMatch(
      /if tg_op = 'update'.*?old\.data.*?reservation_field.*?raise exception.*?old\.data -> reservation_field.*?new\.data -> reservation_field.*?old\.data -> version_field.*?new\.data -> version_field/is
    );
    expect(sql).toMatch(/if tg_op = 'delete'.*?old\.data.*?reservation_field.*?raise exception/is);
    expect(sql).toContain("errcode = '42501'");
  });

  it('makes updated_at a strictly advancing database CAS version', () => {
    expect(sql).toMatch(
      /new\.updated_at := case when old\.updated_at is null then clock_timestamp\(\) else greatest\(clock_timestamp\(\), old\.updated_at \+ interval '1 microsecond'\) end;/
    );
    expect(sql).toMatch(
      /create trigger tools_guard_credential_coordination_trigger before insert or update or delete on public\.tools/
    );
  });
});
