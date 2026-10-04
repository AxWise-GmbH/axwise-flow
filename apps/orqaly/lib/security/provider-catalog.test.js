import { describe, it, expect, vi } from 'vitest';

vi.mock('../security/resolve-user-key.js', () => ({
  resolveUserKey: vi.fn(),
}));
import {
  PROVIDER_CATALOG,
  TOOL_PROVIDER_ALIAS,
  aliasFor,
  isKnownProvider,
  probeProviderKey,
} from './provider-catalog.js';
import { PREDEFINED_TOOLS } from '../../src/config/predefinedTools.js';
import { credentialEnvVar } from '../agent-handlers/tool-credentials.js';

describe('llm:gemini keyRegex', () => {
  const re = PROVIDER_CATALOG['llm:gemini'].keyRegex;

  it('accepts classic AI Studio AIza… keys', () => {
    expect(re.test('AIzaSyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7')).toBe(true);
  });

  it('accepts AQ.… keys, which Google also issues and honours', () => {
    // Verified working against v1beta/models and v1beta/openai/chat/completions.
    // Rejecting these blocked a valid key from being saved via Settings -> Keys.
    expect(re.test('AQ.Ab8FakeServiceAccountKeyForTesting12345')).toBe(true);
  });

  it('still rejects garbage and other providers keys', () => {
    expect(re.test('not-a-key')).toBe(false);
    expect(re.test('sk-ant-abcdefghijklmnopqrstuvwxyz')).toBe(false);
    expect(re.test('AQ.short')).toBe(false);
    expect(re.test('AIzaShort')).toBe(false);
  });
});

describe('TOOL_PROVIDER_ALIAS', () => {
  it('every target exists in PROVIDER_CATALOG', () => {
    for (const [toolId, provider] of Object.entries(TOOL_PROVIDER_ALIAS)) {
      expect(PROVIDER_CATALOG[provider], `${toolId} -> ${provider}`).toBeDefined();
    }
  });

  it('every alias points at the SAME credential the tool itself declares', () => {
    // The load-bearing test. An alias hands one service's key to another service's
    // tool if these disagree — e.g. aliasing tool-capsolver-solver (api.capsolver.com)
    // to exec:twocaptcha would send a CapSolver key to 2Captcha. Comparing declared
    // env vars makes that class of mistake impossible to add silently.
    for (const [toolId, provider] of Object.entries(TOOL_PROVIDER_ALIAS)) {
      const def = PREDEFINED_TOOLS.find((d) => d.id === toolId);
      expect(def, `${toolId} is not in the catalog`).toBeDefined();
      expect(PROVIDER_CATALOG[provider].envVar, `${toolId} -> ${provider}`).toBe(credentialEnvVar(def));
    }
  });

  it('only aliases tools that exist and are api-type', () => {
    for (const toolId of Object.keys(TOOL_PROVIDER_ALIAS)) {
      const def = PREDEFINED_TOOLS.find((d) => d.id === toolId);
      expect(def.connectionType, toolId).toBe('api');
    }
  });

  it('does not alias tools whose vendor differs from any catalog entry', () => {
    // CapSolver is not 2Captcha; 5sim and RentAHuman have no entry; tool-analytics
    // needs two credentials and one vault row holds one secret.
    for (const id of ['tool-capsolver-solver', 'tool-sms-verify', 'tool-rentahuman', 'tool-analytics']) {
      expect(TOOL_PROVIDER_ALIAS[id], id).toBeUndefined();
    }
  });
});

describe('aliasFor', () => {
  it('resolves a tool: provider to its catalog target', () => {
    expect(aliasFor('tool:tool-github')).toBe('dev:github');
    expect(aliasFor('tool:tool-web-search')).toBe('search:tavily');
  });

  it('returns null for an unaliased tool, a catalog id, or junk', () => {
    expect(aliasFor('tool:tool-capsolver-solver')).toBeNull();
    expect(aliasFor('llm:openai')).toBeNull();
    expect(aliasFor('tool:nonsense')).toBeNull();
    expect(aliasFor(undefined)).toBeNull();
    expect(aliasFor('')).toBeNull();
  });
});

describe('probeProviderKey via alias', () => {
  it('reaches the alias target instead of rejecting the tool: id outright', async () => {
    // dev:github declares a keyRegex; a garbage key must fail on FORMAT, proving we
    // got past UNKNOWN_PROVIDER and into the real entry — no network needed.
    const res = await probeProviderKey('tool:tool-github', 'not-a-token');
    expect(res.code).not.toBe('UNKNOWN_PROVIDER');
  });

  it('still rejects an unaliased tool: id', async () => {
    const res = await probeProviderKey('tool:tool-capsolver-solver', 'whatever');
    expect(res).toMatchObject({ ok: false, code: 'UNKNOWN_PROVIDER' });
  });

  it('still rejects a genuinely unknown provider', async () => {
    const res = await probeProviderKey('bogus:thing', 'whatever');
    expect(res).toMatchObject({ ok: false, code: 'UNKNOWN_PROVIDER' });
  });
});

describe('isKnownProvider', () => {
  it('accepts catalog ids and tool: ids, rejects the rest', () => {
    expect(isKnownProvider('llm:openai')).toBe(true);
    expect(isKnownProvider('tool:tool-github')).toBe(true);
    expect(isKnownProvider('tool:')).toBe(false);
    expect(isKnownProvider('bogus:thing')).toBe(false);
    expect(isKnownProvider('')).toBe(false);
    expect(isKnownProvider(null)).toBe(false);
  });
});
