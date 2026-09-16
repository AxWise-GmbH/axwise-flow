import { describe, expect, it, vi } from 'vitest';

import { handleList } from './goals.js';

const user = { id: 'user-1' };

// Minimal supabase query-builder double: every chainable call records its
// arguments and returns `this`, and awaiting the builder resolves the result.
function makeAdmin(rows = [], error = null) {
  const calls = { eq: [], order: [], limit: [], select: [] };
  const builder = {
    select: vi.fn(function (cols) {
      calls.select.push(cols);
      return this;
    }),
    eq: vi.fn(function (col, val) {
      calls.eq.push([col, val]);
      return this;
    }),
    order: vi.fn(function (col, opts) {
      calls.order.push([col, opts]);
      return this;
    }),
    limit: vi.fn(function (n) {
      calls.limit.push(n);
      return this;
    }),
    then: (resolve) => resolve({ data: rows, error }),
  };
  return { admin: { from: vi.fn(() => builder) }, calls, builder };
}

describe('handleList', () => {
  it('requests 200 goals, newest first, scoped to the caller', async () => {
    const { admin, calls } = makeAdmin([{ id: 'g1' }]);

    const res = await handleList(admin, user, {});

    expect(admin.from).toHaveBeenCalledWith('goals');
    expect(calls.limit).toEqual([200]);
    expect(calls.order).toEqual([['created_at', { ascending: false }]]);
    expect(calls.eq).toEqual([['user_id', 'user-1']]);
    expect(res).toEqual({ status: 200, data: [{ id: 'g1' }] });
  });

  it('adds a status predicate when one is supplied', async () => {
    const { admin, calls } = makeAdmin([]);

    await handleList(admin, user, { status: 'completed' });

    expect(calls.eq).toEqual([
      ['user_id', 'user-1'],
      ['status', 'completed'],
    ]);
  });

  it('returns an empty array when the query yields no rows', async () => {
    const { admin } = makeAdmin(null);

    await expect(handleList(admin, user, {})).resolves.toEqual({ status: 200, data: [] });
  });

  it('throws when the query fails', async () => {
    const { admin } = makeAdmin(null, new Error('boom'));

    await expect(handleList(admin, user, {})).rejects.toThrow('boom');
  });
});
