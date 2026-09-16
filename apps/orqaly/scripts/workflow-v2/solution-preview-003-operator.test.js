// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  NATIVE_003_KEY_SCOPES,
  SCOPE_003,
  literal003Environment,
  native003ScopeHash,
  parse003Arguments,
  validate003ScopeBundle,
  validate003Source,
} from '../solution-preview-003-operator.mjs';

const image = `europe-west4-docker.pkg.dev/axwise-v2-preview-001/workflow-v2-preview/n8n-native-preview-003@sha256:${'a'.repeat(64)}`;
const sources = () => {
  const environments = ['001', '002'].map((n) => ({
    id: `orqaly-customer-webhook-preview-${n}`,
    tenantId: '00000000-0000-4000-8000-000000000001',
    userId: 'user_previewOwner',
    origin: `https://orqaly-solution-n8n-preview${n === '002' ? '-002' : ''}-161074549006.europe-west4.run.app`,
    apiKey: 'synthetic-test-only',
    useIdToken: true,
  }));
  return {
    environments,
    native: environments.map((e) => ({
      environmentId: e.id,
      origin: e.origin,
      email: 'operator@orqaly.invalid',
      password: 'synthetic-test-only',
      useIdToken: true,
    })),
  };
};
describe('fixed approved preview003 operator', () => {
  it('distinguishes explicitly empty Cloud Run literals from absent variables and secret references', () => {
    const values = literal003Environment([
      { name: 'N8N_SSRF_ALLOWED_HOSTNAMES' },
      { name: 'N8N_SSRF_ALLOWED_IP_RANGES', value: '' },
      { name: 'N8N_SSRF_PROTECTION_ENABLED', value: 'true' },
      {
        name: 'DB_POSTGRESDB_PASSWORD',
        valueFrom: { secretKeyRef: { name: 'example', key: '1' } },
      },
    ]);
    expect(values).toEqual({
      N8N_SSRF_ALLOWED_HOSTNAMES: '',
      N8N_SSRF_ALLOWED_IP_RANGES: '',
      N8N_SSRF_PROTECTION_ENABLED: 'true',
    });
    expect(values.ABSENT_ALLOWLIST).toBeUndefined();
    expect(values.DB_POSTGRESDB_PASSWORD).toBeUndefined();
  });
  it('requires explicit mode and an immutable exact003 image for writes', () => {
    expect(parse003Arguments(['inspect'])).toEqual({ mode: 'inspect', image: null });
    expect(parse003Arguments(['provision', `--image=${image}`])).toEqual({
      mode: 'provision',
      image,
    });
    for (const args of [
      [],
      ['delete'],
      ['provision'],
      ['bootstrap'],
      ['inspect', '--project=other'],
      ['provision', '--image=n8nio/n8n:latest'],
      ['provision', `--image=${image.replace('003@', '002@')}`],
      ['provision', `--image=${image}`, '--force'],
    ])
      expect(() => parse003Arguments(args)).toThrow();
    expect(SCOPE_003.service).toBe('orqaly-solution-n8n-preview-003');
    expect(SCOPE_003.database).toBe('orqaly_solution_n8n_preview_003');
  });
  it('derives the owner from both exactexisting bindings and refuses scope/origin substitution', () => {
    const original = sources();
    expect(validate003Source(original.environments, original.native)).toEqual({
      tenantId: original.environments[0].tenantId,
      userId: 'user_previewOwner',
    });
    for (const mutate of [
      (s) => {
        s.environments[1].userId = 'user_otherOwner';
      },
      (s) => {
        s.environments[1].origin = 'https://other.example.test';
      },
      (s) => {
        s.native[1].useIdToken = false;
      },
      (s) => {
        s.native[1].environmentId = SCOPE_003.environmentId;
      },
      (s) => {
        s.environments.pop();
      },
    ]) {
      const changed = structuredClone(original);
      mutate(changed);
      expect(() => validate003Source(changed.environments, changed.native)).toThrow();
    }
  });
  it('uses genuine management scopes without credential update/decryption or unrelated API scope', () => {
    expect(NATIVE_003_KEY_SCOPES).toContain('workflow:deactivate');
    expect(NATIVE_003_KEY_SCOPES).toContain('workflow:delete');
    expect(NATIVE_003_KEY_SCOPES).toContain('credential:create');
    expect(NATIVE_003_KEY_SCOPES).toContain('credential:list');
    expect(NATIVE_003_KEY_SCOPES).toHaveLength(12);
    expect(NATIVE_003_KEY_SCOPES).not.toContain('credential:update');
    expect(
      NATIVE_003_KEY_SCOPES.some((scope) => /decrypt|user|project|variable|tag/.test(scope))
    ).toBe(false);
  });
  it('requires the exact desired scope hash and preserves every existing binding field except the key', () => {
    const binding = {
      ...sources().environments[0],
      id: SCOPE_003.environmentId,
      apiKey: 'original-synthetic-key-only',
    };
    const bundle = {
      schemaVersion: 1,
      scopeHash: native003ScopeHash(),
      keyId: 'synthetic-key-id',
      binding: { ...binding, apiKey: 'replacement-synthetic-key-only' },
    };
    expect(validate003ScopeBundle(bundle, binding)).toEqual(bundle.binding);
    for (const changed of [
      { ...bundle, scopeHash: 'a'.repeat(64) },
      { ...bundle, binding: { ...bundle.binding, userId: 'user_otherOwner' } },
      { ...bundle, binding: { ...bundle.binding, origin: 'https://other.example.test' } },
      { ...bundle, binding: { ...bundle.binding, extraAuthority: true } },
    ])
      expect(() => validate003ScopeBundle(changed, binding)).toThrow();
  });
});
