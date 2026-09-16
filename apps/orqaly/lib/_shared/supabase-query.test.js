import { describe, expect, it, vi } from 'vitest';
import { runBestEffortSupabaseQuery } from './supabase-query.js';

function bareThenable(result, error) {
  return {
    then(resolve, reject) {
      return error ? reject(error) : resolve(result);
    },
  };
}

describe('runBestEffortSupabaseQuery', () => {
  it('awaits a Supabase-style thenable that has no catch method', async () => {
    const query = bareThenable({ data: [{ id: 'row-1' }], error: null });

    await expect(runBestEffortSupabaseQuery(query)).resolves.toEqual({
      data: [{ id: 'row-1' }],
      error: null,
    });
  });

  it('reports a PostgREST error without throwing', async () => {
    const onError = vi.fn();
    const error = { message: 'column missing', code: '42703' };

    await expect(
      runBestEffortSupabaseQuery(bareThenable({ data: null, error }), { onError })
    ).resolves.toEqual({ data: null, error });
    expect(onError).toHaveBeenCalledWith(error);
  });

  it('reports a rejected query without throwing', async () => {
    const onError = vi.fn();
    const error = new Error('network unavailable');

    await expect(
      runBestEffortSupabaseQuery(bareThenable(null, error), { onError })
    ).resolves.toEqual({ data: null, error });
    expect(onError).toHaveBeenCalledWith(error);
  });
});
