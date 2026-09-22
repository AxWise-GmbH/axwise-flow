import test from 'node:test';
import assert from 'node:assert/strict';
import { createEvaluationStorage, createWorkloadIdentity } from './storage.mjs';

const bucket = 'orqanix-agent-evaluations-preview-161074549006';
test('claim is conditional and never overwrites an existing cycle', async () => {
  const calls = [];
  const storage = createEvaluationStorage({ bucket, tokenProvider: async () => 'private-token', fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return new Response('', { status: 412 });
  } });
  assert.equal(await storage.claim('2026-09-21T12:00:00.000Z', 'run'), false);
  assert.match(calls[0].url, /ifGenerationMatch=0$/);
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer private-token');
  // GCS validates exact media type equality between metadata and media part.
  assert.match(calls[0].options.body, /"contentType":"application\/json; charset=utf-8"/);
  assert.match(calls[0].options.body, /Content-Type: application\/json; charset=utf-8\r\n/);
  assert.doesNotMatch(calls[0].options.body, /private-token/);
});

test('storage refuses another bucket and unsafe object paths', async () => {
  assert.throws(() => createEvaluationStorage({ bucket: 'production-data' }));
  const storage = createEvaluationStorage({ bucket, tokenProvider: async () => '' });
  await assert.rejects(storage.read('public/../../secret'));
  await assert.rejects(storage.write('other/config', {}));
});

test('recent history is paginated, bounded by date, and contains only fetched records', async () => {
  const urls = [];
  const storage = createEvaluationStorage({ bucket, tokenProvider: async () => 'token', fetchImpl: async url => {
    urls.push(url);
    const parsed = new URL(url);
    if (parsed.searchParams.has('prefix')) {
      return Response.json(parsed.searchParams.has('pageToken')
        ? { items: [{ name: 'records/2026-09-21/b.json' }] }
        : { items: [{ name: 'records/2026-09-20/a.json' }], nextPageToken: 'next' });
    }
    return Response.json({ runId: url.includes('a.json') ? 'a' : 'b' });
  } });
  assert.deepEqual(await storage.recentRecords(new Date('2026-09-21T12:00:00Z')), [{ runId: 'a' }, { runId: 'b' }]);
  assert.equal(urls.length, 4);
  assert.match(urls[0], /startOffset=records%2F2026-09-20/);
  assert.match(urls[1], /pageToken=next/);
});

test('metadata identities are audience scoped and never follow redirects', async () => {
  const calls = [];
  const identity = createWorkloadIdentity({ fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return url.endsWith('/token') ? Response.json({ access_token: 'access', expires_in: 3600 }) : new Response('header.payload.signature');
  } });
  assert.equal(await identity.accessToken(), 'access');
  assert.equal(await identity.accessToken(), 'access');
  await identity.idToken('https://a.example');
  await identity.idToken('https://a.example');
  await identity.idToken('https://b.example');
  assert.equal(calls.length, 3);
  assert.ok(calls.every(call => call.options.redirect === 'error'));
  assert.match(calls[1].url, /audience=https%3A%2F%2Fa.example/);
});
