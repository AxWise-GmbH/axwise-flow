// Invoked by the disposable PostgreSQL + pinned n8n acceptance harness.
// Human authentication is a fixture; machine calls use real issued keys and HTTP,
// no cookies or Clerk session. Execution is real n8n, not a mock or evaluator.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export async function verifySolutionApplicationAccess({
  app,
  service,
  revisions,
  repository,
  auth,
  tenantId,
  solutionId,
  humanHeader,
  authMiddlewareCalls,
}) {
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const management = `/v2/solutions/${solutionId}/app-keys`;
  const endpoint = `/invoke/v1/solutions/${solutionId}`;
  const call = async (path, { method = 'GET', token, body, human = false, headers = {} } = {}) => {
    const response = await fetch(`${origin}${path}`, {
      method,
      redirect: 'error',
      signal: AbortSignal.timeout(120_000),
      headers: {
        ...(human ? humanHeader : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await response.json();
    // Failures must not echo credentials, even when the test later expects failure.
    if (token) assert.equal(JSON.stringify(json).includes(token), false, 'token echo');
    return { status: response.status, body: json, headers: response.headers };
  };
  const count = async () =>
    repository.solutionTransaction(tenantId, async (client) =>
      Number(
        (
          await client.query(
            'SELECT count(*) FROM orqaly.solution_invocations WHERE tenant_id=$1 AND solution_id=$2',
            [tenantId, solutionId]
          )
        ).rows[0].count
      )
    );
  const decide = async (action) => {
    const { solution } = await service.read(auth, solutionId);
    return service.decide(
      auth,
      solutionId,
      { action, workflowHash: solution.workflowHash, environmentId: solution.environment.id },
      solution.rowVersion
    );
  };
  const issue = async (label, creationKey = randomUUID()) => {
    const { solution } = await service.read(auth, solutionId);
    return call(management, {
      method: 'POST',
      human: true,
      body: { label, expiresInDays: 30, workflowHash: solution.workflowHash },
      headers: { 'if-match': `"${solution.rowVersion}"`, 'idempotency-key': creationKey },
    });
  };
  try {
    await decide('activate');
    const first = await issue('Acceptance caller A');
    assert.equal(first.status, 201, 'issue first key');
    assert.equal(typeof first.body.token, 'string');
    const second = await issue('Acceptance caller B');
    assert.equal(second.status, 201, 'issue second key');
    const token = first.body.token;
    const secondToken = second.body.token;
    const listed = await call(management, { human: true });
    assert.equal(listed.status, 200);
    assert.equal(JSON.stringify(listed.body).includes(token), false, 'list exposes first token');
    assert.equal(
      JSON.stringify(listed.body).includes(secondToken),
      false,
      'list exposes second token'
    );
    assert.equal(listed.headers.get('cache-control'), 'no-store');

    const before = await count();
    const input = { name: ' Carol ', email: 'CAROL@EXAMPLE.COM', count: 11 };
    const requestKey = randomUUID();
    const request = {
      method: 'POST',
      token,
      body: { input },
      headers: { 'idempotency-key': requestKey },
    };
    const beforeAuth = authMiddlewareCalls();
    assert.equal((await call(endpoint, { ...request, token: undefined })).status, 401);
    assert.equal((await call(endpoint, { ...request, token: `${token}invalid` })).status, 401);
    assert.equal(
      (
        await call(endpoint, {
          ...request,
          headers: { ...request.headers, origin: 'https://attacker.invalid' },
        })
      ).status,
      403,
      'machine keys are not browser credentials'
    );
    assert.equal(authMiddlewareCalls(), beforeAuth, 'machine route must not call Clerk middleware');
    assert.equal(await count(), before, 'invalid requests must not dispatch');
    assert.equal((await call(management, { token })).status, 401, 'app key cannot manage keys');

    const result = await call(endpoint, request);
    assert.equal(result.status, 200, 'machine HTTP invocation');
    assert.equal(result.body.invocation.status, 'succeeded', 'actual n8n success');
    assert.deepEqual(result.body.invocation.output, {
      customer: ' CAROL ',
      email: 'carol@example.com',
      count: 11,
    });
    assert.match(result.body.invocation.executionId, /^[1-9][0-9]*$/);
    assert.equal(await count(), before + 1);
    const replay = await call(endpoint, request);
    assert.equal(replay.status, 200);
    assert.equal(replay.body.replayed, true);
    assert.equal(replay.body.invocation.id, result.body.invocation.id);
    assert.equal(await count(), before + 1, 'replay must not invoke n8n again');
    assert.equal(
      (await call(endpoint, { ...request, body: { input: { ...input, count: 12 } } })).status,
      409,
      'changed input conflicts with earlier idempotency key'
    );
    const receiptPath = `${endpoint}/invocations/${result.body.invocation.id}`;
    assert.equal((await call(receiptPath, { token })).status, 200);
    assert.equal(
      (await call(receiptPath, { token: secondToken })).status,
      404,
      'receipt is app-key scoped'
    );
    const otherNamespace = await call(endpoint, { ...request, token: secondToken });
    assert.equal(otherNamespace.status, 200);
    assert.equal(otherNamespace.body.replayed, false);
    assert.notEqual(otherNamespace.body.invocation.id, result.body.invocation.id);
    assert.notEqual(otherNamespace.body.invocation.executionId, result.body.invocation.executionId);
    assert.equal(await count(), before + 2);

    await decide('pause');
    const paused = await call(endpoint, {
      ...request,
      token: secondToken,
      headers: { 'idempotency-key': randomUUID() },
    });
    assert.equal(paused.status, 409);
    assert.equal(paused.body.error.code, 'SOLUTION_NOT_ACTIVE');
    assert.equal(await count(), before + 2, 'pause must not create a new invocation');
    await decide('activate');

    const revoke = await call(`${management}/${first.body.key.id}/revoke`, {
      method: 'POST',
      human: true,
      body: {},
      headers: { 'if-match': `"${first.body.key.rowVersion}"` },
    });
    assert.equal(revoke.status, 200);
    assert.equal((await call(endpoint, request)).status, 401, 'revocation denies replays too');
    assert.equal(
      (await call(receiptPath, { token })).status,
      401,
      'revocation denies receipt access'
    );
    assert.equal(await count(), before + 2);

    // Publish a real new release; the old application's grant must not silently
    // broaden to different approved behavior. The old grant is never auto-rotated.
    const { solution } = await service.read(auth, solutionId);
    const draft = await revisions.createDraft(auth, solutionId, {
      expectedVersion: solution.rowVersion,
    });
    const workflow = structuredClone(draft.revision.workflow);
    const transform = workflow.nodes.find((node) => node.id === 'transform');
    transform.parameters.jsonOutput = transform.parameters.jsonOutput.replace(
      '.toUpperCase()',
      '.trim()'
    );
    const saved = await revisions.saveDraft(auth, solutionId, draft.revision.id, {
      expectedVersion: draft.revision.rowVersion,
      workflow,
    });
    const reviewed = await revisions.review(auth, solutionId, draft.revision.id, {
      expectedVersion: saved.revision.rowVersion,
    });
    assert.equal(reviewed.revision.review.valid, true);
    const revise = (revision, action) =>
      revisions.decide(auth, solutionId, revision.id, {
        action,
        workflowHash: revision.workflowHash,
        expectedVersion: revision.rowVersion,
      });
    const approved = await revise(reviewed.revision, 'approve');
    const deployed = await revise(approved.revision, 'deploy');
    assert.equal(deployed.revision.status, 'ready');
    const tested = await revisions.invoke(
      auth,
      solutionId,
      deployed.revision.id,
      { input },
      randomUUID()
    );
    assert.equal(tested.invocation.status, 'succeeded');
    assert.deepEqual(tested.invocation.output, {
      customer: 'Carol',
      email: 'carol@example.com',
      count: 11,
    });
    const ready = (await revisions.read(auth, solutionId)).revisions.find(
      (item) => item.id === deployed.revision.id
    );
    await revise(ready, 'activate');
    const changedRelease = await call(endpoint, {
      ...request,
      token: secondToken,
      headers: { 'idempotency-key': randomUUID() },
    });
    assert.equal(changedRelease.status, 409, 'old grant cannot invoke a new release');
    assert.equal(await count(), before + 3, 'only the authorized new-release test added a row');
    const persisted = await service.read(auth, solutionId);
    assert.ok(persisted.invocations.some((item) => item.id === result.body.invocation.id));
    return {
      verified: true,
      executionIds: [
        result.body.invocation.executionId,
        otherNamespace.body.invocation.executionId,
        tested.invocation.executionId,
      ],
      checks: [
        'machine HTTP without human session',
        'real n8n output',
        'per-key idempotency and receipt isolation',
        'pause',
        'revocation',
        'exact-release grants',
        'durable history',
      ],
      limitation:
        'Local-only controlled fixtures for human identity; no live preview deployment or external provider action',
    };
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
}
