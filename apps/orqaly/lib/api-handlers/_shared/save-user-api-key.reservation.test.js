import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  putEnvelope: vi.fn(),
  deleteEnvelope: vi.fn(),
  encryptEnvelope: vi.fn(),
  invalidateResolveCache: vi.fn(),
}));

vi.mock('../../../api/_lib/supabase-server.js', () => ({
  buildSupabaseAdminClient: vi.fn(() => null),
}));
vi.mock('../../security/envelope-crypto.js', () => ({
  buildAad: vi.fn(() => 'safe-aad'),
  encryptEnvelope: mocks.encryptEnvelope,
}));
vi.mock('../../security/vault-storage.js', () => ({
  putEnvelope: mocks.putEnvelope,
  deleteEnvelope: mocks.deleteEnvelope,
  buildVaultSecretName: vi.fn(() => 'safe-vault-name'),
}));
vi.mock('../../security/provider-catalog.js', () => ({
  isKnownProvider: vi.fn(() => true),
  probeProviderKey: vi.fn(async () => ({ ok: true })),
}));
vi.mock('../../security/resolve-user-key.js', () => ({
  invalidateResolveCache: mocks.invalidateResolveCache,
}));
vi.mock('../../../api/_lib/logger.js', () => ({
  createLogger: () => ({ warn: vi.fn() }),
}));

const { saveUserApiKey } = await import('./save-user-api-key.js');
const {
  reserveToolCredentialWrite,
  TOOL_CREDENTIAL_RESERVATION_FIELD,
  TOOL_CREDENTIAL_VERSION_FIELD,
} = await import('./tool-credential-write-reservation.js');

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function contains(actual, expected) {
  if (expected === null || typeof expected !== 'object') return actual === expected;
  return Object.entries(expected).every(([key, value]) => contains(actual?.[key], value));
}

function existingKey(overrides = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    user_id: 'user-1',
    provider: 'tool:tool-1',
    slot: 'default',
    label: 'Old Tool One',
    masked_preview: 'old…tail',
    fingerprint: 'old-fingerprint',
    key_length: 20,
    vault_secret_id: 'old-vault-secret-id',
    kek_id: 'ORQ_KEK_V1',
    is_current: true,
    superseded_at: null,
    superseded_by: null,
    last_tested_at: null,
    last_test_ok: null,
    created_at: '2026-08-20T12:00:00.000Z',
    updated_at: '2026-08-20T12:00:00.000Z',
    ...overrides,
  };
}

function makeAdmin({
  existing = null,
  insertMode = 'success',
  rotationModes = [],
  deleteMode = 'success',
  currentLoadError = false,
} = {}) {
  const tool = {
    id: 'tool-1',
    user_id: 'user-1',
    name: 'Tool One',
    status: 'needs_setup',
    connection_type: 'api',
    data: { url: 'https://api.example.test' },
    updated_at: '2026-08-22T12:00:00.000Z',
  };
  const state = {
    keyRows: existing ? [clone(existing)] : [],
    insertedPayloads: [],
    rpcCalls: [],
    rotationModes: [...rotationModes],
    inspectionUnknownIds: new Set(),
    deleteMode,
    currentLoadError,
    touch: 0,
  };

  function toolField(field) {
    if (field.startsWith('data->>')) {
      const value = tool.data?.[field.slice('data->>'.length)];
      return value == null ? null : String(value);
    }
    if (field.startsWith('data->')) {
      return tool.data?.[field.slice('data->'.length)] ?? null;
    }
    return tool[field] ?? null;
  }

  function toolQuery(operation, patch = null) {
    const filters = [];
    let returning = operation === 'select';
    const evaluate = async () => {
      const matched = filters.every(({ kind, field, value }) => {
        const actual = toolField(field);
        return kind === 'contains' ? contains(actual, value) : actual === value;
      });
      if (!matched) return { data: null, error: null };
      if (operation === 'update') {
        Object.assign(tool, clone(patch));
        state.touch += 1;
        tool.updated_at = new Date(Date.parse(tool.updated_at) + state.touch).toISOString();
      }
      return { data: returning ? clone(tool) : null, error: null };
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

  function keyQuery(operation, payload = null) {
    const filters = [];
    let returning = operation === 'select';
    const matches = (row) => filters.every(({ field, value }) => (row?.[field] ?? null) === value);

    const evaluate = async () => {
      if (operation === 'select') {
        const idFilter = filters.find(({ field }) => field === 'id')?.value;
        const currentLookup = filters.some(
          ({ field, value }) => field === 'is_current' && value === true
        );
        if (state.currentLoadError && currentLookup) {
          return { data: null, error: { message: 'current state unavailable' } };
        }
        if (idFilter && state.inspectionUnknownIds.has(idFilter)) {
          return { data: null, error: { message: 'inspection unavailable' } };
        }
        return { data: clone(state.keyRows.find(matches) || null), error: null };
      }

      if (operation === 'insert') {
        state.insertedPayloads.push(clone(payload));
        const row = {
          ...clone(payload),
          created_at: '2026-08-22T12:02:00.000Z',
          updated_at: '2026-08-22T12:02:00.000Z',
        };
        if (insertMode === 'error_absent') {
          return { data: null, error: { message: 'insert rejected' } };
        }
        if (insertMode === 'error_unknown') {
          state.inspectionUnknownIds.add(row.id);
          return { data: null, error: { message: 'insert response unknown' } };
        }
        if (insertMode === 'error_conflict') {
          state.keyRows.push({ ...row, fingerprint: 'conflicting-fingerprint' });
          return { data: null, error: { message: 'insert response unknown' } };
        }
        state.keyRows.push(row);
        if (insertMode === 'throw_committed') throw new Error('connection dropped after insert');
        if (insertMode === 'error_committed') {
          return { data: null, error: { message: 'connection dropped after insert' } };
        }
        return { data: returning ? clone(row) : null, error: null };
      }

      const index = state.keyRows.findIndex(matches);
      if (state.deleteMode === 'error_unknown') {
        const id = filters.find(({ field }) => field === 'id')?.value;
        if (id) state.inspectionUnknownIds.add(id);
        return { data: null, error: { message: 'delete outcome unknown' } };
      }
      if (state.deleteMode === 'error_present') {
        return { data: null, error: { message: 'delete rejected' } };
      }
      if (index < 0) return { data: null, error: null };
      const [deleted] = state.keyRows.splice(index, 1);
      if (state.deleteMode === 'error_absent') {
        return { data: null, error: { message: 'delete response lost' } };
      }
      return { data: returning ? { id: deleted.id } : null, error: null };
    };

    const chain = {
      eq(field, value) {
        filters.push({ field, value });
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

  function commitRotation(args) {
    const oldRow = state.keyRows.find(({ id }) => id === args.p_old_id);
    const newRow = state.keyRows.find(({ id }) => id === args.p_new_id);
    oldRow.is_current = false;
    oldRow.superseded_at = '2026-08-22T12:03:00.000Z';
    oldRow.superseded_by = newRow.id;
    oldRow.updated_at = '2026-08-22T12:03:00.000Z';
    newRow.is_current = true;
    newRow.updated_at = '2026-08-22T12:03:00.000Z';
  }

  const admin = {
    from(table) {
      if (table === 'tools') {
        return {
          select: () => toolQuery('select'),
          update: (patch) => toolQuery('update', patch),
        };
      }
      if (table === 'user_api_keys') {
        return {
          select: () => keyQuery('select'),
          insert: (payload) => keyQuery('insert', payload),
          delete: () => keyQuery('delete'),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
    async rpc(name, args) {
      expect(name).toBe('rotate_user_api_key_current');
      state.rpcCalls.push(clone(args));
      const mode = state.rotationModes.shift() || 'success';
      if (mode === 'success') {
        commitRotation(args);
        return { data: { old_id: args.p_old_id, new_id: args.p_new_id }, error: null };
      }
      if (mode === 'error_committed') {
        commitRotation(args);
        return { data: null, error: { message: 'rotation response lost' } };
      }
      if (mode === 'throw_committed') {
        commitRotation(args);
        throw new Error('rotation response lost');
      }
      if (mode === 'error_conflict') {
        const oldRow = state.keyRows.find(({ id }) => id === args.p_old_id);
        oldRow.is_current = false;
        oldRow.superseded_at = '2026-08-22T12:03:00.000Z';
        oldRow.superseded_by = '22222222-2222-4222-8222-222222222222';
        oldRow.updated_at = '2026-08-22T12:03:00.000Z';
        return { data: null, error: { message: 'rotation raced' } };
      }
      if (mode === 'error_unknown') {
        state.inspectionUnknownIds.add(args.p_old_id);
        state.inspectionUnknownIds.add(args.p_new_id);
      }
      return { data: null, error: { message: `rotation ${mode}` } };
    },
  };
  return { admin, tool, state };
}

async function reserve(admin, tool, attemptId = 'successful-attempt') {
  return reserveToolCredentialWrite({
    admin,
    userId: 'user-1',
    toolSnapshot: clone(tool),
    source: 'tool-setup',
    attemptId,
  });
}

async function save({ admin, reservation }) {
  return saveUserApiKey({
    userId: 'user-1',
    provider: 'tool:tool-1',
    label: 'Tool One',
    apiKey: 'plaintext-secret-value',
    skipProbe: true,
    adminClient: admin,
    toolCredentialReservation: reservation,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.encryptEnvelope.mockReturnValue({
    envelope: JSON.stringify({ ciphertext: 'encrypted-only' }),
    maskedPreview: 'abcd…wxyz',
    fingerprint: 'fingerprint',
    keyLength: 24,
    kekId: 'ORQ_KEK_V1',
  });
  mocks.putEnvelope.mockResolvedValue('vault-secret-id');
  mocks.deleteEnvelope.mockResolvedValue(undefined);
});

describe('saveUserApiKey tool reservation boundary', () => {
  it('rejects a tool-scoped write without a reservation before Vault', async () => {
    const { admin } = makeAdmin();

    const result = await save({ admin, reservation: null });

    expect(result).toMatchObject({
      success: false,
      code: 'TOOL_RESERVATION_REQUIRED',
      status: 409,
    });
    expect(mocks.putEnvelope).not.toHaveBeenCalled();
  });

  it('re-verifies the exact marker immediately before Vault', async () => {
    const { admin, tool } = makeAdmin();
    const reserved = await reserve(admin, tool, 'browser-attempt');
    expect(reserved.ok).toBe(true);
    tool.data[TOOL_CREDENTIAL_RESERVATION_FIELD].attempt_id = 'manual-attempt';

    const result = await save({ admin, reservation: reserved.reservation });

    expect(result).toMatchObject({ success: false, code: 'TOOL_RESERVATION_LOST' });
    expect(mocks.putEnvelope).not.toHaveBeenCalled();
    expect(tool.data[TOOL_CREDENTIAL_RESERVATION_FIELD].attempt_id).toBe('manual-attempt');
  });

  it('releases only its exact reservation after a known Vault failure', async () => {
    const { admin, tool } = makeAdmin();
    const reserved = await reserve(admin, tool, 'vault-failure-attempt');
    mocks.putEnvelope.mockRejectedValueOnce(new Error('vault unavailable'));

    const result = await save({ admin, reservation: reserved.reservation });

    expect(result).toMatchObject({ success: false, code: 'VAULT_PUT_FAILED' });
    expect(tool.status).toBe('needs_setup');
    expect(tool.data[TOOL_CREDENTIAL_RESERVATION_FIELD]).toBeUndefined();
    expect(tool.data[TOOL_CREDENTIAL_VERSION_FIELD]).toBe('vault-failure-attempt');
  });

  it('pre-generates the row id and finalizes after encrypted-only persistence', async () => {
    const { admin, tool, state } = makeAdmin();
    const reserved = await reserve(admin, tool);

    const result = await save({ admin, reservation: reserved.reservation });

    expect(result.success).toBe(true);
    expect(result.row.id).toBe(state.insertedPayloads[0].id);
    expect(result.row.id).toMatch(/^[0-9a-f]{8}-[0-9a-f-]{27}$/i);
    expect(tool.status).toBe('active');
    expect(tool.data[TOOL_CREDENTIAL_RESERVATION_FIELD]).toBeUndefined();
    expect(tool.data[TOOL_CREDENTIAL_VERSION_FIELD]).toBe('successful-attempt');
    expect(JSON.stringify(state.insertedPayloads)).not.toContain('plaintext-secret-value');
    expect(mocks.putEnvelope).toHaveBeenCalledWith(
      expect.objectContaining({ envelopeJson: expect.stringContaining('encrypted-only') })
    );
  });

  it.each(['error_committed', 'throw_committed'])(
    'reconciles a committed insert after %s response loss without deleting Vault',
    async (insertMode) => {
      const { admin, tool, state } = makeAdmin({ insertMode });
      const reserved = await reserve(admin, tool, `insert-${insertMode}`);

      const result = await save({ admin, reservation: reserved.reservation });

      expect(result.success).toBe(true);
      expect(result.row.id).toBe(state.insertedPayloads[0].id);
      expect(mocks.deleteEnvelope).not.toHaveBeenCalled();
      expect(tool.data[TOOL_CREDENTIAL_RESERVATION_FIELD]).toBeUndefined();
    }
  );

  it('cleans Vault and releases only when a failed insert is proven absent', async () => {
    const old = existingKey();
    const { admin, tool, state } = makeAdmin({ existing: old, insertMode: 'error_absent' });
    const reserved = await reserve(admin, tool, 'insert-absent');

    const result = await save({ admin, reservation: reserved.reservation });

    expect(result).toMatchObject({ success: false, code: 'INSERT_FAILED' });
    expect(mocks.deleteEnvelope).toHaveBeenCalledWith('vault-secret-id');
    expect(tool.data[TOOL_CREDENTIAL_RESERVATION_FIELD]).toBeUndefined();
    expect(state.keyRows).toHaveLength(1);
    expect(state.keyRows[0]).toMatchObject({ id: old.id, is_current: true });
  });

  it.each(['error_unknown', 'error_conflict'])(
    'retains Vault and the tool fence when insert inspection is %s',
    async (insertMode) => {
      const { admin, tool } = makeAdmin({ insertMode });
      const reserved = await reserve(admin, tool, `insert-${insertMode}`);

      const result = await save({ admin, reservation: reserved.reservation });

      expect(result).toMatchObject({
        success: false,
        code: 'API_KEY_RECONCILIATION_REQUIRED',
        reconciliationRequired: true,
        credentialStored: true,
      });
      expect(mocks.deleteEnvelope).not.toHaveBeenCalled();
      expect(tool.data[TOOL_CREDENTIAL_RESERVATION_FIELD]).toMatchObject({
        attempt_id: `insert-${insertMode}`,
        status: 'storing',
      });
    }
  );

  it.each(['error_committed', 'throw_committed'])(
    'reconciles a committed atomic rotation after %s response loss',
    async (rotationMode) => {
      const old = existingKey();
      const { admin, tool, state } = makeAdmin({
        existing: old,
        rotationModes: [rotationMode],
      });
      const reserved = await reserve(admin, tool, `rotation-${rotationMode}`);

      const result = await save({ admin, reservation: reserved.reservation });

      expect(result.success).toBe(true);
      const currentRows = state.keyRows.filter(({ is_current }) => is_current);
      expect(currentRows).toHaveLength(1);
      expect(currentRows[0].id).toBe(result.row.id);
      expect(state.keyRows.find(({ id }) => id === old.id)).toMatchObject({
        is_current: false,
        superseded_by: result.row.id,
      });
      expect(mocks.deleteEnvelope).not.toHaveBeenCalled();
    }
  );

  it('retries a proven original RPC, then cleans the exact candidate without a current-key gap', async () => {
    const old = existingKey();
    const { admin, tool, state } = makeAdmin({
      existing: old,
      rotationModes: ['error_original', 'error_original'],
    });
    const reserved = await reserve(admin, tool, 'rotation-absent');

    const result = await save({ admin, reservation: reserved.reservation });

    expect(result).toMatchObject({ success: false, code: 'ROTATION_FAILED' });
    expect(state.rpcCalls).toHaveLength(2);
    expect(state.keyRows).toHaveLength(1);
    expect(state.keyRows[0]).toMatchObject({ id: old.id, is_current: true });
    expect(mocks.deleteEnvelope).toHaveBeenCalledWith('vault-secret-id');
    expect(tool.data[TOOL_CREDENTIAL_RESERVATION_FIELD]).toBeUndefined();
  });

  it('succeeds when a proven-original rotation retry commits', async () => {
    const old = existingKey();
    const { admin, tool, state } = makeAdmin({
      existing: old,
      rotationModes: ['error_original', 'success'],
    });
    const reserved = await reserve(admin, tool, 'rotation-retry');

    const result = await save({ admin, reservation: reserved.reservation });

    expect(result.success).toBe(true);
    expect(state.rpcCalls).toHaveLength(2);
    expect(state.keyRows.filter(({ is_current }) => is_current)).toEqual([
      expect.objectContaining({ id: result.row.id }),
    ]);
    expect(mocks.deleteEnvelope).not.toHaveBeenCalled();
  });

  it('retains the candidate, Vault, and fence when exact cleanup is ambiguous', async () => {
    const { admin, tool, state } = makeAdmin({
      existing: existingKey(),
      rotationModes: ['error_original', 'error_original'],
      deleteMode: 'error_unknown',
    });
    const reserved = await reserve(admin, tool, 'rotation-cleanup-unknown');

    const result = await save({ admin, reservation: reserved.reservation });

    expect(result).toMatchObject({
      success: false,
      code: 'API_KEY_RECONCILIATION_REQUIRED',
      reconciliationRequired: true,
    });
    expect(state.keyRows).toHaveLength(2);
    expect(mocks.deleteEnvelope).not.toHaveBeenCalled();
    expect(tool.data[TOOL_CREDENTIAL_RESERVATION_FIELD]).toMatchObject({
      attempt_id: 'rotation-cleanup-unknown',
    });
  });

  it.each(['error_conflict', 'error_unknown'])(
    'keeps candidate, Vault, and tool fence for a %s rotation result',
    async (rotationMode) => {
      const { admin, tool, state } = makeAdmin({
        existing: existingKey(),
        rotationModes: [rotationMode],
      });
      const reserved = await reserve(admin, tool, `rotation-${rotationMode}`);

      const result = await save({ admin, reservation: reserved.reservation });

      expect(result).toMatchObject({
        success: false,
        code: 'API_KEY_RECONCILIATION_REQUIRED',
        reconciliationRequired: true,
      });
      expect(state.keyRows).toHaveLength(2);
      expect(mocks.deleteEnvelope).not.toHaveBeenCalled();
      expect(tool.data[TOOL_CREDENTIAL_RESERVATION_FIELD]).toMatchObject({
        attempt_id: `rotation-${rotationMode}`,
      });
    }
  );

  it('passes both exact snapshots to the service-role rotation RPC', async () => {
    const old = existingKey();
    const { admin, tool, state } = makeAdmin({ existing: old });
    const reserved = await reserve(admin, tool, 'rotation-args');

    const result = await save({ admin, reservation: reserved.reservation });

    expect(result.success).toBe(true);
    expect(state.rpcCalls[0]).toMatchObject({
      p_user_id: 'user-1',
      p_provider: 'tool:tool-1',
      p_slot: 'default',
      p_old_id: old.id,
      p_old_updated_at: old.updated_at,
      p_old_vault_secret_id: old.vault_secret_id,
      p_new_id: result.row.id,
      p_new_updated_at: '2026-08-22T12:02:00.000Z',
      p_new_vault_secret_id: 'vault-secret-id',
    });
  });
});
