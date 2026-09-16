import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWorkflowV2Client } from './api.js';

afterEach(() => vi.unstubAllGlobals());
describe('native build API client commands', () => {
  it('pins candidate fork and provider-free test requests to the entire bundle', async () => {
    const fetch = vi.fn(
      async () => new Response('{}', { headers: { 'content-type': 'application/json' } })
    );
    vi.stubGlobal('fetch', fetch);
    const client = createWorkflowV2Client(async () => 'session-token', 'https://api.example');
    const binding = { workflowHash: 'a'.repeat(64), bundleHash: 'b'.repeat(64) };
    await client.forkSolutionRevision(
      'solution/id',
      'candidate/id',
      { expectedVersion: 7, ...binding },
      'fork_once'
    );
    expect(fetch.mock.lastCall[0]).toBe(
      'https://api.example/v2/solutions/solution%2Fid/revisions/candidate%2Fid/fork'
    );
    expect(fetch.mock.lastCall[1].headers).toMatchObject({
      'if-match': '"7"',
      'idempotency-key': 'fork_once',
    });
    expect(JSON.parse(fetch.mock.lastCall[1].body)).toEqual(binding);
    await client.reviewSolutionRevision('solution/id', {
      id: 'candidate/id',
      rowVersion: 7,
      ...binding,
    });
    expect(JSON.parse(fetch.mock.lastCall[1].body)).toEqual({ bundleHash: binding.bundleHash });
    await client.testSolutionRevision(
      'solution/id',
      'candidate/id',
      { name: 'Synthetic' },
      'test_once',
      { bundleHash: binding.bundleHash }
    );
    expect(JSON.parse(fetch.mock.lastCall[1].body)).toEqual({
      input: { name: 'Synthetic' },
      bundleHash: binding.bundleHash,
    });
  });
  it('preserves explicit effect consent and exact version on a delivered Solution test', async () => {
    const fetch = vi.fn(
      async () => new Response('{}', { headers: { 'content-type': 'application/json' } })
    );
    vi.stubGlobal('fetch', fetch);
    const client = createWorkflowV2Client(async () => 'session-token', 'https://api.example');
    const authorization = { allowExternalEffects: true, workflowHash: 'a'.repeat(64) };
    await client.invokeSolution(
      'solution/id',
      { message: 'sample' },
      'test',
      'approved_test_1',
      authorization
    );
    expect(fetch.mock.lastCall[0]).toBe(
      'https://api.example/v2/solutions/solution%2Fid/invocations'
    );
    expect(JSON.parse(fetch.mock.lastCall[1].body)).toEqual({
      input: { message: 'sample' },
      mode: 'test',
      ...authorization,
    });
  });
  it.each(['approve', 'run', 'cancel', 'reconcile'])(
    'sends a scope-bound coding %s without exposing dispatch tokens',
    async (action) => {
      const fetch = vi.fn(
        async () => new Response('{}', { headers: { 'content-type': 'application/json' } })
      );
      vi.stubGlobal('fetch', fetch);
      const client = createWorkflowV2Client(async () => 'session-token', 'https://api.example');
      const command = { runId: 'run-id', expectedVersion: 2, specHash: 'b'.repeat(64) };
      await client[`${action}SolutionCodingJob`](
        'solution/id',
        'job/id',
        command,
        'coding_action_1'
      );
      expect(fetch.mock.lastCall[0]).toBe(
        `https://api.example/v2/solutions/solution%2Fid/coding-jobs/job%2Fid/${action}`
      );
      expect(JSON.parse(fetch.mock.lastCall[1].body)).toEqual(command);
      expect(fetch.mock.lastCall[1].headers['idempotency-key']).toBe('coding_action_1');
    }
  );
  it.each([
    ['testSolutionBuildRequest', 'test'],
    ['repairSolutionBuildRequest', 'repair'],
    ['cancelSolutionBuildRequest', 'cancel'],
    ['createSolutionBuildConnection', 'connections'],
    ['revokeSolutionBuildConnection', 'connections/revoke'],
  ])('%s carries exact revision/idempotency and verified auth to %s', async (method, path) => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers(),
      json: async () => ({ buildRequest: { id: 'native-build' } }),
    });
    vi.stubGlobal('fetch', fetch);
    const command = { expectedVersion: 7, workflowHash: 'a'.repeat(64) };
    const client = createWorkflowV2Client(async () => 'session-token', 'https://api.example');
    await expect(client[method]('build/id', command, 'native_request_1')).resolves.toEqual({
      buildRequest: { id: 'native-build' },
    });
    expect(fetch).toHaveBeenCalledWith(
      `https://api.example/v2/solution-build-requests/build%2Fid/${path}`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(command),
        headers: expect.objectContaining({
          authorization: 'Bearer session-token',
          'idempotency-key': 'native_request_1',
        }),
      })
    );
    if (path.startsWith('connections')) expect(fetch.mock.calls[0][1].cache).toBe('no-store');
  });
  it('does not issue a credential request without an authenticated session', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const client = createWorkflowV2Client(async () => null, 'https://api.example');
    await expect(
      client.createSolutionBuildConnection(
        'id',
        { credentials: { secret: 'never-sent' } },
        'request_key'
      )
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(fetch).not.toHaveBeenCalled();
  });
});
