import { describe, expect, it } from 'vitest';
import {
  CURRENT_TASK_PROVENANCE_COLUMNS_MISSING,
  currentGoalTaskAttempt,
} from './current-goal-task-attempt.js';

describe('currentGoalTaskAttempt', () => {
  it('uses the atomically committed team-work attempt before older decision tags', () => {
    const goal = {
      data: {
        team_formation_attempt: {
          version: 'orqaly_team_formation_attempt_v1',
          attempt_id: 'formation-new',
          status: 'completed',
        },
        team_work_materialization: {
          version: 'orqaly_team_work_materialization_v1',
          formation_attempt: 'formation-new',
          research_attempt_key: null,
        },
        axwise_orchestration: { decision_id: 'decision-shared' },
      },
    };

    expect(
      currentGoalTaskAttempt(goal, [
        {
          id: 'old',
          status: 'todo',
          materialization_attempt: 'formation-old',
          data: { axwise_decision_id: 'decision-shared' },
        },
        {
          id: 'new',
          status: 'planned',
          materialization_attempt: 'formation-new',
          data: {
            materialization_attempt: 'formation-new',
            axwise_decision_id: 'decision-shared',
          },
        },
      ]).map((task) => task.id)
    ).toEqual(['new']);
  });

  it('uses the research attempt key written by the delegated materializer', () => {
    const goal = {
      data: {
        team_formation_attempt: {
          version: 'orqaly_team_formation_attempt_v1',
          attempt_id: 'formation-new',
          status: 'completed',
        },
        team_work_materialization: {
          version: 'orqaly_team_work_materialization_v1',
          formation_attempt: 'formation-new',
          research_attempt_key: 'research-new',
          research_run_id: 'run-new',
        },
        research_materialization: {
          attempt_key: 'research-new',
          research_run_id: 'run-new',
        },
        axwise_customer_intelligence: { research_bundle: { run_id: 'run-new' } },
      },
    };

    expect(
      currentGoalTaskAttempt(goal, [
        {
          id: 'formation-row',
          status: 'planned',
          materialization_attempt: 'formation-new',
          data: { materialization_attempt: 'formation-new' },
        },
        {
          id: 'research-row',
          status: 'planned',
          materialization_attempt: 'formation-new',
          data: { materialization_attempt: 'research-new' },
        },
      ]).map((task) => task.id)
    ).toEqual(['research-row']);
  });

  it('raises a query-contract error when a materialized row omitted its provenance column', () => {
    const goal = {
      data: {
        team_formation_attempt: {
          version: 'orqaly_team_formation_attempt_v1',
          attempt_id: 'formation-new',
          status: 'completed',
        },
        team_work_materialization: {
          version: 'orqaly_team_work_materialization_v1',
          formation_attempt: 'formation-new',
        },
      },
    };

    expect(() =>
      currentGoalTaskAttempt(goal, [{ id: 'under-selected', status: 'planned', data: {} }])
    ).toThrow(
      expect.objectContaining({
        code: CURRENT_TASK_PROVENANCE_COLUMNS_MISSING,
      })
    );
  });

  it('fails closed when a committed work marker is malformed', () => {
    const goal = {
      data: {
        team_formation_attempt: {
          version: 'orqaly_team_formation_attempt_v1',
          attempt_id: 'formation-new',
          status: 'completed',
        },
        team_work_materialization: {
          version: 'corrupt',
          formation_attempt: 'formation-new',
        },
      },
    };

    expect(
      currentGoalTaskAttempt(goal, [
        { id: 'old', status: 'todo', materialization_attempt: 'formation-new' },
      ])
    ).toEqual([]);
  });

  it('requires one exact native planning, formation, scope, and work chain', () => {
    const scopeHash = 'a'.repeat(64);
    const plan = { strategy: 'Canonical plan', phases: [{ name: 'Deliver', jobs: [] }] };
    const formation = {
      version: 'orqaly_team_formation_attempt_v1',
      attempt_id: 'formation-native',
      status: 'completed',
      scope_hash: scopeHash,
      planning_attempt_id: 'planning-native',
      plan_hash: 'b'.repeat(64),
    };
    const goal = {
      plan,
      data: {
        axwise_customer_intelligence: {
          scope_packet: { version: 'axwise_scope_packet_v1', scope_hash: scopeHash },
        },
        scope_admission: { native_scope: true, status: 'accepted', scope_hash: scopeHash },
        native_planning_attempt: {
          version: 'orqaly_native_planning_attempt_v1',
          attempt_id: 'planning-native',
          status: 'completed',
          scope_hash: scopeHash,
          plan_hash: 'b'.repeat(64),
          plan_snapshot: structuredClone(plan),
        },
        team_formation_attempt: formation,
        native_team_formation_attempt: { ...formation },
        team_work_materialization: {
          version: 'orqaly_team_work_materialization_v1',
          formation_attempt: 'formation-native',
          native_scope_hash: scopeHash,
          research_attempt_key: null,
        },
      },
    };
    const rows = [
      {
        id: 'native-current',
        status: 'planned',
        materialization_attempt: 'formation-native',
        data: { materialization_attempt: 'formation-native' },
      },
    ];

    expect(currentGoalTaskAttempt(goal, rows).map((task) => task.id)).toEqual(['native-current']);
    goal.data.native_team_formation_attempt = {
      ...formation,
      scope_hash: 'c'.repeat(64),
    };
    expect(currentGoalTaskAttempt(goal, rows)).toEqual([]);
  });

  it('rejects native task rows when the live plan differs from its sealed snapshot', () => {
    const scopeHash = 'a'.repeat(64);
    const plan = { strategy: 'Sealed', phases: [{ name: 'Canonical phase', jobs: [] }] };
    const formation = {
      version: 'orqaly_team_formation_attempt_v1',
      attempt_id: 'formation-native',
      status: 'completed',
      scope_hash: scopeHash,
      planning_attempt_id: 'planning-native',
      plan_hash: 'b'.repeat(64),
    };
    const goal = {
      plan: { ...plan, strategy: 'Poisoned replacement' },
      data: {
        axwise_customer_intelligence: {
          scope_packet: { version: 'axwise_scope_packet_v1', scope_hash: scopeHash },
        },
        scope_admission: { native_scope: true, status: 'accepted', scope_hash: scopeHash },
        native_planning_attempt: {
          version: 'orqaly_native_planning_attempt_v1',
          attempt_id: 'planning-native',
          status: 'completed',
          scope_hash: scopeHash,
          plan_hash: formation.plan_hash,
          plan_snapshot: plan,
        },
        team_formation_attempt: formation,
        native_team_formation_attempt: { ...formation },
        team_work_materialization: {
          version: 'orqaly_team_work_materialization_v1',
          formation_attempt: formation.attempt_id,
          native_scope_hash: scopeHash,
        },
      },
    };
    const task = {
      id: 'native-current',
      status: 'planned',
      materialization_attempt: formation.attempt_id,
      data: { materialization_attempt: formation.attempt_id },
    };

    expect(currentGoalTaskAttempt(goal, [task])).toEqual([]);
  });

  it('keeps native rows current when execution changes runtime-only plan state', () => {
    const scopeHash = 'a'.repeat(64);
    const sealedPlan = {
      strategy: 'Sealed',
      phases: [{ name: 'Canonical phase', status: 'pending', jobs: [] }],
    };
    const formation = {
      version: 'orqaly_team_formation_attempt_v1',
      attempt_id: 'formation-native',
      status: 'completed',
      scope_hash: scopeHash,
      planning_attempt_id: 'planning-native',
      plan_hash: 'b'.repeat(64),
    };
    const goal = {
      plan: {
        ...sealedPlan,
        phases: [
          {
            ...sealedPlan.phases[0],
            status: 'executing',
            started_at: '2026-08-24T12:00:00.000Z',
            progress_percent: 25,
          },
        ],
      },
      data: {
        axwise_customer_intelligence: {
          scope_packet: { version: 'axwise_scope_packet_v1', scope_hash: scopeHash },
        },
        scope_admission: { native_scope: true, status: 'accepted', scope_hash: scopeHash },
        native_planning_attempt: {
          version: 'orqaly_native_planning_attempt_v1',
          attempt_id: 'planning-native',
          status: 'completed',
          scope_hash: scopeHash,
          plan_hash: formation.plan_hash,
          plan_snapshot: sealedPlan,
        },
        team_formation_attempt: formation,
        native_team_formation_attempt: { ...formation },
        team_work_materialization: {
          version: 'orqaly_team_work_materialization_v1',
          formation_attempt: formation.attempt_id,
          native_scope_hash: scopeHash,
        },
      },
    };
    const task = {
      id: 'native-current',
      status: 'inProgress',
      materialization_attempt: formation.attempt_id,
      data: { materialization_attempt: formation.attempt_id },
    };

    expect(currentGoalTaskAttempt(goal, [task]).map((row) => row.id)).toEqual(['native-current']);
  });

  it('never falls back to unbound rows after any native marker exists', () => {
    expect(
      currentGoalTaskAttempt({ data: { scope_admission: { native_scope: true } } }, [
        { id: 'legacy-row', status: 'todo', data: {} },
      ])
    ).toEqual([]);
  });

  it('uses the Orqaly retry boundary when a new attempt has no AxWise decision', () => {
    const goal = {
      data: {
        retry_count: 2,
        goal_task_attempt: { version: 1, retry_count: 2 },
        axwise_orchestration: { decision_id: 'decision-old' },
      },
    };
    const tasks = [
      { id: 'old', status: 'done', data: { axwise_decision_id: 'decision-old' } },
      { id: 'new', status: 'planned', data: { goal_retry_count: 2 } },
    ];

    expect(currentGoalTaskAttempt(goal, tasks).map((task) => task.id)).toEqual(['new']);
  });

  it('shows no old work while a strict retry attempt is awaiting new task rows', () => {
    const goal = {
      data: {
        retry_count: 2,
        goal_task_attempt: { version: 1, retry_count: 2 },
        axwise_orchestration: { decision_id: null, status: 'retry_pending' },
      },
    };

    expect(
      currentGoalTaskAttempt(goal, [
        { id: 'old', status: 'done', data: { axwise_decision_id: 'decision-old' } },
      ])
    ).toEqual([]);
  });

  it('uses a current-retry AxWise decision to filter the tagged attempt', () => {
    const goal = {
      data: {
        retry_count: 2,
        goal_task_attempt: { version: 1, retry_count: 2 },
        axwise_orchestration: { decision_id: 'decision-new', retry_count: 2 },
      },
    };

    expect(
      currentGoalTaskAttempt(goal, [
        {
          id: 'matching',
          status: 'todo',
          data: { goal_retry_count: 2, axwise_decision_id: 'decision-new' },
        },
        {
          id: 'other',
          status: 'todo',
          data: { goal_retry_count: 2, axwise_decision_id: 'decision-other' },
        },
      ]).map((task) => task.id)
    ).toEqual(['matching']);
  });

  it('prioritizes the signed task manifest over decision tags', () => {
    const goal = {
      data: {
        execution_authorization: {
          status: 'approved',
          snapshot_hash: 'approved-hash',
          manifest: { valid: true, tasks: [{ task_id: 'manifest-task' }] },
        },
        goal_approvals: {
          execution: { status: 'approved', snapshot_hash: 'approved-hash' },
        },
        axwise_orchestration: { decision_id: 'decision-new' },
      },
    };
    const tasks = [
      {
        id: 'manifest-task',
        status: 'done',
        data: { axwise_decision_id: 'decision-new' },
      },
      {
        id: 'decision-only-task',
        status: 'done',
        data: { axwise_decision_id: 'decision-new' },
      },
    ];

    expect(currentGoalTaskAttempt(goal, tasks).map((task) => task.id)).toEqual(['manifest-task']);
  });

  it('fails closed when a manifest exists before its current rows materialize', () => {
    const goal = {
      data: {
        execution_authorization: {
          status: 'approved',
          snapshot_hash: 'approved-hash',
          manifest: { valid: true, tasks: [] },
        },
        goal_approvals: {
          execution: { status: 'approved', snapshot_hash: 'approved-hash' },
        },
        axwise_orchestration: { decision_id: 'decision-new' },
      },
    };

    expect(
      currentGoalTaskAttempt(goal, [
        {
          id: 'decision-task',
          status: 'done',
          data: { axwise_decision_id: 'decision-new' },
        },
      ])
    ).toEqual([]);
  });

  it('ignores an invalidated manifest and selects the replacement decision', () => {
    const goal = {
      data: {
        execution_authorization: {
          status: 'invalidated',
          snapshot_hash: null,
          manifest: { valid: true, tasks: [{ task_id: 'old-task' }] },
        },
        goal_approvals: {
          execution: { status: 'invalidated', snapshot_hash: 'old-hash' },
        },
        axwise_orchestration: { decision_id: 'decision-new' },
      },
    };

    expect(
      currentGoalTaskAttempt(goal, [
        { id: 'old-task', status: 'done', data: { axwise_decision_id: 'decision-old' } },
        { id: 'new-task', status: 'todo', data: { axwise_decision_id: 'decision-new' } },
      ]).map((task) => task.id)
    ).toEqual(['new-task']);
  });

  it('ignores an invalid manifest even when approval statuses and hashes match', () => {
    const goal = {
      data: {
        execution_authorization: {
          status: 'approved',
          snapshot_hash: 'same-hash',
          manifest: { valid: false, tasks: [{ task_id: 'old-task' }] },
        },
        goal_approvals: {
          execution: { status: 'approved', snapshot_hash: 'same-hash' },
        },
        axwise_orchestration: { decision_id: 'decision-new' },
      },
    };

    expect(
      currentGoalTaskAttempt(goal, [
        { id: 'old-task', status: 'done', data: { axwise_decision_id: 'decision-old' } },
        { id: 'new-task', status: 'todo', data: { axwise_decision_id: 'decision-new' } },
      ]).map((task) => task.id)
    ).toEqual(['new-task']);
  });

  it('never restores retired rows even when the manifest names them', () => {
    const goal = {
      data: {
        execution_authorization: {
          status: 'approved',
          snapshot_hash: 'approved-hash',
          manifest: {
            valid: true,
            tasks: [
              { task_id: 'uk-cancelled' },
              { task_id: 'us-canceled' },
              { task_id: 'superseded' },
            ],
          },
        },
        goal_approvals: {
          execution: { status: 'approved', snapshot_hash: 'approved-hash' },
        },
      },
    };

    expect(
      currentGoalTaskAttempt(goal, [
        { id: 'uk-cancelled', status: 'CANCELLED' },
        { id: 'us-canceled', status: ' canceled ' },
        { id: 'superseded', status: 'Superseded' },
      ])
    ).toEqual([]);
  });

  it('strictly selects the current AxWise attempt and excludes cancelled history', () => {
    const goal = { data: { axwise_orchestration: { decision_id: 'decision-new' } } };
    const tasks = [
      {
        id: 'old-cancelled',
        status: 'cancelled',
        data: { axwise_decision_id: 'decision-old' },
      },
      { id: 'new', status: 'done', data: { axwise_decision_id: 'decision-new' } },
    ];

    expect(currentGoalTaskAttempt(goal, tasks).map((task) => task.id)).toEqual(['new']);
  });

  it('accepts the immutable decision tag from the execution context shape', () => {
    const goal = { data: { axwise_orchestration: { decision_id: 'decision-new' } } };
    const tasks = [
      {
        id: 'new',
        status: 'done',
        data: { axwise_execution_context: { decision_id: 'decision-new' } },
      },
    ];

    expect(currentGoalTaskAttempt(goal, tasks).map((task) => task.id)).toEqual(['new']);
  });

  it('fails closed instead of showing historical rows before current tasks materialize', () => {
    const goal = { data: { axwise_orchestration: { decision_id: 'decision-new' } } };
    const tasks = [{ id: 'old', status: 'done', data: { axwise_decision_id: 'decision-old' } }];

    expect(currentGoalTaskAttempt(goal, tasks)).toEqual([]);
  });

  it('keeps non-retired rows for legacy goals without decision tagging', () => {
    expect(
      currentGoalTaskAttempt({}, [
        { id: 'cancelled', status: 'cancelled', data: {} },
        { id: 'done', status: 'done', data: {} },
      ]).map((task) => task.id)
    ).toEqual(['done']);
  });
});
