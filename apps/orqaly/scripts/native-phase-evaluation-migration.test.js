import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/224_native_phase_evaluation_attempt.sql'),
  'utf8'
);
const sql = migration.replace(/\s+/g, ' ').trim().toLowerCase();

describe('native phase evaluation attempt migration', () => {
  it('holds reservation and completion in explicit transactions with row locks', () => {
    expect(sql).toContain('begin;');
    expect(sql.indexOf('begin;')).toBeLessThan(sql.indexOf('create or replace function'));
    expect(sql.endsWith('commit;')).toBe(true);
    expect(sql.match(/for update/g)).toHaveLength(2);
    expect(sql).toContain('create or replace function public.reserve_native_phase_evaluation');
    expect(sql).toContain('create or replace function public.finalize_native_phase_evaluation');
  });

  it('recomputes exact task outputs and exact job costs inside both locked operations', () => {
    expect(sql).toContain(
      "digest( pg_catalog.convert_to(coalesce(t.data ->> 'output', ''), 'utf8'), 'sha256' )"
    );
    expect(sql.match(/native_phase_evaluation_task_receipts\(/g).length).toBeGreaterThanOrEqual(4);
    expect(sql.match(/native_phase_evaluation_job_receipts\(/g).length).toBeGreaterThanOrEqual(4);
    expect(sql.match(/task_set_changed/g)).toHaveLength(2);
    expect(sql.match(/job_cost_set_changed/g)).toHaveLength(2);
  });

  it('binds scope, planning, formation, materialization, Gate 2, and phase lifecycle', () => {
    for (const path of [
      '{axwise_customer_intelligence,scope_packet,scope_hash}',
      '{native_planning_attempt,attempt_id}',
      '{native_planning_attempt,plan_hash}',
      '{team_formation_attempt,attempt_id}',
      '{team_work_materialization,formation_attempt}',
      '{goal_approvals,execution,snapshot_hash}',
      '{execution_authorization,snapshot_hash}',
      "array['phases', p_phase_index::text, 'started_at']",
    ]) {
      expect(sql).toContain(path);
    }
  });

  it('publishes plan, cost, and completed attempt in the one winning update', () => {
    expect(sql).toContain('native_phase_evaluation_terminal_accounting_invalid');
    expect(sql).toContain(
      "coalesce(goal_row.spent_usd, 0) + (p_completed_attempt ->> 'phase_cost_usd')::numeric"
    );
    expect(sql).toMatch(
      /set status = p_next_status, plan = p_next_plan, current_value = p_next_current_value, spent_usd = p_next_spent_usd, data = p_next_data, updated_at = completed_at_value/
    );
    expect(sql).toContain("'{native_phase_evaluation_attempt,status}' = 'running'");
    expect(sql).toContain("'{native_phase_evaluation_attempt,lease_token}' = p_lease_token");
  });

  it('is callable only by the service role', () => {
    expect(sql).toMatch(
      /revoke all on function public\.reserve_native_phase_evaluation[\s\S]*from public, anon, authenticated;/
    );
    expect(sql).toMatch(
      /revoke all on function public\.finalize_native_phase_evaluation[\s\S]*from public, anon, authenticated;/
    );
    expect(sql).toMatch(
      /grant execute on function public\.reserve_native_phase_evaluation[\s\S]*to service_role;/
    );
    expect(sql).toMatch(
      /grant execute on function public\.finalize_native_phase_evaluation[\s\S]*to service_role;/
    );
    expect(sql).not.toMatch(/grant execute[\s\S]*to authenticated;/);
  });
});
