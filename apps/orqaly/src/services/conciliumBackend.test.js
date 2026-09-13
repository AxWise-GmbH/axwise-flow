/**
 * Tests for conciliumBackend.js — Supabase CRUD for concilium boards (v2 schema).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

let mockHasSupabase = true;
let mockUserId = 'user-abc-123';

// Chainable query builder — each method returns `this` until the terminal call.
function createQueryBuilder(resolvedValue = { data: [], error: null }) {
  const builder = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockResolvedValue(resolvedValue),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue(resolvedValue),
  };
  // For update/delete chains the terminal .eq must resolve
  // We override eq to resolve when it is the last in the chain
  // by making it return a thenable that also has .eq
  const terminalEq = vi.fn().mockResolvedValue(resolvedValue);
  terminalEq.eq = terminalEq; // allow further chaining
  builder.eq.mockReturnValue(terminalEq);
  // select -> eq -> order chain
  builder.select.mockReturnValue({
    eq: vi.fn().mockReturnValue({
      order: vi.fn().mockResolvedValue(resolvedValue),
    }),
  });
  return builder;
}

let queryBuilder;

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(),
    },
    from: vi.fn(),
  },
  hasSupabase: vi.fn(),
}));

vi.mock('./auditLogBackend', () => ({
  logAction: vi.fn().mockResolvedValue(undefined),
  buildAgentMeta: vi.fn().mockReturnValue({}),
}));

// Import after mocks are declared
import {
  loadConcilium,
  createConcilium,
  updateConciliumById,
  deleteConciliumById,
} from './conciliumBackend';
import { supabase, hasSupabase } from '../lib/supabase';
import { logAction, buildAgentMeta } from './auditLogBackend';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** A full DB row with all v2 columns populated. */
function makeSampleRow(overrides = {}) {
  return {
    id: 'row-1',
    uuid_id: 'uuid-abc',
    name: 'Alpha Board',
    quantity: 3,
    llms: ['gpt-4', 'claude-3'],
    purpose: 'testing',
    status: 'active',
    created_by_id: 'creator-1',
    created_by_name: 'Alice',
    change_log: [{ msg: 'init' }],
    started_at: '2026-01-01T00:00:00Z',
    working_on: ['task-a'],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
    description: 'A test board',
    security_level: 'high',
    approval_threshold: '0.8',
    confidence_threshold: '0.9',
    auto_quarantine_on_violation: true,
    ...overrides,
  };
}

/** A camelCase concilium object matching the frontend shape. */
function makeSampleConcilium(overrides = {}) {
  return {
    id: 'conc-1',
    name: 'Beta Board',
    quantity: 2,
    llms: ['groq-1'],
    purpose: 'analysis',
    status: 'active',
    createdById: 'creator-2',
    createdByName: 'Bob',
    changeLog: [],
    startedAt: '2026-02-01T00:00:00Z',
    workingOn: [],
    description: 'A beta board',
    securityLevel: 'elevated',
    approvalThreshold: 0.75,
    confidenceThreshold: 0.85,
    autoQuarantineOnViolation: true,
    ...overrides,
  };
}

// ── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockHasSupabase = true;
  mockUserId = 'user-abc-123';

  hasSupabase.mockImplementation(() => mockHasSupabase);
  supabase.auth.getUser.mockResolvedValue({
    data: { user: { id: mockUserId } },
  });

  queryBuilder = createQueryBuilder();
  supabase.from.mockReturnValue(queryBuilder);
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('conciliumBackend', () => {
  // ── assertSupabase ───────────────────────────────────────────────────────
  describe('assertSupabase', () => {
    it('should throw when hasSupabase returns false', async () => {
      mockHasSupabase = false;
      await expect(loadConcilium()).rejects.toThrow('Supabase required for concilium');
    });

    it('should not throw when hasSupabase returns true', async () => {
      mockHasSupabase = true;
      // Will proceed past assertSupabase (may succeed or fail on auth — that is fine)
      await expect(loadConcilium()).resolves.toBeDefined();
    });
  });

  // ── getAuthUserId ────────────────────────────────────────────────────────
  describe('getAuthUserId', () => {
    it('should return null and throw when user is not authenticated', async () => {
      supabase.auth.getUser.mockResolvedValue({ data: { user: null } });
      await expect(loadConcilium()).rejects.toThrow('Must be authenticated');
    });

    it('should return null and throw when getUser returns undefined user', async () => {
      supabase.auth.getUser.mockResolvedValue({ data: { user: undefined } });
      await expect(loadConcilium()).rejects.toThrow('Must be authenticated');
    });
  });

  // ── loadConcilium ───────────────────────────────────────────────────────
  describe('loadConcilium', () => {
    it('should return mapped concilium rows on success', async () => {
      const rows = [makeSampleRow(), makeSampleRow({ id: 'row-2', name: 'Second' })];
      const selectEq = {
        order: vi.fn().mockResolvedValue({ data: rows, error: null }),
      };
      const selectResult = { eq: vi.fn().mockReturnValue(selectEq) };
      queryBuilder.select.mockReturnValue(selectResult);
      supabase.from.mockReturnValue(queryBuilder);

      const result = await loadConcilium();

      expect(supabase.from).toHaveBeenCalledWith('concilium');
      expect(queryBuilder.select).toHaveBeenCalledWith('*');
      expect(selectResult.eq).toHaveBeenCalledWith('user_id', mockUserId);
      expect(selectEq.order).toHaveBeenCalledWith('created_at', { ascending: false });
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('row-1');
      expect(result[1].name).toBe('Second');
    });

    it('should map v2 fields correctly from snake_case to camelCase', async () => {
      const row = makeSampleRow();
      const selectEq = {
        order: vi.fn().mockResolvedValue({ data: [row], error: null }),
      };
      queryBuilder.select.mockReturnValue({ eq: vi.fn().mockReturnValue(selectEq) });
      supabase.from.mockReturnValue(queryBuilder);

      const [item] = await loadConcilium();

      expect(item.uuidId).toBe('uuid-abc');
      expect(item.description).toBe('A test board');
      expect(item.securityLevel).toBe('high');
      expect(item.approvalThreshold).toBe(0.8);
      expect(item.confidenceThreshold).toBe(0.9);
      expect(item.autoQuarantineOnViolation).toBe(true);
    });

    it('should apply default values for missing v2 fields', async () => {
      const row = makeSampleRow({
        uuid_id: null,
        description: null,
        security_level: null,
        approval_threshold: null,
        confidence_threshold: null,
        auto_quarantine_on_violation: null,
      });
      const selectEq = {
        order: vi.fn().mockResolvedValue({ data: [row], error: null }),
      };
      queryBuilder.select.mockReturnValue({ eq: vi.fn().mockReturnValue(selectEq) });
      supabase.from.mockReturnValue(queryBuilder);

      const [item] = await loadConcilium();

      expect(item.uuidId).toBeNull();
      expect(item.description).toBe('');
      expect(item.securityLevel).toBe('standard');
      expect(item.approvalThreshold).toBe(0.6);
      expect(item.confidenceThreshold).toBe(0.7);
      expect(item.autoQuarantineOnViolation).toBe(false);
    });

    it('should map v1 fields correctly', async () => {
      const row = makeSampleRow();
      const selectEq = {
        order: vi.fn().mockResolvedValue({ data: [row], error: null }),
      };
      queryBuilder.select.mockReturnValue({ eq: vi.fn().mockReturnValue(selectEq) });
      supabase.from.mockReturnValue(queryBuilder);

      const [item] = await loadConcilium();

      expect(item.name).toBe('Alpha Board');
      expect(item.quantity).toBe(3);
      expect(item.llms).toEqual(['gpt-4', 'claude-3']);
      expect(item.purpose).toBe('testing');
      expect(item.status).toBe('active');
      expect(item.createdById).toBe('creator-1');
      expect(item.createdByName).toBe('Alice');
      expect(item.changeLog).toEqual([{ msg: 'init' }]);
      expect(item.startedAt).toBe('2026-01-01T00:00:00Z');
      expect(item.workingOn).toEqual(['task-a']);
      expect(item.createdAt).toBe('2026-01-01T00:00:00Z');
      expect(item.updatedAt).toBe('2026-01-02T00:00:00Z');
    });

    it('should return empty array when data is null', async () => {
      const selectEq = {
        order: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
      queryBuilder.select.mockReturnValue({ eq: vi.fn().mockReturnValue(selectEq) });
      supabase.from.mockReturnValue(queryBuilder);

      const result = await loadConcilium();
      expect(result).toEqual([]);
    });

    it('should throw when Supabase returns an error', async () => {
      const dbError = new Error('relation "concilium" does not exist');
      const selectEq = {
        order: vi.fn().mockResolvedValue({ data: null, error: dbError }),
      };
      queryBuilder.select.mockReturnValue({ eq: vi.fn().mockReturnValue(selectEq) });
      supabase.from.mockReturnValue(queryBuilder);

      await expect(loadConcilium()).rejects.toThrow('relation "concilium" does not exist');
    });

    it('should handle row with non-array llms gracefully', async () => {
      const row = makeSampleRow({ llms: 'not-an-array', working_on: null, change_log: 'nope' });
      const selectEq = {
        order: vi.fn().mockResolvedValue({ data: [row], error: null }),
      };
      queryBuilder.select.mockReturnValue({ eq: vi.fn().mockReturnValue(selectEq) });
      supabase.from.mockReturnValue(queryBuilder);

      const [item] = await loadConcilium();
      expect(item.llms).toEqual([]);
      expect(item.workingOn).toEqual([]);
      expect(item.changeLog).toEqual([]);
    });

    it('should handle null row in rowToConcilium returning null', async () => {
      // rowToConcilium returns null for falsy input; the map filters it
      const selectEq = {
        order: vi.fn().mockResolvedValue({ data: [null], error: null }),
      };
      queryBuilder.select.mockReturnValue({ eq: vi.fn().mockReturnValue(selectEq) });
      supabase.from.mockReturnValue(queryBuilder);

      const result = await loadConcilium();
      // null row maps to null via rowToConcilium
      expect(result).toEqual([null]);
    });
  });

  // ── createConcilium ─────────────────────────────────────────────────────
  describe('createConcilium', () => {
    it('should insert a row with user_id and return the concilium', async () => {
      queryBuilder.insert.mockResolvedValue({ error: null });
      supabase.from.mockReturnValue(queryBuilder);

      const concilium = makeSampleConcilium();
      const result = await createConcilium(concilium);

      expect(supabase.from).toHaveBeenCalledWith('concilium');
      expect(queryBuilder.insert).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: mockUserId })
      );
      expect(result).toBe(concilium);
    });

    it('should map camelCase v2 fields to snake_case in the inserted row', async () => {
      queryBuilder.insert.mockResolvedValue({ error: null });
      supabase.from.mockReturnValue(queryBuilder);

      const concilium = makeSampleConcilium();
      await createConcilium(concilium);

      const insertedRow = queryBuilder.insert.mock.calls[0][0];
      expect(insertedRow.description).toBe('A beta board');
      expect(insertedRow.security_level).toBe('elevated');
      expect(insertedRow.approval_threshold).toBe(0.75);
      expect(insertedRow.confidence_threshold).toBe(0.85);
      expect(insertedRow.auto_quarantine_on_violation).toBe(true);
    });

    it('should omit v2 fields from the row when undefined in the input', async () => {
      queryBuilder.insert.mockResolvedValue({ error: null });
      supabase.from.mockReturnValue(queryBuilder);

      const concilium = {
        id: 'conc-minimal',
        name: 'Minimal',
      };
      await createConcilium(concilium);

      const insertedRow = queryBuilder.insert.mock.calls[0][0];
      expect(insertedRow).not.toHaveProperty('description');
      expect(insertedRow).not.toHaveProperty('security_level');
      expect(insertedRow).not.toHaveProperty('approval_threshold');
      expect(insertedRow).not.toHaveProperty('confidence_threshold');
      expect(insertedRow).not.toHaveProperty('auto_quarantine_on_violation');
    });

    it('should call logAction after successful insert', async () => {
      queryBuilder.insert.mockResolvedValue({ error: null });
      supabase.from.mockReturnValue(queryBuilder);

      const concilium = makeSampleConcilium();
      await createConcilium(concilium);

      // logAction is fire-and-forget; allow microtasks to flush
      await vi.waitFor(() => {
        expect(logAction).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'Concilium created',
            entity: 'Concilium',
            entityId: concilium.id,
            details: concilium.name,
          })
        );
      });
    });

    it('should call buildAgentMeta when agentContext is provided', async () => {
      queryBuilder.insert.mockResolvedValue({ error: null });
      supabase.from.mockReturnValue(queryBuilder);

      const agentCtx = { id: 'agent-1', name: 'TestAgent' };
      await createConcilium(makeSampleConcilium(), agentCtx);

      expect(buildAgentMeta).toHaveBeenCalledWith(agentCtx);
    });

    it('should throw when Supabase insert returns an error', async () => {
      const dbError = new Error('insert failed');
      queryBuilder.insert.mockResolvedValue({ error: dbError });
      supabase.from.mockReturnValue(queryBuilder);

      await expect(createConcilium(makeSampleConcilium())).rejects.toThrow('insert failed');
    });

    it('should throw when user is not authenticated', async () => {
      supabase.auth.getUser.mockResolvedValue({ data: { user: null } });
      await expect(createConcilium(makeSampleConcilium())).rejects.toThrow('Must be authenticated');
    });

    it('should not call logAction when insert fails', async () => {
      const dbError = new Error('insert failed');
      queryBuilder.insert.mockResolvedValue({ error: dbError });
      supabase.from.mockReturnValue(queryBuilder);

      await expect(createConcilium(makeSampleConcilium())).rejects.toThrow();
      expect(logAction).not.toHaveBeenCalled();
    });
  });

  // ── updateConciliumById ─────────────────────────────────────────────────
  describe('updateConciliumById', () => {
    it('should update the row scoped to user_id and return the concilium', async () => {
      const secondEq = vi.fn().mockResolvedValue({ error: null });
      const firstEq = vi.fn().mockReturnValue({ eq: secondEq });
      queryBuilder.update.mockReturnValue({ eq: firstEq });
      supabase.from.mockReturnValue(queryBuilder);

      const concilium = makeSampleConcilium();
      const result = await updateConciliumById('conc-1', concilium);

      expect(supabase.from).toHaveBeenCalledWith('concilium');
      expect(queryBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Beta Board',
          updated_at: expect.any(String),
        })
      );
      expect(firstEq).toHaveBeenCalledWith('id', 'conc-1');
      expect(secondEq).toHaveBeenCalledWith('user_id', mockUserId);
      expect(result).toBe(concilium);
    });

    it('should include v2 snake_case fields in the update payload', async () => {
      const secondEq = vi.fn().mockResolvedValue({ error: null });
      const firstEq = vi.fn().mockReturnValue({ eq: secondEq });
      queryBuilder.update.mockReturnValue({ eq: firstEq });
      supabase.from.mockReturnValue(queryBuilder);

      await updateConciliumById('conc-1', makeSampleConcilium());

      const updatePayload = queryBuilder.update.mock.calls[0][0];
      expect(updatePayload.description).toBe('A beta board');
      expect(updatePayload.security_level).toBe('elevated');
      expect(updatePayload.approval_threshold).toBe(0.75);
      expect(updatePayload.confidence_threshold).toBe(0.85);
      expect(updatePayload.auto_quarantine_on_violation).toBe(true);
    });

    it('should call logAction after successful update', async () => {
      const secondEq = vi.fn().mockResolvedValue({ error: null });
      const firstEq = vi.fn().mockReturnValue({ eq: secondEq });
      queryBuilder.update.mockReturnValue({ eq: firstEq });
      supabase.from.mockReturnValue(queryBuilder);

      const concilium = makeSampleConcilium();
      await updateConciliumById('conc-1', concilium);

      await vi.waitFor(() => {
        expect(logAction).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'Concilium updated',
            entity: 'Concilium',
            entityId: 'conc-1',
            details: concilium.name,
          })
        );
      });
    });

    it('should call buildAgentMeta when agentContext is provided', async () => {
      const secondEq = vi.fn().mockResolvedValue({ error: null });
      const firstEq = vi.fn().mockReturnValue({ eq: secondEq });
      queryBuilder.update.mockReturnValue({ eq: firstEq });
      supabase.from.mockReturnValue(queryBuilder);

      const agentCtx = { id: 'agent-2', name: 'UpdateBot' };
      await updateConciliumById('conc-1', makeSampleConcilium(), agentCtx);

      expect(buildAgentMeta).toHaveBeenCalledWith(agentCtx);
    });

    it('should throw when Supabase update returns an error', async () => {
      const dbError = new Error('update failed');
      const secondEq = vi.fn().mockResolvedValue({ error: dbError });
      const firstEq = vi.fn().mockReturnValue({ eq: secondEq });
      queryBuilder.update.mockReturnValue({ eq: firstEq });
      supabase.from.mockReturnValue(queryBuilder);

      await expect(updateConciliumById('conc-1', makeSampleConcilium())).rejects.toThrow(
        'update failed'
      );
    });

    it('should throw when user is not authenticated', async () => {
      supabase.auth.getUser.mockResolvedValue({ data: { user: null } });
      await expect(updateConciliumById('conc-1', makeSampleConcilium())).rejects.toThrow(
        'Must be authenticated'
      );
    });
  });

  // ── deleteConciliumById ─────────────────────────────────────────────────
  describe('deleteConciliumById', () => {
    it('should delete the row scoped to user_id and return true', async () => {
      const secondEq = vi.fn().mockResolvedValue({ error: null });
      const firstEq = vi.fn().mockReturnValue({ eq: secondEq });
      queryBuilder.delete.mockReturnValue({ eq: firstEq });
      supabase.from.mockReturnValue(queryBuilder);

      const result = await deleteConciliumById('conc-1');

      expect(supabase.from).toHaveBeenCalledWith('concilium');
      expect(queryBuilder.delete).toHaveBeenCalled();
      expect(firstEq).toHaveBeenCalledWith('id', 'conc-1');
      expect(secondEq).toHaveBeenCalledWith('user_id', mockUserId);
      expect(result).toBe(true);
    });

    it('should call logAction with importance "high" after successful delete', async () => {
      const secondEq = vi.fn().mockResolvedValue({ error: null });
      const firstEq = vi.fn().mockReturnValue({ eq: secondEq });
      queryBuilder.delete.mockReturnValue({ eq: firstEq });
      supabase.from.mockReturnValue(queryBuilder);

      await deleteConciliumById('conc-1');

      await vi.waitFor(() => {
        expect(logAction).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'Concilium deleted',
            entity: 'Concilium',
            entityId: 'conc-1',
            details: 'Concilium removed',
            meta: expect.objectContaining({
              importance: 'high',
              tags: ['delete', 'concilium'],
              source: 'conciliumBackend',
            }),
          })
        );
      });
    });

    it('should call buildAgentMeta when agentContext is provided', async () => {
      const secondEq = vi.fn().mockResolvedValue({ error: null });
      const firstEq = vi.fn().mockReturnValue({ eq: secondEq });
      queryBuilder.delete.mockReturnValue({ eq: firstEq });
      supabase.from.mockReturnValue(queryBuilder);

      const agentCtx = { id: 'agent-3', name: 'CleanupBot' };
      await deleteConciliumById('conc-1', agentCtx);

      expect(buildAgentMeta).toHaveBeenCalledWith(agentCtx);
    });

    it('should throw when Supabase delete returns an error', async () => {
      const dbError = new Error('delete failed');
      const secondEq = vi.fn().mockResolvedValue({ error: dbError });
      const firstEq = vi.fn().mockReturnValue({ eq: secondEq });
      queryBuilder.delete.mockReturnValue({ eq: firstEq });
      supabase.from.mockReturnValue(queryBuilder);

      await expect(deleteConciliumById('conc-1')).rejects.toThrow('delete failed');
    });

    it('should throw when user is not authenticated', async () => {
      supabase.auth.getUser.mockResolvedValue({ data: { user: null } });
      await expect(deleteConciliumById('conc-1')).rejects.toThrow('Must be authenticated');
    });

    it('should not call logAction when delete fails', async () => {
      const dbError = new Error('delete failed');
      const secondEq = vi.fn().mockResolvedValue({ error: dbError });
      const firstEq = vi.fn().mockReturnValue({ eq: secondEq });
      queryBuilder.delete.mockReturnValue({ eq: firstEq });
      supabase.from.mockReturnValue(queryBuilder);

      await expect(deleteConciliumById('conc-1')).rejects.toThrow();
      expect(logAction).not.toHaveBeenCalled();
    });
  });

  // ── Cross-cutting: Supabase guard on every exported function ────────────
  describe('assertSupabase guard on all exports', () => {
    it('should throw from createConcilium when hasSupabase is false', async () => {
      mockHasSupabase = false;
      await expect(createConcilium(makeSampleConcilium())).rejects.toThrow(
        'Supabase required for concilium'
      );
    });

    it('should throw from updateConciliumById when hasSupabase is false', async () => {
      mockHasSupabase = false;
      await expect(updateConciliumById('x', makeSampleConcilium())).rejects.toThrow(
        'Supabase required for concilium'
      );
    });

    it('should throw from deleteConciliumById when hasSupabase is false', async () => {
      mockHasSupabase = false;
      await expect(deleteConciliumById('x')).rejects.toThrow('Supabase required for concilium');
    });
  });
});
