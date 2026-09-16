import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockResolveUserKey } = vi.hoisted(() => ({ mockResolveUserKey: vi.fn() }));
vi.mock('../security/resolve-user-key.js', () => ({ resolveUserKey: mockResolveUserKey }));

import {
  credentialEnvVar,
  envToolKeysAllowedFor,
  resolveToolCredential,
} from './tool-credentials.js';

const API_DEF = {
  id: 'tool-web-search',
  connectionType: 'api',
  credentials: [{ key: 'TAVILY_API_KEY' }],
};

// The real trap: a property id declared BEFORE the actual secret.
const ANALYTICS_DEF = {
  id: 'tool-analytics',
  connectionType: 'api',
  credentials: [{ key: 'GA_PROPERTY_ID' }, { key: 'GA_API_KEY' }],
};

const ENV_KEYS = [
  'VERCEL',
  'VERCEL_ENV',
  'ORQ_ALLOW_ENV_TOOL_KEYS',
  'ORQ_ENV_TOOL_KEYS',
  'COMPOSIO_API_KEY',
];
let saved;

beforeEach(() => {
  vi.clearAllMocks();
  saved = { NODE_ENV: process.env.NODE_ENV };
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  process.env.NODE_ENV = 'test';
  mockResolveUserKey.mockResolvedValue({ source: 'none', key: null });
});

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe('credentialEnvVar', () => {
  it('returns the declared secret for a single-credential tool', () => {
    expect(credentialEnvVar(API_DEF)).toBe('TAVILY_API_KEY');
  });

  it('skips an *_ID credential and picks the actual secret', () => {
    // credentials[0] here is GA_PROPERTY_ID — an identifier, not a secret.
    expect(credentialEnvVar(ANALYTICS_DEF)).toBe('GA_API_KEY');
  });

  it('returns null when the def declares no credentials', () => {
    expect(credentialEnvVar({ id: 'tool-doc-generator', connectionType: 'internal' })).toBeNull();
    expect(credentialEnvVar({ id: 'x', credentials: [] })).toBeNull();
    expect(credentialEnvVar(undefined)).toBeNull();
  });
});

describe('envToolKeysAllowedFor', () => {
  const open = () => {
    process.env.ORQ_ALLOW_ENV_TOOL_KEYS = 'true';
    process.env.ORQ_ENV_TOOL_KEYS = 'tool-web-search';
  };

  it('allows an allowlisted tool in local dev with the flag set', () => {
    open();
    expect(envToolKeysAllowedFor('tool-web-search')).toBe(true);
  });

  it('refuses a tool that is not on the allowlist', () => {
    open();
    expect(envToolKeysAllowedFor('tool-github')).toBe(false);
  });

  it('is closed when the flag is unset', () => {
    process.env.ORQ_ENV_TOOL_KEYS = 'tool-web-search';
    expect(envToolKeysAllowedFor('tool-web-search')).toBe(false);
  });

  it('fails closed on near-miss flag values rather than guessing intent', () => {
    process.env.ORQ_ENV_TOOL_KEYS = 'tool-web-search';
    for (const v of ['TRUE', 'True', '1', 'yes', 'on', ' true']) {
      process.env.ORQ_ALLOW_ENV_TOOL_KEYS = v;
      expect(envToolKeysAllowedFor('tool-web-search')).toBe(false);
    }
  });

  it('is closed when the allowlist is empty or unset — no implicit wildcard', () => {
    process.env.ORQ_ALLOW_ENV_TOOL_KEYS = 'true';
    expect(envToolKeysAllowedFor('tool-web-search')).toBe(false);
    process.env.ORQ_ENV_TOOL_KEYS = '';
    expect(envToolKeysAllowedFor('tool-web-search')).toBe(false);
    process.env.ORQ_ENV_TOOL_KEYS = '*';
    expect(envToolKeysAllowedFor('tool-web-search')).toBe(false);
  });

  it('cannot be opened on a deployment, even with the flag and allowlist set', () => {
    open();
    process.env.VERCEL = '1';
    expect(envToolKeysAllowedFor('tool-web-search')).toBe(false);
  });

  it('cannot be opened in production by NODE_ENV or VERCEL_ENV', () => {
    open();
    process.env.NODE_ENV = 'production';
    expect(envToolKeysAllowedFor('tool-web-search')).toBe(false);
    process.env.NODE_ENV = 'test';
    process.env.VERCEL_ENV = 'production';
    expect(envToolKeysAllowedFor('tool-web-search')).toBe(false);
  });
});

describe('resolveToolCredential', () => {
  it('marks internal tools ready without consulting the vault', async () => {
    const out = await resolveToolCredential({
      def: { id: 'tool-doc-generator', connectionType: 'internal' },
      userId: 'u1',
    });
    expect(out).toEqual({ source: 'none', apiKey: null, ready: true });
    expect(mockResolveUserKey).not.toHaveBeenCalled();
  });

  it('leaves composio tools not-ready when no platform COMPOSIO_API_KEY is set', async () => {
    // COMPOSIO_API_KEY is deleted in beforeEach.
    const out = await resolveToolCredential({
      def: { id: 'mcp-github', connectionType: 'composio' },
      userId: 'u1',
    });
    expect(out.ready).toBe(false);
    expect(mockResolveUserKey).not.toHaveBeenCalled();
  });

  it('marks composio tools ready when a platform COMPOSIO_API_KEY is configured', async () => {
    // Auth is the per-user OAuth connection at Composio (entityId=userId); a
    // missing connection fails soft at call time, so offering the tool is safe.
    process.env.COMPOSIO_API_KEY = 'cmp_test_key';
    const out = await resolveToolCredential({
      def: { id: 'mcp-slack', connectionType: 'composio' },
      userId: 'u1',
    });
    expect(out).toEqual({ source: 'composio', apiKey: null, ready: true });
    expect(mockResolveUserKey).not.toHaveBeenCalled();
  });

  it('resolves the user vault key under the tool:<toolId> provider', async () => {
    mockResolveUserKey.mockResolvedValue({ source: 'user', key: 'tvly-user' });
    const out = await resolveToolCredential({ def: API_DEF, userId: 'u1' });

    expect(mockResolveUserKey).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', provider: 'tool:tool-web-search' })
    );
    expect(out).toEqual({ source: 'user', apiKey: 'tvly-user', ready: true });
  });

  it('withholds envVar entirely when the gate is shut, so env is unreachable', async () => {
    await resolveToolCredential({ def: API_DEF, userId: 'u1' });
    expect(mockResolveUserKey.mock.calls[0][0].envVar).toBeUndefined();
  });

  it('passes envVar only for an allowlisted tool in local dev', async () => {
    process.env.ORQ_ALLOW_ENV_TOOL_KEYS = 'true';
    process.env.ORQ_ENV_TOOL_KEYS = 'tool-web-search';
    await resolveToolCredential({ def: API_DEF, userId: 'u1' });
    expect(mockResolveUserKey.mock.calls[0][0].envVar).toBe('TAVILY_API_KEY');
  });

  it('uses the vault key without consulting a legacy plaintext row', async () => {
    mockResolveUserKey.mockResolvedValue({ source: 'user', key: 'from-vault' });
    const out = await resolveToolCredential({
      def: API_DEF,
      row: { data: { apiKey: 'from-legacy-row' } },
      userId: 'u1',
    });
    expect(out.apiKey).toBe('from-vault');
    expect(out.source).toBe('user');
  });

  it('refuses a legacy plaintext row when the user has no vault key', async () => {
    const out = await resolveToolCredential({
      def: API_DEF,
      row: { data: { apiKey: 'from-legacy-row' } },
      userId: 'u1',
    });
    expect(out).toEqual({ source: 'none', apiKey: null, ready: false });
  });

  it('FAILS CLOSED when the vault key exists but cannot be decrypted', async () => {
    // The user configured a key; we just cannot read it. Falling through to the
    // legacy row would authenticate as a different identity than they chose.
    mockResolveUserKey.mockResolvedValue({ source: 'none', key: null, vaultError: true });
    const out = await resolveToolCredential({
      def: API_DEF,
      row: { data: { apiKey: 'from-legacy-row' } },
      userId: 'u1',
    });
    expect(out.ready).toBe(false);
    expect(out.apiKey).toBeNull();
  });

  it('is not ready when there is no key anywhere', async () => {
    const out = await resolveToolCredential({ def: API_DEF, userId: 'u1' });
    expect(out).toEqual({ source: 'none', apiKey: null, ready: false });
  });
});

describe('resolveToolCredential — catalog alias fallback', () => {
  // tool-web-search is Tavily. A user who pasted their Tavily key at
  // Settings -> Search -> Tavily stored it as `search:tavily`; that IS this key.
  const byProvider = (map) =>
    mockResolveUserKey.mockImplementation(async ({ provider }) =>
      map[provider] ? { source: 'user', key: map[provider] } : { source: 'none', key: null }
    );

  it('uses the existing catalog key when the user has no tool:* key', async () => {
    byProvider({ 'search:tavily': 'tvly-from-settings' });
    const out = await resolveToolCredential({ def: API_DEF, userId: 'u1' });
    expect(out).toEqual({ source: 'alias', apiKey: 'tvly-from-settings', ready: true });
  });

  it('prefers an explicit tool:* key over the alias', async () => {
    byProvider({ 'tool:tool-web-search': 'explicit', 'search:tavily': 'via-alias' });
    const out = await resolveToolCredential({ def: API_DEF, userId: 'u1' });
    expect(out.apiKey).toBe('explicit');
    expect(out.source).toBe('user');
  });

  it('asks for tool:* FIRST — ordering is what makes the preference real', async () => {
    byProvider({ 'search:tavily': 'via-alias' });
    await resolveToolCredential({ def: API_DEF, userId: 'u1' });
    expect(mockResolveUserKey.mock.calls[0][0].provider).toBe('tool:tool-web-search');
    expect(mockResolveUserKey.mock.calls[1][0].provider).toBe('search:tavily');
  });

  it('tags the alias lookup with an attributable reason', async () => {
    // Otherwise an agent's use of the GitHub key is indistinguishable in
    // audit_log from the KB importer's read.
    byProvider({ 'search:tavily': 'k' });
    await resolveToolCredential({ def: API_DEF, userId: 'u1' });
    expect(mockResolveUserKey.mock.calls[1][0].reason).toBe('agent.tool:tool-web-search.alias');
  });

  it('uses the alias without consulting a legacy plaintext row', async () => {
    byProvider({ 'search:tavily': 'via-alias' });
    const out = await resolveToolCredential({
      def: API_DEF,
      row: { data: { apiKey: 'legacy' } },
      userId: 'u1',
    });
    expect(out.apiKey).toBe('via-alias');
  });

  it('refuses legacy plaintext when the alias has no key either', async () => {
    byProvider({});
    const out = await resolveToolCredential({
      def: API_DEF,
      row: { data: { apiKey: 'legacy' } },
      userId: 'u1',
    });
    expect(out).toEqual({ source: 'none', apiKey: null, ready: false });
  });

  it('FAILS CLOSED when the ALIAS key exists but cannot be decrypted', async () => {
    mockResolveUserKey.mockImplementation(async ({ provider }) =>
      provider === 'search:tavily'
        ? { source: 'none', key: null, vaultError: true }
        : { source: 'none', key: null }
    );
    const out = await resolveToolCredential({
      def: API_DEF,
      row: { data: { apiKey: 'legacy' } },
      userId: 'u1',
    });
    expect(out.ready).toBe(false);
  });

  it('never resolves an unaliased tool through a neighbour vendor', async () => {
    // CapSolver is not 2Captcha. A key at exec:twocaptcha must not reach it.
    byProvider({ 'exec:twocaptcha': '2captcha-key' });
    const out = await resolveToolCredential({
      def: {
        id: 'tool-capsolver-solver',
        connectionType: 'api',
        credentials: [{ key: 'CAPSOLVER_API_KEY' }],
      },
      userId: 'u1',
    });
    expect(out.ready).toBe(false);
    expect(mockResolveUserKey.mock.calls.map((c) => c[0].provider)).toEqual([
      'tool:tool-capsolver-solver',
    ]);
  });
});
