import { describe, expect, it } from 'vitest';
import {
  activeGoalTasks,
  currentGoalTaskAttempt,
  isRetiredGoalTask,
} from './currentGoalTaskAttempt.js';

describe('currentGoalTaskAttempt', () => {
  it('shows only the atomically committed team-work attempt', () => {
    const goal = {
      data: {
        team_formation_attempt: {
          version: 'orqaly_team_formation_attempt_v1',
          attempt_id: 'formation-current',
          status: 'completed',
        },
        team_work_materialization: {
          version: 'orqaly_team_work_materialization_v1',
          formation_attempt: 'formation-current',
          research_attempt_key: null,
        },
        axwise_orchestration: { decision_id: 'decision-shared' },
      },
    };

    expect(
      currentGoalTaskAttempt(goal, [
        {
          id: 'stale',
          status: 'todo',
          materialization_attempt: 'formation-old',
          data: { axwise_decision_id: 'decision-shared' },
        },
        {
          id: 'current',
          status: 'planned',
          materialization_attempt: 'formation-current',
          data: {
            materialization_attempt: 'formation-current',
            axwise_decision_id: 'decision-shared',
          },
        },
      ]).map((task) => task.id)
    ).toEqual(['current']);
  });

  it('hides all rows when the committed work marker is malformed', () => {
    expect(
      currentGoalTaskAttempt(
        {
          data: {
            team_formation_attempt: {
              version: 'orqaly_team_formation_attempt_v1',
              attempt_id: 'formation-current',
              status: 'completed',
            },
            team_work_materialization: {
              version: 'corrupt',
              formation_attempt: 'formation-current',
            },
          },
        },
        [{ id: 'stale', status: 'todo', materialization_attempt: 'formation-current' }]
      )
    ).toEqual([]);
  });

  it('uses the same fail-closed native provenance chain as the server', () => {
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
    const tasks = [
      {
        id: 'native-current',
        status: 'planned',
        materialization_attempt: 'formation-native',
        data: { materialization_attempt: 'formation-native' },
      },
    ];

    expect(currentGoalTaskAttempt(goal, tasks).map((task) => task.id)).toEqual(['native-current']);
    goal.data.team_work_materialization.native_scope_hash = 'c'.repeat(64);
    expect(currentGoalTaskAttempt(goal, tasks)).toEqual([]);
  });

  it('shows only the tagged full-retry attempt when AxWise is not used', () => {
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

  it('hides old work while a new strict retry attempt has not materialized tasks', () => {
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

  it('prioritizes the signed execution manifest over the AxWise decision boundary', () => {
    const goal = {
      data: {
        execution_authorization: {
          status: 'approved',
          snapshot_hash: 'approved-hash',
          manifest: { valid: true, tasks: [{ task_id: 'authorized-2' }] },
        },
        goal_approvals: {
          execution: { status: 'approved', snapshot_hash: 'approved-hash' },
        },
        axwise_orchestration: { decision_id: 'decision-current' },
      },
    };
    const tasks = [
      { id: 'authorized-1', status: 'todo', data: { axwise_decision_id: 'decision-current' } },
      { id: 'authorized-2', status: 'todo', data: { axwise_decision_id: 'decision-current' } },
      { id: 'other-decision', status: 'done', data: { axwise_decision_id: 'decision-old' } },
    ];

    expect(currentGoalTaskAttempt(goal, tasks).map((task) => task.id)).toEqual(['authorized-2']);
  });

  it('fails closed when an explicit manifest has no active matching rows', () => {
    const goal = {
      data: {
        execution_authorization: {
          status: 'approved',
          snapshot_hash: 'approved-hash',
          manifest: { valid: true, tasks: [{ task_id: 'retired-authorized' }] },
        },
        goal_approvals: {
          execution: { status: 'approved', snapshot_hash: 'approved-hash' },
        },
      },
    };
    const tasks = [
      { id: 'retired-authorized', status: 'cancelled', data: {} },
      { id: 'unapproved-current', status: 'todo', data: {} },
    ];

    expect(currentGoalTaskAttempt(goal, tasks)).toEqual([]);
  });

  it('ignores an invalidated old manifest and selects the new AxWise decision', () => {
    const goal = {
      data: {
        execution_authorization: {
          status: 'pending',
          snapshot_hash: 'old-hash',
          manifest: { valid: true, tasks: [{ task_id: 'old-authorized' }] },
        },
        goal_approvals: {
          execution: { status: 'approved', snapshot_hash: 'old-hash' },
        },
        axwise_orchestration: { decision_id: 'decision-new' },
      },
    };
    const tasks = [
      { id: 'old-authorized', status: 'done', data: { axwise_decision_id: 'decision-old' } },
      { id: 'new-1', status: 'todo', data: { axwise_decision_id: 'decision-new' } },
      { id: 'new-2', status: 'planned', data: { axwise_decision_id: 'decision-new' } },
    ];

    expect(currentGoalTaskAttempt(goal, tasks).map((task) => task.id)).toEqual(['new-1', 'new-2']);
  });

  it('ignores an approved manifest when its approval hash is stale', () => {
    const goal = {
      data: {
        execution_authorization: {
          status: 'approved',
          snapshot_hash: 'new-hash',
          manifest: { tasks: [{ task_id: 'old-authorized' }] },
        },
        goal_approvals: {
          execution: { status: 'approved', snapshot_hash: 'old-hash' },
        },
        axwise_orchestration: { decision_id: 'decision-new' },
      },
    };
    const tasks = [
      { id: 'old-authorized', status: 'done', data: { axwise_decision_id: 'decision-old' } },
      { id: 'new', status: 'todo', data: { axwise_decision_id: 'decision-new' } },
    ];

    expect(currentGoalTaskAttempt(goal, tasks).map((task) => task.id)).toEqual(['new']);
  });

  it('ignores an invalid manifest even when approval statuses and hashes match', () => {
    const goal = {
      data: {
        execution_authorization: {
          status: 'approved',
          snapshot_hash: 'same-hash',
          manifest: { valid: false, tasks: [{ task_id: 'old-authorized' }] },
        },
        goal_approvals: {
          execution: { status: 'approved', snapshot_hash: 'same-hash' },
        },
        axwise_orchestration: { decision_id: 'decision-new' },
      },
    };
    const tasks = [
      { id: 'old-authorized', status: 'done', data: { axwise_decision_id: 'decision-old' } },
      { id: 'new', status: 'todo', data: { axwise_decision_id: 'decision-new' } },
    ];

    expect(currentGoalTaskAttempt(goal, tasks).map((task) => task.id)).toEqual(['new']);
  });

  it('shows only tasks belonging to the latest AxWise decision', () => {
    const goal = { data: { axwise_orchestration: { decision_id: 'decision-new' } } };
    const tasks = [
      { id: 'old', status: 'cancelled', data: { axwise_decision_id: 'decision-old' } },
      { id: 'new-1', status: 'todo', data: { axwise_decision_id: 'decision-new' } },
      { id: 'new-2', status: 'planned', data: { axwise_decision_id: 'decision-new' } },
    ];

    expect(currentGoalTaskAttempt(goal, tasks).map((task) => task.id)).toEqual(['new-1', 'new-2']);
  });

  it('accepts decision tags stored in the AxWise execution context', () => {
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

  it('hides retired retry rows for legacy goals without decision tagging', () => {
    const tasks = [
      { id: 'retired', status: 'cancelled', data: {} },
      { id: 'current', status: 'completed', data: {} },
    ];

    expect(currentGoalTaskAttempt({}, tasks).map((task) => task.id)).toEqual(['current']);
  });

  it('does not fall back to historical rows while current tasks are materializing', () => {
    const goal = { data: { axwise_orchestration: { decision_id: 'decision-new' } } };
    const tasks = [{ id: 'old', status: 'done', data: { axwise_decision_id: 'decision-old' } }];

    expect(currentGoalTaskAttempt(goal, tasks)).toEqual([]);
  });

  it('removes retired rows even when they share the current AxWise decision', () => {
    const goal = { data: { axwise_orchestration: { decision_id: 'decision-current' } } };
    const tasks = [
      { id: 'old-1', status: 'cancelled', data: { axwise_decision_id: 'decision-current' } },
      { id: 'old-2', status: 'superseded', data: { axwise_decision_id: 'decision-current' } },
      { id: 'new-1', status: 'todo', data: { axwise_decision_id: 'decision-current' } },
      { id: 'new-2', status: 'inProgress', data: { axwise_decision_id: 'decision-current' } },
    ];

    expect(currentGoalTaskAttempt(goal, tasks).map((task) => task.id)).toEqual(['new-1', 'new-2']);
  });

  it('normalizes retired status spellings for generic active-task consumers', () => {
    const tasks = [
      { id: 'cancelled', status: 'cancelled' },
      { id: 'canceled', status: 'CANCELED' },
      { id: 'superseded', status: 'superseded' },
      { id: 'failed', status: 'failed' },
      { id: 'active', status: 'todo' },
    ];

    expect(isRetiredGoalTask(tasks[0])).toBe(true);
    expect(activeGoalTasks(tasks).map((task) => task.id)).toEqual(['failed', 'active']);
  });
});
