import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWorkflowV2Client } from './api.js';
afterEach(() => vi.restoreAllMocks());
describe('capability browser commands remain explicit and no-store', () => {
  it('does not call any capability endpoint merely by creating a client', () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    createWorkflowV2Client(async () => 'synthetic-token', 'https://api.example.test');
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([
    ['startCapabilityWork', '/v2/capability-work', false],
    ['approveCapabilityScope', '/v2/capability-work/run%2Fid/scope', true],
    ['admitCapabilityCorpus', '/v2/capability-work/run%2Fid/corpus', true],
    ['prepareCapabilityOperation', '/v2/capability-work/run%2Fid/prepare', true],
    ['confirmCapabilityOperation', '/v2/capability-work/run%2Fid/confirm', true],
  ])('sends only the explicitly supplied %s command', async (method, path, takesRun) => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response('{"fixture":true}', { headers: { 'content-type': 'application/json' } })
      );
    const client = createWorkflowV2Client(
      async () => 'synthetic-token',
      'https://api.example.test/'
    );
    const command = { explicit: 'synthetic', noConsentDefault: true };
    expect(await (takesRun ? client[method]('run/id', command) : client[method](command))).toEqual({
      fixture: true,
    });
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith(
      `https://api.example.test${path}`,
      expect.objectContaining({
        method: 'POST',
        cache: 'no-store',
        body: JSON.stringify(command),
        headers: expect.objectContaining({ authorization: 'Bearer synthetic-token' }),
      })
    );
  });
  it('reads configuration without a session-provisioning POST', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response('{"configured":false}', { headers: { 'content-type': 'application/json' } })
      );
    const client = createWorkflowV2Client(
      async () => 'synthetic-token',
      'https://api.example.test'
    );
    expect(await client.capabilityWorkConfiguration()).toEqual({ configured: false });
    expect(fetch.mock.calls[0][0]).toBe(
      'https://api.example.test/v2/capability-work/configuration'
    );
    expect(fetch.mock.calls[0][1].body).toBeUndefined();
    expect(fetch.mock.calls[0][1].method).toBeUndefined();
    expect(fetch.mock.calls[0][1].cache).toBe('no-store');
  });
  it('requires authentication and does not retry an uncertain confirmation', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    await expect(
      createWorkflowV2Client(
        async () => null,
        'https://api.example.test'
      ).confirmCapabilityOperation('run', {})
    ).rejects.toMatchObject({ status: 401 });
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockRejectedValue(new Error('Synthetic ambiguous transport'));
    await expect(
      createWorkflowV2Client(
        async () => 'synthetic-token',
        'https://api.example.test'
      ).confirmCapabilityOperation('run', {})
    ).rejects.toThrow();
    expect(fetch).toHaveBeenCalledOnce();
  });
});
