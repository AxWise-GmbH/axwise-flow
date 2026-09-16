import { afterEach, describe, expect, it, vi } from 'vitest';
import { withAxwiseTracked } from './tracked.js';
import { withAxwise } from './degrade.js';
import { recordLlmUsage } from '../../goal-handlers/_helpers.js';
import { buildConsiliumCreateContext, buildCopilotContext } from './context.js';

/** Admin whose axwise_calls.insert captures the row; everything else is inert. */
function captureAdmin() {
  const store = { row: null };
  return {
    store,
    admin: {
      from: (t) =>
        t === 'axwise_calls'
          ? {
              insert: (row) => {
                store.row = row;
                return Promise.resolve({ error: null });
              },
            }
          : {},
    },
  };
}

vi.mock('./degrade.js', () => ({ withAxwise: vi.fn() }));
vi.mock('../../goal-handlers/_helpers.js', () => ({ recordLlmUsage: vi.fn() }));
vi.mock('../../../api/_lib/supabase-server.js', () => ({
  buildSupabaseAdminClient: () => ({ from: () => ({}) }),
}));

const ctx = buildConsiliumCreateContext({
  requestId: 'r',
  tenant: { userId: 'u1', orgId: 'o1' },
  board: { name: 'B' },
});

describe('axwise/tracked withAxwiseTracked', () => {
  afterEach(() => vi.clearAllMocks());

  it('records an axwise usage row when there is cost', async () => {
    withAxwise.mockResolvedValue({
      degraded: false,
      processedOutputs: {},
      meta: { cost: 0.02, latencyMs: 120, model: 'gem' },
    });
    const out = await withAxwiseTracked(ctx, () => ({}), {});
    expect(out.processedOutputs).toEqual({});
    expect(recordLlmUsage).toHaveBeenCalledTimes(1);
    const [, row] = recordLlmUsage.mock.calls[0];
    expect(row.source).toBe('axwise');
    expect(row.operation).toBe('consilium.create');
    expect(row.estimatedCostUsd).toBe(0.02);
    expect(row.userId).toBe('u1');
    expect(row.organizationId).toBe('o1');
  });

  it('keeps a personal AxWise tenant out of the organization FK', async () => {
    const { store, admin } = captureAdmin();
    withAxwise.mockResolvedValue({
      degraded: false,
      processedOutputs: {},
      meta: { cost: 0.02, latencyMs: 120, model: 'gem' },
    });
    const personalContext = buildCopilotContext({
      requestId: 'personal-request',
      tenant: { userId: 'user-1', orgId: 'user-1' },
      message: 'hello',
    });

    await withAxwiseTracked(personalContext, () => ({}), {
      admin,
      organizationId: null,
    });

    expect(store.row.org_id).toBe('user-1');
    const [, usageRow] = recordLlmUsage.mock.calls[0];
    expect(usageRow.userId).toBe('user-1');
    expect(usageRow.organizationId).toBeNull();
  });

  it('records genuine degradations as error + axwise_degraded, even with zero cost', async () => {
    withAxwise.mockResolvedValue({
      degraded: true,
      processedOutputs: {},
      meta: { degraded: true },
    });
    await withAxwiseTracked(ctx, () => ({}), {});
    expect(recordLlmUsage).toHaveBeenCalledTimes(1);
    const [, row] = recordLlmUsage.mock.calls[0];
    expect(row.status).toBe('error');
    expect(row.errorType).toBe('axwise_degraded');
    expect(row.metadataExtra.degraded).toBe(true);
  });

  it('skips telemetry for a skipped call (smalltalk / pure read)', async () => {
    withAxwise.mockResolvedValue({
      degraded: false,
      skipped: true,
      processedOutputs: {},
      meta: { skipped: true },
    });
    await withAxwiseTracked(ctx, () => ({}), {});
    expect(recordLlmUsage).not.toHaveBeenCalled();
  });

  it('skips telemetry when AxWise is disabled, never a dropped insert', async () => {
    withAxwise.mockResolvedValue({
      degraded: true,
      disabled: true,
      processedOutputs: {},
      meta: { degraded: true, reason: 'disabled' },
    });
    await withAxwiseTracked(ctx, () => ({}), {});
    expect(recordLlmUsage).not.toHaveBeenCalled();
  });

  it('never throws if telemetry fails', async () => {
    withAxwise.mockResolvedValue({ degraded: false, processedOutputs: {}, meta: { cost: 0.01 } });
    recordLlmUsage.mockRejectedValue(new Error('db down'));
    await expect(withAxwiseTracked(ctx, () => ({}), {})).resolves.toBeTruthy();
  });

  it('persists the AxWise verdict, local verdict, and traceId for divergence analysis', async () => {
    withAxwise.mockResolvedValue({
      degraded: false,
      processedOutputs: { security: { scopeDecision: 'denied' } },
      applicableConditions: [{ category: 'security_gating' }, { category: 'tone' }],
      meta: { cost: 0.01, latencyMs: 90, model: 'gem', traceId: 'trace-123' },
    });
    await withAxwiseTracked(ctx, () => ({}), { localDecision: 'allowed' });
    const [, row] = recordLlmUsage.mock.calls[0];
    expect(row.metadataExtra).toMatchObject({
      ax_decision: 'denied',
      local_decision: 'allowed',
      trace_id: 'trace-123',
      ax_conditions: ['security_gating', 'tone'],
    });
  });

  it('writes a full axwise_calls inspector row (request + response + applied)', async () => {
    const { store, admin } = captureAdmin();
    withAxwise.mockResolvedValue({
      degraded: false,
      skipped: false,
      processedOutputs: {
        security: { scopeDecision: 'allowed' },
        systemPromptFragment: 'be concise',
      },
      applicableConditions: [{ category: 'tone', decision: 'applied', reason: 'ok' }],
      meta: { cost: 0.01, latencyMs: 120, model: 'gem', traceId: 'tr-1' },
    });
    const cctx = buildCopilotContext({
      requestId: 'r1',
      tenant: { userId: 'u1', orgId: 'o1' },
      message: 'hello world',
      history: [{}, {}],
    });
    await withAxwiseTracked(cctx, () => ({}), { admin, localDecision: 'allow', posture: 'open' });
    expect(store.row).toBeTruthy();
    expect(store.row.integration_point).toBe('copilot.chat');
    expect(store.row.applied_outcome).toBe('shadow-logged');
    expect(store.row.request_payload.message).toBe('hello world');
    expect(store.row.processed_outputs.systemPromptFragment).toBe('be concise');
    expect(store.row.applicable_conditions[0].reason).toBe('ok');
    expect(store.row.trace_id).toBe('tr-1');
  });

  it('writes a thin skipped axwise_calls row (message only, no response, no ledger)', async () => {
    const { store, admin } = captureAdmin();
    withAxwise.mockResolvedValue({
      degraded: false,
      skipped: true,
      processedOutputs: {},
      meta: { skipped: true },
    });
    const cctx = buildCopilotContext({ requestId: 'r', tenant: { userId: 'u' }, message: 'hi' });
    await withAxwiseTracked(cctx, () => ({}), { admin });
    expect(store.row.skipped).toBe(true);
    expect(store.row.applied_outcome).toBe('skipped');
    expect(store.row.processed_outputs).toBeNull();
    expect(store.row.request_payload.message).toBe('hi');
    expect(recordLlmUsage).not.toHaveBeenCalled();
  });

  it('writes NO axwise_calls row when AxWise is disabled', async () => {
    const { store, admin } = captureAdmin();
    withAxwise.mockResolvedValue({
      degraded: true,
      disabled: true,
      processedOutputs: {},
      meta: { degraded: true, reason: 'disabled' },
    });
    const cctx = buildCopilotContext({ requestId: 'r', tenant: { userId: 'u' }, message: 'x' });
    await withAxwiseTracked(cctx, () => ({}), { admin });
    expect(store.row).toBeNull();
  });
});
