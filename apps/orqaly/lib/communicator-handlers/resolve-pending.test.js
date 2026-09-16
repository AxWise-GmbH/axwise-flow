/**
 * [module: connection-hub]
 * Tests for resolvePendingToolCall — TTL, user-scoping, reject, and
 * atomic approve (no double execution).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./assistant-bridge.js', () => ({ executeToolCall: vi.fn() }));
vi.mock('./chat-blocks-extractor.js', () => ({ extractBlocks: vi.fn(() => []) }));

import { executeToolCall } from './assistant-bridge.js';
import { resolvePendingToolCall } from './resolve-pending.js';

const FUTURE = new Date(Date.now() + 60_000).toISOString();
const PAST = new Date(Date.now() - 60_000).toISOString();

/** Minimal chainable supabase mock for a single pending_tool_calls row. */
function makeAdmin({ row, claim = { id: 'p1' } }) {
  const updates = [];
  return {
    updates,
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                eq() {
                  return { maybeSingle: async () => ({ data: row }) };
                },
              };
            },
          };
        },
        update(patch) {
          updates.push(patch);
          const chain = {
            eq() { return chain; },
            is() { return chain; },
            select() { return { maybeSingle: async () => ({ data: patch.resolution === 'approved' ? claim : null }) }; },
            then(resolve) { return resolve({ data: null, error: null }); },
          };
          return chain;
        },
      };
    },
  };
}

describe('resolvePendingToolCall', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns not_found for a missing/other-user row', async () => {
    const admin = makeAdmin({ row: null });
    const out = await resolvePendingToolCall(admin, 'user-1', 'p1', 'approve');
    expect(out.status).toBe('not_found');
    expect(executeToolCall).not.toHaveBeenCalled();
  });

  it('returns already_resolved when resolved_at is set', async () => {
    const admin = makeAdmin({ row: { id: 'p1', resolved_at: PAST, resolution: 'approved' } });
    const out = await resolvePendingToolCall(admin, 'user-1', 'p1', 'approve');
    expect(out.status).toBe('already_resolved');
    expect(executeToolCall).not.toHaveBeenCalled();
  });

  it('marks expired rows and does not execute', async () => {
    const admin = makeAdmin({ row: { id: 'p1', resolved_at: null, expires_at: PAST } });
    const out = await resolvePendingToolCall(admin, 'user-1', 'p1', 'approve');
    expect(out.status).toBe('expired');
    expect(executeToolCall).not.toHaveBeenCalled();
  });

  it('rejects without executing', async () => {
    const admin = makeAdmin({ row: { id: 'p1', resolved_at: null, expires_at: FUTURE, tool: 'goal.create' } });
    const out = await resolvePendingToolCall(admin, 'user-1', 'p1', 'reject');
    expect(out.status).toBe('rejected');
    expect(executeToolCall).not.toHaveBeenCalled();
  });

  it('executes on approve after claiming the row', async () => {
    executeToolCall.mockResolvedValue({ created: { id: 'g1' } });
    const admin = makeAdmin({ row: { id: 'p1', resolved_at: null, expires_at: FUTURE, tool: 'goal.create', args: { title: 'X' } } });
    const out = await resolvePendingToolCall(admin, 'user-1', 'p1', 'approve');
    expect(out.status).toBe('approved');
    expect(executeToolCall).toHaveBeenCalledWith(admin, 'user-1', 'goal.create', { title: 'X' });
  });

  it('does not execute if the claim is lost (already approved concurrently)', async () => {
    const admin = makeAdmin({ row: { id: 'p1', resolved_at: null, expires_at: FUTURE, tool: 'goal.create' }, claim: null });
    const out = await resolvePendingToolCall(admin, 'user-1', 'p1', 'approve');
    expect(out.status).toBe('already_resolved');
    expect(executeToolCall).not.toHaveBeenCalled();
  });
});
