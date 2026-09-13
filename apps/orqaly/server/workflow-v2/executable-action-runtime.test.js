import crypto from 'node:crypto';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createExecutableActionRuntimeFromEnvironment } from './executable-action-runtime.js';

function runtimeEnvironment(overrides = {}) {
  const { publicKey } = crypto.generateKeyPairSync('ed25519');
  return {
    ORQALY_N8N_BASE_URL: 'http://127.0.0.1:5678',
    ORQALY_N8N_BINDING_MANIFEST_PATH: path.resolve('infra/n8n/executor-bindings.json'),
    ORQALY_GATEWAY_PUBLIC_KEYS_JSON: JSON.stringify({
      preview_key: publicKey.export({ type: 'spki', format: 'pem' }),
    }),
    ...overrides,
  };
}

describe('WorkflowV2 executable action runtime configuration', () => {
  it('stays disabled when no execution setting is present', async () => {
    await expect(createExecutableActionRuntimeFromEnvironment({})).resolves.toEqual({
      configured: false,
      bindingManifest: null,
      n8nExecutor: null,
    });
  });

  it('loads the pinned binding and uses the cold-start-safe 90 second dispatch default', async () => {
    const runtime = await createExecutableActionRuntimeFromEnvironment(runtimeEnvironment());

    expect(runtime.configured).toBe(true);
    expect(runtime.bindingManifest.manifestHash).toMatch(/^[a-f0-9]{64}$/);
    expect(runtime.n8nExecutor.timeoutMs).toBe(90_000);
  });

  it('fails closed on partial configuration or an invalid timeout', async () => {
    await expect(
      createExecutableActionRuntimeFromEnvironment({ ORQALY_N8N_BASE_URL: 'http://127.0.0.1:5678' })
    ).rejects.toThrow('execution requires');
    await expect(
      createExecutableActionRuntimeFromEnvironment(
        runtimeEnvironment({ ORQALY_N8N_TIMEOUT_MS: '0' })
      )
    ).rejects.toThrow('ORQALY_N8N_TIMEOUT_MS must be positive');
  });
});
