import { describe, expect, it, vi } from 'vitest';
import {
  decideExecutableActionWithClient,
  insertExecutableActionWithClient,
  loadLatestExecutableActionWithClient,
} from './executable-action-repository.js';

const TENANT_ID = '10000000-0000-4000-8000-000000000001';
const RUN_ID = '20000000-0000-4000-8000-000000000002';
const ACTION_ID = '30000000-0000-4000-8000-000000000003';
const USER_ID = 'user_repository1';

function action(overrides = {}) {
  return {
    tenant_id: TENANT_ID,
    id: ACTION_ID,
    workflow_run_id: RUN_ID,
    owner_user_id: USER_ID,
    status: 'proposed',
    row_version: 0,
    approval_expires_at: new Date('2026-09-04T21:00:00.000Z'),
    approval_idempotency_key: null,
    approval_decision_hash: null,
    execution_deadline_at: null,
    ...overrides,
  };
}

function approvalDecision(overrides = {}) {
  return {
    tenantId: TENANT_ID,
    actionId: ACTION_ID,
    ownerUserId: USER_ID,
    expectedRowVersion: 0,
    idempotencyKey: 'approval-repository-001',
    decision: 'approve',
    decisionHash: 'a'.repeat(64),
    reason: null,
    decidedAt: '2026-09-04T20:00:00.000Z',
    attemptId: '40000000-0000-4000-8000-000000000004',
    grantId: '50000000-0000-4000-8000-000000000005',
    grantReferenceHash: 'b'.repeat(64),
    grantScopeHash: 'c'.repeat(64),
    organizationId: TENANT_ID,
    workspaceId: TENANT_ID,
    runId: RUN_ID,
    stepId: '60000000-0000-4000-8000-000000000006',
    effectId: '70000000-0000-4000-8000-000000000007',
    grantIssuedAt: '2026-09-04T20:00:00.000Z',
    grantExpiresAt: '2026-09-04T20:01:25.000Z',
    executionDeadlineAt: '2026-09-04T20:01:30.000Z',
    envelope: { version: 'test-envelope' },
    ...overrides,
  };
}

describe('WorkflowV2 executable action repository crash safety', () => {
  it('requires a locked, expired-unused-grant proof before replacing an ambiguous action', async () => {
    const unknown = action({ status: 'outcome_unknown' });
    const client = {
      query: vi.fn(async (sql) => {
        if (sql.includes('FROM orqaly.workflow_runs')) return { rows: [{ id: RUN_ID }] };
        if (sql.includes('ORDER BY created_at, id')) return { rows: [unknown] };
        if (sql.includes('executable_action_not_applied'))
          return { rows: [{ not_applied: false }] };
        return { rows: [] };
      }),
    };
    await expect(
      insertExecutableActionWithClient(client, {
        tenantId: TENANT_ID,
        runId: RUN_ID,
        ownerUserId: USER_ID,
        proposalIdempotencyKey: 'new-proposal-001',
      })
    ).rejects.toMatchObject({ code: 'EXECUTABLE_ACTION_REQUIRES_RECONCILIATION' });
    expect(client.query.mock.calls[0][0]).toContain('pg_advisory_xact_lock');
    expect(client.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO'))).toBe(false);
  });

  it('exposes recovery only after the database proves the previous effect absent', async () => {
    const unknown = action({ status: 'outcome_unknown' });
    const client = {
      query: vi.fn(async (sql) => {
        if (sql.includes('FROM orqaly.workflow_runs')) return { rows: [{ id: RUN_ID }] };
        if (sql.includes('FROM orqaly.executable_actions')) return { rows: [unknown] };
        if (sql.includes('executable_action_not_applied')) return { rows: [{ not_applied: true }] };
        return { rows: [] };
      }),
    };
    const result = await loadLatestExecutableActionWithClient(client, TENANT_ID, RUN_ID, USER_ID);
    expect(result.row.recovery).toBe('confirmed_not_applied');
    expect(result.row.status).toBe('outcome_unknown');
  });

  it('persists approval, grant and running attempt without a committed queued state', async () => {
    const calls = [];
    const running = action({
      status: 'running',
      row_version: 1,
      approval_idempotency_key: 'approval-repository-001',
      approval_decision_hash: 'a'.repeat(64),
      execution_deadline_at: new Date('2026-09-04T20:01:30.000Z'),
    });
    const client = {
      query: vi.fn(async (sql) => {
        calls.push(String(sql));
        if (String(sql).includes('FOR UPDATE')) return { rows: [action()] };
        if (String(sql).includes("SET status = 'running'")) return { rows: [running] };
        return { rows: [] };
      }),
    };

    const result = await decideExecutableActionWithClient(client, approvalDecision());

    expect(result).toEqual({
      row: running,
      idempotent: false,
      dispatch: { envelope: { version: 'test-envelope' } },
    });
    const transitionIndex = calls.findIndex((sql) => sql.includes("SET status = 'running'"));
    const grantIndex = calls.findIndex((sql) =>
      sql.includes('INSERT INTO orqaly.agentic_gateway_grants')
    );
    expect(transitionIndex).toBeGreaterThan(0);
    expect(grantIndex).toBeGreaterThan(transitionIndex);
    expect(calls.join('\n')).not.toContain("SET status = 'queued'");
    expect(calls[transitionIndex]).toContain('execution_deadline_at = $9');
  });

  it('an idempotent approval retry terminalizes a stale running attempt without dispatch', async () => {
    const staleRunning = action({
      status: 'running',
      row_version: 1,
      approval_idempotency_key: 'approval-repository-001',
      approval_decision_hash: 'a'.repeat(64),
      execution_deadline_at: new Date('2026-09-04T20:01:30.000Z'),
    });
    const unknown = action({
      ...staleRunning,
      status: 'outcome_unknown',
      row_version: 2,
      error_code: 'EXECUTION_DEADLINE_EXCEEDED',
      terminal_at: new Date('2026-09-04T20:02:00.000Z'),
    });
    const calls = [];
    const client = {
      query: vi.fn(async (sql) => {
        calls.push(String(sql));
        if (String(sql).includes('FOR UPDATE')) return { rows: [staleRunning] };
        if (String(sql).includes("SET status = 'outcome_unknown'")) return { rows: [unknown] };
        return { rows: [] };
      }),
    };

    const result = await decideExecutableActionWithClient(
      client,
      approvalDecision({ decidedAt: '2026-09-04T20:02:00.000Z' })
    );

    expect(result).toEqual({ row: unknown, idempotent: true, dispatch: null });
    expect(calls.some((sql) => sql.includes('INSERT INTO orqaly.agentic_gateway_grants'))).toBe(
      false
    );
    expect(calls.some((sql) => sql.includes("SET status = 'running'"))).toBe(false);
  });

  it('GET terminalizes a stale running attempt before returning the latest aggregate row', async () => {
    const unknown = action({
      status: 'outcome_unknown',
      row_version: 2,
      error_code: 'EXECUTION_DEADLINE_EXCEEDED',
      terminal_at: new Date('2026-09-04T20:02:00.000Z'),
    });
    const calls = [];
    const client = {
      query: vi.fn(async (sql) => {
        calls.push(String(sql));
        if (String(sql).includes('FROM orqaly.workflow_runs')) return { rows: [{ exists: 1 }] };
        if (String(sql).includes("SET status = 'outcome_unknown'")) return { rows: [unknown] };
        if (String(sql).includes('FROM orqaly.executable_actions')) return { rows: [unknown] };
        return { rows: [] };
      }),
    };

    const result = await loadLatestExecutableActionWithClient(
      client,
      TENANT_ID,
      RUN_ID,
      USER_ID,
      '2026-09-04T20:02:00.000Z'
    );

    expect(result).toEqual({ runFound: true, row: unknown });
    expect(calls.findIndex((sql) => sql.includes("SET status = 'outcome_unknown'"))).toBeLessThan(
      calls.findLastIndex((sql) => sql.includes('FROM orqaly.executable_actions'))
    );
  });
});
