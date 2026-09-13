import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/218_tools_current_credential_delete_guard.sql'),
  'utf8'
);
const sql = migration.replace(/\s+/g, ' ').trim().toLowerCase();

describe('tools current credential delete guard migration', () => {
  it('blocks an owner delete only for the exact tenant/tool current credential', () => {
    expect(sql).toContain('before delete on public.tools');
    expect(sql).toContain('credential.user_id = old.user_id');
    expect(sql).toContain("credential.provider = 'tool:' || old.id");
    expect(sql).toContain('credential.is_current = true');
    expect(sql).toContain("errcode = '42501'");
    expect(sql).toContain(
      "message = 'delete this tool''s current credential before deleting the tool'"
    );
  });

  it('keeps trusted server and database maintenance writers out of the owner guard', () => {
    expect(sql).toContain("request_role text := nullif(auth.role(), '')");
    expect(sql).toContain("coalesce(request_role = 'service_role', false)");
    expect(sql).toContain("current_user in ('postgres', 'supabase_admin')");
    expect(sql).toContain('if not trusted_writer');
    expect(sql).toContain('security invoker');
  });

  it('is non-destructive and never mutates credential or Vault state', () => {
    expect(sql).not.toMatch(/(?:update|delete from) public\.user_api_keys/);
    expect(sql).not.toContain('vault.secrets');
    expect(sql).not.toContain('is_current = false');
  });
});
