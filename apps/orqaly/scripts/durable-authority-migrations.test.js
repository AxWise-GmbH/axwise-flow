import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function migration(number, name) {
  return readFileSync(resolve(`supabase/migrations/${number}_${name}.sql`), 'utf8');
}

const jobAuthority = migration('227', 'agent_jobs_durable_authority_and_live_lease');
const communicationAuthority = migration('228', 'communication_logs_tenant_authority');
const reportTypes = migration('229', 'concilium_agent_report_types');
const compact = (value) => value.replace(/\s+/g, ' ').trim().toLowerCase();

describe('agent_jobs durable authority and live lease migration', () => {
  const sql = compact(jobAuthority);

  it('adds one exact renewable lease with indexed expiry and token identity', () => {
    expect(sql).toContain('add column if not exists lease_token uuid');
    expect(sql).toContain('add column if not exists heartbeat_at timestamptz');
    expect(sql).toContain('add column if not exists lease_expires_at timestamptz');
    expect(sql).toContain('idx_agent_jobs_running_lease_expiry');
    expect(sql).toContain('(status, worker_scope, lease_expires_at)');
    expect(sql).toContain('unique index if not exists idx_agent_jobs_live_lease_token');
  });

  it('terminalizes every markerless legacy running row before enforcing leases', () => {
    const quarantine = sql.indexOf("update public.agent_jobs set status = 'failed'");
    const leaseConstraint = sql.indexOf('add constraint agent_jobs_live_lease_check');
    const quarantineClause = sql.slice(quarantine, leaseConstraint);
    expect(quarantine).toBeGreaterThanOrEqual(0);
    expect(sql).toContain('job_live_lease_required: legacy running job quarantined');
    expect(quarantineClause).toContain("where status = 'running'");
    expect(quarantineClause).toContain('lease_token is null');
    expect(quarantineClause).toContain('heartbeat_at is null');
    expect(quarantineClause).toContain('lease_expires_at is null');
    expect(quarantineClause).toContain('lease_expires_at <= heartbeat_at');
    expect(quarantine).toBeLessThan(leaseConstraint);
  });

  it('requires all lease fields only for running and clears them for every other status', () => {
    expect(sql).toMatch(
      /status = 'running' and lease_token is not null and heartbeat_at is not null and lease_expires_at is not null/
    );
    expect(sql).toMatch(
      /status <> 'running' and lease_token is null and heartbeat_at is null and lease_expires_at is null/
    );
    expect(sql).toContain('lease_expires_at > heartbeat_at');
    expect(sql).toContain("check (status in ('queued', 'running', 'done', 'failed', 'cancelled'))");
    expect(sql).not.toContain("new.status := 'failed'");
    expect(sql).toContain('a terminal/requeued transition revokes the old invocation atomically');
    expect(sql).toMatch(
      /new\.lease_token := null; new\.heartbeat_at := null; new\.lease_expires_at := null;/
    );
  });

  it('replaces the permissive owner fallback with explicit immutable authority', () => {
    expect(sql).toContain('drop trigger if exists trg_agent_jobs_set_owner');
    expect(sql).toContain('drop function if exists public.agent_jobs_set_owner()');
    expect(sql).toContain('agent_jobs.user_id is required');
    expect(sql).toContain('agent_jobs.user_id is immutable');
    expect(sql).toContain('agent_jobs.payload authority envelope is immutable');
    expect(sql).toContain('agent_job_canonical_owner_payload');
    for (const alias of ['_userid', 'userid', 'user_id']) {
      expect(sql).toContain(alias);
    }
  });

  it('replaces global authenticated job polling with owner-only reads', () => {
    expect(sql).toContain('drop policy if exists "authenticated read agent_jobs"');
    expect(sql).toContain('drop policy if exists agent_jobs_owner_all');
    expect(sql).toContain('drop policy if exists agent_jobs_owner_select');
    expect(sql).toContain('drop policy if exists agent_jobs_service');
    expect(sql).toMatch(
      /create policy agent_jobs_owner_select on public\.agent_jobs for select to authenticated using \(user_id = auth\.uid\(\)\)/
    );
    expect(sql).toMatch(
      /revoke select, insert, update, delete, truncate, references, trigger on table public\.agent_jobs from public, anon, authenticated/
    );
    expect(sql).toContain('grant select on table public.agent_jobs to authenticated');
    expect(sql).toContain('grant all privileges on table public.agent_jobs to service_role');
  });

  it('quarantines invalid executable legacy rows with their exact security reason', () => {
    expect(sql).toContain('with invalid_jobs as materialized');
    expect(sql).toContain('agent_job_authority_contract_error(user_id, payload)');
    expect(sql).toContain("error = 'job_owner_validation_error: ' || invalid.reason");
    expect(sql).toMatch(/where status = 'queued'/);
    expect(sql).toContain("status not in ('queued', 'running') or user_id is not null");
  });

  it('validates every declared entity against the typed durable owner', () => {
    for (const relation of [
      'public.goals',
      'public.team_tasks',
      'public.jobs',
      'public.agents',
      'public.agent_blueprints',
      'public.agent_teams',
      'public.concilium_teams',
      'public.concilium',
      'public.workflows',
      'public.organizations',
      'public.communication_channels',
    ]) {
      expect(sql).toContain(relation);
    }
    expect(sql).toContain('belongs to another owner');
    expect(sql).toContain('durable goal bindings disagree');
    expect(sql).toContain('agent identity references disagree');
  });

  it('supports the ops-owned browser job without making it a central worker type', () => {
    expect(sql).toMatch(/'axwise-outcome', 'browser-task', 'communicator-process'/);
    expect(sql).toContain('unsupported queued job type');
  });

  it('keeps heartbeat updates O(1) and independent of updated_at', () => {
    const triggerStart = sql.indexOf(
      'create or replace function public.agent_jobs_enforce_authority_and_lease()'
    );
    const triggerEnd = sql.indexOf(
      'drop trigger if exists trg_agent_jobs_authority_and_lease',
      triggerStart
    );
    const trigger = sql.slice(triggerStart, triggerEnd);
    const branches = trigger.match(
      /if tg_op = 'insert' then([\s\S]*?)else([\s\S]*?)end if; if new\.status = 'running'/
    );
    expect(branches).not.toBeNull();
    expect(branches[1]).toContain('agent_job_authority_contract_error');
    expect(branches[2]).not.toContain('agent_job_authority_contract_error');
    expect(trigger).not.toContain('new.updated_at');
  });

  it('bounds lease duration and prevents heartbeat or expiry rewind', () => {
    expect(sql).toContain("new.lease_expires_at > new.heartbeat_at + interval '2 minutes'");
    expect(sql).toContain('new.lease_expires_at <= clock_timestamp()');
    expect(sql).toContain("new.heartbeat_at > clock_timestamp() + interval '30 seconds'");
    expect(sql).toContain('new.heartbeat_at < old.heartbeat_at');
    expect(sql).toContain('new.lease_expires_at < old.lease_expires_at');
  });

  it('requires every execution generation to pass through the durable queue', () => {
    expect(sql).toContain("tg_op = 'insert' and new.status = 'running'");
    expect(sql).toContain('agent job must be inserted queued before it can be leased');
    expect(sql).toContain(
      "tg_op = 'update' and new.status = 'running' and old.status not in ('queued', 'running')"
    );
    expect(sql).toContain('terminal agent job cannot transition directly to running');
  });
});

describe('communication_logs tenant authority migration', () => {
  const sql = compact(communicationAuthority);

  it('makes live communication rows non-null tenant-owned with cascading cleanup', () => {
    expect(sql).toContain('add column if not exists user_id uuid');
    expect(sql).toContain('foreign key (user_id) references auth.users(id) on delete cascade');
    expect(sql).toContain('alter column user_id set not null');
    expect(sql).toContain('alter column user_id set default auth.uid()');
    expect(sql).toContain('idx_comm_logs_user_created');
    expect(sql).toContain('idx_comm_logs_user_thread_created');
  });

  it('backfills only a single corroborated owner and propagates only unique threads', () => {
    expect(sql).toContain('communication_log_owner_candidates');
    expect(sql.match(/having count\(distinct user_id\) = 1/g)?.length).toBeGreaterThanOrEqual(3);
    expect(sql).toContain("'unique_thread_owner'");
    expect(sql).toContain("'sender_auth_user'");
    expect(sql).toContain("'sender_agent'");
    expect(sql).toContain("'metadata_channel'");
    expect(sql).toContain("'metadata_goal'");
    expect(sql).toContain("'metadata_organization'");
  });

  it('moves unresolved or conflicting history to a non-user-visible quarantine', () => {
    const quarantineInsert = sql.indexOf(
      'insert into public.communication_logs_security_quarantine'
    );
    const unresolvedDelete = sql.indexOf(
      'delete from public.communication_logs where user_id is null'
    );
    expect(quarantineInsert).toBeGreaterThanOrEqual(0);
    expect(unresolvedDelete).toBeGreaterThan(quarantineInsert);
    expect(sql).toContain('conflicting durable tenant signals');
    expect(sql).toContain('no provable durable tenant signal');
    expect(sql).toContain('force row level security');
    expect(sql).toContain(
      'revoke all on table public.communication_logs_security_quarantine from public, anon, authenticated'
    );
  });

  it('stamps one owner and rejects mismatched authenticated or durable signals', () => {
    expect(sql).toContain('function public.communication_log_resolve_owner(');
    expect(sql).toContain('function public.communication_logs_stamp_owner()');
    expect(sql).toContain('communication log tenant signals disagree');
    expect(sql).toContain('communication_logs.user_id is immutable');
    expect(sql).toContain('before insert or update of user_id, sender_type, sender_id');
  });

  it('replaces shared policies and table grants with owner-only chat access', () => {
    for (const oldPolicy of [
      'comm_logs_select',
      'comm_logs_select_own',
      'comm_logs_insert',
      'comm_logs_update',
      'comm_logs_delete',
      'comm_logs_owner_update',
    ]) {
      expect(sql).toContain(`drop policy if exists "${oldPolicy}"`);
    }
    expect(sql).toMatch(
      /create policy "comm_logs_owner_select"[\s\S]*?using \(auth\.uid\(\) = user_id\)/
    );
    expect(sql).toMatch(
      /create policy "comm_logs_owner_insert"[\s\S]*?with check \(auth\.uid\(\) = user_id\)/
    );
    expect(sql).toMatch(
      /create policy "comm_logs_owner_delete"[\s\S]*?using \(auth\.uid\(\) = user_id\)/
    );
    expect(sql).toContain(
      'grant select, insert, delete on table public.communication_logs to authenticated'
    );
    expect(sql).not.toMatch(/grant[^;]*update[^;]*communication_logs[^;]*authenticated/);
  });

  it('repairs current goal and direct-agent chat contexts and binds their owners', () => {
    expect(sql).toMatch(/'organization', 'agent-chat', 'goal'/);
    expect(sql).toContain("'agent_chat_context'");
    expect(sql).toContain("'goal_context'");
    expect(sql).toContain("p_context_type = 'agent-chat'");
    expect(sql).toContain("p_context_type = 'goal'");
  });
});

describe('Concilium secured report type migration', () => {
  const sql = compact(reportTypes);

  it('retains lifecycle types and adds only the three secured workflow types', () => {
    const match = sql.match(/check \(report_type in \(([^)]+)\)\)/);
    expect(match).not.toBeNull();
    const values = [...match[1].matchAll(/'([^']+)'/g)].map((entry) => entry[1]);
    expect(values).toEqual([
      'check_in',
      'activity',
      'error',
      'completion',
      'status_change',
      'system_audit',
      'supervisor_intervention',
      'approval_request',
    ]);
  });
});
