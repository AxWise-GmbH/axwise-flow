import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWorkflowV2Client } from './api.js';
afterEach(() => vi.unstubAllGlobals());
describe('solution conversation API client', () => {
  it('uses encoded solution/draft scopes and preserves the exact idempotent command', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, headers: new Headers(), json: async () => ({}) });
    vi.stubGlobal('fetch', fetch);
    const client = createWorkflowV2Client(async () => 'test-token', 'https://api.example');
    await client.solutions();
    await client.solutionConversation('solution/id', { draftId: 'draft/id' });
    const body = {
      turnId: 'turn',
      mode: 'ask',
      message: 'Explain',
      expectedSolutionVersion: 1,
      workflowHash: 'a'.repeat(64),
    };
    await client.sendSolutionConversationTurn('solution/id', body, 'same-key');
    expect(fetch.mock.calls[0][0]).toBe('https://api.example/v2/solutions');
    expect(fetch.mock.calls[1][0]).toBe(
      'https://api.example/v2/solutions/solution%2Fid/conversation?draftId=draft%2Fid'
    );
    expect(fetch.mock.calls[2]).toEqual([
      'https://api.example/v2/solutions/solution%2Fid/conversation/turns',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'idempotency-key': 'same-key',
          authorization: 'Bearer test-token',
        }),
        body: JSON.stringify(body),
      }),
    ]);
  });
});
