#!/usr/bin/env node
/**
 * Read-only production preflight for migrations 220 and 221.
 *
 * The checks below intentionally mirror every existing-row condition that can
 * abort those migrations. Queries are sent through the same Supabase
 * Management API convention as apply-migration.mjs, but only static SELECT/WITH
 * statements are accepted. No credential, response body, or artifact text is
 * logged.
 *
 * Usage:
 *   node scripts/preflight-quality-migrations.mjs
 *
 * Required environment:
 *   SUPABASE_ACCESS_TOKEN
 *   SUPABASE_PROJECT_REF, or SUPABASE_URL / VITE_SUPABASE_URL
 */
import { pathToFileURL } from 'node:url';
import { config } from 'dotenv';

const ALLOWED_GOAL_STATUSES_220 = Object.freeze([
  'draft',
  'feasibility',
  'analyzing',
  'researching_customer',
  'awaiting_context_approval',
  'planning',
  'forming_team',
  'provisioning_tools',
  'estimating',
  'awaiting_approval',
  'authorizing_execution',
  'active',
  'pending_validation',
  'paused',
  'completed',
  'failed',
  'cancelled',
  'awaiting_tools',
  'awaiting_po_input',
  'needs_human',
]);

export const QUALITY_MIGRATION_PREFLIGHT_CHECKS = Object.freeze([
  {
    code: '220_UNSUPPORTED_GOAL_STATUS',
    migration: '220',
    description: 'goal rows use statuses rejected by the replacement goals_status_check',
  },
  {
    code: '221_MALFORMED_TASK_JSON_GOAL_ID',
    migration: '221',
    description: 'output-bearing done tasks contain malformed JSON goal IDs',
  },
  {
    code: '221_CONFLICTING_TASK_GOAL_IDS',
    migration: '221',
    description: 'output-bearing done tasks contain conflicting typed and JSON goal IDs',
  },
  {
    code: '221_INVALID_ATTESTATION_HASHES',
    migration: '221',
    description: 'completed passed-quality goals have invalid artifact or scope hashes',
  },
  {
    code: '221_MISSING_SELECTED_CANDIDATE_ID',
    migration: '221',
    description: 'completed passed-quality goals lack a durable selected candidate ID',
  },
  {
    code: '221_ATTESTED_ARTIFACT_NOT_EXACT',
    migration: '221',
    description: 'completed passed-quality goals do not resolve to one tenant-bound attested task',
  },
  {
    code: '221_MISSING_DELIVERABLE_ARRAY',
    migration: '221',
    description: 'completed passed-quality goals lack a durable deliverables array',
  },
  {
    code: '221_DELIVERABLE_COUNT_NOT_ONE',
    migration: '221',
    description: 'completed passed-quality goals do not have exactly one durable deliverable',
  },
  {
    code: '221_DELIVERABLE_PROJECTION_MISMATCH',
    migration: '221',
    description: 'completed passed-quality goals lack one exact selected-artifact projection',
  },
  {
    code: '221_MISSING_CANDIDATE_SET_ARRAY',
    migration: '221',
    description: 'completed passed-quality goals lack a durable candidate-set array',
  },
  {
    code: '221_SELECTED_CANDIDATE_NOT_UNIQUE',
    migration: '221',
    description: 'selected candidates do not occur exactly once with the attested hash',
  },
  {
    code: '221_DUPLICATE_CANDIDATE_IDS',
    migration: '221',
    description: 'completed passed-quality goals contain duplicate candidate identities',
  },
  {
    code: '221_NON_VERIFIABLE_CANDIDATE_SET',
    migration: '221',
    description: 'candidate sets contain malformed or non-tenant-bound artifact rows',
  },
  {
    code: '221_EXISTING_FREEZE_MISMATCH',
    migration: '221',
    description: 'existing active quality freezes disagree with durable completion evidence',
  },
]);

const CHECK_BY_CODE = new Map(
  QUALITY_MIGRATION_PREFLIGHT_CHECKS.map((check) => [check.code, check])
);

export function projectRefFromUrl(url) {
  const match = /^https:\/\/([a-z0-9]+)\.supabase\.(?:co|com)(?:\/|$)/i.exec(String(url || ''));
  return match ? match[1] : null;
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function assertReadOnlySql(query) {
  const sql = String(query || '').trim();
  if (!/^(?:select|with)\b/i.test(sql)) {
    throw new Error('Refusing to execute a non-read-only preflight query');
  }
  if (
    /\b(?:insert|update|delete|alter|drop|create|truncate|grant|revoke|comment|call|do)\b/i.test(
      sql
    )
  ) {
    throw new Error('Refusing to execute a mutating preflight query');
  }
  if (/;\s*\S/.test(sql)) {
    throw new Error('Refusing to execute multiple preflight statements');
  }
}

function normalizeQueryRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.result)) return payload.result;
  if (Array.isArray(payload?.data)) return payload.data;
  throw new Error('Supabase Management API returned an unexpected query result shape');
}

export async function runReadOnlyManagementQuery({ ref, token, query, fetchImpl = fetch }) {
  assertReadOnlySql(query);
  const response = await fetchImpl(
    `https://api.supabase.com/v1/projects/${encodeURIComponent(ref)}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    }
  );

  if (!response.ok) {
    // The response body can echo database details. Deliberately do not print it.
    throw new Error(`Supabase Management API read-only query failed (HTTP ${response.status})`);
  }

  let payload;
  try {
    payload = JSON.parse(await response.text());
  } catch {
    throw new Error('Supabase Management API returned invalid JSON');
  }
  return normalizeQueryRows(payload);
}

export function buildFreezeTableProbeSql() {
  return `select to_regclass('public.goal_quality_artifact_freezes') is not null as freeze_table_exists;`;
}

export function buildQualityMigrationPreflightSql({ includeExistingFreezes = false } = {}) {
  const allowedStatuses = ALLOWED_GOAL_STATUSES_220.map(sqlLiteral).join(', ');
  const freezeMismatch = includeExistingFreezes
    ? `
  union all
  select
    '221_EXISTING_FREEZE_MISMATCH',
    evidence.goal_id::text
  from quality_evidence as evidence
  where exists (
    select 1
    from public.goal_quality_artifact_freezes as artifact_freeze
    where artifact_freeze.goal_id = evidence.goal_id
      and artifact_freeze.released_at is null
      and (
        artifact_freeze.artifact_hash is distinct from evidence.artifact_hash
        or artifact_freeze.scope_hash is distinct from evidence.scope_hash
        or artifact_freeze.candidate_id is distinct from evidence.resolved_candidate_id
        or artifact_freeze.candidate_set is distinct from evidence.candidate_set
        or artifact_freeze.artifact_text is distinct from evidence.artifact_text
        or artifact_freeze.attestation is distinct from evidence.attestation
      )
  )`
    : '';

  return `with completed_quality_goals as (
  select
    goal.id as goal_id,
    goal.user_id,
    goal.data,
    goal.data -> 'prd_quality_attestation' as attestation,
    lower(coalesce(goal.data #>> '{prd_quality_attestation,artifact_hash}', '')) as artifact_hash,
    lower(coalesce(goal.data #>> '{prd_quality_attestation,scope_hash}', '')) as scope_hash,
    nullif(btrim(coalesce(goal.data #>> '{prd_quality_validation,candidate_id}', '')), '')
      as candidate_id,
    goal.data #> '{prd_quality_validation,candidate_set}' as candidate_set,
    goal.data -> 'deliverables' as deliverables
  from public.goals as goal
  where goal.status in ('completed', 'completed_with_warnings')
    and goal.data -> 'prd_quality_attestation' ->> 'status' = 'passed'
),
quality_evidence as (
  select
    goal.*,
    jsonb_typeof(goal.candidate_set) as candidate_set_type,
    case
      when jsonb_typeof(goal.candidate_set) = 'array' then goal.candidate_set
      else '[]'::jsonb
    end as candidate_set_array,
    jsonb_typeof(goal.deliverables) as deliverables_type,
    case
      when jsonb_typeof(goal.deliverables) = 'array' then goal.deliverables
      else '[]'::jsonb
    end as deliverables_array,
    selected_task.match_count,
    selected_task.resolved_candidate_id,
    selected_task.artifact_text
  from completed_quality_goals as goal
  left join lateral (
    select
      count(*)::integer as match_count,
      max(task.id) as resolved_candidate_id,
      max(task.data ->> 'output') as artifact_text
    from public.team_tasks as task
    where task.id = goal.candidate_id
      and task.goal_id = goal.goal_id
      and task.user_id = goal.user_id
      and lower(coalesce(task.status, '')) = 'done'
      and (
        nullif(btrim(coalesce(task.data ->> 'goal_id', '')), '') is null
        or public.try_uuid(task.data ->> 'goal_id') = goal.goal_id
      )
      and nullif(btrim(coalesce(task.data ->> 'output', '')), '') is not null
      and encode(
        extensions.digest(replace(task.data ->> 'output', E'\\r\\n', E'\\n'), 'sha256'),
        'hex'
      ) = goal.artifact_hash
  ) as selected_task on true
),
issues(issue_code, entity_id) as (
  select
    '220_UNSUPPORTED_GOAL_STATUS',
    goal.id::text
  from public.goals as goal
  where goal.status is not null
    and goal.status not in (${allowedStatuses})

  union all
  select
    '221_MALFORMED_TASK_JSON_GOAL_ID',
    task.id::text
  from public.team_tasks as task
  where lower(coalesce(task.status, '')) = 'done'
    and nullif(btrim(coalesce(task.data ->> 'output', '')), '') is not null
    and nullif(btrim(coalesce(task.data ->> 'goal_id', '')), '') is not null
    and public.try_uuid(task.data ->> 'goal_id') is null

  union all
  select
    '221_CONFLICTING_TASK_GOAL_IDS',
    task.id::text
  from public.team_tasks as task
  where lower(coalesce(task.status, '')) = 'done'
    and nullif(btrim(coalesce(task.data ->> 'output', '')), '') is not null
    and task.goal_id is not null
    and public.try_uuid(task.data ->> 'goal_id') is not null
    and task.goal_id is distinct from public.try_uuid(task.data ->> 'goal_id')

  union all
  select
    '221_INVALID_ATTESTATION_HASHES',
    evidence.goal_id::text
  from quality_evidence as evidence
  where evidence.artifact_hash !~ '^[0-9a-f]{64}$'
    or evidence.scope_hash !~ '^[0-9a-f]{64}$'

  union all
  select
    '221_MISSING_SELECTED_CANDIDATE_ID',
    evidence.goal_id::text
  from quality_evidence as evidence
  where evidence.candidate_id is null

  union all
  select
    '221_ATTESTED_ARTIFACT_NOT_EXACT',
    evidence.goal_id::text
  from quality_evidence as evidence
  where evidence.match_count <> 1
    or evidence.resolved_candidate_id is null

  union all
  select
    '221_MISSING_DELIVERABLE_ARRAY',
    evidence.goal_id::text
  from quality_evidence as evidence
  where evidence.deliverables_type is distinct from 'array'

  union all
  select
    '221_DELIVERABLE_COUNT_NOT_ONE',
    evidence.goal_id::text
  from quality_evidence as evidence
  where evidence.deliverables_type = 'array'
    and jsonb_array_length(evidence.deliverables_array) <> 1

  union all
  select
    '221_DELIVERABLE_PROJECTION_MISMATCH',
    evidence.goal_id::text
  from quality_evidence as evidence
  where evidence.match_count = 1
    and evidence.resolved_candidate_id is not null
    and evidence.deliverables_type = 'array'
    and jsonb_array_length(evidence.deliverables_array) = 1
    and (
      select count(*)
      from jsonb_array_elements(evidence.deliverables_array) as deliverable
      where jsonb_typeof(deliverable) = 'object'
        and deliverable ->> 'id' = evidence.resolved_candidate_id
        and deliverable ->> 'output' = evidence.artifact_text
        and encode(
          extensions.digest(replace(deliverable ->> 'output', E'\\r\\n', E'\\n'), 'sha256'),
          'hex'
        ) = evidence.artifact_hash
    ) <> 1

  union all
  select
    '221_MISSING_CANDIDATE_SET_ARRAY',
    evidence.goal_id::text
  from quality_evidence as evidence
  where evidence.candidate_set_type is distinct from 'array'

  union all
  select
    '221_SELECTED_CANDIDATE_NOT_UNIQUE',
    evidence.goal_id::text
  from quality_evidence as evidence
  where evidence.candidate_set_type = 'array'
    and (
      select count(*)
      from jsonb_array_elements(evidence.candidate_set_array) as item
      where item ->> 'id' = evidence.resolved_candidate_id
        and lower(coalesce(item ->> 'artifact_hash', '')) = evidence.artifact_hash
    ) <> 1

  union all
  select
    '221_DUPLICATE_CANDIDATE_IDS',
    evidence.goal_id::text
  from quality_evidence as evidence
  where evidence.candidate_set_type = 'array'
    and (
      select count(*)
      from jsonb_array_elements(evidence.candidate_set_array)
    ) is distinct from (
      select count(distinct item ->> 'id')
      from jsonb_array_elements(evidence.candidate_set_array) as item
    )

  union all
  select
    '221_NON_VERIFIABLE_CANDIDATE_SET',
    evidence.goal_id::text
  from quality_evidence as evidence
  where evidence.candidate_set_type = 'array'
    and exists (
      select 1
      from jsonb_array_elements(evidence.candidate_set_array) as item
      where jsonb_typeof(item) is distinct from 'object'
        or nullif(btrim(coalesce(item ->> 'id', '')), '') is null
        or lower(coalesce(item ->> 'artifact_hash', '')) !~ '^[0-9a-f]{64}$'
        or not exists (
          select 1
          from public.team_tasks as task
          where task.id = item ->> 'id'
            and task.goal_id = evidence.goal_id
            and task.user_id = evidence.user_id
            and lower(coalesce(task.status, '')) = 'done'
            and (
              nullif(btrim(coalesce(task.data ->> 'goal_id', '')), '') is null
              or public.try_uuid(task.data ->> 'goal_id') = evidence.goal_id
            )
            and nullif(btrim(coalesce(task.data ->> 'output', '')), '') is not null
            and encode(
              extensions.digest(
                replace(task.data ->> 'output', E'\\r\\n', E'\\n'),
                'sha256'
              ),
              'hex'
            ) = lower(item ->> 'artifact_hash')
        )
    )${freezeMismatch}
)
select
  issue_code,
  count(distinct entity_id)::integer as affected_count,
  (array_agg(distinct entity_id order by entity_id))[1:20] as sample_ids
from issues
group by issue_code
order by issue_code;`;
}

function safeSampleId(value) {
  const text = String(value || '');
  return /^[a-zA-Z0-9_.:-]{1,128}$/.test(text) ? text : '<redacted-id>';
}

function freezeTableExists(rows) {
  const value = rows?.[0]?.freeze_table_exists;
  return value === true || value === 'true' || value === 't' || value === 1 || value === '1';
}

export async function runQualityMigrationPreflight({
  env = process.env,
  log = console,
  fetchImpl = fetch,
} = {}) {
  const token = env.SUPABASE_ACCESS_TOKEN;
  const ref =
    env.SUPABASE_PROJECT_REF || projectRefFromUrl(env.SUPABASE_URL || env.VITE_SUPABASE_URL);
  if (!token || !ref) {
    log.error(
      'Missing SUPABASE_ACCESS_TOKEN and/or SUPABASE_PROJECT_REF (or SUPABASE_URL/VITE_SUPABASE_URL)'
    );
    return 2;
  }

  let issueRows;
  try {
    const probeRows = await runReadOnlyManagementQuery({
      ref,
      token,
      query: buildFreezeTableProbeSql(),
      fetchImpl,
    });
    issueRows = await runReadOnlyManagementQuery({
      ref,
      token,
      query: buildQualityMigrationPreflightSql({
        includeExistingFreezes: freezeTableExists(probeRows),
      }),
      fetchImpl,
    });
  } catch (error) {
    log.error(error instanceof Error ? error.message : 'Quality migration preflight failed');
    return 2;
  }

  if (issueRows.length === 0) {
    log.log(
      'Quality migration preflight passed: migrations 220 and 221 have no existing-data blockers.'
    );
    return 0;
  }

  log.error('Quality migration preflight found existing-data blockers:');
  for (const row of issueRows) {
    const check = CHECK_BY_CODE.get(String(row?.issue_code || ''));
    if (!check) {
      log.error('- Unknown preflight finding returned by the database (details withheld)');
      continue;
    }
    const affectedCount = Number.isSafeInteger(Number(row.affected_count))
      ? Number(row.affected_count)
      : 0;
    const sampleIds = Array.isArray(row.sample_ids)
      ? row.sample_ids.slice(0, 20).map(safeSampleId)
      : [];
    const samples = sampleIds.length > 0 ? `; sample IDs: ${sampleIds.join(', ')}` : '';
    log.error(
      `- Migration ${check.migration} [${check.code}]: ${affectedCount} affected; ${check.description}${samples}`
    );
  }
  log.error('Resolve every blocker before applying migration 220 or 221. No data was changed.');
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  config({ path: ['.env.local', '.env'], quiet: true });
  process.exit(await runQualityMigrationPreflight());
}
