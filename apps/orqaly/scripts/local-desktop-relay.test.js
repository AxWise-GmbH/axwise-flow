// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { startLocalDesktopRelay } from './local-desktop-relay.mjs';

const servers = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => {
    server.closeAllConnections();
    server.close(resolve);
  })));
});

const token = 'local-benchmark-token-01234567890123456789';
const environment = {
  ORQALY_GOOSE_GEMINI_API_KEY: 'server-only-gemini-key',
  ORQALY_LOCAL_TEST_MODE: 'true',
  ORQALY_LOCAL_TEST_TOKEN: token,
};

describe('loopback desktop relay', () => {
  it('binds only loopback and accepts only the explicit local benchmark token', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Ready.' } }] }),
      { headers: { 'content-type': 'application/json' } }));
    const { server, url } = await startLocalDesktopRelay({ environment, fetchImpl, port: 0 });
    servers.push(server);
    expect(server.address().address).toBe('127.0.0.1');
    expect((await fetch(`${url}/desktop/v1/session`)).status).toBe(401);
    expect((await fetch(`${url}/desktop/v1/session`, {
      headers: { Authorization: 'Bearer wrong-token' },
    })).status).toBe(401);

    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const session = await fetch(`${url}/desktop/v1/session`, { headers });
    expect(await session.json()).toMatchObject({ userId: 'local-benchmark', accountScoped: true });
    const badHash = await fetch(`${url}/desktop/v1/session`, {
      headers: { ...headers, 'X-Orqaly-Account-Hash': '0'.repeat(64) },
    });
    expect(badHash.status).toBe(403);
    const goodHash = createHash('sha256').update('local-benchmark').digest('hex');
    expect((await fetch(`${url}/desktop/v1/session`, {
      headers: { ...headers, 'X-Orqaly-Account-Hash': goodHash },
    })).status).toBe(200);

    const chat = await fetch(`${url}/desktop/v1/chat/completions`, {
      method: 'POST', headers,
      body: JSON.stringify({ model: 'orqaly-gemini', messages: [{ role: 'user', content: 'Hello' }] }),
    });
    expect(chat.status).toBe(200);
    expect((await chat.json()).choices[0].message.content).toBe('Ready.');
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('requires a strong explicit benchmark token and a provider key', async () => {
    await expect(startLocalDesktopRelay({
      environment: { ...environment, ORQALY_LOCAL_TEST_TOKEN: 'short' }, port: 0,
    })).rejects.toThrow(/ORQALY_LOCAL_TEST_TOKEN/);
    await expect(startLocalDesktopRelay({
      environment: { ...environment, ORQALY_GOOSE_GEMINI_API_KEY: '' }, port: 0,
    })).rejects.toThrow(/API_KEY_REQUIRED/);
  });
});
