/**
 * Tests for requestBackend.js — Supabase + localStorage fallback CRUD for job requests.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

let mockHasSupabase = true;
let mockUserId = 'user-abc-123';

function createQueryBuilder(resolvedValue = { data: [], error: null }) {
  const builder = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockResolvedValue(resolvedValue),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue(resolvedValue),
    limit: vi.fn().mockResolvedValue(resolvedValue),
  };
  const terminalEq = vi.fn().mockResolvedValue(resolvedValue);
  terminalEq.eq = terminalEq;
  builder.eq.mockReturnValue(terminalEq);
  builder.select.mockReturnValue({
    eq: vi.fn().mockReturnValue({
      order: vi.fn().mockResolvedValue(resolvedValue),
    }),
    limit: vi.fn().mockResolvedValue(resolvedValue),
  });
  return builder;
}

let queryBuilder;

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: vi.fn() },
    from: vi.fn(),
  },
  hasSupabase: vi.fn(),
}));

vi.mock('./auditLogBackend', () => ({
  logAction: vi.fn().mockResolvedValue(undefined),
  buildAgentMeta: vi.fn().mockReturnValue({}),
}));

import {
  isTableReady,
  loadRequests,
  createRequest,
  updateRequestById,
  deleteRequestById,
} from './requestBackend';
import { supabase, hasSupabase } from '../lib/supabase';
import { logAction } from './auditLogBackend';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeSampleRow(overrides = {}) {
  return {
    id: 'req-123-abc',
    request_text: 'Build a dashboard for sales data',
    status: 'pending',
    parsed_title: 'Sales Dashboard',
    parsed_category: 'analytics',
    parsed_requirements: 'Must include charts and filters',
    parsed_priority: 'high',
    assigned_concilium_id: null,
    assigned_concilium_name: '',
    result_job_id: null,
    result_agent_id: null,
    processing_notes: '',
    cost_usd: 0,
    data: {},
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
    ...overrides,
  };
}

function makeSampleRequest(overrides = {}) {
  return {
    id: 'req-456-def',
    requestText: 'Analyze partner engagement metrics',
    status: 'pending',
    parsedTitle: null,
    parsedCategory: null,
    parsedRequirements: null,
    parsedPriority: 'medium',
    assignedConciliumId: null,
    assignedConciliumName: '',
    resultJobId: null,
    resultAgentId: null,
    processingNotes: '',
    costUsd: 0,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
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

describe('requestBackend', () => {
  describe('isTableReady', () => {
    it('should return false when hasSupabase is false', async () => {
      mockHasSupabase = false;
      const ready = await isTableReady();
      expect(ready).toBe(false);
    });
  });

  describe('loadRequests', () => {
    it('should return mapped request rows from Supabase', async () => {
      const rows = [
        makeSampleRow(),
        makeSampleRow({ id: 'req-789', request_text: 'Another request' }),
      ];
      const selectResult = {
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: rows, error: null }),
        }),
        limit: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
      queryBuilder.select.mockReturnValue(selectResult);
      supabase.from.mockReturnValue(queryBuilder);

      const result = await loadRequests();

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('req-123-abc');
      expect(result[0].requestText).toBe('Build a dashboard for sales data');
      expect(result[0].parsedTitle).toBe('Sales Dashboard');
      expect(result[0].parsedPriority).toBe('high');
    });

    it('should map snake_case fields to camelCase', async () => {
      const row = makeSampleRow();
      const selectResult = {
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [row], error: null }),
        }),
        limit: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
      queryBuilder.select.mockReturnValue(selectResult);
      supabase.from.mockReturnValue(queryBuilder);

      const [item] = await loadRequests();

      expect(item.requestText).toBe('Build a dashboard for sales data');
      expect(item.parsedTitle).toBe('Sales Dashboard');
      expect(item.parsedCategory).toBe('analytics');
      expect(item.parsedRequirements).toBe('Must include charts and filters');
      expect(item.parsedPriority).toBe('high');
      expect(item.createdAt).toBe('2026-01-01T00:00:00Z');
      expect(item.updatedAt).toBe('2026-01-02T00:00:00Z');
    });

    it('should return empty array when not authenticated (falls to localStorage)', async () => {
      supabase.auth.getUser.mockResolvedValue({ data: { user: null } });
      // loadRequests will try Supabase, fail, and fall back to localStorage (empty)
      const result = await loadRequests();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('createRequest', () => {
    it('should insert a row via Supabase and return the request', async () => {
      // First call is isTableReady probe, second is the actual insert
      const probeSelect = {
        limit: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
      const insertBuilder = {
        select: vi.fn().mockReturnValue(probeSelect),
        insert: vi.fn().mockResolvedValue({ error: null }),
      };
      supabase.from.mockReturnValue(insertBuilder);

      const request = makeSampleRequest();
      const result = await createRequest(request);

      expect(result).toBe(request);
    });

    it('should call logAction after successful creation', async () => {
      const probeSelect = {
        limit: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
      const insertBuilder = {
        select: vi.fn().mockReturnValue(probeSelect),
        insert: vi.fn().mockResolvedValue({ error: null }),
      };
      supabase.from.mockReturnValue(insertBuilder);

      await createRequest(makeSampleRequest());

      await vi.waitFor(() => {
        expect(logAction).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'Request created',
            entity: 'Request',
          })
        );
      });
    });
  });

  describe('deleteRequestById', () => {
    it('should delete via Supabase and return true', async () => {
      const secondEq = vi.fn().mockResolvedValue({ error: null });
      const firstEq = vi.fn().mockReturnValue({ eq: secondEq });
      const deleteBuilder = {
        select: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
        delete: vi.fn().mockReturnValue({ eq: firstEq }),
      };
      supabase.from.mockReturnValue(deleteBuilder);

      const result = await deleteRequestById('req-456-def');

      expect(result).toBe(true);
    });

    it('should call logAction with importance "high" after delete', async () => {
      const secondEq = vi.fn().mockResolvedValue({ error: null });
      const firstEq = vi.fn().mockReturnValue({ eq: secondEq });
      const deleteBuilder = {
        select: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
        delete: vi.fn().mockReturnValue({ eq: firstEq }),
      };
      supabase.from.mockReturnValue(deleteBuilder);

      await deleteRequestById('req-456-def');

      await vi.waitFor(() => {
        expect(logAction).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'Request deleted',
            entity: 'Request',
            entityId: 'req-456-def',
            meta: expect.objectContaining({
              importance: 'high',
              tags: ['delete', 'request'],
            }),
          })
        );
      });
    });
  });
});
