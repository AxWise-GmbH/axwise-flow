// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createDesktopInformationService } from './desktop-information-service.js';
const input = {
  conversationId: 'session',
  requestId: '11111111-1111-4111-8111-111111111111',
  issuedAt: '2026-09-23T12:00:00Z',
  question: 'Bremen news',
  capability: { kind: 'quick_info', location: 'Bremen', routingMode: 'explicit' },
};
const answer = {
  outcome: 'no_verified_matches',
  response: {
    schemaVersion: 'axwise.assistant-turn.v1',
    markdown: 'No current verified matches.',
    sources: [],
    facts: [],
    recommendations: [],
  },
};
describe('stateless desktop information', () => {
  it('uses IAM protected information endpoint, returns terminal identity and never submits an operation', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(answer)));
    const service = createDesktopInformationService({
      baseUrl: 'https://internal.example',
      authHeaders: async () => ({ Authorization: 'Bearer test' }),
      fetchImpl,
    });
    const result = await service.lookup({ userId: 'u' }, input);
    expect(String(fetchImpl.mock.calls[0][0])).toBe('https://internal.example/v2/information');
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({
      question: input.question,
      capability: input.capability,
    });
    expect(result).toMatchObject({
      requestId: input.requestId,
      conversationId: 'session',
      status: 'completed',
      outcome: 'no_verified_matches',
      transport: 'stateless_information',
    });
    expect(result).not.toHaveProperty('operationId');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('rejects engineering, images and project context without forwarding them', async () => {
    const fetchImpl = vi.fn();
    const service = createDesktopInformationService({
      baseUrl: 'https://internal.example',
      authHeaders: async () => ({}),
      fetchImpl,
    });
    for (const patch of [
      { capability: { kind: 'text' } },
      { runId: input.requestId },
      { capability: { kind: 'image_generate' } },
    ])
      await expect(service.lookup({}, { ...input, ...patch })).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('does not forward after disconnect during credential refresh', async () => {
    const controller = new AbortController();
    let resolve;
    const headers = new Promise((r) => {
      resolve = r;
    });
    const fetchImpl = vi.fn();
    const service = createDesktopInformationService({
      baseUrl: 'https://internal.example',
      authHeaders: () => headers,
      fetchImpl,
    });
    const work = service.lookup({}, input, { signal: controller.signal });
    controller.abort();
    await expect(work).rejects.toThrow();
    resolve({});
    await new Promise((r) => setImmediate(r));
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
