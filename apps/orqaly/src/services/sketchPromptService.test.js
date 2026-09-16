import { describe, it, expect, vi, beforeEach } from 'vitest';

// Build a chainable query-builder mock that records the last operation
// and returns preset results on the terminal call.
function makeQB() {
  const state = {
    table: null,
    op: null,
    filters: [],
    insertRow: null,
    updateRow: null,
    orderBy: null,
    result: { data: null, error: null },
    singleResult: null,
  };

  const qb = {
    from: vi.fn((t) => {
      state.table = t;
      return qb;
    }),
    select: vi.fn(() => qb),
    insert: vi.fn((row) => {
      state.op = 'insert';
      state.insertRow = row;
      return qb;
    }),
    update: vi.fn((row) => {
      state.op = 'update';
      state.updateRow = row;
      return qb;
    }),
    delete: vi.fn(() => {
      state.op = 'delete';
      return qb;
    }),
    eq: vi.fn((k, v) => {
      state.filters.push(['eq', k, v]);
      return qb;
    }),
    order: vi.fn((c, opts) => {
      state.orderBy = [c, opts];
      return qb;
    }),
    single: vi.fn(() => Promise.resolve(state.singleResult || state.result)),
    then: (resolve) => resolve(state.result),
  };
  return { qb, state };
}

function installSupabase(result, singleResult) {
  const { qb, state } = makeQB();
  state.result = result || { data: [], error: null };
  if (singleResult) state.singleResult = singleResult;
  const client = {
    from: qb.from,
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })) },
  };
  return { client, qb, state };
}

let currentMock;
vi.mock('../lib/supabase', () => ({
  get supabase() {
    return currentMock;
  },
}));

beforeEach(() => {
  currentMock = null;
});

describe('sketchPromptService', () => {
  it('listSketchPrompts fetches ordered by created_at desc', async () => {
    const { client, state } = installSupabase({ data: [{ id: 'a' }], error: null });
    currentMock = client;
    const { listSketchPrompts } = await import('./sketchPromptService.js');
    const rows = await listSketchPrompts();
    expect(rows).toEqual([{ id: 'a' }]);
    expect(state.table).toBe('sketch_prompts');
    expect(state.orderBy[0]).toBe('created_at');
    expect(state.orderBy[1].ascending).toBe(false);
  });

  it('listSketchPrompts filters by status and agentId', async () => {
    const { client, state } = installSupabase({ data: [], error: null });
    currentMock = client;
    const { listSketchPrompts } = await import('./sketchPromptService.js');
    await listSketchPrompts({ status: 'applied', agentId: 'agent-42' });
    expect(state.filters).toContainEqual(['eq', 'status', 'applied']);
    expect(state.filters).toContainEqual(['eq', 'agent_id', 'agent-42']);
  });

  it('createSketchPrompt inserts a draft when no agentId is given', async () => {
    const row = { id: 'p-1', status: 'draft' };
    const { client, state } = installSupabase(
      { data: [], error: null },
      { data: row, error: null }
    );
    currentMock = client;
    const { createSketchPrompt } = await import('./sketchPromptService.js');
    const out = await createSketchPrompt({ name: 'N', content: 'C' });
    expect(out).toEqual(row);
    expect(state.insertRow.status).toBe('draft');
    expect(state.insertRow.applied_at).toBeNull();
    expect(state.insertRow.user_id).toBe('user-1');
  });

  it('createSketchPrompt marks applied when agentId is provided', async () => {
    const { client, state } = installSupabase(
      { data: [], error: null },
      { data: { id: 'p' }, error: null }
    );
    currentMock = client;
    const { createSketchPrompt } = await import('./sketchPromptService.js');
    await createSketchPrompt({ name: 'N', content: 'C', agentId: 'agent-7' });
    expect(state.insertRow.status).toBe('applied');
    expect(state.insertRow.agent_id).toBe('agent-7');
    expect(state.insertRow.applied_at).toBeTruthy();
  });

  it('createSketchPrompt rejects missing fields', async () => {
    currentMock = installSupabase().client;
    const { createSketchPrompt } = await import('./sketchPromptService.js');
    await expect(createSketchPrompt({ name: '', content: 'C' })).rejects.toThrow(/required/);
  });

  it('applyToAgent updates the row with applied status', async () => {
    const { client, state } = installSupabase(null, {
      data: { id: 'p', status: 'applied' },
      error: null,
    });
    currentMock = client;
    const { applyToAgent } = await import('./sketchPromptService.js');
    const out = await applyToAgent('p', 'agent-x');
    expect(out.status).toBe('applied');
    expect(state.updateRow.agent_id).toBe('agent-x');
    expect(state.updateRow.status).toBe('applied');
  });

  it('archiveSketchPrompt sets status=archived', async () => {
    const { client, state } = installSupabase({ data: null, error: null });
    currentMock = client;
    const { archiveSketchPrompt } = await import('./sketchPromptService.js');
    await archiveSketchPrompt('p-1');
    expect(state.updateRow.status).toBe('archived');
    expect(state.filters).toContainEqual(['eq', 'id', 'p-1']);
  });

  it('deleteSketchPrompt issues a delete by id', async () => {
    const { client, state } = installSupabase({ data: null, error: null });
    currentMock = client;
    const { deleteSketchPrompt } = await import('./sketchPromptService.js');
    await deleteSketchPrompt('p-1');
    expect(state.op).toBe('delete');
    expect(state.filters).toContainEqual(['eq', 'id', 'p-1']);
  });
});
