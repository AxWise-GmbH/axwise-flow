import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  QUALITY_MIGRATION_PREFLIGHT_CHECKS,
  buildFreezeTableProbeSql,
  buildQualityMigrationPreflightSql,
  projectRefFromUrl,
  runQualityMigrationPreflight,
  runReadOnlyManagementQuery,
} from './preflight-quality-migrations.mjs';

function jsonResponse(payload, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    text: async () => JSON.stringify(payload),
  };
}

function recordingLog() {
  return {
    log: vi.fn(),
    error: vi.fn(),
  };
}

describe('quality migration 220/221 preflight', () => {
  it('enumerates every existing-data abort condition from the two migrations', () => {
    expect(QUALITY_MIGRATION_PREFLIGHT_CHECKS.map((check) => check.code)).toEqual([
      '220_UNSUPPORTED_GOAL_STATUS',
      '221_MALFORMED_TASK_JSON_GOAL_ID',
      '221_CONFLICTING_TASK_GOAL_IDS',
      '221_INVALID_ATTESTATION_HASHES',
      '221_MISSING_SELECTED_CANDIDATE_ID',
      '221_ATTESTED_ARTIFACT_NOT_EXACT',
      '221_MISSING_DELIVERABLE_ARRAY',
      '221_DELIVERABLE_COUNT_NOT_ONE',
      '221_DELIVERABLE_PROJECTION_MISMATCH',
      '221_MISSING_CANDIDATE_SET_ARRAY',
      '221_SELECTED_CANDIDATE_NOT_UNIQUE',
      '221_DUPLICATE_CANDIDATE_IDS',
      '221_NON_VERIFIABLE_CANDIDATE_SET',
      '221_EXISTING_FREEZE_MISMATCH',
    ]);
  });

  it('stays pinned to every explicit data-dependent migration 221 exception', () => {
    const migrationSource = readFileSync(
      path.join(
        process.cwd(),
        'supabase',
        'migrations',
        '221_quality_candidate_completion_guard.sql'
      ),
      'utf8'
    ).replace(/\s+/g, ' ');
    const migrationAbortMessages = [
      'Output-bearing done team_tasks contain malformed JSON goal IDs',
      'Output-bearing done team_tasks contain conflicting typed and JSON goal IDs',
      'Completed quality goal %s has invalid attestation hashes',
      'Completed quality goal %s lacks a durable selected candidate ID',
      'Completed quality goal %s does not resolve to exactly one tenant-bound attested artifact',
      'Completed quality goal %s lacks durable user-visible deliverables',
      'Completed quality goal %s does not have exactly one durable user-visible deliverable',
      'Completed quality goal %s has no unique user-visible projection of its selected artifact',
      'Completed quality goal %s lacks a durable candidate set',
      'Completed quality goal %s has an invalid candidate set',
      'Completed quality goal %s has duplicate candidate identities',
      'Completed quality goal %s has a non-verifiable candidate set',
      'Existing quality freeze for goal %s disagrees with durable evidence',
    ];

    expect(migrationAbortMessages).toHaveLength(
      QUALITY_MIGRATION_PREFLIGHT_CHECKS.filter((check) => check.migration === '221').length
    );
    for (const message of migrationAbortMessages) {
      expect(migrationSource).toContain(message);
    }
  });

  it('mirrors the migration 220 status constraint exactly', () => {
    const sql = buildQualityMigrationPreflightSql();
    const statusCheck = sql.match(/goal\.status not in \(([^)]+)\)/)?.[1] || '';
    expect(statusCheck.match(/'[^']+'/g)).toEqual([
      "'draft'",
      "'feasibility'",
      "'analyzing'",
      "'researching_customer'",
      "'awaiting_context_approval'",
      "'planning'",
      "'forming_team'",
      "'provisioning_tools'",
      "'estimating'",
      "'awaiting_approval'",
      "'authorizing_execution'",
      "'active'",
      "'pending_validation'",
      "'paused'",
      "'completed'",
      "'failed'",
      "'cancelled'",
      "'awaiting_tools'",
      "'awaiting_po_input'",
      "'needs_human'",
    ]);
  });

  it('mirrors task-parent, attestation, deliverable, candidate, tenant, and hash predicates', () => {
    const sql = buildQualityMigrationPreflightSql({ includeExistingFreezes: true });

    for (const check of QUALITY_MIGRATION_PREFLIGHT_CHECKS) {
      expect(sql).toContain(`'${check.code}'`);
    }
    expect(sql).toContain("public.try_uuid(task.data ->> 'goal_id') is null");
    expect(sql).toContain("task.goal_id is distinct from public.try_uuid(task.data ->> 'goal_id')");
    expect(sql).toContain("evidence.artifact_hash !~ '^[0-9a-f]{64}$'");
    expect(sql).toContain("evidence.scope_hash !~ '^[0-9a-f]{64}$'");
    expect(sql).toContain('task.goal_id = goal.goal_id');
    expect(sql).toContain('task.user_id = goal.user_id');
    expect(sql).toContain("evidence.deliverables_type is distinct from 'array'");
    expect(sql).toContain('jsonb_array_length(evidence.deliverables_array) <> 1');
    expect(sql).toContain("deliverable ->> 'id' = evidence.resolved_candidate_id");
    expect(sql).toContain("deliverable ->> 'output' = evidence.artifact_text");
    expect(sql).toContain("evidence.candidate_set_type is distinct from 'array'");
    expect(sql).toContain("count(distinct item ->> 'id')");
    expect(sql).toContain('task.goal_id = evidence.goal_id');
    expect(sql).toContain('task.user_id = evidence.user_id');
    expect(sql).toContain('artifact_freeze.candidate_set is distinct from evidence.candidate_set');
    expect(sql).toContain('artifact_freeze.attestation is distinct from evidence.attestation');
  });

  it('only includes the existing-freeze check when the migration table already exists', () => {
    expect(buildQualityMigrationPreflightSql()).not.toContain("'221_EXISTING_FREEZE_MISMATCH'");
    expect(buildQualityMigrationPreflightSql({ includeExistingFreezes: true })).toContain(
      "'221_EXISTING_FREEZE_MISMATCH'"
    );
    expect(buildFreezeTableProbeSql()).toMatch(/^select\b/i);
  });

  it('derives the project ref using existing Supabase URL conventions', () => {
    expect(projectRefFromUrl('https://projectref.supabase.co')).toBe('projectref');
    expect(projectRefFromUrl('https://another123.supabase.com/rest/v1')).toBe('another123');
    expect(projectRefFromUrl('https://example.com')).toBeNull();
  });

  it('refuses mutating SQL before making a Management API request', async () => {
    const fetchImpl = vi.fn();
    await expect(
      runReadOnlyManagementQuery({
        ref: 'projectref',
        token: 'secret-token',
        query: 'update public.goals set status = status',
        fetchImpl,
      })
    ).rejects.toThrow(/non-read-only|mutating/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('passes with two read-only queries and never logs credentials', async () => {
    const token = 'secret-token-that-must-not-be-logged';
    const calls = [];
    const fetchImpl = vi.fn(async (_url, options) => {
      calls.push(options);
      return calls.length === 1 ? jsonResponse([{ freeze_table_exists: false }]) : jsonResponse([]);
    });
    const log = recordingLog();

    await expect(
      runQualityMigrationPreflight({
        env: { SUPABASE_ACCESS_TOKEN: token, SUPABASE_PROJECT_REF: 'projectref' },
        log,
        fetchImpl,
      })
    ).resolves.toBe(0);

    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call.method).toBe('POST');
      expect(call.headers.Authorization).toBe(`Bearer ${token}`);
      const query = JSON.parse(call.body).query;
      expect(query).toMatch(/^\s*(?:select|with)\b/i);
      expect(query).not.toMatch(
        /\b(?:insert|update|delete|alter|drop|create|truncate|grant|revoke)\b/i
      );
    }
    const output = [...log.log.mock.calls.flat(), ...log.error.mock.calls.flat()].join('\n');
    expect(output).not.toContain(token);
    expect(output).toContain('preflight passed');
  });

  it('reports known blockers with sanitized samples and no remote-controlled details', async () => {
    const token = 'another-secret-token';
    const responses = [
      [{ freeze_table_exists: true }],
      [
        {
          issue_code: '221_INVALID_ATTESTATION_HASHES',
          affected_count: '2',
          sample_ids: ['goal-safe', 'sensitive value with spaces'],
          description: token,
        },
        {
          issue_code: 'UNKNOWN_REMOTE_CODE',
          affected_count: 99,
          sample_ids: [token],
        },
      ],
    ];
    const fetchImpl = vi.fn(async () => jsonResponse(responses.shift()));
    const log = recordingLog();

    await expect(
      runQualityMigrationPreflight({
        env: {
          SUPABASE_ACCESS_TOKEN: token,
          SUPABASE_URL: 'https://projectref.supabase.co',
        },
        log,
        fetchImpl,
      })
    ).resolves.toBe(1);

    const output = log.error.mock.calls.flat().join('\n');
    expect(output).toContain('221_INVALID_ATTESTATION_HASHES');
    expect(output).toContain('goal-safe');
    expect(output).toContain('<redacted-id>');
    expect(output).toContain('Unknown preflight finding');
    expect(output).not.toContain(token);
  });

  it('fails closed without credentials or when the API fails, without echoing secrets', async () => {
    const missingLog = recordingLog();
    await expect(
      runQualityMigrationPreflight({ env: {}, log: missingLog, fetchImpl: vi.fn() })
    ).resolves.toBe(2);

    const token = 'never-print-this-token';
    const errorLog = recordingLog();
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ message: `database detail and ${token}` }, { ok: false, status: 403 })
    );
    await expect(
      runQualityMigrationPreflight({
        env: { SUPABASE_ACCESS_TOKEN: token, SUPABASE_PROJECT_REF: 'projectref' },
        log: errorLog,
        fetchImpl,
      })
    ).resolves.toBe(2);

    const output = errorLog.error.mock.calls.flat().join('\n');
    expect(output).toContain('HTTP 403');
    expect(output).not.toContain(token);
    expect(output).not.toContain('database detail');
  });
});
