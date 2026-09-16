import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATION = path.join(ROOT, 'supabase/migrations/216_tools_tenant_identity.sql');

function sql() {
  return fs.readFileSync(MIGRATION, 'utf8').replaceAll(/\s+/g, ' ').toLowerCase();
}

describe('tools tenant identity migration', () => {
  it('moves the physical primary key away from the shared canonical tool slug', () => {
    const source = sql();

    expect(source).toContain(
      'add column if not exists row_id uuid not null default gen_random_uuid()'
    );
    expect(source).not.toContain('update public.tools set row_id');
    expect(source).toContain('alter column row_id set default gen_random_uuid()');
    expect(source).toContain('alter column row_id set not null');
    expect(source).toContain('alter column id set not null');
    expect(source).toContain('drop constraint if exists tools_pkey');
    expect(source).toContain('add constraint tools_pkey primary key (row_id)');
  });

  it('allows each owner one row per canonical id while preserving global uniqueness', () => {
    const source = sql();

    expect(source).toContain('add constraint tools_user_id_id_key unique (user_id, id)');
    expect(source).toContain('create unique index if not exists tools_global_canonical_id_unique');
    expect(source).toContain('on public.tools (id) where user_id is null');
    expect(source).toContain('drop constraint if exists tools_user_id_fkey');
    expect(source).toContain(
      'add constraint tools_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade'
    );
  });

  it('binds replicators to the source tool owned by the same tenant', () => {
    const source = sql();

    expect(source).toContain('drop constraint if exists replicators_source_tool_id_fkey');
    expect(source).toContain('foreign key (user_id, source_tool_id)');
    expect(source).toContain('references public.tools (user_id, id)');
    expect(source).toContain('not valid');
  });
});
