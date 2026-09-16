import { describe, expect, it, vi } from 'vitest';
import { ensureOwnedToolPlaceholder } from './_tool-placeholder.js';

function adminFixture({ existing = null, insertError = null, commitBeforeError = false } = {}) {
  let row = existing;
  const insert = vi.fn(async (candidate) => {
    if (!insertError || commitBeforeError) row = candidate;
    if (insertError instanceof Error) throw insertError;
    return { error: insertError };
  });
  const from = vi.fn(() => {
    let requestedId = null;
    let requestedUserId = null;
    const query = {
      eq: vi.fn((field, value) => {
        if (field === 'id') requestedId = value;
        if (field === 'user_id') requestedUserId = value;
        return query;
      }),
      maybeSingle: vi.fn(async () => ({
        data:
          row?.id === requestedId && row?.user_id === requestedUserId
            ? { id: row.id, user_id: row.user_id }
            : null,
        error: null,
      })),
    };
    return { insert, select: vi.fn(() => query) };
  });
  return { admin: { from }, insert };
}

const placeholder = {
  id: 'tool-github',
  user_id: 'user-2',
  name: 'GitHub',
  connection_type: 'api',
};

describe('ensureOwnedToolPlaceholder', () => {
  it('does not insert when this owner already has the canonical tool', async () => {
    const { admin, insert } = adminFixture({ existing: placeholder });

    await expect(ensureOwnedToolPlaceholder(admin, placeholder)).resolves.toMatchObject({
      created: false,
    });
    expect(insert).not.toHaveBeenCalled();
  });

  it('accepts a returned insert error only after the exact owner row is visible', async () => {
    const { admin } = adminFixture({
      insertError: { code: 'FETCH_ERROR', message: 'response lost' },
      commitBeforeError: true,
    });

    await expect(ensureOwnedToolPlaceholder(admin, placeholder)).resolves.toMatchObject({
      created: true,
      recovered: true,
    });
  });

  it('accepts a thrown response loss only after the exact owner row is visible', async () => {
    const { admin } = adminFixture({
      insertError: new Error('connection closed after commit'),
      commitBeforeError: true,
    });

    await expect(ensureOwnedToolPlaceholder(admin, placeholder)).resolves.toMatchObject({
      created: true,
      recovered: true,
    });
  });

  it('rejects a proven absent insert instead of parking the goal behind a missing row', async () => {
    const { admin } = adminFixture({
      insertError: { code: 'XX000', message: 'database unavailable' },
    });

    await expect(ensureOwnedToolPlaceholder(admin, placeholder)).rejects.toMatchObject({
      code: 'XX000',
    });
  });
});
