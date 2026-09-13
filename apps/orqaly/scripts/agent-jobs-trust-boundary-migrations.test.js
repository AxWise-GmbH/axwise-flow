import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WORKER_DEPLOYMENT_HEADER } from '../api/_lib/supabase-server.js';
import { WORKER_DEPLOYMENT_PAYLOAD_KEY } from '../lib/agent-handlers/worker-scope.js';

function migration(number, name) {
  return readFileSync(resolve(process.cwd(), `supabase/migrations/${number}_${name}.sql`), 'utf8');
}

const lockdown = migration('209', 'agent_jobs_client_write_lockdown');
const osjaDedupe = migration('210', 'osja_review_preview_deployment_dedup');
const outcomeDedupe = migration('211', 'axwise_outcome_retry_runtime_dedup');
const previewLease = migration('212', 'agent_jobs_preview_deployment_claim_guard');
const compact = (value) => value.replace(/\s+/g, ' ').trim().toLowerCase();

describe('agent_jobs client-write lockdown migration', () => {
  const sql = compact(lockdown);

  it('replaces the authenticated owner FOR ALL policy with owner SELECT only', () => {
    expect(sql).toContain('drop policy if exists "agent_jobs_owner_all" on public.agent_jobs;');
    expect(sql).toMatch(
      /create policy "agent_jobs_owner_select" on public\.agent_jobs for select to authenticated using \(auth\.uid\(\) = user_id\);/
    );
    expect(sql).not.toMatch(
      /create policy "agent_jobs_owner_(?:all|insert|update|delete)"[\s\S]*?on public\.agent_jobs/
    );
  });

  it('removes browser mutation privileges even for rows owned by auth.uid()', () => {
    expect(sql).toContain(
      'revoke select, insert, update, delete, truncate, references, trigger on table public.agent_jobs from public, anon, authenticated;'
    );
    expect(sql).toContain('grant select on table public.agent_jobs to authenticated;');
    expect(sql).not.toMatch(
      /grant (?:insert|update|delete|all privileges)[^;]*to (?:anon|authenticated)/
    );
  });

  it('retains the trusted service-role worker lifecycle', () => {
    expect(sql).toMatch(
      /create policy "agent_jobs_service" on public\.agent_jobs for all to service_role using \(true\) with check \(true\);/
    );
    expect(sql).toContain('grant all privileges on table public.agent_jobs to service_role;');
  });
});

describe('deployment-aware full Osja retry deduplication migration', () => {
  const sql = compact(osjaDedupe);

  it('replaces migration 201 index with a Preview deployment expression', () => {
    expect(sql).toContain('drop index if exists public.idx_agent_jobs_active_full_osja_review;');
    expect(sql).toMatch(
      /create unique index idx_agent_jobs_active_full_osja_review on public\.agent_jobs \( \(payload ->> 'goalid'\), worker_scope, \( case when worker_scope = 'preview' then coalesce\(nullif\(payload ->> '_workerdeployment', ''\), '__unbound_preview__'\) else '__worker_scope__' end \) \)/
    );
  });

  it('allows two Preview deployments while preserving per-deployment and non-Preview dedupe', () => {
    const key = ({ goalId, workerScope, deployment }) =>
      [
        goalId,
        workerScope,
        workerScope === 'preview' ? deployment || '__unbound_preview__' : '__worker_scope__',
      ].join('|');

    expect(
      key({ goalId: 'goal-1', workerScope: 'preview', deployment: 'vercel-deployment:dpl_a' })
    ).not.toBe(
      key({ goalId: 'goal-1', workerScope: 'preview', deployment: 'vercel-deployment:dpl_b' })
    );
    expect(
      key({ goalId: 'goal-1', workerScope: 'preview', deployment: 'vercel-deployment:dpl_a' })
    ).toBe(
      key({ goalId: 'goal-1', workerScope: 'preview', deployment: 'vercel-deployment:dpl_a' })
    );
    expect(key({ goalId: 'goal-1', workerScope: 'production', deployment: 'dpl_a' })).toBe(
      key({ goalId: 'goal-1', workerScope: 'production', deployment: 'dpl_b' })
    );
    expect(key({ goalId: 'goal-1', workerScope: 'local', deployment: 'local-a' })).toBe(
      key({ goalId: 'goal-1', workerScope: 'local', deployment: 'local-b' })
    );
  });

  it('retains the exact active full manual-review predicate', () => {
    expect(sql).toContain("where status in ('queued', 'running')");
    expect(sql).toContain("payload ->> 'type' = 'orchestrate-goal'");
    expect(sql).toContain("payload ->> 'action' = 'osja-review'");
    expect(sql).toContain("payload ->> 'manualretry' = 'true'");
    expect(sql).toContain("not (payload ? 'singledeliverableid')");
  });
});

describe('deployment-aware AxWise outcome retry deduplication migration', () => {
  const sql = compact(outcomeDedupe);

  it('replaces the global goal index with an exact Preview runtime key', () => {
    expect(sql).toMatch(
      /create unique index if not exists idx_agent_jobs_active_axwise_outcome_runtime on public\.agent_jobs \( \(payload ->> 'goalid'\), worker_scope, \( case when worker_scope = 'preview' then coalesce\(payload ->> '_workerdeployment', ''\) else '' end \) \)/
    );
    expect(sql).toContain('drop index if exists public.idx_agent_jobs_active_axwise_outcome_goal;');
  });

  it('retains the active AxWise outcome predicate', () => {
    expect(sql).toContain("where status in ('queued', 'running')");
    expect(sql).toContain("payload ->> 'type' = 'axwise-outcome'");
    expect(sql).toContain("payload ? 'goalid'");
  });
});

describe('Preview deployment lease guard migration', () => {
  const sql = compact(previewLease);

  it('quarantines legacy unbound Preview rows before installing the claim guard', () => {
    expect(sql).toMatch(
      /update public\.agent_jobs set status = 'failed',[\s\S]*where worker_scope = 'preview' and status = 'queued'/
    );
    expect(sql).toContain("payload ->> '_workerdeployment'");
    expect(sql).toContain('legacy unbound preview job quarantined');
    expect(sql.indexOf('update public.agent_jobs')).toBeLessThan(
      sql.indexOf('create or replace function public.agent_jobs_guard_worker_scope_claim')
    );
  });

  it('requires the trusted deployment header to match the queued row binding', () => {
    expect(sql).toContain(`request_headers ->> '${WORKER_DEPLOYMENT_HEADER}'`);
    expect(sql).toContain(`old.payload ->> '${WORKER_DEPLOYMENT_PAYLOAD_KEY.toLowerCase()}'`);
    expect(sql).toMatch(/if requested_deployment is null then raise exception/);
    expect(sql).toMatch(/if bound_deployment is null then raise exception/);
    expect(sql).toMatch(/if bound_deployment is distinct from requested_deployment then/);
  });

  it('applies the deployment check only to Preview queued-to-running leases', () => {
    expect(sql).toMatch(
      /old\.status is distinct from 'queued' or new\.status is distinct from 'running'/
    );
    expect(sql).toMatch(/if old\.worker_scope = 'preview' then[\s\S]*end if;/);
    expect(sql).toMatch(/requested_scope not in \('production', 'preview', 'local'\)/);
    expect(sql).toMatch(/old\.worker_scope is distinct from requested_scope/);
  });
});
