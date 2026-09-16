import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { evaluateConditions, normalizeAxwiseTenant } from './client.js';

const CTX = {
  integrationPoint: 'consilium.create',
  requestId: 'req-1',
  tenant: { userId: 'u1', orgId: 'o1' },
  payload: { name: 'Board' },
};

describe('axwise/client evaluateConditions', () => {
  beforeEach(() => {
    vi.stubEnv('AXWISE_API_URL', 'https://axwise.test/v1');
    vi.stubEnv('AXWISE_API_KEY', 'k-123');
    global.fetch = vi.fn();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('POSTs to /conditions/evaluate with x-axwise-key and returns parsed json', async () => {
    const body = { applicableConditions: [], processedOutputs: {}, meta: { cost: 0.01 } };
    global.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => body });

    const out = await evaluateConditions(CTX);
    expect(out).toEqual(body);

    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('https://axwise.test/v1/conditions/evaluate');
    expect(opts.method).toBe('POST');
    expect(opts.headers['x-axwise-key']).toBe('k-123');
    expect(JSON.parse(opts.body).integrationPoint).toBe('consilium.create');
  });

  it('uses the authenticated user as the personal-workspace org tenant', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ applicableConditions: [], processedOutputs: {} }),
    });

    await evaluateConditions({
      ...CTX,
      integrationPoint: 'copilot.chat',
      tenant: { userId: 'user-personal', orgId: null },
    });

    const request = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(request.tenant).toEqual({ userId: 'user-personal', orgId: 'user-personal' });
  });

  it('fails locally when no authenticated tenant user exists', async () => {
    expect(() => normalizeAxwiseTenant({ userId: null, orgId: null })).toThrow(
      /tenant\.userId is required/
    );
    await expect(
      evaluateConditions({ ...CTX, tenant: { userId: null, orgId: null } })
    ).rejects.toThrow(/tenant\.userId is required/);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('throws with HTTP status on non-ok response', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 503, text: async () => 'down' });
    await expect(evaluateConditions(CTX)).rejects.toThrow(/HTTP 503/);
  });

  it('throws when API key is missing', async () => {
    vi.stubEnv('AXWISE_API_KEY', '');
    await expect(evaluateConditions(CTX)).rejects.toThrow(/AXWISE_API_KEY/);
  });

  it('throws when integrationPoint is missing', async () => {
    await expect(evaluateConditions({})).rejects.toThrow(/integrationPoint/);
  });

  it('rejects a loopback AxWise URL in a deployed runtime before fetching', async () => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('AXWISE_API_URL', 'http://127.0.0.1:8791/api/orqaly-axwise/v1');

    await expect(evaluateConditions(CTX)).rejects.toThrow(/HTTPS|loopback/);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
