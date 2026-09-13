import { afterEach, describe, expect, it, vi } from 'vitest';
import { withAxwise } from './degrade.js';
import { evaluateConditions } from './client.js';
import { buildAgentGenerateContext, buildConsiliumCreateContext, buildCopilotContext } from './context.js';

vi.mock('./client.js', () => ({ evaluateConditions: vi.fn() }));

const tenant = { userId: 'u1', orgId: 'o1' };
const boardCtx = buildConsiliumCreateContext({ requestId: 'r', tenant, board: { name: 'B' } });
const agentCtx = buildAgentGenerateContext({ requestId: 'r', tenant, config: { name: 'A', system_prompt: 'x' } });

describe('axwise/degrade withAxwise', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('disabled flag → local fallback, degraded, no network call', async () => {
    vi.stubEnv('AXWISE_ENABLE', 'false');
    const out = await withAxwise(boardCtx, () => ({ processedOutputs: { governance: { quorum: 3 } } }), { posture: 'open' });
    expect(out.degraded).toBe(true);
    expect(out.disabled).toBe(true);
    expect(out.processedOutputs.governance.quorum).toBe(3);
    expect(evaluateConditions).not.toHaveBeenCalled();
  });

  it('per-user kill switch (options.axwiseUserDisabled) → local fallback, reason disabled, no network', async () => {
    vi.stubEnv('AXWISE_ENABLE', 'true'); // env ON, but the user turned AxWise off
    const out = await withAxwise(
      boardCtx,
      () => ({ processedOutputs: { governance: { quorum: 4 } } }),
      { posture: 'open', axwiseUserDisabled: true }
    );
    expect(out.degraded).toBe(true);
    expect(out.disabled).toBe(true);
    expect(out.meta.reason).toBe('disabled');
    expect(out.processedOutputs.governance.quorum).toBe(4);
    expect(evaluateConditions).not.toHaveBeenCalled();
  });

  // `disabled` is what lets a fail-closed caller tell "the user opted out" apart
  // from "AxWise broke". Both are degraded; only the latter may penalise the
  // request. Conflating them routes every agent to approval when AxWise is off.
  it('off is disabled but an outage is not, on the same fail-closed point', async () => {
    vi.stubEnv('AXWISE_ENABLE', 'true');
    const off = await withAxwise(agentCtx, () => ({}), { posture: 'closed', axwiseUserDisabled: true });
    expect(off).toMatchObject({ degraded: true, disabled: true });
    expect(off.processedOutputs.security).toBeUndefined();

    evaluateConditions.mockRejectedValue(new Error('timeout'));
    const outage = await withAxwise(agentCtx, () => ({}), { posture: 'closed' });
    expect(outage.degraded).toBe(true);
    expect(outage.disabled).toBeFalsy();
    expect(outage.processedOutputs.security.scopeDecision).toBe('denied');
  });

  it('a healthy evaluation is never marked disabled', async () => {
    vi.stubEnv('AXWISE_ENABLE', 'true');
    evaluateConditions.mockResolvedValue({ applicableConditions: [], processedOutputs: {}, meta: {} });
    const out = await withAxwise(boardCtx, () => ({}), { posture: 'open' });
    expect(out.disabled).toBeFalsy();
  });

  it('pre-classifier skip → skipped, not degraded, no network call', async () => {
    vi.stubEnv('AXWISE_ENABLE', 'true');
    const smalltalk = buildCopilotContext({ requestId: 'r', tenant, message: 'hi' });
    const out = await withAxwise(smalltalk, () => ({}), { posture: 'open' });
    expect(out.skipped).toBe(true);
    expect(out.degraded).toBe(false);
    expect(evaluateConditions).not.toHaveBeenCalled();
  });

  it('success → returns AxWise result, not degraded', async () => {
    vi.stubEnv('AXWISE_ENABLE', 'true');
    evaluateConditions.mockResolvedValue({
      applicableConditions: [], processedOutputs: { systemPromptFragment: 'tone' }, meta: {},
    });
    const out = await withAxwise(boardCtx, () => ({}), { posture: 'open' });
    expect(out.degraded).toBe(false);
    expect(out.processedOutputs.systemPromptFragment).toBe('tone');
  });

  it('error on fail-closed posture → denied verdict', async () => {
    vi.stubEnv('AXWISE_ENABLE', 'true');
    evaluateConditions.mockRejectedValue(new Error('timeout'));
    const out = await withAxwise(boardCtx, () => ({}), { posture: 'closed' });
    expect(out.degraded).toBe(true);
    expect(out.processedOutputs.security.scopeDecision).toBe('denied');
  });

  it('error on agent.generate → denied regardless of posture', async () => {
    vi.stubEnv('AXWISE_ENABLE', 'true');
    evaluateConditions.mockRejectedValue(new Error('boom'));
    const out = await withAxwise(agentCtx, () => ({}), { posture: 'open' });
    expect(out.processedOutputs.security.scopeDecision).toBe('denied');
  });

  it('error on fail-open → local fallback, no block', async () => {
    vi.stubEnv('AXWISE_ENABLE', 'true');
    evaluateConditions.mockRejectedValue(new Error('down'));
    const out = await withAxwise(boardCtx, () => ({ processedOutputs: { governance: { quorum: 2 } } }), { posture: 'open' });
    expect(out.degraded).toBe(true);
    expect(out.processedOutputs.governance.quorum).toBe(2);
    expect(out.processedOutputs.security).toBeUndefined();
  });

  it('propagates AxWise internal degradation flag', async () => {
    vi.stubEnv('AXWISE_ENABLE', 'true');
    evaluateConditions.mockResolvedValue({ applicableConditions: [], processedOutputs: {}, meta: { degraded: true } });
    const out = await withAxwise(boardCtx, () => ({}), { posture: 'open' });
    expect(out.degraded).toBe(true);
  });
});
