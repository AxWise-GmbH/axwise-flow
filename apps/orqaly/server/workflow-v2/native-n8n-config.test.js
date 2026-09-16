import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nativeN8nGatewayFromEnvironment } from './native-n8n-config.js';
import * as upstreamModule from './native-editor-upstream.js';

const google = vi.hoisted(() => ({ getIdTokenClient: vi.fn() }));
vi.mock('google-auth-library', () => ({
  GoogleAuth: function GoogleAuth() {
    this.getIdTokenClient = google.getIdTokenClient;
  },
}));

const solutionId = '2031decc-b21e-48b5-9bd5-3ed3d4dfd024';
const apiOrigin = 'https://api.orqaly.example';
const parentOrigin = 'https://orqaly.example';
const binding = {
  environmentId: 'customer-preview-n8n',
  origin: 'https://private-n8n.example',
  email: 'operator@example.invalid',
  password: 'test-only-private-password',
  useIdToken: true,
};
const runtimeBinding = {
  id: binding.environmentId,
  origin: binding.origin,
  useIdToken: binding.useIdToken,
  tenantId: 'tenant-from-server-configuration',
  userId: 'user_owned',
};
function environment(overrides = {}) {
  return {
    ORQALY_ENVIRONMENT: 'preview',
    ORQALY_NATIVE_N8N_GATEWAY_ORIGIN: apiOrigin,
    ORQALY_BROWSER_ORIGINS: parentOrigin,
    ORQALY_NATIVE_N8N_SIGNING_KEY: 'test-only-signing-key-with-at-least-32-bytes',
    ORQALY_NATIVE_N8N_BINDINGS: JSON.stringify([binding]),
    ORQALY_SOLUTION_ENVIRONMENTS: JSON.stringify([runtimeBinding]),
    ...overrides,
  };
}
function configured(env = environment()) {
  const solutionService = {
    read: vi.fn().mockResolvedValue({
      solution: {
        id: solutionId,
        environment: { id: binding.environmentId },
        workflowHash: 'a'.repeat(64),
        workflow: {},
        rowVersion: 2,
      },
    }),
  };
  const revisionService = { read: vi.fn() };
  return {
    gateway: nativeN8nGatewayFromEnvironment({ solutionService, revisionService, env }),
    solutionService,
  };
}
beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('native n8n environment configuration', () => {
  it('disables the gateway only when all native configuration is absent', () => {
    expect(configured({}).gateway).toBeNull();
    for (const missing of [
      'ORQALY_NATIVE_N8N_GATEWAY_ORIGIN',
      'ORQALY_NATIVE_N8N_SIGNING_KEY',
      'ORQALY_NATIVE_N8N_BINDINGS',
    ]) {
      expect(() => configured(environment({ [missing]: undefined }))).toThrow(
        'native_editor_partial_configuration'
      );
    }
  });

  it('binds the gateway to the configured runtime and obtains IAM identity only for that upstream origin', async () => {
    const upstream = vi.spyOn(upstreamModule, 'createNativeN8nUpstream');
    const getRequestHeaders = vi
      .fn()
      .mockResolvedValue(new Headers({ Authorization: 'Bearer test-only-id-token' }));
    google.getIdTokenClient.mockResolvedValue({ getRequestHeaders });
    const { gateway, solutionService } = configured();
    expect(google.getIdTokenClient).not.toHaveBeenCalled();
    expect(upstream).toHaveBeenCalledWith(
      expect.objectContaining({
        origin: binding.origin,
        email: binding.email,
        password: binding.password,
      })
    );
    const upstreamOptions = upstream.mock.calls[0][0];
    const headers = await upstreamOptions.identityHeaders(binding.origin);
    expect(google.getIdTokenClient).toHaveBeenCalledWith(binding.origin);
    expect(getRequestHeaders).toHaveBeenCalledWith(binding.origin);
    expect(headers.get('Authorization')).toBe('Bearer test-only-id-token');
    const issued = await gateway.issue({ userId: 'user_owned' }, solutionId, {
      mode: 'view',
      revisionId: null,
    });
    expect(issued.launchUrl).toBe(`${apiOrigin}/native-n8n/launch`);
    expect(solutionService.read).toHaveBeenCalledWith({ userId: 'user_owned' }, solutionId);
    expect(JSON.stringify(issued)).not.toContain(binding.password);
    expect(JSON.stringify(issued)).not.toContain('test-only-id-token');
  });

  it('does not silently change an execution environment authentication mode', () => {
    const changed = { ...binding, useIdToken: false };
    expect(() =>
      configured(environment({ ORQALY_NATIVE_N8N_BINDINGS: JSON.stringify([changed]) }))
    ).toThrow('native_editor_runtime_binding_mismatch');
    expect(google.getIdTokenClient).not.toHaveBeenCalled();
  });

  it.each([
    { ...binding, environmentId: 'other-customer-environment' },
    { ...binding, origin: 'https://other-customer-n8n.example' },
  ])('rejects an editor binding that does not exactly match the execution runtime', (value) => {
    expect(() =>
      configured(environment({ ORQALY_NATIVE_N8N_BINDINGS: JSON.stringify([value]) }))
    ).toThrow('native_editor_runtime_binding_mismatch');
  });

  it('rejects shared native environments and missing runtime bindings', () => {
    expect(() =>
      configured(
        environment({
          ORQALY_NATIVE_N8N_BINDINGS: JSON.stringify([
            binding,
            { ...binding, environmentId: 'other-preview-n8n' },
          ]),
        })
      )
    ).toThrow('native_editor_shared_environment_denied');
    expect(() => configured(environment({ ORQALY_SOLUTION_ENVIRONMENTS: '[]' }))).toThrow(
      'native_editor_runtime_binding_mismatch'
    );
  });

  it.each([
    'not-json',
    '[]',
    '[{}]',
    JSON.stringify([{ ...binding, extraToken: 'must-not-be-accepted' }]),
  ])('fails closed on invalid native configuration', (value) => {
    expect(() => configured(environment({ ORQALY_NATIVE_N8N_BINDINGS: value }))).toThrow(
      'native_editor_invalid_binding_configuration'
    );
  });

  it('requires a strong signing key and a separate exact browser origin', () => {
    expect(() => configured(environment({ ORQALY_NATIVE_N8N_SIGNING_KEY: 'short' }))).toThrow(
      'native_editor_isolation_configuration_invalid'
    );
    expect(() => configured(environment({ ORQALY_BROWSER_ORIGINS: apiOrigin }))).toThrow(
      'native_editor_isolation_configuration_invalid'
    );
    expect(() => configured(environment({ ORQALY_BROWSER_ORIGINS: '' }))).toThrow(
      'native_editor_isolation_configuration_invalid'
    );
    expect(() =>
      configured(environment({ ORQALY_BROWSER_ORIGINS: `${parentOrigin}/workspace` }))
    ).toThrow('native_editor_origin_invalid');
  });

  it.each([
    'http://private-n8n.example',
    'https://private-n8n.example/path',
    'https://username:password@private-n8n.example',
  ])('rejects unsafe upstream origin %s even when the runtime string matches', (origin) => {
    expect(() =>
      configured(
        environment({
          ORQALY_NATIVE_N8N_BINDINGS: JSON.stringify([{ ...binding, origin }]),
          ORQALY_SOLUTION_ENVIRONMENTS: JSON.stringify([{ ...runtimeBinding, origin }]),
        })
      )
    ).toThrow('invalid_native_editor_origin');
  });

  it('allows loopback HTTP only in explicitly local mode without attaching Google credentials', () => {
    const upstream = vi.spyOn(upstreamModule, 'createNativeN8nUpstream');
    const origin = 'http://127.0.0.1:15678';
    const env = environment({
      ORQALY_ENVIRONMENT: 'local',
      ORQALY_NATIVE_N8N_GATEWAY_ORIGIN: 'http://127.0.0.1:19091',
      ORQALY_BROWSER_ORIGINS: 'http://localhost:5173',
      ORQALY_NATIVE_N8N_BINDINGS: JSON.stringify([{ ...binding, origin, useIdToken: false }]),
      ORQALY_SOLUTION_ENVIRONMENTS: JSON.stringify([
        { ...runtimeBinding, origin, useIdToken: false },
      ]),
    });
    expect(configured(env).gateway).not.toBeNull();
    expect(upstream.mock.calls[0][0].identityHeaders).toBeUndefined();
    expect(google.getIdTokenClient).not.toHaveBeenCalled();
    expect(() => configured({ ...env, ORQALY_ENVIRONMENT: 'preview' })).toThrow();
  });
});
