import { describe, expect, it, vi } from 'vitest';
import { createNativeN8nUpstream, isNativeN8nReadPath } from './native-editor-upstream.js';

const options = {
  origin: 'https://n8n.example.test',
  email: 'operator@example.test',
  password: 'fake-test-password',
};
const loggedIn = () =>
  new Response('{"data":{"id":"owner"}}', {
    headers: {
      'set-cookie': 'n8n-auth=fake-issued-cookie; Path=/; HttpOnly; Secure; Max-Age=7200',
    },
  });

describe('native editor upstream reader', () => {
  it('permits native assets/metadata but denies workflow data and encoded path escapes', () => {
    for (const path of [
      '/rest/login',
      '/types/nodes.json',
      '/workflow/draft_123',
      '/assets/index-Abc.js',
      '/icons/n8n-nodes-base/dist/nodes/Webhook/webhook.svg',
    ])
      expect(isNativeN8nReadPath(path)).toBe(true);
    for (const path of [
      '/rest/workflows/123',
      '/rest/credentials',
      '/rest/api-keys',
      '//evil.test/a.js',
      '/assets/../rest/settings',
      '/assets/%2e%2e/settings.js',
      '/assets/a.js?redirect=https://evil.test',
      '/rest/roles?withUsageCount=true',
      '/assets/a.js#frag',
      '/assets/..\\rest/settings.js',
    ])
      expect(isNativeN8nReadPath(path)).toBe(false);
  });

  it('uses genuine login once, bound browser ID, IAM headers and server-only cookie', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(loggedIn())
      .mockImplementation(
        async () =>
          new Response('asset', {
            headers: {
              'content-type': 'text/javascript',
              'set-cookie': 'not-for-browser=secret',
              'content-encoding': 'gzip',
            },
          })
      );
    const upstream = createNativeN8nUpstream({
      ...options,
      fetchImpl,
      identityHeaders: async () => ({
        authorization: 'Bearer fake-iam-token',
        cookie: 'injected=denied',
        'x-n8n-api-key': 'denied',
      }),
    });
    const [first, second] = await Promise.all([
      upstream.read('/assets/index-Abc.js'),
      upstream.read('/rest/settings'),
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl.mock.calls[0][0]).toBe(`${options.origin}/rest/login`);
    expect(fetchImpl.mock.calls[0][1].method).toBe('POST');
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({
      emailOrLdapLoginId: options.email,
      password: options.password,
    });
    for (const [, request] of fetchImpl.mock.calls.slice(1)) {
      expect(request.headers.get('cookie')).toBe('n8n-auth=fake-issued-cookie');
      expect(request.headers.get('browser-id')).toBe(
        fetchImpl.mock.calls[0][1].headers.get('browser-id')
      );
      expect(request.headers.get('authorization')).toBe('Bearer fake-iam-token');
      expect(request.headers.get('x-n8n-api-key')).toBeNull();
      expect(request.redirect).toBe('error');
      expect(request.method).toBe('GET');
    }
    expect(first.body.toString()).toBe('asset');
    expect(first.headers.has('set-cookie')).toBe(false);
    expect(first.headers.has('content-encoding')).toBe(false);
    expect(second.headers.get('cache-control')).toBe('private, no-store');
  });

  it('allows a bounded 60s authentication cold start while keeping HTML, assets and metadata reads at 30s', async () => {
    const deadlines = vi.spyOn(AbortSignal, 'timeout');
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(loggedIn())
      .mockImplementation(async () => new Response('native editor response'));
    try {
      const upstream = createNativeN8nUpstream({ ...options, fetchImpl });
      await upstream.read('/workflow/8b606adc-91ba-46e5-86da-ece609df9c7d');
      await upstream.read('/assets/index-Abc.js');
      await upstream.read('/rest/login');
      expect(deadlines.mock.calls.map(([milliseconds]) => milliseconds)).toEqual([
        60000, 30000, 30000, 30000,
      ]);
      expect(fetchImpl.mock.calls.map(([, request]) => request.method)).toEqual([
        'POST',
        'GET',
        'GET',
        'GET',
      ]);
      for (const [, request] of fetchImpl.mock.calls)
        expect(request.signal).toBeInstanceOf(AbortSignal);
    } finally {
      deadlines.mockRestore();
    }
  });

  it('denies untrusted paths and origins before network access', async () => {
    const fetchImpl = vi.fn();
    const upstream = createNativeN8nUpstream({ ...options, fetchImpl });
    await expect(upstream.read('/rest/workflows/abc/run')).rejects.toThrow('path_denied');
    expect(fetchImpl).not.toHaveBeenCalled();
    for (const origin of [
      'http://evil.test',
      'https://user:password@evil.test',
      'https://evil.test/path',
      'https://evil.test/',
    ])
      expect(() => createNativeN8nUpstream({ ...options, origin })).toThrow(
        'invalid_native_editor_origin'
      );
  });

  it('sanitizes an authentication timeout without retrying it and permits a later explicit reconnect', async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error('Timeout at https://private-editor.example/?token=secret'))
      .mockResolvedValueOnce(loggedIn())
      .mockResolvedValueOnce(new Response('native editor HTML'));
    const upstream = createNativeN8nUpstream({ ...options, fetchImpl });
    await expect(upstream.read('/workflow/draft_123')).rejects.toEqual(
      new Error('native_editor_upstream_unavailable')
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const reconnected = await upstream.read('/workflow/draft_123');
    expect(reconnected.body.toString()).toBe('native editor HTML');
    expect(fetchImpl.mock.calls.map(([, request]) => request.method)).toEqual([
      'POST',
      'POST',
      'GET',
    ]);
  });

  it('refreshes rejected sessions once and fails without disclosing upstream error bodies', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(loggedIn())
      .mockResolvedValueOnce(new Response('sensitive upstream detail', { status: 401 }))
      .mockResolvedValueOnce(loggedIn())
      .mockResolvedValueOnce(new Response('still sensitive', { status: 401 }));
    await expect(
      createNativeN8nUpstream({ ...options, fetchImpl }).read('/rest/settings')
    ).rejects.toThrow('native_editor_upstream_auth_failed');
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it('rejects failed login and overlarge responses', async () => {
    const refused = vi.fn().mockResolvedValue(new Response('secret error', { status: 403 }));
    await expect(
      createNativeN8nUpstream({ ...options, fetchImpl: refused }).read('/rest/settings')
    ).rejects.toThrow('native_editor_upstream_auth_failed');
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(loggedIn())
      .mockResolvedValueOnce(new Response('123456'));
    await expect(
      createNativeN8nUpstream({ ...options, fetchImpl, maxAssetBytes: 5 }).read('/assets/index.js')
    ).rejects.toThrow('response_too_large');
  });
});
