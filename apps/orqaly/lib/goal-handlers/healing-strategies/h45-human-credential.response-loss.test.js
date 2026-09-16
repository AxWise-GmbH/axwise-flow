import { describe, expect, it, vi } from 'vitest';
import { apply } from './h45-human-credential.js';

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function makeGoal() {
  return {
    id: 'goal-1',
    user_id: 'user-1',
    title: 'Research vendors',
    status: 'failed',
    data: {
      unconfigured_tools: ['tool-1'],
      required_tool_id: 'tool-1',
      failure_reason: 'Credential not configured',
    },
    updated_at: '2026-08-22T10:00:00.000Z',
  };
}

function makeAdmin(mode) {
  const state = {
    goal: clone(makeGoal()),
    task: null,
    goalInspectionUnknown: false,
    goalLogs: [],
    notifications: [],
    mode,
  };

  function rows(table) {
    if (table === 'goals') return state.goal ? [state.goal] : [];
    if (table === 'human_tasks') return state.task ? [state.task] : [];
    if (table === 'tools') {
      return [
        {
          id: 'tool-1',
          user_id: 'user-1',
          name: 'Vendor API',
          data: { signup_url: 'https://vendor.example/signup' },
        },
      ];
    }
    return [];
  }

  function query(table, operation, payload = null) {
    const filters = [];
    let returning = operation === 'select';
    let evaluated = false;
    let result;

    function matches(row) {
      return filters.every(({ kind, field, value }) => {
        const actual = row?.[field];
        if (kind === 'in') return value.includes(actual);
        return actual === value;
      });
    }

    async function evaluate() {
      if (evaluated) return result;
      evaluated = true;

      if (operation === 'select') {
        if (table === 'goals' && state.goalInspectionUnknown) {
          result = { data: null, error: { message: 'goal inspection unavailable' } };
          return result;
        }
        result = { data: clone(rows(table).find(matches) || null), error: null };
        return result;
      }

      if (operation === 'insert') {
        if (table === 'human_tasks') {
          state.task = {
            ...clone(payload),
            id: 'task-1',
            user_id: 'user-1',
            claimed_at: null,
            escalated_at: null,
            updated_at: '2026-08-22T10:01:00.000Z',
          };
          result = { data: returning ? clone(state.task) : null, error: null };
          return result;
        }
        if (table === 'goal_log') state.goalLogs.push(clone(payload));
        if (table === 'notification_log') state.notifications.push(clone(payload));
        result = { data: null, error: null };
        return result;
      }

      const row = rows(table).find(matches) || null;
      if (table === 'goals') {
        const transitionMode = state.mode;
        state.mode = null;
        if (transitionMode === 'error_committed' && row) {
          Object.assign(row, clone(payload), {
            updated_at: payload.updated_at.replace('Z', '+00:00'),
          });
        }
        if (transitionMode === 'error_committed_then_edited' && row) {
          Object.assign(row, clone(payload), {
            data: { ...clone(payload.data), concurrent_user_edit: true },
            updated_at: payload.updated_at.replace('Z', '+00:00'),
          });
        }
        if (transitionMode === 'error_conflict' && state.goal) {
          Object.assign(state.goal, {
            status: 'cancelled',
            data: { ...state.goal.data, cancelled_by: 'user-1' },
            updated_at: '2026-08-22T10:02:00.000Z',
          });
        }
        if (transitionMode === 'error_unknown') state.goalInspectionUnknown = true;
        result = { data: null, error: { message: `goal transition ${transitionMode}` } };
        return result;
      }

      if (row) Object.assign(row, clone(payload));
      result = { data: returning && row ? clone(row) : null, error: null };
      return result;
    }

    const chain = {
      eq(field, value) {
        filters.push({ kind: 'eq', field, value });
        return chain;
      },
      is(field, value) {
        filters.push({ kind: 'eq', field, value });
        return chain;
      },
      in(field, value) {
        filters.push({ kind: 'in', field, value });
        return chain;
      },
      order() {
        return chain;
      },
      limit() {
        return chain;
      },
      select() {
        returning = true;
        return chain;
      },
      maybeSingle: evaluate,
      single: evaluate,
      then(resolve, reject) {
        return evaluate().then(resolve, reject);
      },
    };
    return chain;
  }

  return {
    state,
    admin: {
      from(table) {
        return {
          select: () => query(table, 'select'),
          insert: (payload) => query(table, 'insert', payload),
          update: (payload) => query(table, 'update', payload),
        };
      },
    },
  };
}

describe('h45 goal transition response-loss reconciliation', () => {
  it('accepts an exact committed transition and emits side effects once', async () => {
    const { admin, state } = makeAdmin('error_committed');

    const result = await apply(admin, makeGoal(), {
      log: { info: vi.fn(), warn: vi.fn() },
    });

    expect(result).toMatchObject({
      action: 'manual-credential-checkpoint',
      humanTaskId: 'task-1',
      manualOnly: true,
    });
    expect(state.task).toMatchObject({
      status: 'pending',
      escalation_allowed: false,
      escalate_after_seconds: null,
    });
    expect(state.goal.data).toMatchObject({
      blocked_by_human_task_id: 'task-1',
      manual_credential_checkpoint: {
        status: 'awaiting_user',
        human_task_id: 'task-1',
      },
    });
    expect(state.goalLogs).toHaveLength(1);
    expect(state.notifications).toHaveLength(1);
  });

  it('cancels the exact newly-created task when the transition is proven absent', async () => {
    const { admin, state } = makeAdmin('error_original');

    const result = await apply(admin, makeGoal(), {
      log: { info: vi.fn(), warn: vi.fn() },
    });

    expect(result).toEqual({ action: 'skipped', reason: 'goal-transition-failed' });
    expect(state.goal).toEqual(makeGoal());
    expect(state.task).toMatchObject({ status: 'cancelled', completed_by: 'cancelled' });
    expect(state.goalLogs).toHaveLength(0);
    expect(state.notifications).toHaveLength(0);
  });

  it.each(['error_conflict', 'error_unknown', 'error_committed_then_edited'])(
    'retains the unique task fail-closed when inspection is %s',
    async (mode) => {
      const { admin, state } = makeAdmin(mode);

      const result = await apply(admin, makeGoal(), {
        log: { info: vi.fn(), warn: vi.fn() },
      });

      expect(result).toEqual({
        action: 'skipped',
        reason: 'goal-transition-needs-reconciliation',
      });
      expect(state.task).toMatchObject({ status: 'pending', escalation_allowed: false });
      expect(state.goalLogs).toHaveLength(0);
      expect(state.notifications).toHaveLength(0);
    }
  );
});
