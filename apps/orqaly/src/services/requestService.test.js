/**
 * Tests for requestService.js — CRUD and buildRequest factory for job requests.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('./requestBackend', () => ({
  loadRequests: vi.fn(),
  createRequest: vi.fn().mockResolvedValue(undefined),
  updateRequestById: vi.fn().mockResolvedValue(undefined),
  deleteRequestById: vi.fn().mockResolvedValue(undefined),
}));

import * as requestBackend from './requestBackend';
import {
  buildRequest,
  createRequest,
  getAllRequests,
  getRequestById,
  updateRequest,
  deleteRequest,
  REQUEST_STATUSES_LIST,
  REQUEST_PRIORITIES_LIST,
} from './requestService';

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('requestService', () => {
  describe('exports', () => {
    it('exports status list', () => {
      expect(REQUEST_STATUSES_LIST).toEqual(['pending', 'processing', 'completed', 'rejected']);
    });

    it('exports priority list', () => {
      expect(REQUEST_PRIORITIES_LIST).toEqual(['low', 'medium', 'high', 'urgent']);
    });
  });

  describe('buildRequest', () => {
    it('should generate an id starting with "req-"', () => {
      const req = buildRequest({ requestText: 'Test' });
      expect(req.id).toMatch(/^req-/);
    });

    it('should default status to "pending"', () => {
      const req = buildRequest({ requestText: 'Test' });
      expect(req.status).toBe('pending');
    });

    it('should default priority to "medium"', () => {
      const req = buildRequest({ requestText: 'Test' });
      expect(req.parsedPriority).toBe('medium');
    });

    it('should accept valid status values', () => {
      const req = buildRequest({ requestText: 'Test', status: 'processing' });
      expect(req.status).toBe('processing');
    });

    it('should reject invalid status values and default to "pending"', () => {
      const req = buildRequest({ requestText: 'Test', status: 'invalid' });
      expect(req.status).toBe('pending');
    });

    it('should accept valid priority values', () => {
      const req = buildRequest({ requestText: 'Test', parsedPriority: 'urgent' });
      expect(req.parsedPriority).toBe('urgent');
    });

    it('should reject invalid priority values and default to "medium"', () => {
      const req = buildRequest({ requestText: 'Test', parsedPriority: 'extreme' });
      expect(req.parsedPriority).toBe('medium');
    });

    it('should set requestText from data', () => {
      const req = buildRequest({ requestText: 'Build a dashboard' });
      expect(req.requestText).toBe('Build a dashboard');
    });

    it('should default null fields correctly', () => {
      const req = buildRequest({ requestText: 'Test' });
      expect(req.parsedTitle).toBeNull();
      expect(req.parsedCategory).toBeNull();
      expect(req.parsedRequirements).toBeNull();
      expect(req.assignedConciliumId).toBeNull();
      expect(req.resultJobId).toBeNull();
      expect(req.resultAgentId).toBeNull();
      expect(req.costUsd).toBe(0);
    });

    it('should include timestamps', () => {
      const req = buildRequest({ requestText: 'Test' });
      expect(req.createdAt).toBeDefined();
      expect(req.updatedAt).toBeDefined();
    });
  });

  describe('createRequest', () => {
    it('should call requestBackend.createRequest with a built request', async () => {
      const result = await createRequest({ requestText: 'Analyze data' });

      expect(requestBackend.createRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          requestText: 'Analyze data',
          status: 'pending',
        }),
        null
      );
      expect(result.id).toMatch(/^req-/);
    });

    it('should pass agentContext to backend', async () => {
      const agentCtx = { id: 'agent-1' };
      await createRequest({ requestText: 'Test' }, agentCtx);

      expect(requestBackend.createRequest).toHaveBeenCalledWith(expect.any(Object), agentCtx);
    });
  });

  describe('getAllRequests', () => {
    it('should return requests from backend', async () => {
      const mockData = [
        { id: 'req-1', requestText: 'First', status: 'pending' },
        { id: 'req-2', requestText: 'Second', status: 'completed' },
      ];
      requestBackend.loadRequests.mockResolvedValue(mockData);

      const result = await getAllRequests();

      expect(result).toEqual(mockData);
      expect(requestBackend.loadRequests).toHaveBeenCalled();
    });
  });

  describe('getRequestById', () => {
    it('should return the matching request', async () => {
      const mockData = [
        { id: 'req-1', requestText: 'First' },
        { id: 'req-2', requestText: 'Second' },
      ];
      requestBackend.loadRequests.mockResolvedValue(mockData);

      const result = await getRequestById('req-2');
      expect(result).toEqual({ id: 'req-2', requestText: 'Second' });
    });

    it('should return null when not found', async () => {
      requestBackend.loadRequests.mockResolvedValue([]);
      const result = await getRequestById('req-nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('updateRequest', () => {
    it('should merge updates into existing request', async () => {
      const existing = {
        id: 'req-1',
        requestText: 'Original',
        status: 'pending',
        parsedTitle: null,
        parsedPriority: 'medium',
        costUsd: 0,
      };
      requestBackend.loadRequests.mockResolvedValue([existing]);

      const result = await updateRequest('req-1', {
        status: 'processing',
        parsedTitle: 'New Title',
      });

      expect(result.status).toBe('processing');
      expect(result.parsedTitle).toBe('New Title');
      expect(result.requestText).toBe('Original');
      expect(result.updatedAt).toBeDefined();
    });

    it('should return null when request not found', async () => {
      requestBackend.loadRequests.mockResolvedValue([]);
      const result = await updateRequest('req-nonexistent', { status: 'completed' });
      expect(result).toBeNull();
    });
  });

  describe('deleteRequest', () => {
    it('should call backend deleteRequestById and return true', async () => {
      const result = await deleteRequest('req-1');
      expect(requestBackend.deleteRequestById).toHaveBeenCalledWith('req-1', null);
      expect(result).toBe(true);
    });
  });
});
