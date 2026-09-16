import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWorkflowV2Client } from './api.js';
afterEach(() => vi.restoreAllMocks());
describe('owned revision connection and handler-test client', () => {
  it('keeps owner authentication and exact command/idempotency scope on each new route', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(
        async () => new Response('{}', { headers: { 'content-type': 'application/json' } })
      );
    const client = createWorkflowV2Client(async () => 'synthetic-session', 'https://api.example');
    const command = {
      expectedVersion: 4,
      workflowHash: 'a'.repeat(64),
      bundleHash: 'b'.repeat(64),
    };
    for (const [call, tail, method, body, key] of [
      [() => client.solutionRevisionSetup('solution/id', 'revision/id'), 'connections', 'GET'],
      [
        () =>
          client.createSolutionRevisionConnection(
            'solution/id',
            'revision/id',
            command,
            'save-once'
          ),
        'connections',
        'POST',
        command,
        'save-once',
      ],
      [
        () =>
          client.revokeSolutionRevisionConnection(
            'solution/id',
            'revision/id',
            command,
            'revoke-once'
          ),
        'connections/revoke',
        'POST',
        command,
        'revoke-once',
      ],
      [() => client.solutionFailureProbes('solution/id', 'revision/id'), 'failure-probes', 'GET'],
      [
        () => client.testSolutionFailureHandler('solution/id', 'revision/id', command, 'test-once'),
        'failure-probes',
        'POST',
        command,
        'test-once',
      ],
      [
        () => client.reconcileSolutionFailureProbe('solution/id', 'revision/id', 'probe/id'),
        'failure-probes/probe%2Fid/reconcile',
        'POST',
        {},
      ],
    ]) {
      await call();
      expect(fetch).toHaveBeenLastCalledWith(
        `https://api.example/v2/solutions/solution%2Fid/revisions/revision%2Fid/${tail}`,
        expect.objectContaining({
          ...(method === 'GET' ? {} : { method }),
          ...(body ? { body: JSON.stringify(body) } : {}),
          headers: expect.objectContaining({
            authorization: 'Bearer synthetic-session',
            ...(key ? { 'idempotency-key': key } : {}),
          }),
        })
      );
      expect(fetch.mock.lastCall[1].method || 'GET').toBe(method);
    }
  });
});
