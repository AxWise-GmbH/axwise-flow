import { describe, expect, it } from 'vitest';
import { AxWiseOutcomeReceiptError, buildGoalOutcome } from './outcomes.js';

describe('AxWise Phase 4 outcome builder', () => {
  it('converts completed Orqaly work into decision and node receipts', () => {
    const goal = {
      id: 'goal-1',
      iteration: 1,
      spent_usd: 2.5,
      created_at: '2026-07-18T10:00:00.000Z',
      plan: { phases: [{ quality_score: 90 }] },
      data: {
        completed_at: '2026-07-18T10:10:00.000Z',
        axwise_orchestration: {
          decision_id: 'decision-1',
          applied: true,
          feasible: true,
        },
      },
    };
    const outcome = buildGoalOutcome(goal, [
      {
        id: 'task-1',
        status: 'done',
        agent_id: 'agent-1',
        created_at: '2026-07-18T10:01:00.000Z',
        updated_at: '2026-07-18T10:08:00.000Z',
        data: {
          axwise_execution_context: {
            decision_id: 'decision-1',
            step_id: 'phase-1-job-1',
          },
          quality_score: 92,
          llmCost: 1.25,
          llmTotalTokens: 1200,
          duration_ms: 420000,
        },
      },
    ]);

    expect(outcome).toMatchObject({
      decision_id: 'decision-1',
      authorization_status: 'approved',
      execution_status: 'completed',
      task_success: true,
      quality_score: 0.9,
      latency_ms: 600000,
    });
    expect(outcome.node_receipts[0]).toMatchObject({
      node_id: 'phase-1-job-1',
      agent_id: 'agent-1',
      status: 'completed',
      quality_score: 0.92,
      cost: 1.25,
      token_count: 1200,
    });
  });

  it('does not emit an outcome when no AxWise execution decision exists', () => {
    expect(buildGoalOutcome({ id: 'goal-1', data: {} }, [])).toBeNull();
  });

  it('scopes deterministic outcome and receipt ids to the AxWise decision', () => {
    const goalForDecision = (decisionId) => ({
      id: 'goal-shared',
      iteration: 2,
      data: {
        axwise_orchestration: { decision_id: decisionId, applied: true },
      },
    });
    const taskForDecision = (decisionId) => [
      {
        id: 'task-shared',
        status: 'done',
        agent_id: 'agent-1',
        data: {
          axwise_execution_context: {
            decision_id: decisionId,
            step_id: 'phase-1-job-1',
          },
        },
      },
    ];

    const first = buildGoalOutcome(
      goalForDecision('decision-before-replan'),
      taskForDecision('decision-before-replan')
    );
    const retry = buildGoalOutcome(
      goalForDecision('decision-before-replan'),
      taskForDecision('decision-before-replan')
    );
    const replanned = buildGoalOutcome(
      goalForDecision('decision-after-replan'),
      taskForDecision('decision-after-replan')
    );

    expect(retry.outcome_id).toBe(first.outcome_id);
    expect(retry.node_receipts[0].receipt_id).toBe(first.node_receipts[0].receipt_id);
    expect(replanned.outcome_id).not.toBe(first.outcome_id);
    expect(replanned.node_receipts[0].receipt_id).not.toBe(first.node_receipts[0].receipt_id);
  });

  it('keeps decision-scoped ids within the 255-character contract for long source ids', () => {
    const decisionId = `decision-${'d'.repeat(500)}`;
    const outcome = buildGoalOutcome(
      {
        id: `goal-${'g'.repeat(500)}`,
        iteration: 3,
        data: {
          axwise_orchestration: {
            decision_id: decisionId,
            applied: true,
          },
        },
      },
      [
        {
          id: `task-${'t'.repeat(500)}`,
          status: 'done',
          data: {
            axwise_execution_context: {
              decision_id: decisionId,
              step_id: 'phase-1-job-1',
            },
          },
        },
      ]
    );

    expect(outcome.outcome_id).toMatch(/^orqaly-outcome:v2:[a-f0-9]{64}$/);
    expect(outcome.node_receipts[0].receipt_id).toMatch(/^orqaly-receipt:v2:[a-f0-9]{64}$/);
    expect(outcome.outcome_id.length).toBeLessThanOrEqual(255);
    expect(outcome.node_receipts[0].receipt_id.length).toBeLessThanOrEqual(255);
  });

  it('bounds malformed counters and explains task-level human overrides', () => {
    const outcome = buildGoalOutcome(
      {
        id: 'goal-2',
        iteration: 'not-a-number',
        data: {
          axwise_orchestration: { decision_id: 'decision-2', applied: true },
          completed_at: '2026-07-18T10:10:00.000Z',
        },
      },
      [
        {
          id: 'task-2',
          status: 'completed',
          agent_id: 'agent-2',
          data: {
            axwise_execution_context: {
              decision_id: 'decision-2',
              step_id: 'phase-1-job-1',
            },
            retry_count: 'not-a-number',
            human_override: true,
            human_override_reason: 'Approved reassignment by the goal owner',
          },
        },
      ]
    );

    expect(outcome.rework_count).toBe(0);
    expect(outcome.node_receipts[0]).toMatchObject({
      attempt: 1,
      rework_count: 0,
      human_override: true,
      override_reason: 'Approved reassignment by the goal owner',
    });
  });

  it('marks a divergent shadow-mode execution as an explicit observational override', () => {
    const outcome = buildGoalOutcome(
      {
        id: 'goal-shadow',
        data: {
          axwise_orchestration: {
            decision_id: 'decision-shadow',
            applied: false,
            feasible: true,
            assignments: { 'phase-1-job-1': 'agent-axwise' },
          },
          completed_at: '2026-07-18T10:10:00.000Z',
        },
      },
      [
        {
          id: 'task-shadow',
          status: 'completed',
          agent_id: 'agent-local',
          data: {
            axwise_execution_context: {
              decision_id: 'decision-shadow',
              step_id: 'phase-1-job-1',
            },
          },
        },
      ]
    );

    expect(outcome).toMatchObject({
      authorization_status: 'partially_approved',
      human_override: true,
    });
    expect(outcome.node_receipts[0]).toMatchObject({
      agent_id: 'agent-local',
      human_override: true,
    });
    expect(outcome.node_receipts[0].override_reason).toContain('agent-axwise');
  });

  it('fails closed when an approved execution node has no terminal receipt', () => {
    const goal = {
      id: 'goal-approved',
      data: {
        axwise_orchestration: {
          decision_id: 'decision-approved',
          applied: true,
          assignments: { legacy_node: 'agent-legacy' },
        },
        goal_approvals: {
          execution: {
            status: 'approved',
            snapshot_hash: 'approved-hash',
            snapshot: {
              authorization_manifest: {
                valid: true,
                tasks: [
                  { task_id: 'task-a', step_id: 'node-a', agent_id: 'agent-a' },
                  { task_id: 'task-b', step_id: 'node-b', agent_id: 'agent-b' },
                ],
              },
            },
          },
        },
        execution_authorization: {
          status: 'approved',
          snapshot_hash: 'approved-hash',
          manifest: {
            valid: true,
            tasks: [
              { task_id: 'task-a', step_id: 'node-a', agent_id: 'agent-a' },
              { task_id: 'task-b', step_id: 'node-b', agent_id: 'agent-b' },
            ],
          },
        },
      },
    };

    expect(() =>
      buildGoalOutcome(goal, [
        {
          id: 'task-a',
          status: 'done',
          agent_id: 'agent-a',
          data: { axwise_execution_context: { step_id: 'node-a' } },
        },
        {
          id: 'task-b',
          status: 'running',
          agent_id: 'agent-b',
          data: { axwise_execution_context: { step_id: 'node-b' } },
        },
      ])
    ).toThrowError(AxWiseOutcomeReceiptError);

    try {
      buildGoalOutcome(goal, [
        {
          id: 'task-a',
          status: 'done',
          agent_id: 'agent-a',
          data: { axwise_execution_context: { step_id: 'node-a' } },
        },
      ]);
    } catch (error) {
      expect(error.details).toMatchObject({
        reason: 'missing_terminal_node_receipts',
        expected_source: 'execution_authorization',
        missing_node_ids: ['node-b'],
      });
    }
  });

  it('reports only the authorized task when historical rows share its AxWise node', () => {
    const manifest = {
      valid: true,
      tasks: [{ task_id: 'task-current', step_id: 'node-shared', agent_id: 'agent-current' }],
    };
    const goal = {
      id: 'goal-revised',
      data: {
        axwise_orchestration: {
          decision_id: 'decision-current',
          applied: true,
          feasible: true,
          assignments: { 'node-shared': 'agent-current' },
        },
        goal_approvals: {
          execution: {
            status: 'approved',
            snapshot_hash: 'current-hash',
            snapshot: { authorization_manifest: manifest },
          },
        },
        execution_authorization: {
          status: 'approved',
          snapshot_hash: 'current-hash',
          manifest,
        },
      },
    };
    const sharedContext = { axwise_execution_context: { step_id: 'node-shared' } };

    const outcome = buildGoalOutcome(goal, [
      {
        id: 'task-old-failed',
        status: 'failed',
        agent_id: 'agent-old',
        data: { ...sharedContext, axwise_decision_id: 'decision-old' },
      },
      {
        id: 'task-old-cancelled',
        status: 'cancelled',
        agent_id: 'agent-old',
        data: { ...sharedContext, axwise_decision_id: 'decision-old' },
      },
      {
        id: 'task-current',
        status: 'done',
        agent_id: 'agent-current',
        data: { ...sharedContext, axwise_decision_id: 'decision-current' },
      },
    ]);

    expect(outcome.task_success).toBe(true);
    expect(outcome.failure_type).toBeNull();
    expect(outcome.node_receipts).toHaveLength(1);
    expect(outcome.node_receipts[0]).toMatchObject({
      node_id: 'node-shared',
      agent_id: 'agent-current',
      status: 'completed',
    });
  });

  it('uses legacy orchestration assignments when no authorization snapshot exists', () => {
    const goal = {
      id: 'goal-legacy',
      data: {
        axwise_orchestration: {
          decision_id: 'decision-legacy',
          applied: true,
          assignments: { 'node-legacy': 'agent-a' },
        },
      },
    };

    expect(() => buildGoalOutcome(goal, [])).toThrow(
      'missing terminal task receipts for approved nodes: node-legacy'
    );
  });

  it('fails closed instead of resurrecting untagged terminal rows for a current decision', () => {
    const goal = {
      id: 'goal-current-decision',
      data: {
        axwise_orchestration: {
          decision_id: 'decision-current',
          applied: true,
          assignments: { 'node-current': 'agent-current' },
        },
      },
    };

    expect(() =>
      buildGoalOutcome(goal, [
        {
          id: 'stale-done',
          status: 'done',
          agent_id: 'agent-old',
          data: { axwise_execution_context: { step_id: 'node-current' } },
        },
      ])
    ).toThrow('missing terminal task receipts for approved nodes: node-current');
  });

  it('rejects a stale authorization boundary instead of falling back', () => {
    const goal = {
      id: 'goal-stale',
      data: {
        axwise_orchestration: {
          decision_id: 'decision-stale',
          applied: true,
          assignments: { 'node-a': 'agent-a' },
        },
        execution_authorization: {
          status: 'pending',
          snapshot_hash: 'new-hash',
          manifest: {
            valid: true,
            tasks: [{ task_id: 'task-a', step_id: 'node-a', agent_id: 'agent-a' }],
          },
        },
      },
    };

    expect(() => buildGoalOutcome(goal, [])).toThrow('unapproved execution authorization');
  });
});
