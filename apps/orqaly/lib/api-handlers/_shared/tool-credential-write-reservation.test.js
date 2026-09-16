import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  finalizeToolCredentialDelete,
  finalizeToolCredentialWrite,
  releaseToolCredentialWrite,
  reserveToolCredentialWrite,
  TOOL_CREDENTIAL_RESERVATION_FIELD,
  TOOL_CREDENTIAL_VERSION_FIELD,
} from './tool-credential-write-reservation.js';

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function contains(actual, expected) {
  if (expected === null || typeof expected !== 'object') return actual === expected;
  return Object.entries(expected).every(([key, value]) => contains(actual?.[key], value));
}

function makeToolAdmin(overrides = {}) {
  const row = {
    id: 'tool-1',
    user_id: 'user-1',
    name: 'Tool One',
    status: 'active',
    connection_type: 'api',
    data: { url: 'https://api.example.test' },
    updated_at: '2026-08-22T12:00:00.000Z',
    ...clone(overrides),
  };
  const operations = [];

  function fieldValue(field) {
    if (field.startsWith('data->>')) {
      const value = row.data?.[field.slice('data->>'.length)];
      return value == null ? null : String(value);
    }
    if (field.startsWith('data->')) {
      return row.data?.[field.slice('data->'.length)] ?? null;
    }
    return row[field] ?? null;
  }

  function query(operation, patch = null) {
    const filters = [];
    let returning = false;
    const evaluate = async () => {
      const matched = filters.every(({ kind, field, value }) => {
        const actual = fieldValue(field);
        if (kind === 'contains') return contains(actual, value);
        return actual === value;
      });
      operations.push({ operation, patch: clone(patch), filters: clone(filters), matched });
      if (!matched) return { data: null, error: null };
      if (operation === 'update') Object.assign(row, clone(patch));
      return { data: returning || operation === 'select' ? clone(row) : null, error: null };
    };
    const chain = {
      eq(field, value) {
        filters.push({ kind: 'eq', field, value });
        return chain;
      },
      is(field, value) {
        filters.push({ kind: 'is', field, value });
        return chain;
      },
      contains(field, value) {
        filters.push({ kind: 'contains', field, value });
        return chain;
      },
      select() {
        returning = true;
        return chain;
      },
      maybeSingle: evaluate,
      then(resolve, reject) {
        return evaluate().then(resolve, reject);
      },
    };
    return chain;
  }

  return {
    admin: {
      from(table) {
        expect(table).toBe('tools');
        return {
          select: () => query('select'),
          update: (patch) => query('update', patch),
        };
      },
    },
    row,
    operations,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('tool credential write reservation', () => {
  it('uses supported scalar JSON-path predicates and stores only opaque metadata', async () => {
    const { admin, row, operations } = makeToolAdmin({
      data: { url: 'https://api.example.test', apiKey: 'legacy-plaintext-secret' },
    });
    const snapshot = clone(row);

    const result = await reserveToolCredentialWrite({
      admin,
      userId: 'user-1',
      toolSnapshot: snapshot,
      source: 'browser-task',
      attemptId: 'attempt-browser',
    });

    expect(result.ok).toBe(true);
    expect(row.data).toMatchObject({
      url: 'https://api.example.test',
      [TOOL_CREDENTIAL_VERSION_FIELD]: 'attempt-browser',
      [TOOL_CREDENTIAL_RESERVATION_FIELD]: {
        attempt_id: 'attempt-browser',
        status: 'storing',
        source: 'browser-task',
      },
    });
    expect(JSON.stringify(row.data)).not.toContain('legacy-plaintext-secret');
    const reserveFilters = operations[0].filters;
    expect(reserveFilters).toContainEqual({
      kind: 'is',
      field: `data->${TOOL_CREDENTIAL_RESERVATION_FIELD}`,
      value: null,
    });
    expect(reserveFilters).toContainEqual({
      kind: 'is',
      field: `data->>${TOOL_CREDENTIAL_VERSION_FIELD}`,
      value: null,
    });
    expect(reserveFilters).not.toContainEqual(
      expect.objectContaining({ kind: 'eq', field: 'data' })
    );
  });

  it('rejects an old browser snapshot after a manual data edit', async () => {
    const { admin, row } = makeToolAdmin();
    const browserSnapshot = clone(row);
    row.data = { url: 'https://manually-edited.example.test' };
    row.updated_at = '2026-08-22T12:01:00.000Z';

    const result = await reserveToolCredentialWrite({
      admin,
      userId: 'user-1',
      toolSnapshot: browserSnapshot,
      source: 'browser-task',
      attemptId: 'stale-browser',
    });

    expect(result).toMatchObject({ ok: false, code: 'TOOL_SNAPSHOT_STALE', status: 409 });
    expect(row.data).toEqual({ url: 'https://manually-edited.example.test' });
  });

  it('rejects an old snapshot after a status edit', async () => {
    const { admin, row } = makeToolAdmin({ status: 'needs_setup' });
    const snapshot = clone(row);
    row.status = 'disabled';

    const result = await reserveToolCredentialWrite({
      admin,
      userId: 'user-1',
      toolSnapshot: snapshot,
      source: 'human-task-complete',
      attemptId: 'stale-status',
    });

    expect(result).toMatchObject({ ok: false, code: 'TOOL_SNAPSHOT_STALE' });
    expect(row.status).toBe('disabled');
  });

  it('uses the persistent version to reject a stale browser even in the same millisecond', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-22T12:00:00.000Z'));
    const { admin, row } = makeToolAdmin();
    const browserSnapshot = clone(row);

    const manual = await reserveToolCredentialWrite({
      admin,
      userId: 'user-1',
      toolSnapshot: clone(row),
      source: 'user-api-keys',
      attemptId: 'manual-attempt',
    });
    expect(manual.ok).toBe(true);
    expect((await finalizeToolCredentialWrite({ admin, reservation: manual.reservation })).ok).toBe(
      true
    );
    expect(row.updated_at).toBe(browserSnapshot.updated_at);

    const staleBrowser = await reserveToolCredentialWrite({
      admin,
      userId: 'user-1',
      toolSnapshot: browserSnapshot,
      source: 'browser-task',
      attemptId: 'browser-attempt',
    });

    expect(staleBrowser).toMatchObject({ ok: false, code: 'TOOL_SNAPSHOT_STALE' });
    expect(row.data[TOOL_CREDENTIAL_VERSION_FIELD]).toBe('manual-attempt');
  });

  it('never takes over an old-looking storing marker', async () => {
    const { admin, row, operations } = makeToolAdmin({
      data: {
        [TOOL_CREDENTIAL_VERSION_FIELD]: 'old-attempt',
        [TOOL_CREDENTIAL_RESERVATION_FIELD]: {
          attempt_id: 'old-attempt',
          status: 'storing',
          started_at: '2020-01-01T00:00:00.000Z',
        },
      },
    });

    const result = await reserveToolCredentialWrite({
      admin,
      userId: 'user-1',
      toolSnapshot: clone(row),
      source: 'tool-setup',
      attemptId: 'new-attempt',
    });

    expect(result).toMatchObject({
      ok: false,
      code: 'TOOL_CREDENTIAL_WRITE_IN_PROGRESS',
      status: 409,
    });
    expect(operations).toHaveLength(0);
    expect(row.data[TOOL_CREDENTIAL_RESERVATION_FIELD].attempt_id).toBe('old-attempt');
  });

  it('releases only the exact marker and retains the advanced version', async () => {
    const { admin, row } = makeToolAdmin({ status: 'needs_setup' });
    const reserved = await reserveToolCredentialWrite({
      admin,
      userId: 'user-1',
      toolSnapshot: clone(row),
      source: 'tool-setup',
      attemptId: 'failed-vault-attempt',
    });
    expect(reserved.ok).toBe(true);

    const released = await releaseToolCredentialWrite({
      admin,
      reservation: reserved.reservation,
    });

    expect(released.ok).toBe(true);
    expect(row.status).toBe('needs_setup');
    expect(row.data[TOOL_CREDENTIAL_RESERVATION_FIELD]).toBeUndefined();
    expect(row.data[TOOL_CREDENTIAL_VERSION_FIELD]).toBe('failed-vault-attempt');
  });

  it('fails closed instead of clearing a marker that no longer belongs to it', async () => {
    const { admin, row } = makeToolAdmin();
    const reserved = await reserveToolCredentialWrite({
      admin,
      userId: 'user-1',
      toolSnapshot: clone(row),
      source: 'browser-task',
      attemptId: 'attempt-a',
    });
    expect(reserved.ok).toBe(true);
    row.data[TOOL_CREDENTIAL_RESERVATION_FIELD].attempt_id = 'attempt-b';

    const released = await releaseToolCredentialWrite({
      admin,
      reservation: reserved.reservation,
    });

    expect(released).toMatchObject({
      ok: false,
      code: 'TOOL_CREDENTIAL_RECONCILIATION_REQUIRED',
      reconciliationRequired: true,
    });
    expect(row.data[TOOL_CREDENTIAL_RESERVATION_FIELD].attempt_id).toBe('attempt-b');
  });

  it.each([
    [false, 'inactive'],
    [true, 'active'],
  ])(
    'finalizes an exact delete with remaining=%s into %s',
    async (hasRemainingCredential, expectedStatus) => {
      const { admin, row } = makeToolAdmin({ status: 'active' });
      const reserved = await reserveToolCredentialWrite({
        admin,
        userId: 'user-1',
        toolSnapshot: clone(row),
        source: 'user-api-keys-delete',
        attemptId: `delete-${hasRemainingCredential}`,
      });

      const finalized = await finalizeToolCredentialDelete({
        admin,
        reservation: reserved.reservation,
        hasRemainingCredential,
      });

      expect(finalized.ok).toBe(true);
      expect(row.status).toBe(expectedStatus);
      expect(row.data[TOOL_CREDENTIAL_RESERVATION_FIELD]).toBeUndefined();
    }
  );
});
