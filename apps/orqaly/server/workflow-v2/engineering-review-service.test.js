// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import { createServer } from 'node:http';
import { sha256Hex } from '../../lib/workflow-v2/canonical.js';
import { createEngineeringReviewService, ENGINEERING_REVIEW_MAX_BYTES } from './engineering-review-service.js';
import { createGooseProviderRouter } from './goose-provider-http.js';
import { evaluateWithJev } from '../../../../packages/omp-mcp-server/src/omp-client.mjs';

const auth = { userId: 'user-owner' };
const markdown = 'Preserve Retry-After; handle malformed input.';
const reference = { conversationId: 'desktop_conversation', requestId: '11111111-1111-4111-8111-111111111111', artifactHash: sha256Hex(markdown) };
const jsonResponse = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const answer = (quality = 0.9, ready = 0.9) => ({ model: 'jev-1.13.0', answers: {
  quality_verified: { type: 'noul', noul: quality }, ready_for_review: { type: 'noul', noul: ready },
} });
function request(change = () => {}) {
  const value = { taskId: 'engineering_task', conversationId: reference.conversationId,
    task: 'Handle malformed Retry-After input.', acceptanceCriteria: ['Malformed input returns null.'], researchReferences: [reference],
    evidence: { diff: { status: 'captured', before: 'return parse(value);', after: 'try { return parse(value); } catch { return null; }', changed: true },
      tests: { status: 'passed', command: ['node', '--test', 'retry.test.mjs'], exitCode: 0, output: '2 tests passed', truncated: false }, toolsUsed: ['read', 'edit', 'bash'],
      changedFilesStatus: 'captured', changedFiles: [{ path: 'src/retry.js', change: 'edited' }], relevantIgnoredFilesChanged: false } };
  change(value);
  value.inputHash = sha256Hex(JSON.stringify({ task: value.task, acceptanceCriteria: value.acceptanceCriteria, researchReferences: value.researchReferences }));
  return value;
}
function legacyRequest(change = () => {}) {
  return request((value) => {
    delete value.evidence.changedFilesStatus;
    delete value.evidence.changedFiles;
    delete value.evidence.relevantIgnoredFilesChanged;
    change(value);
  });
}
function fixture(overrides = {}) {
  const options = { desktopWorkService: { read: vi.fn(async () => ({ ...reference, status: 'completed', artifacts: [{ contentHash: reference.artifactHash, markdown }] })) },
    fetchImpl: vi.fn(async () => jsonResponse(answer())), apiKey: 'server-fixture-key', ...overrides };
  return { ...options, service: createEngineeringReviewService(options) };
}
const servers = [];
afterEach(async () => { await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }))); });
async function routeFixture(overrides = {}) {
  const f = fixture();
  const commandService = { session: vi.fn(async () => ({ userId: auth.userId, tenantBound: true })) };
  const app = express();
  app.use('/desktop/v1', createGooseProviderRouter({ commandService,
    verifyDesktopAuth: async (req) => req.get('Authorization') === 'Bearer desktop-fixture-token' ? auth : null,
    apiKey: 'gemini-fixture-key', engineeringReviewService: f.service, ...overrides }));
  const server = createServer(app);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  servers.push(server);
  const base = `http://127.0.0.1:${server.address().port}/desktop/v1`;
  const call = (body = request(), headers = {}) => fetch(base + '/engineering/review', { method: 'POST',
    headers: { Authorization: 'Bearer desktop-fixture-token', 'Content-Type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  return { ...f, commandService, base, call };
}

describe('bounded cloud engineering review', () => {
  it('sends complete evidence and owned research, binding the actual model and exact hashes', async () => {
    const f = fixture();
    const command = request((value) => { value.evidence.diff.after += 'x'.repeat(5000) + 'COMPLETE_DIFF_END'; });
    const receipt = await f.service.review(auth, command);
    expect(receipt).toMatchObject({ taskId: command.taskId, inputHash: command.inputHash, evidenceHash: sha256Hex(JSON.stringify(command.evidence)), researchReferences: [reference],
      review: { status: 'passed', advisory: true, model: 'jev-1.13.0', qualityScore: 0.9, readyProbability: 0.9 } });
    expect(receipt.review.evaluatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(f.desktopWorkService.read).toHaveBeenCalledWith(auth, { conversationId: reference.conversationId, requestId: reference.requestId });
    const [url, options] = f.fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.typesafe.ai/v1/systemone');
    expect(options.redirect).toBe('error');
    expect(options.headers.Authorization).toBe('Bearer server-fixture-key');
    const sent = JSON.parse(options.body);
    expect(sent.model).toBe('jev-latest');
    expect(sent.state.evidence).toEqual(command.evidence);
    expect(sent.state.research).toEqual([{ ...reference, markdown }]);
    expect(Object.values(sent.questions).every((question) => question.type === 'noul')).toBe(true);
    expect(JSON.stringify(receipt)).not.toContain('server-fixture-key');
  });
  it('requires both quality .6 and readiness .5 thresholds', async () => {
    for (const [quality, ready, status] of [[0.6, 0.5, 'passed'], [0.59, 0.9, 'failed'], [0.9, 0.49, 'failed']]) {
      const f = fixture({ fetchImpl: vi.fn(async () => jsonResponse(answer(quality, ready))) });
      expect((await f.service.review(auth, request())).review.status).toBe(status);
    }
  });
  it('rejects missing identity, changed input hashes and another conversation before lookups', async () => {
    const f = fixture();
    await expect(f.service.review(null, request())).rejects.toMatchObject({ status: 401 });
    await expect(f.service.review(auth, { ...request(), inputHash: 'a'.repeat(64) })).rejects.toMatchObject({ status: 409 });
    await expect(f.service.review(auth, request((value) => { value.conversationId = 'foreign'; }))).rejects.toMatchObject({ status: 403 });
    expect(f.desktopWorkService.read).not.toHaveBeenCalled(); expect(f.fetchImpl).not.toHaveBeenCalled();
  });
  it('denies unauthorized and unknown research references without provider calls', async () => {
    for (const status of [401, 403, 404]) {
      const f = fixture({ desktopWorkService: { read: vi.fn(async () => { throw Object.assign(new Error('private detail'), { status }); }) } });
      await expect(f.service.review(auth, request())).rejects.toMatchObject({ status, code: 'ENGINEERING_RESEARCH_NOT_AVAILABLE' });
      expect(f.fetchImpl).not.toHaveBeenCalled();
    }
  });
  it('rejects pending, orphan and mutated artifacts', async () => {
    for (const result of [{ ...reference, status: 'running', artifacts: [] }, { ...reference, status: 'completed', artifacts: [] },
      { ...reference, status: 'completed', artifacts: [{ contentHash: reference.artifactHash, markdown: 'mutated' }] }]) {
      const f = fixture({ desktopWorkService: { read: async () => result } });
      await expect(f.service.review(auth, request())).rejects.toMatchObject({ status: 409 }); expect(f.fetchImpl).not.toHaveBeenCalled();
    }
  });
  it('permits general tasks without references but cannot evaluate without a server key', async () => {
    const general = fixture({ desktopWorkService: null });
    expect((await general.service.review(auth, request((value) => { value.researchReferences = []; }))).review.status).toBe('passed');
    const missing = fixture({ apiKey: undefined });
    expect((await missing.service.review(auth, request())).review).toMatchObject({ status: 'not_evaluated', reason: 'not_configured', model: null });
    expect(missing.fetchImpl).not.toHaveBeenCalled();
  });
  it('forces failed test evidence to fail regardless of Jev', async () => {
    const f = fixture();
    for (const change of [(value) => { value.evidence.tests.status = 'failed'; }, (value) => { value.evidence.tests.exitCode = 2; }])
      expect((await f.service.review(auth, request(change))).review).toMatchObject({ status: 'failed', reason: 'tests_failed', model: null });
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });
  it('does not evaluate absent criteria, changes or executed complete test evidence', async () => {
    const f = fixture();
    for (const change of [(value) => { value.acceptanceCriteria = []; }, (value) => { value.evidence.diff.status = 'unavailable'; },
      (value) => { value.evidence.diff.after = value.evidence.diff.before; }, (value) => { value.evidence.tests.status = 'not_run'; },
      (value) => { value.evidence.tests.truncated = true; }, (value) => { value.evidence.tests.command = []; }, (value) => { value.evidence.tests.output = ''; }])
      expect((await f.service.review(auth, request(change))).review.status).toBe('not_evaluated');
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });
  it('fails closed when changed-file attribution is unavailable, empty or includes ignored files', async () => {
    const f = fixture();
    for (const [change, reason] of [
      [(value) => { value.evidence.changedFilesStatus = 'unavailable'; value.evidence.changedFiles = []; }, 'missing_changed_file_evidence'],
      [(value) => { value.evidence.changedFiles = []; }, 'missing_changed_file_evidence'],
      [(value) => { value.evidence.relevantIgnoredFilesChanged = true; }, 'ignored_files_changed'],
    ]) {
      expect((await f.service.review(auth, request(change))).review).toMatchObject({ status: 'not_evaluated', reason });
    }
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });
  it('accepts the exact legacy evidence shape but fails closed without calling the provider', async () => {
    const f = fixture();
    const command = legacyRequest();
    const receipt = await f.service.review(auth, command);
    expect(receipt).toMatchObject({ taskId: command.taskId, inputHash: command.inputHash,
      evidenceHash: sha256Hex(JSON.stringify(command.evidence)),
      review: { status: 'not_evaluated', reason: 'missing_changed_file_evidence', advisory: true, model: null } });
    expect(f.desktopWorkService.read).not.toHaveBeenCalled();
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });
  it('strictly rejects malformed or inconsistent changed-file evidence', async () => {
    const f = fixture();
    for (const change of [
      (value) => { value.evidence.changedFiles[0].path = '../secret'; },
      (value) => { value.evidence.changedFiles[0].change = 'renamed'; },
      (value) => { value.evidence.changedFiles.push({ ...value.evidence.changedFiles[0] }); },
      (value) => { value.evidence.changedFilesStatus = 'unavailable'; },
    ]) {
      await expect(f.service.review(auth, request(change))).rejects.toMatchObject({ name: 'ZodError' });
    }
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });
  it('rejects ambiguous payloads mixing legacy evidence with current-only fields', async () => {
    const f = fixture();
    for (const change of [
      (value) => { value.evidence.changedFilesStatus = 'captured'; },
      (value) => { value.evidence.changedFiles = [{ path: 'src/retry.js', change: 'edited' }]; },
      (value) => { value.evidence.relevantIgnoredFilesChanged = false; },
    ]) {
      await expect(f.service.review(auth, legacyRequest(change))).rejects.toMatchObject({ name: 'ZodError' });
    }
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });
  it('rejects combined oversized evidence and caller credentials without truncation', async () => {
    const f = fixture();
    await expect(f.service.review(auth, request((value) => { value.evidence.diff.before = 'a'.repeat(30000); value.evidence.diff.after = 'b'.repeat(30000); }))).rejects.toMatchObject({ status: 413 });
    await expect(f.service.review(auth, { ...request(), apiKey: 'caller-key' })).rejects.toMatchObject({ name: 'ZodError' });
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });
  it('cannot pass missing, malformed, out-of-range or oversized provider responses', async () => {
    const responses = [{}, { ...answer(), model: undefined }, answer(NaN, 0.9), answer(1.1, 0.9), answer('0.9', 0.9), answer(0.9, null),
      { ...answer(), answers: { quality_verified: { noul: 0.9 }, ready_for_review: { type: 'noul', noul: 0.9 } } }, { ...answer(), padding: 'x'.repeat(20000) }];
    for (const body of responses) {
      const f = fixture({ fetchImpl: async () => jsonResponse(body) });
      expect((await f.service.review(auth, request())).review).toMatchObject({ status: 'not_evaluated', reason: 'invalid_provider_response' });
    }
    const f = fixture({ fetchImpl: async () => jsonResponse({ error: 'private detail' }, 503) });
    const receipt = await f.service.review(auth, request());
    expect(receipt.review.status).toBe('not_evaluated'); expect(JSON.stringify(receipt)).not.toContain('private detail');
  });
  it('bounds lookup, fetch and response-body stalls with one deadline', async () => {
    for (const override of [{ desktopWorkService: { read: () => new Promise(() => {}) } }, { fetchImpl: () => new Promise(() => {}) },
      { fetchImpl: async () => new Response(new ReadableStream({ start() {} }), { headers: { 'Content-Type': 'application/json' } }) }]) {
      const f = fixture({ timeoutMs: 15, ...override });
      expect((await f.service.review(auth, request())).review).toMatchObject({ status: 'not_evaluated', reason: 'review_timeout' });
    }
  });
});

describe('desktop engineering review route', () => {
  it('authenticates before parsing, binds account identity and reuses tenant/rate checks', async () => {
    const f = await routeFixture();
    expect((await f.call('{bad json', { Authorization: '' })).status).toBe(401);
    expect((await f.call(request(), { 'X-Orqaly-Account-Hash': 'a'.repeat(64) })).status).toBe(403);
    expect(f.commandService.session).not.toHaveBeenCalled(); expect(f.fetchImpl).not.toHaveBeenCalled();
    const unbound = await routeFixture({ commandService: { session: async () => ({ userId: auth.userId, tenantBound: false }) } });
    expect((await unbound.call()).status).toBe(403);
    const limited = await routeFixture({ rateLimiter: (_req, res) => res.status(429).end() });
    expect((await limited.call()).status).toBe(429); expect(limited.commandService.session).not.toHaveBeenCalled();
  });
  it('accepts real OMP client receipt validation end to end through the authenticated router', async () => {
    const f = await routeFixture();
    const command = request();
    const receipt = await evaluateWithJev({ config: { apiBaseUrl: f.base, conversationId: command.conversationId, accountHash: sha256Hex(auth.userId) },
      request: command, tokenProvider: async () => 'desktop-fixture-token' });
    expect(receipt).toMatchObject({ taskId: command.taskId, inputHash: command.inputHash, evidenceHash: sha256Hex(JSON.stringify(command.evidence)), review: { status: 'passed', model: 'jev-1.13.0', advisory: true } });
    expect(f.desktopWorkService.read).toHaveBeenCalledOnce(); expect(f.fetchImpl).toHaveBeenCalledOnce();
  });
  it('returns a fail-closed receipt for legacy evidence and rejects mixed legacy/current payloads', async () => {
    const f = await routeFixture();
    const legacy = legacyRequest();
    const response = await f.call(legacy);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ taskId: legacy.taskId,
      review: { status: 'not_evaluated', reason: 'missing_changed_file_evidence', advisory: true, model: null } });
    expect(f.desktopWorkService.read).not.toHaveBeenCalled();
    expect(f.fetchImpl).not.toHaveBeenCalled();
    expect((await f.call(legacyRequest((value) => { value.evidence.changedFilesStatus = 'captured'; }))).status).toBe(400);
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });
  it('returns no-store receipts and rejects malformed or oversized JSON', async () => {
    const f = await routeFixture(); const response = await f.call();
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store');
    expect((await f.call('{bad json')).status).toBe(400);
    const large = await f.call(JSON.stringify({ task: 'x'.repeat(ENGINEERING_REVIEW_MAX_BYTES + 1) }));
    expect(large.status).toBe(413); expect(await large.json()).toMatchObject({ error: { code: 'ENGINEERING_REVIEW_TOO_LARGE' } });
  });
});
