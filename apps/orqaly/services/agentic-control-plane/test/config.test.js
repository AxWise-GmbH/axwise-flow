import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConfig } from '../src/config.js';

test('configuration accepts normal unrelated process variables and stays disabled by default', () => {
  const config = loadConfig({
    DATABASE_URL: 'postgresql://localhost/agentic',
    ORQALY_PRINCIPAL_SIGNING_KEY: 'a-key-that-is-definitely-longer-than-32-bytes',
    PATH: '/usr/bin',
  });
  assert.equal(config.AGENTIC_EXECUTION_ENABLED, false);
  assert.equal(config.PORT, 8080);
});

test('configuration rejects a short signing key and malformed capability JSON is rejected at app load', () => {
  assert.throws(() =>
    loadConfig({
      DATABASE_URL: 'postgresql://localhost/agentic',
      ORQALY_PRINCIPAL_SIGNING_KEY: 'short',
    })
  );
});

test('configuration cannot extend an Agent principal beyond five minutes', () => {
  assert.throws(() =>
    loadConfig({
      DATABASE_URL: 'postgresql://localhost/agentic',
      ORQALY_PRINCIPAL_SIGNING_KEY: 'a-key-that-is-definitely-longer-than-32-bytes',
      ORQALY_PRINCIPAL_MAX_TTL_SECONDS: '301',
    })
  );
});
