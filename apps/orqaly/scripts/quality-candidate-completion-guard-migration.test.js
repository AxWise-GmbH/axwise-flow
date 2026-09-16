import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/221_quality_candidate_completion_guard.sql'),
  'utf8'
);
const uuidDependencyMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/183_data_isolation_backfill.sql'),
  'utf8'
);
const sql = migration.replace(/\s+/g, ' ').trim().toLowerCase();

describe('quality candidate completion guard migration', () => {
  it('holds task writes through one explicit migration transaction', () => {
    const beginIndex = sql.indexOf('begin;');
    const lockIndex = sql.indexOf('lock table public.team_tasks in share mode;');
    const alterIndex = sql.indexOf('alter table public.goals');
    expect(beginIndex).toBeGreaterThanOrEqual(0);
    expect(lockIndex).toBeGreaterThan(beginIndex);
    expect(alterIndex).toBeGreaterThan(lockIndex);
    expect(sql.endsWith('commit;')).toBe(true);
  });

  it('adds a database-owned monotonic revision token', () => {
    expect(sql).toContain('add column if not exists row_version bigint not null default 0');
    expect(sql).toContain('new.row_version := old.row_version + 1');
    expect(sql).toContain("interval '1 microsecond'");
    expect(sql).toContain('coalesce(new.updated_at, clock_timestamp())');
    expect(sql).toContain('coalesce(old.updated_at, clock_timestamp()');
  });

  it('stores immutable revision evidence behind forced RLS', () => {
    expect(sql).toContain('create table if not exists public.goal_quality_artifact_freezes');
    expect(sql).toContain('primary key (goal_id, completion_row_version)');
    expect(sql).toContain('uq_goal_quality_artifact_freezes_active');
    expect(sql).toContain('where released_at is null');
    expect(sql).toContain('force row level security');
    expect(sql).toContain(
      'revoke all on table public.goal_quality_artifact_freezes from service_role'
    );
    expect(sql).toContain(
      'grant select on table public.goal_quality_artifact_freezes to service_role'
    );
    expect(sql).toContain("jsonb_typeof(candidate_set) = 'array'");
    expect(sql).toContain("attestation ->> 'status' = 'passed'");
  });

  it('uses the same CRLF-normalized SHA-256 contract as the application', () => {
    expect(sql).toContain('function public.quality_artifact_sha256(value text)');
    expect(sql).toContain("replace(value, e'\\r\\n', e'\\n')");
    expect(sql).toContain('set search_path = pg_catalog, public, extensions');
  });

  it('atomically completes an exact v2 attestation and candidate snapshot', () => {
    expect(sql).toContain('function public.complete_quality_goal_revision(');
    expect(sql).toContain('p_expected_row_version bigint');
    expect(sql).toContain('p_candidate_artifact text');
    expect(sql).toContain('p_candidate_set jsonb');
    expect(sql).toContain(
      "p_attestation ->> 'version' is distinct from 'prd-quality-attestation-v2'"
    );
    expect(sql).toContain(
      "p_attestation ->> 'ruleset_version' is distinct from 'prd-quality-ruleset-v2'"
    );
    expect(sql).toContain('goal_row.row_version is distinct from p_expected_row_version');
    expect(sql).toContain('candidate set is not an exact tenant-bound set of done artifact rows');
    expect(sql).toContain("jsonb_typeof(p_completion_data -> 'deliverables')");
    expect(sql).toContain("jsonb_array_length(p_completion_data -> 'deliverables') <> 1");
    expect(sql).toContain('quality completion must expose exactly one user-visible deliverable');
    expect(sql).toContain(
      'user-visible deliverable does not uniquely match the selected attested artifact'
    );
    expect(sql).toContain('goal_row.row_version + 1');
    expect(sql).toContain("'status', 'already_completed'");
    expect(sql).toContain("'status', 'completed'");
    expect(sql).not.toContain('on conflict do nothing');
  });

  it('rejects extra or conflicting UI artifacts under the single-artifact v2 contract', () => {
    const completionStart = sql.indexOf(
      'create or replace function public.complete_quality_goal_revision('
    );
    const completionEnd = sql.indexOf(
      'revoke all on function public.complete_quality_goal_revision(',
      completionStart
    );
    const backfillStart = sql.indexOf(
      'do $$ declare goal_row public.goals%rowtype;',
      completionEnd
    );
    const backfillEnd = sql.indexOf(
      'create or replace function public.reopen_quality_goal_revision(',
      backfillStart
    );
    const completion = sql.slice(completionStart, completionEnd);
    const backfill = sql.slice(backfillStart, backfillEnd);

    expect(completion).toContain("jsonb_array_length(p_completion_data -> 'deliverables') <> 1");
    expect(backfill).toContain("jsonb_array_length(goal_row.data -> 'deliverables') <> 1");
    expect(
      completion.indexOf("jsonb_array_length(p_completion_data -> 'deliverables') <> 1")
    ).toBeLessThan(completion.indexOf('into deliverable_match_count'));
    expect(
      backfill.indexOf("jsonb_array_length(goal_row.data -> 'deliverables') <> 1")
    ).toBeLessThan(backfill.indexOf('into deliverable_match_count'));
  });

  it('allows only the matching terminal transition and freezes all scope-bearing fields', () => {
    expect(sql).toContain('matching_terminal_transition :=');
    expect(sql).toContain("old.status = 'pending_validation'");
    expect(sql).toContain('active_freeze.completion_row_version = new.row_version');
    expect(sql).toContain('active_freeze.attestation = new_attestation');
    expect(sql).toContain('active_freeze.candidate_set = coalesce');
    expect(sql).toContain('old.title is distinct from new.title');
    expect(sql).toContain('old.description is distinct from new.description');
    expect(sql).toContain('old.iteration is distinct from new.iteration');
    expect(sql).toContain('old.retrospective is distinct from new.retrospective');
    expect(sql).toContain('and not matching_terminal_transition');
    expect(sql).toContain('before delete on public.goals');
    expect(sql).toContain("old.data - 'axwise_outcome' - 'axwise_outcome_delivery'");
    expect(sql).toContain("new.data - 'axwise_outcome' - 'axwise_outcome_delivery'");
    expect(sql).toContain('when trusted_writer then');
    expect(sql).toContain('else old.data is distinct from new.data');
  });

  it('makes pre-terminal quality state trusted-backend-owned', () => {
    expect(sql).toContain("new.status = 'pending_validation'");
    expect(sql).toContain("new.data ? 'prd_quality_attestation'");
    expect(sql).toContain("new.data ? 'prd_quality_validation'");
    expect(sql).toContain("new.data ? 'prd_quality_repair'");
    expect(sql).toContain(
      "(old.data -> 'prd_quality_attestation') is distinct from (new.data -> 'prd_quality_attestation')"
    );
    expect(sql).toContain('quality validation state may be changed only by the trusted backend');
  });

  it('atomically releases one frozen revision before feedback reopening', () => {
    expect(sql).toContain('function public.reopen_quality_goal_revision(');
    expect(sql).toContain("release_reason = 'feedback_revision'");
    expect(sql).toContain('revision_ref = p_revision_ref');
    expect(sql).toContain("- 'prd_quality_attestation'");
    expect(sql).toContain("- 'prd_quality_validation'");
    expect(sql).toContain("- 'prd_quality_repair'");
    expect(sql).toContain("'status', 'already_reopened'");
    expect(sql).toContain("'status', 'not_frozen'");
    expect(sql).toContain('released_match_count = 1');
  });

  it('serializes final-artifact mutations with the parent goal row', () => {
    expect(sql).toContain(
      'before insert or delete or update of id, title, status, data, goal_id, user_id'
    );
    expect(sql).toContain('from public.goals as goal');
    expect(sql).toContain('for update');
    expect(sql).toContain("target_status in ('active', 'pending_validation')");
    expect(sql).toContain('update public.goals set updated_at = updated_at');
  });

  it('rejects frozen artifact mutations but ignores unrelated task metadata changes', () => {
    const taskGuardStart = sql.indexOf(
      'create or replace function public.guard_quality_completion_team_task_artifact()'
    );
    const taskGuardEnd = sql.indexOf(
      'revoke all on function public.guard_quality_completion_team_task_artifact()',
      taskGuardStart
    );
    const taskGuard = sql.slice(taskGuardStart, taskGuardEnd);
    expect(sql).toContain('select exists (');
    expect(sql).toContain('if target_frozen then');
    expect(sql).toContain("errcode = '55000'");
    expect(sql).toContain("(old.data ->> 'output') is distinct from (new.data ->> 'output')");
    expect(sql).toContain('old.user_id is distinct from new.user_id');
    expect(sql).toContain('if not artifact_mutation then');
    expect(taskGuard).not.toContain('old.data is distinct from new.data');
  });

  it('uses the typed parent first and a validated JSON fallback', () => {
    expect(uuidDependencyMigration).toMatch(
      /create or replace function public\.try_uuid\(v text\)/i
    );
    expect(sql).toContain('old_data_goal_id := public.try_uuid(old_json_goal_text)');
    expect(sql).toContain('old_goal_id := coalesce(old_typed_goal_id, old_data_goal_id)');
    expect(sql).toContain('new_data_goal_id := public.try_uuid(new_json_goal_text)');
    expect(sql).toContain('new_goal_id := coalesce(new_typed_goal_id, new_data_goal_id)');
    expect(sql).toContain('old_typed_goal_id is distinct from old_data_goal_id');
    expect(sql).toContain('new_typed_goal_id is distinct from new_data_goal_id');
    expect(sql).toContain("errcode = '23514'");
    expect(sql).toContain("(old.data ->> 'goal_id') is distinct from (new.data ->> 'goal_id')");
    expect(sql).toContain('security definer');
    expect(sql).toContain('set search_path = pg_catalog, public');
    expect(sql).toContain("request_role text := nullif(auth.role(), '')");
    expect(sql).toContain('request_user_id uuid := auth.uid()');
    expect(sql).toContain('request_user_id is distinct from target_user_id');
    expect(sql).toContain('new.user_id is distinct from target_user_id');
    expect(sql).toContain('artifact task tenant must match its parent goal tenant');
    expect(sql).toContain("errcode = '42501'");
    expect(sql).toContain(
      "coalesce((case when tg_op = 'delete' then old.id else new.id end)::text, '<unknown>')"
    );
    expect(sql).toContain(
      'revoke all on function public.guard_quality_completion_team_task_artifact() from public'
    );
  });

  it('fails migration preflight when an existing done artifact names two parents', () => {
    expect(sql).toContain('from public.team_tasks as task');
    expect(sql).toContain("task.goal_id is distinct from public.try_uuid(task.data ->> 'goal_id')");
    expect(sql).toContain(
      'output-bearing done team_tasks contain conflicting typed and json goal ids'
    );
    expect(sql).toContain('output-bearing done team_tasks contain malformed json goal ids');
  });

  it('backfills completed attestations only from exact tenant-bound evidence', () => {
    expect(sql).toContain("goal.data -> 'prd_quality_attestation' ->> 'status' = 'passed'");
    expect(sql).toContain('task.goal_id = goal_row.id');
    expect(sql).toContain('task.user_id = goal_row.user_id');
    expect(sql).toContain(
      "nullif(btrim(coalesce(task.data ->> 'goal_id', '')), '') is null or public.try_uuid(task.data ->> 'goal_id') = goal_row.id"
    );
    expect(sql).toContain('lacks a durable selected candidate id');
    expect(sql).toContain('lacks a durable candidate set');
    expect(sql).toContain('lacks durable user-visible deliverables');
    expect(sql).toContain("jsonb_array_length(goal_row.data -> 'deliverables') <> 1");
    expect(sql).toContain('does not have exactly one durable user-visible deliverable');
    expect(sql).toContain('has no unique user-visible projection of its selected artifact');
    expect(sql).not.toContain("attestation_value #>> '{repair,task_id}'");
    expect(sql).toContain('match_count <> 1');
    expect(sql).toContain('existing_freeze.artifact_text is distinct from artifact_text_value');
    expect(sql).toContain('existing quality freeze for goal %s disagrees with durable evidence');
  });
});
