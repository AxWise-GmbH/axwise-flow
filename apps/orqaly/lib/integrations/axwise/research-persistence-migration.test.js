import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(resolve('supabase/migrations/202_goal_research_persistence.sql'), 'utf8');

describe('202 goal research persistence migration', () => {
  it('defines normalized tables, current-version uniqueness, grants and owner RLS', () => {
    for (const table of [
      'goal_research_runs',
      'goal_research_sources',
      'goal_research_personas',
      'goal_research_artifacts',
      'goal_agent_persona_assignments',
    ]) {
      expect(sql).toContain(`create table if not exists public.${table}`);
      expect(sql).toContain(`'${table}'`);
      expect(sql).toContain(`grant select on table public.${table} to authenticated`);
      expect(sql).toContain(`grant all on table public.${table} to service_role`);
    }
    expect(sql).toContain('idx_goal_research_runs_one_current');
    expect(sql).toContain("where version_status = 'current'");
    expect(sql).toContain('for select using (auth.uid() = user_id)');
  });

  it('validates each tenant scope with one correctly targeted trigger', () => {
    expect(sql).toContain('goal_research_validate_run_scope');
    expect(sql).toContain('goal_research_validate_child_scope');
    expect(sql).toContain('goal_research_validate_assignment_scope');
    expect(sql).not.toContain('perform public.goal_research_validate_child_scope()');
    expect(sql).toContain('Goal-agent assignment tenant scope does not match its run');
    expect(sql).toContain('Goal-agent assignment agent is outside the goal organization');
    for (const [trigger, table] of [
      ['trg_goal_research_sources_validate_scope', 'goal_research_sources'],
      ['trg_goal_research_personas_validate_scope', 'goal_research_personas'],
      ['trg_goal_research_artifacts_validate_scope', 'goal_research_artifacts'],
      ['trg_goal_agent_persona_assignments_validate_scope', 'goal_agent_persona_assignments'],
    ]) {
      const block = sql.match(
        new RegExp(`create trigger ${trigger}([\\s\\S]*?)for each row execute function`)
      )?.[1];
      expect(block, `${trigger} block`).toBeTruthy();
      expect(block.match(new RegExp(`on public\\.${table}`, 'g'))).toHaveLength(1);
    }
  });

  it('activates complete imports atomically through a service-role-only RPC', () => {
    expect(sql).toContain('create or replace function public.activate_goal_research_run');
    expect(sql).toContain('pg_advisory_xact_lock');
    expect(sql).toContain("set version_status = 'superseded'");
    expect(sql).toContain("set version_status = 'current'");
    expect(sql).toContain(
      'grant execute on function public.activate_goal_research_run(uuid, uuid) to service_role'
    );
    expect(sql).toContain('trg_goal_research_runs_touch_updated_at');
  });

  it('atomically and idempotently materializes only research-owned work and final bindings', () => {
    expect(sql).toContain('create or replace function public.materialize_goal_research_work');
    expect(sql).toContain('pg_advisory_xact_lock(hashtextextended(p_goal_id::text, 0))');
    expect(sql).toContain("goal_status <> 'forming_team'");
    expect(sql).toContain("r.version_status = 'current'");
    expect(sql).toContain('research_materialization_task_job_binding_invalid');
    expect(sql).toContain('research_materialization_task_binding_invalid');
    expect(sql).toContain('research_materialization_attempt_inconsistent');
    expect(sql).toContain(
      "item#>>'{payload,materialization_attempt}' is distinct from p_attempt_key"
    );
    expect(sql).toContain("job->>'assigned_agent_id' is not distinct from task->>'agent_id'");
    expect(sql).toContain('materialization_attempt is not null');
    expect(sql).toContain("assignment_source = 'orqaly_team_formation'");
    expect(sql).not.toContain("assignment_source = 'axwise';");
    expect(sql).toContain("'reused', true");
    expect(sql.indexOf("'reused', true")).toBeLessThan(
      sql.indexOf('research_materialization_attempt_inconsistent')
    );
    expect(sql).toContain('grant execute on function public.materialize_goal_research_work(');
  });

  it('does not expose trigger helpers as directly callable public functions', () => {
    for (const functionName of [
      'goal_research_touch_updated_at()',
      'goal_research_validate_run_scope()',
      'goal_research_validate_child_scope()',
      'goal_research_validate_assignment_scope()',
    ]) {
      expect(sql).toContain(`revoke all on function public.${functionName} from public`);
      expect(sql).toContain(`revoke all on function public.${functionName} from authenticated`);
    }
  });
});
