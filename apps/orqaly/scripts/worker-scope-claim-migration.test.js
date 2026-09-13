import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/199_agent_jobs_require_worker_scope_header.sql'),
  'utf8'
);

describe('worker scope claim hardening migration', () => {
  it('rejects headerless queue claims instead of treating them as production', () => {
    expect(migration).toMatch(
      /requested_scope not in \('production', 'preview', 'local'\)[\s\S]*raise exception/i
    );
    expect(migration).toMatch(/worker scope header is required to claim job/i);
    expect(migration).not.toMatch(/requested_scope\s*:=\s*'production'/i);
  });

  it('continues to reject cross-partition claims', () => {
    expect(migration).toMatch(/old\.worker_scope is distinct from requested_scope/i);
    expect(migration).toMatch(/worker scope %s cannot claim %s job %s/i);
  });

  it('only guards the queued to running lease transition', () => {
    expect(migration).toMatch(
      /old\.status is distinct from 'queued' or new\.status is distinct from 'running'/i
    );
  });
});
