import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWorkflowV2Client } from './api.js';
import {
  goalViewId as id,
  goalViewResponse,
} from '../../shared/workflow-v2/fixtures/goal-workflow-view.js';

afterEach(() => vi.restoreAllMocks());
describe('typed Goal workflow metadata client', () => {
  it('uses only an authenticated no-store GET and forwards cancellation', async () => {
    const value = goalViewResponse(),
      signal = new AbortController().signal;
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } })
      );
    const client = createWorkflowV2Client(
      async () => 'synthetic-test-token',
      'https://api.example'
    );
    expect(await client.goalWorkflowView(id(2), { signal })).toEqual(value);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(`https://api.example/v2/workflow-views/goal-runs/${id(2)}`, {
      method: 'GET',
      signal,
      cache: 'no-store',
      headers: { accept: 'application/json', authorization: 'Bearer synthetic-test-token' },
    });
  });
  it('encodes the selected identity rather than allowing a path/query injection', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 400 }));
    const client = createWorkflowV2Client(async () => 'synthetic', 'https://api.example');
    await expect(client.goalWorkflowView('run/other?owner=x')).rejects.toMatchObject({
      status: 400,
    });
    expect(fetch.mock.calls[0][0]).toBe(
      'https://api.example/v2/workflow-views/goal-runs/run%2Fother%3Fowner%3Dx'
    );
  });
  it('does no HTTP request when signed out', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    await expect(
      createWorkflowV2Client(async () => null, 'https://api.example').goalWorkflowView(id(2))
    ).rejects.toMatchObject({ status: 401 });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects a valid DTO for another run', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(goalViewResponse()), {
        headers: { 'content-type': 'application/json' },
      })
    );
    await expect(
      createWorkflowV2Client(async () => 'synthetic', 'https://api.example').goalWorkflowView(
        id(99)
      )
    ).rejects.toMatchObject({ code: 'WORKFLOW_VIEW_MISMATCH' });
  });
  it('rejects extra payload or lease fields', async () => {
    const response = goalViewResponse();
    response.workflow.outputs[0].payload = 'PRIVATE_BODY';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(response), { headers: { 'content-type': 'application/json' } })
    );
    await expect(
      createWorkflowV2Client(async () => 'synthetic', 'https://api.example').goalWorkflowView(id(2))
    ).rejects.toThrow(/Invalid Goal workflow view/);
  });
});
