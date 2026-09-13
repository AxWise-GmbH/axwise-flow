import { EventEmitter } from 'node:events';
import express from 'express';
import httpMocks from 'node-mocks-http';
import { describe, expect, it, vi } from 'vitest';
import { createNativeN8nGateway } from './native-n8n-gateway.js';
import { createNativeN8nUpstream } from './native-editor-upstream.js';
import { SolutionError } from './solution-service.js';
import { nativeOwnedErrorFixture } from './fixtures/native-owned-error.js';

const solutionId = '2031decc-b21e-48b5-9bd5-3ed3d4dfd024';
const revisionId = '4031decc-b21e-48b5-9bd5-3ed3d4dfd024';
const origin = 'https://api.example.test';
const parentOrigin = 'https://orqaly.example.test';
const identity = { userId: 'user_test123' };
const workflow = {
  name: 'Contact transform',
  nodes: [],
  connections: {},
  settings: { executionOrder: 'v1' },
};

function invoke(app, { method = 'GET', url, body, headers = {} }) {
  return new Promise((resolve, reject) => {
    const req = httpMocks.createRequest({ method, url, body, headers });
    // Express changes req.url while entering mounted routers. node-mocks-http
    // supplies a static path, unlike Express's getter, so model that getter.
    Object.defineProperty(req, 'path', { get: () => new URL(req.url, origin).pathname });
    const res = httpMocks.createResponse({ eventEmitter: EventEmitter });
    res.on('end', () => resolve(res));
    app.handle(req, res, reject);
  });
}

function openStream(app, { url, headers }) {
  return new Promise((resolve, reject) => {
    const req = httpMocks.createRequest({ method: 'GET', url, headers });
    Object.defineProperty(req, 'path', { get: () => new URL(req.url, origin).pathname });
    const res = httpMocks.createResponse({ eventEmitter: EventEmitter });
    res.flushHeaders = () => {};
    const write = res.write.bind(res);
    res.write = (...args) => {
      const result = write(...args);
      resolve(res);
      return result;
    };
    res.on('end', () => res.emit('finish'));
    app.handle(req, res, reject);
  });
}

function fixture() {
  let time = Date.now();
  const solution = {
    id: solutionId,
    name: 'Contact transform',
    workflow,
    workflowHash: 'a'.repeat(64),
    rowVersion: 1,
    environment: { id: 'customer-environment' },
  };
  const revision = { id: revisionId, status: 'draft', workflow, version: 2, rowVersion: 3 };
  const solutionService = {
    authoringEnvironment: vi.fn(async (auth) =>
      auth.userId === identity.userId ? { id: 'customer-environment' } : null
    ),
    read: vi.fn(async (auth, id) => {
      if (auth.userId !== identity.userId || id !== solutionId)
        throw new SolutionError('SOLUTION_NOT_FOUND', 'Not found', 404);
      return { solution };
    }),
  };
  const revisionService = {
    read: vi.fn(async () => ({ revisions: [revision] })),
    saveDraft: vi.fn(async (_auth, _solution, _revision, body) => ({
      revision: { ...revision, workflow: body.workflow, rowVersion: 4 },
    })),
  };
  const buildRequest = {
    id: revisionId,
    name: 'New task draft',
    workflow,
    workflowHash: 'b'.repeat(64),
    rowVersion: 2,
    status: 'needs_input',
  };
  const buildService = {
    nativeSelection: vi.fn(async (auth, id) => {
      if (auth.userId !== identity.userId || id !== revisionId)
        throw new SolutionError('BUILD_NOT_FOUND', 'Not found', 404);
      return { buildRequest };
    }),
    saveDraft: vi.fn(async (_auth, _id, body) => ({
      buildRequest: { ...buildRequest, workflow: body.workflow, rowVersion: 3 },
    })),
  };
  const upstream = {
    read: vi.fn(async (path) => ({
      status: 200,
      headers: new Headers({
        'content-type': path.startsWith('/workflow/') ? 'text/html' : 'application/json',
      }),
      body: Buffer.from(
        path.startsWith('/workflow/')
          ? '<script src="/assets/native.js"></script>'
          : JSON.stringify({
              data: { id: 'native-project', name: 'Customer project', type: 'personal' },
            })
      ),
    })),
  };
  const gateway = createNativeN8nGateway({
    solutionService,
    revisionService,
    buildService,
    bindings: [{ environmentId: solution.environment.id, upstream }],
    signingKey: 'test-only-signing-key-of-at-least-32-bytes',
    origin,
    browserOrigins: [parentOrigin],
    now: () => time,
  });
  const app = express();
  app.use('/native-n8n', gateway.router);
  async function launch(mode = 'edit', selectedRevision = revisionId, memberId) {
    const issued = await gateway.issue(identity, solutionId, {
      mode,
      revisionId: selectedRevision,
      ...(memberId ? { dependencyId: memberId } : {}),
    });
    const response = await invoke(app, {
      method: 'POST',
      url: '/native-n8n/launch',
      body: { token: issued.token },
      headers: { origin: parentOrigin },
    });
    const cookie = response.getHeader('Set-Cookie').split(';')[0];
    const prefix = response.getHeader('Set-Cookie').match(/; Path=([^;]+)/)[1];
    return { issued, response, cookie, prefix };
  }
  return {
    gateway,
    app,
    solution,
    revision,
    upstream,
    solutionService,
    revisionService,
    buildService,
    buildRequest,
    launch,
    advance: (delta) => {
      time += delta;
    },
  };
}

describe('native n8n customer gateway', () => {
  it('shows only the exact owned child and refuses child writes or another workflow path', async () => {
    const f = fixture();
    Object.assign(f.revision, nativeOwnedErrorFixture(revisionId));
    const session = await f.launch('view', revisionId, 'failure-handler');
    const response = await invoke(f.app, {
      url: `${session.prefix}rest/workflows/${revisionId}`,
      headers: { cookie: session.cookie },
    });
    expect(response.statusCode).toBe(200);
    const selected = response._getJSONData().data;
    expect(selected.nodes).toEqual(f.revision.spec.ownedDependencies[0].workflow.nodes);
    expect(selected.scopes).toEqual(['workflow:read']);
    expect(selected.name).toContain('failure-handler');
    for (const [method, path] of [
      ['PATCH', `rest/workflows/${revisionId}`],
      ['GET', `rest/workflows/${solutionId}`],
      ['POST', 'rest/workflows/run'],
    ]) {
      const denied = await invoke(f.app, {
        method,
        url: session.prefix + path,
        body: {},
        headers: { cookie: session.cookie, origin },
      });
      expect(denied.statusCode).toBe(403);
    }
    expect(f.revisionService.saveDraft).not.toHaveBeenCalled();
    expect(f.upstream.read.mock.calls.every(([path]) => path === '/rest/projects/personal')).toBe(
      true
    );
    const settings = await invoke(f.app, {
      url: `${session.prefix}rest/settings`,
      headers: { cookie: session.cookie },
    });
    expect(settings._getJSONData().data.workflowsAutosaveDisabled).toBe(true);
    await expect(f.launch('edit', revisionId, 'failure-handler')).rejects.toMatchObject({
      status: 403,
    });
    await expect(f.launch('view', revisionId, 'foreign-handler')).rejects.toMatchObject({
      status: 404,
    });
  });
  it('invalidates a child viewer after either member changes, without broadening credential metadata', async () => {
    const f = fixture();
    Object.assign(f.solution, nativeOwnedErrorFixture(solutionId));
    const session = await f.launch('view', null, 'failure-handler');
    f.solution.spec.ownedDependencies[0].workflow.nodes[1].parameters.jsonOutput =
      '={{ { "changed": true } }}';
    const response = await invoke(f.app, {
      url: `${session.prefix}rest/credentials`,
      headers: { cookie: session.cookie },
    });
    expect(response.statusCode).toBe(409);
    expect(f.upstream.read).not.toHaveBeenCalled();
  });
  it('selects an owned child in build authoring but does not grant a child editing capability', async () => {
    const f = fixture();
    Object.assign(f.buildRequest, nativeOwnedErrorFixture(revisionId));
    const issued = await f.gateway.issueBuild(identity, revisionId, {
      mode: 'view',
      dependencyId: 'failure-handler',
    });
    const launched = await invoke(f.app, {
      method: 'POST',
      url: '/native-n8n/launch',
      body: { token: issued.token },
      headers: { origin: parentOrigin },
    });
    expect(launched.statusCode).toBe(303);
    const cookie = launched.getHeader('Set-Cookie').split(';')[0];
    const prefix = launched.getHeader('Set-Cookie').match(/; Path=([^;]+)/)[1];
    const settings = await invoke(f.app, {
      url: `${prefix}rest/settings`,
      headers: { cookie },
    });
    expect(settings._getJSONData().data.workflowsAutosaveDisabled).toBe(true);
    await expect(
      f.gateway.issueBuild(identity, revisionId, { mode: 'edit', dependencyId: 'failure-handler' })
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      f.gateway.issueBuild({ userId: 'user_other' }, revisionId, {
        mode: 'view',
        dependencyId: 'failure-handler',
      })
    ).rejects.toMatchObject({ status: 404 });
  });
  it('keeps a frozen undeployed Solution visible without reserving a deployment environment', async () => {
    const f = fixture();
    f.solution.status = 'draft';
    f.solution.environment = null;
    const session = await f.launch('view', null);
    const response = await invoke(f.app, {
      url: `${session.prefix}workflow/${solutionId}`,
      headers: { cookie: session.cookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response._getData()).toContain(`${session.prefix}assets/native.js`);
    expect(f.solutionService.authoringEnvironment).toHaveBeenCalledWith(identity);
    expect(f.solution.environment).toBeNull();
    expect(f.revisionService.saveDraft).not.toHaveBeenCalled();
    const rejected = await invoke(f.app, {
      method: 'POST',
      url: `${session.prefix}rest/workflows/${solutionId}/run`,
      body: {},
      headers: { cookie: session.cookie, origin },
    });
    expect(rejected.statusCode).toBe(403);
  });

  it.each([
    ['draft', 'edit', null],
    ['draft', 'view', revisionId],
    ['active', 'view', null],
  ])(
    'does not use authoring assets to bypass missing execution bindings: %s/%s/%s',
    async (status, mode, revision) => {
      const f = fixture();
      f.solution.status = status;
      f.solution.environment = null;
      await expect(
        f.gateway.issue(identity, solutionId, { mode, revisionId: revision })
      ).rejects.toThrow('not connected');
      expect(f.solutionService.authoringEnvironment).not.toHaveBeenCalled();
    }
  );

  it('rechecks owner-scoped frontend access for an unassigned Solution on every request', async () => {
    const f = fixture();
    f.solution.status = 'draft';
    f.solution.environment = null;
    const session = await f.launch('view', null);
    f.solutionService.authoringEnvironment.mockResolvedValue(null);
    const response = await invoke(f.app, {
      url: `${session.prefix}rest/orqaly/workflow`,
      headers: { cookie: session.cookie },
    });
    expect(response.statusCode).toBe(403);
    expect(f.upstream.read).not.toHaveBeenCalled();
  });

  async function launchBuild(f, mode = 'edit') {
    const issued = await f.gateway.issueBuild(identity, revisionId, { mode });
    const response = await invoke(f.app, {
      method: 'POST',
      url: '/native-n8n/launch',
      body: { token: issued.token },
      headers: { origin: parentOrigin },
    });
    const cookie = response.getHeader('Set-Cookie').split(';')[0];
    const prefix = response.getHeader('Set-Cookie').match(/; Path=([^;]+)/)[1];
    expect(response.statusCode).toBe(303);
    expect(response._getRedirectUrl()).toBe(`${prefix}workflow/${revisionId}`);
    return { cookie, prefix };
  }

  it('opens an owner-scoped pre-deployment native draft without reading a Solution or upstream workflow', async () => {
    const f = fixture();
    const { cookie, prefix } = await launchBuild(f, 'view');
    const response = await invoke(f.app, {
      url: `${prefix}rest/workflows/${revisionId}`,
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response._getJSONData().data).toMatchObject({
      name: 'New task draft',
      versionId: '2',
      scopes: ['workflow:read'],
      active: false,
    });
    expect(f.solutionService.read).not.toHaveBeenCalled();
    expect(f.revisionService.read).not.toHaveBeenCalled();
    expect(f.upstream.read.mock.calls.every(([path]) => path === '/rest/projects/personal')).toBe(
      true
    );
  });

  it('launches the pre-deployment native HTML through genuine upstream authentication and scoped assets', async () => {
    const f = fixture();
    const fetchImpl = vi.fn(async (url, request) => {
      if (url === 'https://n8n.example.test/rest/login' && request.method === 'POST')
        return new Response('{}', {
          headers: { 'set-cookie': 'n8n-auth=server-only-test-cookie; Max-Age=300; HttpOnly' },
        });
      if (url === `https://n8n.example.test/workflow/${revisionId}`)
        return new Response(
          '<html><head><link href="/assets/native.css"></head><body><script src="/assets/native.js"></script></body></html>',
          { headers: { 'content-type': 'text/html' } }
        );
      if (url === 'https://n8n.example.test/assets/native.js')
        return new Response('window.nativeEditor = true;', {
          headers: { 'content-type': 'application/javascript' },
        });
      throw new Error('unexpected upstream request');
    });
    const upstream = createNativeN8nUpstream({
      origin: 'https://n8n.example.test',
      email: 'operator@example.test',
      password: 'test-only-password',
      fetchImpl,
    });
    f.upstream.read.mockImplementation(upstream.read);
    const { cookie, prefix } = await launchBuild(f);
    const page = await invoke(f.app, {
      url: `${prefix}workflow/${revisionId}`,
      headers: { cookie, 'sec-fetch-dest': 'iframe' },
    });
    expect(page.statusCode).toBe(200);
    expect(page._getData()).toContain(`src="${prefix}assets/native.js"`);
    expect(page._getData()).toContain(`href="${prefix}assets/native.css"`);
    expect(page._getData()).toContain('Draft edits save to Orqaly.');
    expect(page._getData()).not.toContain('server-only-test-cookie');
    const asset = await invoke(f.app, {
      url: `${prefix}assets/native.js`,
      headers: { cookie },
    });
    expect(asset.statusCode).toBe(200);
    expect(asset._getData().toString()).toBe('window.nativeEditor = true;');
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      'https://n8n.example.test/rest/login',
      `https://n8n.example.test/workflow/${revisionId}`,
      'https://n8n.example.test/assets/native.js',
    ]);
    expect(f.solutionService.read).not.toHaveBeenCalled();
    expect(f.revisionService.read).not.toHaveBeenCalled();
    expect(f.buildService.saveDraft).not.toHaveBeenCalled();
  });

  it('saves pre-deployment edits to the exact build version and hash, never to the deployed Solution', async () => {
    const f = fixture();
    const { cookie, prefix } = await launchBuild(f);
    const read = await invoke(f.app, {
      url: `${prefix}rest/workflows/${revisionId}`,
      headers: { cookie },
    });
    const response = await invoke(f.app, {
      method: 'PATCH',
      url: `${prefix}rest/workflows/${revisionId}`,
      headers: { cookie, origin },
      body: { versionId: '2', expectedChecksum: read._getJSONData().data.checksum, nodes: [] },
    });
    expect(response.statusCode).toBe(200);
    expect(f.buildService.saveDraft).toHaveBeenCalledWith(identity, revisionId, {
      workflow,
      expectedVersion: 2,
      workflowHash: 'b'.repeat(64),
    });
    expect(response._getJSONData().data.versionId).toBe('3');
    expect(f.revisionService.saveDraft).not.toHaveBeenCalled();
  });

  it('denies build owner mismatch, arbitrary environment selection, missing graphs and frozen edits', async () => {
    const f = fixture();
    await expect(
      f.gateway.issueBuild({ userId: 'user_another' }, revisionId, { mode: 'edit' })
    ).rejects.toThrow('Not found');
    await expect(
      f.gateway.issueBuild(identity, revisionId, { mode: 'edit', environmentId: 'other' })
    ).rejects.toThrow();
    f.solutionService.authoringEnvironment.mockResolvedValue(null);
    await expect(f.gateway.issueBuild(identity, revisionId, { mode: 'view' })).rejects.toThrow(
      'not connected'
    );
    f.solutionService.authoringEnvironment.mockResolvedValue({ id: 'customer-environment' });
    f.buildRequest.workflow = null;
    await expect(f.gateway.issueBuild(identity, revisionId, { mode: 'view' })).rejects.toThrow(
      'not available'
    );
    f.buildRequest.workflow = workflow;
    const { cookie, prefix } = await launchBuild(f);
    f.buildRequest.status = 'completed';
    const frozen = await invoke(f.app, {
      url: `${prefix}rest/workflows/${revisionId}`,
      headers: { cookie },
    });
    expect(frozen.statusCode).toBe(409);
    expect(f.upstream.read).not.toHaveBeenCalled();
  });

  it('expires a build view after a resumed design changes its hash and denies execution/credential writes', async () => {
    const f = fixture();
    const { cookie, prefix } = await launchBuild(f, 'view');
    for (const path of [
      'rest/workflows/run',
      'rest/credentials',
      `rest/workflows/${revisionId}/activate`,
    ]) {
      const response = await invoke(f.app, {
        method: 'POST',
        url: `${prefix}${path}`,
        body: {},
        headers: { cookie, origin },
      });
      expect(response.statusCode).toBe(403);
    }
    f.buildRequest.workflowHash = 'c'.repeat(64);
    const changed = await invoke(f.app, {
      url: `${prefix}rest/workflows/${revisionId}`,
      headers: { cookie },
    });
    expect(changed.statusCode).toBe(409);
    expect(f.buildService.saveDraft).not.toHaveBeenCalled();
  });

  it('requires authenticated ownership to issue a session and refuses edit of deployed workflow', async () => {
    const f = fixture();
    await expect(
      f.gateway.issue(null, solutionId, { mode: 'view', revisionId: null })
    ).rejects.toThrow('Sign in');
    await expect(
      f.gateway.issue({ userId: 'user_another' }, solutionId, { mode: 'edit', revisionId })
    ).rejects.toThrow('Not found');
    await expect(
      f.gateway.issue(identity, solutionId, { mode: 'edit', revisionId: null })
    ).rejects.toThrow('Create a draft');
    expect(f.upstream.read).not.toHaveBeenCalled();
  });

  it('retains the pinned native Save/Saved control only for drafts without changing its state or permissions', async () => {
    const f = fixture();
    const edit = await f.launch();
    const view = await f.launch('view', null);
    for (const [asset, marker, replacement] of [
      ['MainHeader-DYwQEGwg.js', 'let ge=p(()=>!b.isAutosaveEnabled)', 'let ge=p(()=>!0)'],
      [
        'MainHeader-legacy-DoaOPRFy.js',
        'const pa=m((()=>!b.isAutosaveEnabled))',
        'const pa=m((()=>!0))',
      ],
    ]) {
      const source = `${marker};/* native bindings remain unchanged */ workflowPermissions.update;stateIsDirty;saveCurrentWorkflow;isAutosaveEnabled;`;
      f.upstream.read.mockResolvedValue({
        status: 200,
        headers: new Headers({ 'content-type': 'application/javascript' }),
        body: Buffer.from(source),
      });
      const editableResponse = await invoke(f.app, {
        url: `${edit.prefix}assets/${asset}`,
        headers: { cookie: edit.cookie },
      });
      expect(editableResponse.statusCode).toBe(200);
      expect(editableResponse._getData()).toBe(source.replace(marker, replacement));
      const readonlyResponse = await invoke(f.app, {
        url: `${view.prefix}assets/${asset}`,
        headers: { cookie: view.cookie },
      });
      expect(readonlyResponse.statusCode).toBe(200);
      expect(Buffer.from(readonlyResponse._getData()).toString()).toBe(source);
    }
    expect(f.revisionService.saveDraft).not.toHaveBeenCalled();
  });

  it('fails explicitly instead of guessing when the pinned native header changes', async () => {
    const f = fixture();
    const { cookie, prefix } = await f.launch();
    const marker = 'let ge=p(()=>!b.isAutosaveEnabled)';
    for (const [asset, source] of [
      ['MainHeader-unknown.js', marker],
      ['MainHeader-DYwQEGwg.js', 'changed native implementation'],
      ['MainHeader-DYwQEGwg.js', `${marker};${marker}`],
    ]) {
      f.upstream.read.mockResolvedValue({
        status: 200,
        headers: new Headers({ 'content-type': 'application/javascript' }),
        body: Buffer.from(source),
      });
      const response = await invoke(f.app, {
        url: `${prefix}assets/${asset}`,
        headers: { cookie },
      });
      expect(response.statusCode).toBe(502);
      expect(response._getData()).toContain('native editor build is not supported');
      expect(response._getData()).not.toContain(marker);
    }
    expect(f.revisionService.saveDraft).not.toHaveBeenCalled();
  });

  it('requires exact launch origin, valid signed short-lived token, and a private per-session cookie', async () => {
    const f = fixture();
    const issued = await f.gateway.issue(identity, solutionId, { mode: 'edit', revisionId });
    const wrongOrigin = await invoke(f.app, {
      method: 'POST',
      url: '/native-n8n/launch',
      body: { token: issued.token },
      headers: { origin: 'https://attacker.example' },
    });
    expect(wrongOrigin.statusCode).toBe(403);
    const forged = await invoke(f.app, {
      method: 'POST',
      url: '/native-n8n/launch',
      body: { token: `${issued.token.slice(0, -2)}xx` },
      headers: { origin: parentOrigin },
    });
    expect(forged.statusCode).toBe(401);
    const { response, prefix } = await f.launch();
    expect(response.statusCode).toBe(303);
    expect(response.getHeader('Set-Cookie')).toContain(`Path=${prefix}`);
    for (const attribute of ['HttpOnly', 'Secure', 'SameSite=None', 'Partitioned'])
      expect(response.getHeader('Set-Cookie')).toContain(attribute);
    expect(response.getHeader('Content-Security-Policy')).toContain(
      `frame-ancestors ${parentOrigin}`
    );
    f.advance(31000);
    const expired = await invoke(f.app, {
      method: 'POST',
      url: '/native-n8n/launch',
      body: { token: issued.token },
      headers: { origin: parentOrigin },
    });
    expect(expired.statusCode).toBe(401);
  });

  it('binds session to path, expiration, current scope and frozen revision state', async () => {
    const f = fixture();
    const first = await f.launch();
    const second = await f.launch();
    const mismatch = await invoke(f.app, {
      url: `${second.prefix}rest/settings`,
      headers: { cookie: first.cookie },
    });
    expect(mismatch.statusCode).toBe(403);
    f.revision.status = 'approved';
    const frozen = await invoke(f.app, {
      url: `${first.prefix}rest/settings`,
      headers: { cookie: first.cookie },
    });
    expect(frozen.statusCode).toBe(409);
    f.revision.status = 'draft';
    f.solution.environment.id = 'another-environment';
    const changedEnvironment = await invoke(f.app, {
      url: `${first.prefix}rest/settings`,
      headers: { cookie: first.cookie },
    });
    expect(changedEnvironment.statusCode).toBe(403);
    f.advance(601000);
    const expired = await invoke(f.app, {
      url: `${first.prefix}rest/settings`,
      headers: { cookie: first.cookie },
    });
    expect(expired.statusCode).toBe(401);
    expect(f.upstream.read).not.toHaveBeenCalled();
  });

  it('routes native saves only to durable Orqaly draft storage, with exact revision concurrency', async () => {
    const f = fixture();
    const { cookie, prefix } = await f.launch();
    const initial = await invoke(f.app, {
      url: `${prefix}rest/workflows/${revisionId}`,
      headers: { cookie },
    });
    const { versionId, checksum } = initial._getJSONData().data;
    const changed = [
      {
        id: 'node',
        name: 'Draft step',
        position: [10, 20],
        type: 'n8n-nodes-base.set',
        typeVersion: 3.4,
        parameters: {},
      },
    ];
    const response = await invoke(f.app, {
      method: 'PATCH',
      url: `${prefix}rest/workflows/${revisionId}`,
      headers: { cookie, origin },
      body: { versionId, expectedChecksum: checksum, nodes: changed },
    });
    expect(response.statusCode).toBe(200);
    expect(f.revisionService.saveDraft).toHaveBeenCalledWith(identity, solutionId, revisionId, {
      workflow: { ...workflow, nodes: changed },
      expectedVersion: 3,
    });
    expect(response._getJSONData().data.active).toBe(false);
    expect(response._getJSONData().data.versionId).toBe('4');
    expect(f.upstream.read.mock.calls.every(([path]) => path === '/rest/projects/personal')).toBe(
      true
    );
    const stale = await invoke(f.app, {
      method: 'PATCH',
      url: `${prefix}rest/workflows/${revisionId}`,
      headers: { cookie, origin },
      body: { versionId: '2', nodes: changed },
    });
    expect(stale.statusCode).toBe(409);
    expect(f.revisionService.saveDraft).toHaveBeenCalledTimes(1);
  });

  it('rejects execution, publish, credential and arbitrary workflow operations before upstream access', async () => {
    const f = fixture();
    const { cookie, prefix } = await f.launch();
    for (const [method, path] of [
      ['POST', `rest/workflows/${revisionId}/run`],
      ['POST', `rest/workflows/${revisionId}/activate`],
      ['POST', 'rest/credentials'],
      ['DELETE', `rest/workflows/${revisionId}`],
      ['GET', 'rest/workflows/another-customer'],
      ['POST', 'rest/login'],
      ['POST', 'rest/api-keys'],
    ]) {
      const response = await invoke(f.app, {
        method,
        url: `${prefix}${path}`,
        headers: { cookie, origin },
        body: {},
      });
      expect(response.statusCode).toBe(403);
    }
    expect(f.upstream.read).not.toHaveBeenCalled();
    expect(f.revisionService.saveDraft).not.toHaveBeenCalled();
  });

  it.each(['view', 'edit'])(
    'serves only selected-graph credential references to the native %s list',
    async (mode) => {
      const f = fixture();
      f.revision.workflow = {
        ...workflow,
        nodes: [
          {
            id: 'selected-node',
            credentials: {
              orqalyBoundedHttp: {
                id: 'selected-reference',
                name: 'Approved connection',
                data: { value: 'must-never-leave-selected-record' },
              },
            },
          },
        ],
      };
      f.solution.workflow = {
        ...workflow,
        nodes: [{ credentials: { githubApi: { id: 'other-reference', name: 'Other release' } } }],
      };
      const { cookie, prefix } = await f.launch(mode);
      for (const path of [
        'rest/credentials?includeScopes=true&includeData=true&includeGlobal=true',
        `rest/credentials/for-workflow?workflowId=${revisionId}`,
      ]) {
        const response = await invoke(f.app, { url: `${prefix}${path}`, headers: { cookie } });
        expect(response.statusCode).toBe(200);
        expect(response._getJSONData()).toEqual({
          data: [
            {
              id: 'selected-reference',
              name: 'Approved connection',
              type: 'orqalyBoundedHttp',
              isManaged: true,
              scopes: ['credential:read'],
            },
          ],
        });
        expect(response._getData()).not.toContain('must-never');
        expect(response._getData()).not.toContain('other-reference');
      }
      expect(f.upstream.read).not.toHaveBeenCalled();
      expect(f.revisionService.saveDraft).not.toHaveBeenCalled();
    }
  );

  it('rejects credential scope expansion, malformed queries and mutations without upstream inventory access', async () => {
    const f = fixture();
    const { cookie, prefix } = await f.launch('view');
    for (const query of [
      'workflowId=another-workflow',
      'projectId=another-project',
      `filter=${encodeURIComponent(JSON.stringify({ projectId: 'another-project' }))}`,
      `filter=${encodeURIComponent(JSON.stringify({ id: 'another-credential' }))}`,
      'filter=not-json',
      'includeData=true&includeData=false',
      'includeData=all',
      'externalSecretsStore=private-store',
      'onlySharedWithMe=true',
    ]) {
      const response = await invoke(f.app, {
        url: `${prefix}rest/credentials?${query}`,
        headers: { cookie },
      });
      expect(response.statusCode, query).toBe(403);
    }
    for (const [method, path] of [
      ['GET', 'rest/credentials/private-id'],
      ['POST', 'rest/credentials'],
      ['POST', 'rest/credentials/test'],
      ['DELETE', 'rest/credentials/private-id'],
    ]) {
      const response = await invoke(f.app, {
        method,
        url: `${prefix}${path}`,
        headers: { cookie, origin },
        body: {},
      });
      expect(response.statusCode).toBe(403);
    }
    expect(f.upstream.read.mock.calls.every(([path]) => path === '/rest/projects/personal')).toBe(
      true
    );
    const crossOrigin = await invoke(f.app, {
      url: `${prefix}rest/credentials`,
      headers: { cookie, origin: parentOrigin },
    });
    expect(crossOrigin.statusCode).toBe(403);
    f.advance(600001);
    const expired = await invoke(f.app, { url: `${prefix}rest/credentials`, headers: { cookie } });
    expect(expired.statusCode).toBe(401);
  });

  it('narrows unsupported metadata features instead of pretending upstream inventories are empty', async () => {
    const f = fixture();
    const { cookie, prefix } = await f.launch('view');
    const nativeSettings = {
      activeModules: ['data-table', 'external-secrets'],
      enterprise: { variables: true, sharing: false },
      workflowsAutosaveDisabled: false,
    };
    f.upstream.read.mockResolvedValueOnce({
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      body: Buffer.from(JSON.stringify({ data: nativeSettings })),
    });
    const settings = await invoke(f.app, { url: `${prefix}rest/settings`, headers: { cookie } });
    expect(settings.statusCode).toBe(200);
    expect(settings._getJSONData().data).toMatchObject({
      activeModules: ['external-secrets'],
      enterprise: { variables: false, sharing: false },
      workflowsAutosaveDisabled: true,
    });
    expect(nativeSettings.activeModules).toContain('data-table');
    expect(nativeSettings.enterprise.variables).toBe(true);
    expect(nativeSettings.workflowsAutosaveDisabled).toBe(false);
    f.upstream.read.mockClear();
    for (const path of [
      'rest/data-tables-global',
      'rest/data-tables-global/limits',
      'rest/variables',
    ]) {
      const response = await invoke(f.app, { url: `${prefix}${path}`, headers: { cookie } });
      expect(response.statusCode).toBe(403);
      expect(response._getJSONData()).toMatchObject({
        error: {
          code: 'NATIVE_EDITOR_DENIED',
          message: 'Variables and data tables are not connected to this Orqaly editor',
        },
      });
      expect(response._getJSONData()).not.toHaveProperty('data');
    }
    const unsupported = await invoke(f.app, {
      url: `${prefix}rest/executions`,
      headers: { cookie },
    });
    expect(unsupported.statusCode).toBe(403);
    expect(f.upstream.read).not.toHaveBeenCalled();
    f.upstream.read.mockResolvedValueOnce({
      status: 200,
      headers: new Headers({ 'content-type': 'text/html' }),
      body: Buffer.from('<html><body><div id="app"></div></body></html>'),
    });
    const page = await invoke(f.app, {
      url: `${prefix}workflow/${revisionId}`,
      headers: { cookie },
    });
    expect(page.statusCode).toBe(200);
    expect(page._getData()).toContain(
      'Manage connections in Orqaly. Variables and data tables are not connected here.'
    );
    expect(page._getData()).toMatch(/color:\s*#24292f !important/);
  });

  it.each([undefined, false, true])(
    'disables autosave only for viewers while preserving upstream draft setting %s',
    async (upstreamDisabled) => {
      const f = fixture();
      for (const mode of ['view', 'edit']) {
        const { cookie, prefix } = await f.launch(mode);
        const data = { versionCli: '2.37.10' };
        if (upstreamDisabled !== undefined) data.workflowsAutosaveDisabled = upstreamDisabled;
        f.upstream.read.mockResolvedValueOnce({
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          body: Buffer.from(JSON.stringify({ data })),
        });
        const settings = await invoke(f.app, {
          url: `${prefix}rest/settings`,
          headers: { cookie },
        });
        expect(settings.statusCode).toBe(200);
        expect(settings._getJSONData().data.workflowsAutosaveDisabled).toBe(
          mode === 'view' ? true : upstreamDisabled
        );
        expect(settings._getJSONData().data.versionCli).toBe('2.37.10');
      }
      expect(f.revisionService.saveDraft).not.toHaveBeenCalled();
    }
  );

  it('keeps viewer autosave writes forbidden even after native settings have disabled them', async () => {
    const f = fixture();
    for (const selectedRevision of [null, revisionId]) {
      const { cookie, prefix } = await f.launch('view', selectedRevision);
      const settings = await invoke(f.app, { url: `${prefix}rest/settings`, headers: { cookie } });
      expect(settings._getJSONData().data.workflowsAutosaveDisabled).toBe(true);
      const response = await invoke(f.app, {
        method: 'PATCH',
        url: `${prefix}rest/workflows/${selectedRevision || solutionId}`,
        headers: { cookie, origin },
        body: { autosaved: true },
      });
      expect(response.statusCode).toBe(403);
      expect(response._getJSONData()).toMatchObject({
        error: { code: 'NATIVE_EDITOR_DENIED', message: 'This canvas is read-only' },
      });
    }
    expect(f.revisionService.saveDraft).not.toHaveBeenCalled();
    expect(f.buildService.saveDraft).not.toHaveBeenCalled();
  });

  it('enforces origin and read-only mode on save despite a valid cookie', async () => {
    const f = fixture();
    const edit = await f.launch();
    for (const headers of [
      { cookie: edit.cookie },
      { cookie: edit.cookie, origin: parentOrigin },
      { cookie: edit.cookie, origin: 'https://attacker.example' },
    ]) {
      const response = await invoke(f.app, {
        method: 'PATCH',
        url: `${edit.prefix}rest/workflows/${revisionId}`,
        headers,
        body: { versionId: '3' },
      });
      expect(response.statusCode).toBe(403);
    }
    const view = await f.launch('view');
    const response = await invoke(f.app, {
      method: 'PATCH',
      url: `${view.prefix}rest/workflows/${revisionId}`,
      headers: { cookie: view.cookie, origin },
      body: { versionId: '3' },
    });
    expect(response.statusCode).toBe(403);
    expect(f.revisionService.saveDraft).not.toHaveBeenCalled();
  });

  it('refuses same-origin iframe deployment and unsafe browser origin configuration', () => {
    const config = {
      solutionService: {},
      revisionService: {},
      bindings: [],
      signingKey: 'a'.repeat(32),
      origin,
      browserOrigins: [parentOrigin],
    };
    expect(() => createNativeN8nGateway({ ...config, browserOrigins: [origin] })).toThrow(
      'isolation'
    );
    expect(() =>
      createNativeN8nGateway({ ...config, browserOrigins: ['http://unsafe.example'] })
    ).toThrow('origin');
    expect(() => createNativeN8nGateway({ ...config, signingKey: 'short' })).toThrow('isolation');
  });

  it('accepts native inactive autosave serialization without losing metadata or permitting activation', async () => {
    const f = fixture();
    const { cookie, prefix } = await f.launch();
    const read = await invoke(f.app, {
      url: `${prefix}rest/workflows/${revisionId}`,
      headers: { cookie },
    });
    const native = read._getJSONData().data;
    const body = {
      id: revisionId,
      name: native.name,
      nodes: [],
      connections: {},
      settings: { ...workflow.settings, binaryMode: 'separate' },
      versionId: native.versionId,
      expectedChecksum: native.checksum,
      active: false,
      autosaved: true,
      aiBuilderAssisted: false,
      nodeGroups: [],
      pinData: {},
      tags: [],
    };
    const saved = await invoke(f.app, {
      method: 'PATCH',
      url: `${prefix}rest/workflows/${revisionId}`,
      headers: { cookie, origin },
      body,
    });
    expect(saved.statusCode).toBe(200);
    expect(saved._getJSONData().data.name).toBe(native.name);
    expect(f.revisionService.saveDraft.mock.calls[0][3].workflow.settings).toEqual(
      workflow.settings
    );
    for (const changed of [
      { name: 'Silently discarded rename' },
      { description: 'Silently discarded description' },
      { meta: { customerNote: 'must not disappear' } },
      { active: true },
      { id: solutionId },
    ]) {
      const denied = await invoke(f.app, {
        method: 'PATCH',
        url: `${prefix}rest/workflows/${revisionId}`,
        headers: { cookie, origin },
        body: { ...body, ...changed },
      });
      expect(denied.statusCode).toBe(400);
    }
    expect(f.revisionService.saveDraft).toHaveBeenCalledTimes(1);
  });

  it('serves only scoped editor SSE comments, caps streams, rechecks revocation, and clears expiry timers', async () => {
    vi.useFakeTimers();
    try {
      const f = fixture();
      const { cookie, prefix } = await f.launch();
      const first = await openStream(f.app, {
        url: `${prefix}rest/push?pushRef=synthetic`,
        headers: { cookie },
      });
      expect(first.getHeader('Content-Type')).toBe('text/event-stream');
      expect(first._getData()).toContain(': Orqaly native editor connection');
      expect(first._getData()).not.toContain('data:');
      expect(f.upstream.read).not.toHaveBeenCalled();
      const second = await openStream(f.app, {
        url: `${prefix}rest/push?pushRef=reconnect`,
        headers: { cookie },
      });
      expect(first._isEndCalled()).toBe(true);
      expect(vi.getTimerCount()).toBe(2);
      f.revision.status = 'approved';
      await vi.advanceTimersByTimeAsync(15000);
      expect(second._isEndCalled()).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
      f.revision.status = 'draft';
      const third = await openStream(f.app, { url: `${prefix}rest/push`, headers: { cookie } });
      f.advance(600001);
      await vi.advanceTimersByTimeAsync(15000);
      expect(third._isEndCalled()).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('directs native autosave health to an authenticated scoped editor check without exposing upstream identity', async () => {
    const f = fixture();
    const { cookie, prefix } = await f.launch();
    const settings = await invoke(f.app, { url: `${prefix}rest/settings`, headers: { cookie } });
    expect(settings._getJSONData().data.endpointHealth).toBe(`${prefix}rest/orqaly/editor-health`);
    f.upstream.read.mockClear();
    f.upstream.read.mockResolvedValue({
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      body: Buffer.from(
        JSON.stringify({
          data: { id: 'private-native-owner', email: 'private-owner@example.test' },
        })
      ),
    });
    const healthy = await invoke(f.app, {
      url: `${prefix}rest/orqaly/editor-health`,
      headers: { cookie },
    });
    expect(healthy.statusCode).toBe(200);
    expect(healthy._getJSONData()).toEqual({ status: 'ok', component: 'native-editor' });
    expect(f.upstream.read).toHaveBeenCalledExactlyOnceWith('/rest/login');
    expect(healthy._getData()).not.toContain('private');
    const unsigned = await invoke(f.app, { url: `${prefix}rest/orqaly/editor-health` });
    expect(unsigned.statusCode).toBe(401);
    expect(f.upstream.read).toHaveBeenCalledTimes(1);
  });

  it('keeps native editor offline when genuine auth metadata cannot be verified', async () => {
    const f = fixture();
    const { cookie, prefix } = await f.launch();
    for (const reply of [
      { status: 401, body: Buffer.from('{"data":{"id":"owner"}}') },
      { status: 200, body: Buffer.from('{"data":{}}') },
      { status: 200, body: Buffer.from('sensitive non-json upstream failure') },
    ]) {
      f.upstream.read.mockResolvedValue(reply);
      const response = await invoke(f.app, {
        url: `${prefix}rest/orqaly/editor-health`,
        headers: { cookie },
      });
      expect(response.statusCode).toBe(502);
      expect(response._getJSONData()).not.toHaveProperty('status', 'ok');
      expect(response._getData()).not.toContain('sensitive');
    }
    f.upstream.read.mockRejectedValue(new Error('sensitive upstream credentials detail'));
    const unavailable = await invoke(f.app, {
      url: `${prefix}rest/orqaly/editor-health`,
      headers: { cookie },
    });
    expect(unavailable.statusCode).toBe(502);
    expect(unavailable._getData()).not.toContain('sensitive');
  });
});
