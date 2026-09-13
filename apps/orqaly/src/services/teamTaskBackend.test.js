/**
 * teamTaskBackend user-scoping tests.
 *
 * Context: team_tasks had no owner column and an `auth.role() = 'authenticated'`
 * RLS policy, so every signed-in user read, edited and deleted every other
 * user's tasks — a new account saw all 88 rows. Migration 183 adds user_id and
 * 184 enforces it; these tests lock the client half of that contract.
 *
 * The builder mock RECORDS the filters actually applied, so a test can only pass
 * if the real `.eq('user_id', ...)` is on the query — not merely because some
 * method was called.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  hasSupabase: vi.fn(() => true),
  getSession: vi.fn(async () => ({ data: { session: { user: { id: 'user-a' } } } })),
  calls: [],
  selectRows: [],
  opError: null,
}));

vi.mock('../lib/supabase', () => {
  // One chainable builder per operation; every filter is appended to call.filters
  // and the whole call is pushed to h.calls for assertion.
  function builder(op) {
    const call = { op, filters: [], payload: undefined };
    h.calls.push(call);
    const chain = {
      select() {
        return chain;
      },
      insert(row) {
        call.payload = row;
        return chain;
      },
      update(payload) {
        call.payload = payload;
        return chain;
      },
      delete() {
        call.op = 'delete';
        return chain;
      },
      eq(col, val) {
        call.filters.push(['eq', col, val]);
        return chain;
      },
      neq(col, val) {
        call.filters.push(['neq', col, val]);
        return chain;
      },
      lt(col, val) {
        call.filters.push(['lt', col, val]);
        return chain;
      },
      limit() {
        return Promise.resolve({ data: h.selectRows, error: h.opError });
      },
      order() {
        return Promise.resolve({ data: h.selectRows, error: h.opError });
      },
      then(resolve) {
        // Terminal await on a chain with no order()/limit() (insert/update/delete).
        return Promise.resolve({ data: h.selectRows, error: h.opError }).then(resolve);
      },
    };
    return chain;
  }
  return {
    hasSupabase: h.hasSupabase,
    supabase: {
      auth: { getSession: h.getSession },
      from: () => builder('query'),
    },
  };
});

vi.mock('./auditLogBackend', () => ({
  logAction: vi.fn(async () => {}),
  buildAgentMeta: vi.fn(() => ({})),
}));

const filtersOf = (op) => h.calls.filter((c) => c.op === op);
const hasUserFilter = (call, uid = 'user-a') =>
  call.filters.some(([kind, col, val]) => kind === 'eq' && col === 'user_id' && val === uid);

async function loadBackend() {
  vi.resetModules();
  h.calls.length = 0;
  return await import('./teamTaskBackend.js');
}

beforeEach(() => {
  localStorage.clear();
  h.calls.length = 0;
  h.selectRows = [];
  h.opError = null;
  h.hasSupabase.mockReturnValue(true);
  h.getSession.mockResolvedValue({ data: { session: { user: { id: 'user-a' } } } });
});

describe('teamTaskBackend — reads are scoped to the signed-in user', () => {
  it('loadTeamTasks filters by user_id', async () => {
    const { loadTeamTasks } = await loadBackend();
    h.selectRows = [{ id: 't1', title: 'Mine', data: {} }];
    const tasks = await loadTeamTasks();
    expect(tasks).toHaveLength(1);
    // The probe call plus the real select; at least one must carry the filter.
    expect(h.calls.some((c) => hasUserFilter(c))).toBe(true);
  });

  it('loadTeamTasks returns [] when signed out, without reading the local mirror', async () => {
    // The local mirror belongs to whoever used this browser last — falling back
    // to it would be a leak in the opposite direction.
    localStorage.setItem('orch_team_tasks_v1', JSON.stringify([{ id: 'stale', title: 'Theirs' }]));
    h.getSession.mockResolvedValue({ data: { session: null } });
    const { loadTeamTasks } = await loadBackend();
    await expect(loadTeamTasks()).resolves.toEqual([]);
  });

  it('loadCompletedTaskOutputs filters by user_id', async () => {
    const { loadCompletedTaskOutputs } = await loadBackend();
    h.selectRows = [{ title: 'A', data: { output: 'x' }, sequence_order: 1 }];
    await loadCompletedTaskOutputs('job-1');
    expect(h.calls.some((c) => hasUserFilter(c))).toBe(true);
  });
});

describe('teamTaskBackend — writes stamp and scope the owner', () => {
  it('createTeamTask stamps user_id on the inserted row', async () => {
    const { createTeamTask } = await loadBackend();
    await createTeamTask({ id: 't1', title: 'New' });
    const insert = h.calls.find((c) => c.payload && c.payload.id === 't1');
    expect(insert?.payload?.user_id).toBe('user-a');
  });

  it('createTeamTask ignores a caller-supplied user_id (no spoofing)', async () => {
    const { createTeamTask } = await loadBackend();
    await createTeamTask({ id: 't1', title: 'New', user_id: 'someone-else' });
    const insert = h.calls.find((c) => c.payload && c.payload.id === 't1');
    expect(insert?.payload?.user_id).toBe('user-a');
    // It must not survive inside the data JSON either.
    expect(insert?.payload?.data?.user_id).toBeUndefined();
  });

  it('updateTeamTaskById scopes by user_id as well as id', async () => {
    const { updateTeamTaskById } = await loadBackend();
    await updateTeamTaskById('t1', { title: 'Edited' });
    const update = h.calls.find((c) => c.filters.some(([, col]) => col === 'id'));
    expect(hasUserFilter(update)).toBe(true);
  });

  it('deleteTeamTaskById scopes by user_id as well as id', async () => {
    const { deleteTeamTaskById } = await loadBackend();
    await deleteTeamTaskById('t1');
    const del = filtersOf('delete')[0];
    expect(hasUserFilter(del)).toBe(true);
  });
});

describe('teamTaskBackend — clearAllTeamTasks cannot wipe other users', () => {
  it('deletes only the current user rows, never an unbounded delete', async () => {
    const { clearAllTeamTasks } = await loadBackend();
    const ok = await clearAllTeamTasks();
    expect(ok).toBe(true);
    const del = filtersOf('delete')[0];
    expect(hasUserFilter(del)).toBe(true);
    // The old implementation used .neq('id', '__never__') to match every row.
    expect(del.filters.some(([kind]) => kind === 'neq')).toBe(false);
  });

  it('refuses to delete anything when signed out', async () => {
    h.getSession.mockResolvedValue({ data: { session: null } });
    const { clearAllTeamTasks } = await loadBackend();
    const ok = await clearAllTeamTasks();
    expect(ok).toBe(false);
    expect(filtersOf('delete')).toHaveLength(0);
  });
});

describe('teamTaskBackend — localStorage mode is unchanged', () => {
  it('uses localStorage and never queries Supabase when it is not configured', async () => {
    h.hasSupabase.mockReturnValue(false);
    const { createTeamTask, loadTeamTasks } = await loadBackend();
    await createTeamTask({ id: 't1', title: 'Local' });
    const tasks = await loadTeamTasks();
    expect(tasks.map((t) => t.id)).toEqual(['t1']);
    expect(h.calls).toHaveLength(0);
  });
});
