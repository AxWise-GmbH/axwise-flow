// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createDesktopDecisionService } from './desktop-decision-service.js';
const input = {
  kind: 'message_disposition',
  sessionId: 's',
  runId: 'r',
  taskId: 't',
  messageId: 'm',
  currentTask: 'Fix checkout',
  incomingMessage: 'Preserve the public API',
};
const body = (choice = 'steer') => ({
  model: 'jev-1.13',
  answers: {
    disposition: {
      type: 'choice',
      choice,
      confidence: 0.95,
      probabilities: {
        steer: choice === 'steer' ? 0.95 : 0.02,
        queue: choice === 'queue' ? 0.95 : 0.02,
        uncertain: 0.03,
      },
    },
  },
});
describe('bounded advisory desktop decisions', () => {
  it('correctly classifies outer turn lane_triage requests using Jev choice', async () => {
    const laneBody = {
      model: 'jev-1.13',
      answers: {
        route: {
          type: 'choice',
          choice: 'quick_info',
          confidence: 0.98,
          probabilities: {
            quick_info: 0.98,
            research: 0.01,
            local_engineering: 0.005,
            conversation: 0.005,
            mixed: 0,
          },
        },
      },
    };
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(laneBody)));
    const value = await createDesktopDecisionService({ apiKey: 'test', fetchImpl }).decide(
      {},
      { kind: 'lane_triage', sessionId: 's1', message: 'What is the weather in Berlin?' }
    );
    expect(value).toMatchObject({
      kind: 'lane_triage',
      decision: 'quick_info',
      confidence: 0.98,
      advisory: true,
    });
    expect(value.provenance.rubric).toBe('lane-triage-v1');
    expect(value.provenance.inputHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('binds the result to run/message plus rubric and exact input hash', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(body())));
    const value = await createDesktopDecisionService({ apiKey: 'test', fetchImpl }).decide(
      {},
      input
    );
    expect(value).toMatchObject({ decision: 'steer', runId: 'r', messageId: 'm', advisory: true });
    expect(value.provenance.inputHash).toMatch(/^[a-f0-9]{64}$/);
    const request = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(request.questions.disposition.criteria.queue).toContain('MIXED');
    expect(JSON.stringify(value)).not.toMatch(/Bearer|test/);
  });
  it('makes no provider call when disabled or unconfigured', async () => {
    const fetchImpl = vi.fn();
    for (const key of [null, 'test']) {
      expect(
        (
          await createDesktopDecisionService({ apiKey: key, fetchImpl }).decide(
            {},
            { ...input, enabled: false }
          )
        ).decision
      ).toBe('uncertain');
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('fails safely on malformed probabilities and low certainty', async () => {
    for (const value of [
      {},
      { ...body(), answers: { disposition: { ...body().answers.disposition, confidence: 0.3 } } },
      {
        ...body(),
        answers: {
          disposition: {
            ...body().answers.disposition,
            probabilities: { steer: 1, queue: 1, uncertain: 1 },
          },
        },
      },
    ]) {
      const service = createDesktopDecisionService({
        apiKey: 'test',
        fetchImpl: async () => new Response(JSON.stringify(value)),
      });
      expect((await service.decide({}, input)).decision).toBe('uncertain');
    }
  });
  it('bounds even a provider mock that ignores cancellation', async () => {
    const started = performance.now();
    const service = createDesktopDecisionService({
      apiKey: 'test',
      timeoutMs: 10,
      fetchImpl: () => new Promise(() => {}),
    });
    expect((await service.decide({}, input)).reason).toBe('timeout');
    expect(performance.now() - started).toBeLessThan(150);
  });
  it('rejects arbitrary commands and unbounded context', async () => {
    const service = createDesktopDecisionService({});
    await expect(service.decide({}, { ...input, command: 'exec' })).rejects.toThrow();
    await expect(
      service.decide({}, { ...input, incomingMessage: 'x'.repeat(9000) })
    ).rejects.toThrow();
  });
});

describe('lane triage preserves uncertainty', () => {
  const request = { kind: 'lane_triage', sessionId: 's', message: 'Explain and fix this bug' };
  const answer = () => ({
    type: 'choice',
    choice: 'mixed',
    confidence: 0.96,
    probabilities: {
      quick_info: 0.01,
      research: 0.01,
      local_engineering: 0.01,
      conversation: 0.01,
      mixed: 0.96,
    },
  });
  const result = (route) => ({ model: 'jev-1.13', answers: { route } });
  it.each([
    { ...answer(), confidence: undefined },
    { ...answer(), confidence: 2 },
    { ...answer(), probabilities: {} },
    { ...answer(), probabilities: { ...answer().probabilities, mixed: -1 } },
    { ...answer(), choice: 'exec' },
    { ...answer(), confidence: 0.5 },
    { ...answer(), choice: 'research' },
  ])('does not fabricate a confident lane from malformed or ambiguous answers', async (route) => {
    const value = await createDesktopDecisionService({
      apiKey: 'test',
      fetchImpl: async () => Response.json(result(route)),
    }).decide({}, request);
    expect(value.decision).toBe('uncertain');
    expect(value.reason).not.toBe('classified');
    expect(value).not.toHaveProperty('thinkingEffort');
  });
  it('returns uncertain without a configured provider', async () => {
    expect(await createDesktopDecisionService({}).decide({}, request)).toMatchObject({
      decision: 'uncertain',
      reason: 'disabled',
    });
  });
  it('times out a stalled body and aborts the provider', async () => {
    let signal;
    const service = createDesktopDecisionService({
      apiKey: 'test',
      timeoutMs: 10,
      fetchImpl: async (_url, options) => {
        signal = options.signal;
        return { ok: true, text: () => new Promise(() => {}) };
      },
    });
    expect(await service.decide({}, request)).toMatchObject({
      decision: 'uncertain',
      reason: 'timeout',
    });
    expect(signal.aborted).toBe(true);
  });
});
