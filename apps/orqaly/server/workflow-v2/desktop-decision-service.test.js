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
