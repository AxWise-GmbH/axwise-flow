import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { createMcpTools, serveMcp } from '../src/mcp.mjs';

const id = '11111111-1111-4111-8111-111111111111';
const base = { apiUrl: 'https://preview.example', conversationId: '20260914_1', accountHash: 'a'.repeat(64), token: async () => 'test-secret', newId: () => id };
const response = (data) => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });

test('cloud work is bound to native conversation and token never becomes tool content', async () => {
  const calls = [];
  const call = createMcpTools({ ...base, fetchImpl: async (...args) => { calls.push(args); return response({ status: 'pending', requestId: id }); } });
  const value = await call('ask_axwise', { question: 'Explain retries' });
  assert.equal(value.isError, false);
  assert.equal(JSON.parse(calls[0][1].body).conversationId, base.conversationId);
  assert.equal(calls[0][1].headers.Authorization, 'Bearer test-secret');
  assert.equal(JSON.stringify(value).includes('test-secret'), false);
  await call('axwise_work_status', { requestId: id });
  assert.equal(calls[1][1].method, 'GET');
  assert.equal(calls[1][0], `https://preview.example/desktop/v1/work/20260914_1/${id}`);
});
test('ambiguous submissions retain request ID without automatic paid retries or leaked errors', async () => {
  let calls = 0;
  const call = createMcpTools({ ...base, fetchImpl: async () => { calls++; throw new Error('test-secret'); } });
  const value = await call('ask_axwise', { question: 'Explain retries' });
  assert.equal(calls, 1); assert.equal(value.structuredContent.status, 'unknown');
  assert.equal(value.structuredContent.requestId, id);
  assert.equal(JSON.stringify(value).includes('test-secret'), false);
});
test('argument and account failures do not redirect requests or expose response bodies', async () => {
  let calls = 0;
  const call = createMcpTools({ ...base, fetchImpl: async () => { calls++; return new Response('test-secret', { status: 403 }); } });
  assert.equal((await call('read_goal_artifact', { runId: '../../evil' })).isError, true);
  assert.equal((await call('ask_axwise', { question: 'test', url: 'https://evil.example' })).isError, true);
  assert.equal(calls, 0);
  const value = await call('ask_axwise', { question: 'test' });
  assert.equal(value.structuredContent.status, 'not_started');
  assert.equal(JSON.stringify(value).includes('test-secret'), false);
});
test('stdio handshake exposes native tools and emits only JSON-RPC', async () => {
  const input = new PassThrough(); const output = new PassThrough(); let received = '';
  output.on('data', (data) => { received += data.toString(); });
  const run = serveMcp({ input, output, call: async () => ({ content: [] }) });
  input.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }) + '\n');
  input.end(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) + '\n');
  await run;
  const replies = received.trim().split('\n').map(JSON.parse);
  assert.equal(replies[0].result.serverInfo.name, 'orqaly');
  assert.equal(replies[1].result.tools.length, 4);
  assert.equal(replies[1].result.tools[0].annotations.readOnlyHint, false);
});
