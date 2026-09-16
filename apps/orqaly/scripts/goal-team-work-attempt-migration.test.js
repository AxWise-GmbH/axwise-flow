import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/222_goal_team_work_attempt.sql'),
  'utf8'
);
const sql = migration.replace(/\s+/g, ' ').trim().toLowerCase();

function functionBody() {
  const start = sql.indexOf('create or replace function public.materialize_goal_team_work(');
  const end = sql.indexOf('revoke all on function public.materialize_goal_team_work(', start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return sql.slice(start, end);
}

function topLevelSqlItems(value) {
  const items = [];
  let start = 0;
  let depth = 0;
  let quoted = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === "'") {
      if (quoted && value[index + 1] === "'") index += 1;
      else quoted = !quoted;
    } else if (!quoted && character === '(') depth += 1;
    else if (!quoted && character === ')') depth -= 1;
    else if (!quoted && depth === 0 && character === ',') {
      items.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  items.push(value.slice(start).trim());
  return items;
}

describe('goal team-work attempt migration', () => {
  it('publishes one fixed-search-path service-role-only RPC', () => {
    expect(sql).toContain('create or replace function public.materialize_goal_team_work(');
    expect(sql).toContain('security definer set search_path = pg_catalog, public');
    for (const role of ['public', 'anon', 'authenticated']) {
      expect(sql).toMatch(
        new RegExp(
          `revoke all on function public\\.materialize_goal_team_work\\([\\s\\S]*?\\) from ${role};`
        )
      );
    }
    expect(sql).toMatch(
      /grant execute on function public\.materialize_goal_team_work\([\s\S]*?\) to service_role;/
    );
    expect(sql.indexOf('begin;')).toBeLessThan(
      sql.indexOf('create or replace function public.materialize_goal_team_work(')
    );
    expect(sql.endsWith('commit;')).toBe(true);
  });

  it('locks the goal and requires exact tenant, lifecycle, and formation-attempt ownership', () => {
    const body = functionBody();
    const lock = body.indexOf('pg_advisory_xact_lock');
    const rowLock = body.indexOf('from public.goals as goal', lock);
    const ownership = body.indexOf("goal_row.status is distinct from 'forming_team'", rowLock);
    const attempt = body.indexOf(
      "common_attempt ->> 'attempt_id' is distinct from p_formation_attempt",
      ownership
    );
    const materializing = body.indexOf(
      "common_attempt ->> 'status' is distinct from 'materializing'",
      attempt
    );
    expect(lock).toBeGreaterThanOrEqual(0);
    expect(rowLock).toBeGreaterThan(lock);
    expect(body.indexOf('for update;', rowLock)).toBeGreaterThan(rowLock);
    expect(ownership).toBeGreaterThan(rowLock);
    expect(attempt).toBeGreaterThan(ownership);
    expect(materializing).toBeGreaterThan(attempt);
    expect(body).toContain('goal_row.user_id is distinct from p_user_id');
  });

  it('cannot downgrade a native attempt and revalidates canonical Gate 1 state', () => {
    const body = functionBody();
    expect(body).toContain('team_work_native_scope_hash_required');
    expect(body).toContain('native_attempt is distinct from common_attempt');
    expect(body).toContain("native_attempt ->> 'scope_hash' is distinct from p_native_scope_hash");
    expect(body).toContain(
      "goal_row.data #>> '{axwise_customer_intelligence,scope_packet,scope_hash}' is distinct from p_native_scope_hash"
    );
    expect(body).toContain(
      "goal_row.data #>> '{axwise_customer_intelligence,scope_validation,ready_for_synthesis}' is distinct from 'true'"
    );
    expect(body).toContain(
      "goal_row.data #>> '{scope_admission,status}' is distinct from 'accepted'"
    );
    expect(body).toContain(
      "goal_row.data #>> '{work_shape_route,authoritative_scope}' is distinct from 'true'"
    );
    expect(body).toContain(
      "goal_row.data #>> '{goal_approvals,context,status}' is distinct from 'approved'"
    );
    expect(body).toContain(
      "goal_row.data #>> '{goal_approvals,context,snapshot,native_scope_contract,scope_hash}' is distinct from p_native_scope_hash"
    );
    expect(body).toContain('team_work_native_context_approval_stale');
    expect(body).toContain(
      "planning_attempt ->> 'version' is distinct from 'orqaly_native_planning_attempt_v1'"
    );
    expect(body).toContain("planning_attempt ->> 'status' is distinct from 'completed'");
    expect(body).toContain("goal_row.plan is distinct from planning_attempt -> 'plan_snapshot'");
    expect(body).toContain(
      "common_attempt ->> 'planning_attempt_id' is distinct from planning_attempt ->> 'attempt_id'"
    );
  });

  it('validates complete tenant/goal/attempt-bound arrays before persistence', () => {
    const body = functionBody();
    const validation = body.indexOf('team_work_materialization_ids_not_unique');
    const firstRetirement = body.indexOf('update public.team_tasks', validation);
    expect(validation).toBeGreaterThanOrEqual(0);
    expect(firstRetirement).toBeGreaterThan(validation);
    expect(body).toContain("item ->> 'goal_id' is distinct from p_goal_id::text");
    expect(body).toContain("item ->> 'user_id' is distinct from p_user_id::text");
    expect(body).toContain(
      "item ->> 'materialization_attempt' is distinct from p_formation_attempt"
    );
    expect(body).toContain('team_work_materialization_task_job_binding_invalid');
    expect(body).toContain("item #>> '{data,goal_id}' is distinct from p_goal_id::text");
    expect(body).toContain(
      "item #>> '{data,materialization_attempt}' is distinct from coalesce(p_research_attempt_key, p_formation_attempt)"
    );
  });

  it('atomically owns an optional goal team and its exact active roster', () => {
    const body = functionBody();
    expect(body).toContain('p_team jsonb default null');
    expect(body).toContain("p_member_ids jsonb default '[]'::jsonb");
    expect(body).toContain('team_work_members_without_team_forbidden');
    expect(body).toContain('team_work_team_contains_unauthorized_agent');
    expect(body).toContain("agent.status = 'active'");
    expect(body).toContain('agent.user_id = p_user_id');
    expect(body).toContain('team_work_team_contains_out_of_org_agent');
    expect(body).toContain('membership.org_id = goal_row.org_id');
    expect(body).toContain('membership.user_id = p_user_id');
    expect(body).toContain('insert into public.agent_teams (');
    expect(body).toContain('delete from public.agent_team_members');
    expect(body).toContain('insert into public.agent_team_members');
    expect(body).toContain('insert into public.org_teams');
    expect(body).toContain('team_work_preassigned_team_not_owned');
    expect(body).toContain('team_work_preassigned_team_roster_not_authorized');
    expect(body).toContain('team_work_materialized_team_required');
    expect(body).toContain('team_work_manifest_agent_not_in_materialized_team');
    expect(body).toContain("membership.member_id::text = item ->> 'assigned_agent_id'");
    expect(body).toContain("agent.status is distinct from 'active'");
    expect(body).toContain('organization_agent.agent_id = membership.member_id::text');
    expect(body).toContain('agent_team_id = coalesce(materialized_team_id, agent_team_id)');
    expect(body).toContain("'team_id', materialized_team_id");

    const preassignedBranch = body.indexOf('materialized_team_id := goal_row.agent_team_id');
    const requiredTeam = body.indexOf('team_work_materialized_team_required', preassignedBranch);
    const organizationMapping = body.indexOf(
      'insert into public.org_teams (user_id, org_id, team_id)',
      requiredTeam
    );
    const manifestAuthorization = body.indexOf(
      'team_work_manifest_agent_not_in_materialized_team',
      organizationMapping
    );
    expect(preassignedBranch).toBeGreaterThanOrEqual(0);
    expect(requiredTeam).toBeGreaterThan(preassignedBranch);
    expect(organizationMapping).toBeGreaterThan(requiredTeam);
    expect(manifestAuthorization).toBeGreaterThan(organizationMapping);
  });

  it('delegates research persistence and accepts only an exactly marked reuse', () => {
    const body = functionBody();
    expect(body).toContain('research_result := public.materialize_goal_research_work(');
    expect(body).toContain('team_work_research_materialization_count_mismatch');
    expect(body).toContain('team_work_research_materialization_result_invalid');
    expect(body).toContain('team_work_research_materialization_attempt_mismatch');
    expect(body).toContain('team_work_research_reuse_marker_invalid');
    expect(body).toContain(
      "goal_row.data #>> '{research_materialization,attempt_key}' is distinct from p_research_attempt_key"
    );
    expect(body).toContain(
      "goal_row.data #>> '{research_materialization,research_run_id}' is distinct from p_research_run_id::text"
    );
    expect(body).toContain("research_result ->> 'reused' = 'true'");
    expect(body).toContain("expected_final_status := 'forming_team'");
    expect(body).toContain("expected_final_status := 'provisioning_tools'");
    // No exception block may swallow a delegated failure and commit partial work.
    expect(body).not.toMatch(/exception\s+when[\s\S]*materialize_goal_research_work/);
  });

  it('retires only superseded unfinished nonresearch rows and preserves current/history', () => {
    const body = functionBody();
    const taskRetirement = body.indexOf('update public.team_tasks');
    const jobRetirement = body.indexOf('update public.jobs', taskRetirement);
    const jobInsert = body.indexOf('insert into public.jobs', jobRetirement);
    const taskInsert = body.indexOf('insert into public.team_tasks', jobInsert);
    expect(taskRetirement).toBeGreaterThanOrEqual(0);
    expect(jobRetirement).toBeGreaterThan(taskRetirement);
    expect(jobInsert).toBeGreaterThan(jobRetirement);
    expect(taskInsert).toBeGreaterThan(jobInsert);
    const retirementSql = body.slice(taskRetirement, jobInsert);
    expect(retirementSql.match(/materialization_attempt is not null/g)).toHaveLength(2);
    expect(
      retirementSql.match(/materialization_attempt is distinct from p_formation_attempt/g)
    ).toHaveLength(2);
    expect(retirementSql).toContain("status in ('planned', 'todo', 'in_progress', 'inprogress')");
    expect(retirementSql).toContain("status = 'active'");
    expect(retirementSql).not.toContain("status = 'completed'");
    expect(body).toContain("current_setting('orqaly.test_fail_team_materialization', true)");
  });

  it('keeps each INSERT column list aligned with its SELECT projection', () => {
    const body = functionBody();
    const jobInsert = body.match(
      /insert into public\.jobs \(([^)]*)\) select ([\s\S]*?) from jsonb_array_elements\(p_jobs\) item;/
    );
    const taskInsert = body.match(
      /insert into public\.team_tasks \(([^)]*)\) select ([\s\S]*?) from jsonb_array_elements\(p_tasks\) item;/
    );
    expect(jobInsert).not.toBeNull();
    expect(taskInsert).not.toBeNull();
    expect(topLevelSqlItems(jobInsert[1])).toHaveLength(10);
    expect(topLevelSqlItems(jobInsert[2])).toHaveLength(10);
    expect(topLevelSqlItems(taskInsert[1])).toHaveLength(16);
    expect(topLevelSqlItems(taskInsert[2])).toHaveLength(16);
  });

  it('completes both attempt aliases and the goal in one exact final update', () => {
    const body = functionBody();
    expect(body).toContain("'status', 'completed'");
    expect(body).toContain("'{team_formation_attempt}'");
    expect(body).toContain("'{native_team_formation_attempt}'");
    expect(body).toContain("'{team_work_materialization}'");
    expect(body).toContain("set status = 'provisioning_tools'");
    expect(body).toContain('and status = expected_final_status');
    expect(body).toContain("and data #>> '{team_formation_attempt,status}' = 'materializing'");
    expect(body).toContain('team_work_formation_attempt_lost_before_commit');
    expect(body).toContain("'completed_at', completed_at_value");
    expect(body).toContain("'reused', false");
  });

  it('reloads delegated goal data before the final JSON patch', () => {
    const body = functionBody();
    const delegate = body.indexOf('research_result := public.materialize_goal_research_work(');
    const reload = body.indexOf('select data into next_goal_data from public.goals', delegate);
    const finalUpdate = body.indexOf('update public.goals', reload);
    expect(reload).toBeGreaterThan(delegate);
    expect(finalUpdate).toBeGreaterThan(reload);
  });
});
