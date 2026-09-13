import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import express from 'express';
import { z } from 'zod';
import { SolutionError } from './solution-service.js';
import { SolutionBuildError } from './solution-build-service.js';
import { canonicalJsonSha256 } from '../../services/agentic-control-plane/src/domain/canonical.js';
import { mergeNativeEditorNodes } from './native-editor-catalog.js';
import { isNativeN8nReadPath } from './native-editor-upstream.js';
import { nativeBundleHash, nativeBundleMembers } from './native-workflow-bundle.js';

const dependencyId = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/);
const sessionRequest = z
  .object({
    revisionId: z.uuid().nullable(),
    mode: z.enum(['view', 'edit']),
    dependencyId: dependencyId.optional(),
  })
  .strict();
const editable = new Set(['draft', 'reviewed']);
const editableBuild = new Set(['preparing', 'needs_input', 'draft', 'reviewed', 'failed']);
const cookieName = 'orqaly_native_n8n';
const deny = (message = 'This editor session cannot perform that operation', status = 403) => {
  throw new SolutionError('NATIVE_EDITOR_DENIED', message, status);
};
const wrap = (handler) => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
// n8n 2.37.10 hides its genuine Save/Saved control when autosave is enabled.
// Retain that native control in Orqaly drafts: its dirty/loading state, update
// permission and save handler remain untouched, as does the autosave process.
// Each build must be explicitly verified; never guess at another asset's code.
const nativeSaveControls = new Map([
  ['/assets/MainHeader-DYwQEGwg.js', ['let ge=p(()=>!b.isAutosaveEnabled)', 'let ge=p(()=>!0)']],
  [
    '/assets/MainHeader-legacy-DoaOPRFy.js',
    ['const pa=m((()=>!b.isAutosaveEnabled))', 'const pa=m((()=>!0))'],
  ],
]);

function retainNativeSaveControl(pathname, body) {
  const adaptation = nativeSaveControls.get(pathname);
  const source = body.toString('utf8');
  if (!adaptation || source.split(adaptation[0]).length !== 2)
    deny(
      'This native editor build is not supported. Reopen after the integration is updated.',
      502
    );
  return source.replace(adaptation[0], adaptation[1]);
}

function checkedOrigin(value, local) {
  const url = new URL(value);
  if (
    url.origin !== value ||
    (url.protocol !== 'https:' &&
      !(local && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))
  ) {
    throw new Error('native_editor_origin_invalid');
  }
  return value;
}

/** An authenticated n8n frontend adapter. Native saves persist Orqaly drafts;
 * no browser request can reach upstream workflow, execution or credential APIs. */
export function createNativeN8nGateway({
  solutionService,
  revisionService,
  buildService,
  bindings,
  signingKey,
  origin,
  browserOrigins,
  allowLocalHttp = false,
  now = () => Date.now(),
}) {
  checkedOrigin(origin, allowLocalHttp);
  browserOrigins.forEach((value) => checkedOrigin(value, allowLocalHttp));
  if (
    browserOrigins.includes(origin) ||
    !browserOrigins.length ||
    Buffer.byteLength(signingKey || '') < 32
  )
    throw new Error('native_editor_isolation_configuration_invalid');
  const providers = new Map(bindings.map((value) => [value.environmentId, value.upstream]));
  if (providers.size !== bindings.length) throw new Error('native_editor_duplicate_binding');
  const router = express.Router();
  const requestCounts = new Map();
  const pushStreams = new Map();
  const sign = (claims) => {
    const encoded = Buffer.from(JSON.stringify(claims)).toString('base64url');
    return `${encoded}.${createHmac('sha256', signingKey).update(encoded).digest('base64url')}`;
  };
  const verify = (token, purpose) => {
    if (typeof token !== 'string' || token.length > 4096) deny('Editor session required', 401);
    const [encoded, supplied, extra] = token.split('.');
    if (!encoded || !supplied || extra) deny('Editor session invalid', 401);
    const expected = createHmac('sha256', signingKey).update(encoded).digest();
    const signature = Buffer.from(supplied, 'base64url');
    if (signature.length !== expected.length || !timingSafeEqual(signature, expected))
      deny('Editor session invalid', 401);
    let claims;
    try {
      claims = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    } catch {
      deny('Editor session invalid', 401);
    }
    if (
      claims.purpose !== purpose ||
      claims.audience !== origin ||
      !Number.isFinite(claims.expiresAt) ||
      claims.expiresAt <= now() ||
      !browserOrigins.includes(claims.parentOrigin)
    )
      deny('Editor session expired. Reopen the canvas.', 401);
    return claims;
  };
  async function solutionEditorEnvironment(auth, solution, command) {
    if (solution.environment) return solution.environment;
    // Viewing frozen v1 bytes does not need an available deployment slot. Reuse
    // only this owner's frontend asset binding, never another owner's runtime.
    // Missing bindings on deployed/revision/edit sessions still fail closed.
    if (
      solution.status === 'draft' &&
      !solution.deployment &&
      command.mode === 'view' &&
      !command.revisionId
    )
      return solutionService.authoringEnvironment?.(auth);
    return null;
  }
  function memberSelection(claims, selected, issuing = false) {
    if (!claims.dependencyId) return selected;
    if (claims.mode !== 'view') deny('Owned workflow members are read-only in this canvas');
    const source = selected.revision || selected.buildRequest || selected.solution;
    let member, bundleHash;
    try {
      const value = { workflow: selected.workflow, spec: source.spec };
      member = nativeBundleMembers(value).find(
        (entry) => entry.dependencyId === claims.dependencyId
      );
      bundleHash = nativeBundleHash(value);
    } catch {
      deny('Owned workflow member is not available', 409);
    }
    if (!member || !bundleHash) deny('Owned workflow member not found', 404);
    const memberWorkflowHash = canonicalJsonSha256(member.workflow);
    if (
      !issuing &&
      (claims.bundleHash !== bundleHash || claims.memberWorkflowHash !== memberWorkflowHash)
    )
      deny('The owned workflow changed. Reopen the canvas.', 409);
    return { ...selected, workflow: member.workflow, member, bundleHash, memberWorkflowHash };
  }
  async function selection(claims, issuing = false) {
    const auth = { userId: claims.userId };
    if (claims.buildRequestId) {
      if (!buildService || claims.solutionId || claims.revisionId)
        deny('Invalid authoring session');
      const { buildRequest } = await buildService.nativeSelection(auth, claims.buildRequestId);
      const environment = await solutionService.authoringEnvironment(auth);
      if (environment?.id !== claims.environmentId || !providers.has(claims.environmentId))
        deny('This workspace is not connected to the native editor');
      if (!buildRequest.workflow) deny('The workflow draft is not available yet', 409);
      if (claims.mode === 'edit' && !editableBuild.has(buildRequest.status))
        deny('This build is frozen. Open its Solution to create a new revision.', 409);
      if (claims.mode === 'view' && buildRequest.workflowHash !== claims.workflowHash)
        deny('The draft changed. Reopen the canvas.', 409);
      return memberSelection(
        claims,
        {
          buildRequest,
          solution: { ...buildRequest, name: buildRequest.name || 'Workflow draft' },
          workflow: buildRequest.workflow,
          version: buildRequest.rowVersion,
        },
        issuing
      );
    }
    const { solution } = await solutionService.read(auth, claims.solutionId);
    const environment = await solutionEditorEnvironment(auth, solution, claims);
    if (environment?.id !== claims.environmentId || !providers.has(claims.environmentId))
      deny('This environment is not connected to the native editor');
    if (!claims.revisionId) {
      if (claims.mode === 'edit') deny('Create a draft before editing');
      // Bind viewing to the exact selected version, including after activation.
      if (solution.workflowHash !== claims.workflowHash)
        deny('The deployed version changed. Reopen the canvas.', 409);
      return memberSelection(
        claims,
        { solution, workflow: solution.workflow, version: solution.rowVersion },
        issuing
      );
    }
    const revision = revisionService.readRevision
      ? (await revisionService.readRevision(auth, claims.solutionId, claims.revisionId)).revision
      : (await revisionService.read(auth, claims.solutionId)).revisions.find(
          (value) => value.id === claims.revisionId
        );
    if (!revision) deny('Workflow revision not found', 404);
    if (claims.mode === 'edit' && !editable.has(revision.status))
      deny('This revision is frozen. Create a new draft to edit.', 409);
    return memberSelection(
      claims,
      { solution, revision, workflow: revision.workflow, version: revision.rowVersion },
      issuing
    );
  }
  async function issue(auth, solutionId, body) {
    if (!auth?.userId) deny('Sign in required', 401);
    z.uuid().parse(solutionId);
    const command = sessionRequest.parse(body);
    const { solution } = await solutionService.read(auth, solutionId);
    const environment = await solutionEditorEnvironment(auth, solution, command);
    const claims = {
      ...command,
      solutionId,
      userId: auth.userId,
      environmentId: environment?.id,
      workflowHash: solution.workflowHash,
      sessionId: randomUUID(),
      audience: origin,
      parentOrigin: browserOrigins[0],
      purpose: 'launch',
      expiresAt: now() + 30_000,
    };
    const selected = await selection(claims, true);
    if (command.dependencyId)
      Object.assign(claims, {
        bundleHash: selected.bundleHash,
        memberWorkflowHash: selected.memberWorkflowHash,
      });
    return {
      launchUrl: `${origin}/native-n8n/launch`,
      token: sign(claims),
      expiresAt: new Date(claims.expiresAt).toISOString(),
    };
  }
  async function issueBuild(auth, buildRequestId, body) {
    if (!auth?.userId) deny('Sign in required', 401);
    if (!buildService) deny('Workflow authoring is not configured', 503);
    z.uuid().parse(buildRequestId);
    const command = z
      .object({ mode: z.enum(['view', 'edit']), dependencyId: dependencyId.optional() })
      .strict()
      .parse(body);
    const { buildRequest } = await buildService.nativeSelection(auth, buildRequestId);
    const environment = await solutionService.authoringEnvironment(auth);
    const claims = {
      ...command,
      buildRequestId,
      userId: auth.userId,
      environmentId: environment?.id,
      workflowHash: buildRequest.workflowHash,
      sessionId: randomUUID(),
      audience: origin,
      parentOrigin: browserOrigins[0],
      purpose: 'launch',
      expiresAt: now() + 30_000,
    };
    const selected = await selection(claims, true);
    if (command.dependencyId)
      Object.assign(claims, {
        bundleHash: selected.bundleHash,
        memberWorkflowHash: selected.memberWorkflowHash,
      });
    return {
      launchUrl: `${origin}/native-n8n/launch`,
      token: sign(claims),
      expiresAt: new Date(claims.expiresAt).toISOString(),
    };
  }
  router.use((req, res, next) => {
    res.set({
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': `default-src 'self'; frame-ancestors ${browserOrigins.join(' ')}; object-src 'none'; base-uri 'self'; form-action 'self'; script-src 'self' data: 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:`,
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    });
    next();
  });
  router.post(
    '/launch',
    express.urlencoded({ extended: false, limit: '8kb' }),
    wrap(async (req, res) => {
      const claims = verify(req.body?.token, 'launch');
      if (req.get('origin') !== claims.parentOrigin) deny('Editor launch origin denied');
      await selection(claims);
      const prefix = `/native-n8n/s/${claims.sessionId}/`;
      const session = sign({ ...claims, purpose: 'session', expiresAt: now() + 10 * 60_000 });
      const secure = origin.startsWith('https:');
      res.set(
        'Set-Cookie',
        `${cookieName}=${session}; Path=${prefix}; HttpOnly; Max-Age=600; ${secure ? 'Secure; SameSite=None; Partitioned' : 'SameSite=Lax'}`
      );
      res.redirect(
        303,
        `${prefix}workflow/${claims.buildRequestId || claims.revisionId || claims.solutionId}`
      );
    })
  );
  router.use(
    '/s/:sessionId',
    express.json({ limit: '192kb', strict: true }),
    wrap(async (req, res) => {
      const cookie = req
        .get('cookie')
        ?.split(';')
        .map((value) => value.trim())
        .find((value) => value.startsWith(`${cookieName}=`))
        ?.slice(cookieName.length + 1);
      const claims = verify(cookie, 'session');
      if (req.params.sessionId !== claims.sessionId) deny('Editor session scope mismatch');
      const assetRequest = /^\/(assets|static|icons|types)\//.test(req.path);
      const rateKey = `${claims.sessionId}:${assetRequest ? 'asset' : 'api'}`;
      const bucket = requestCounts.get(rateKey);
      if (!bucket || bucket.resetAt <= now()) {
        if (requestCounts.size >= 1000) requestCounts.delete(requestCounts.keys().next().value);
        requestCounts.set(rateKey, { count: 1, resetAt: now() + 60000 });
      } else if (++bucket.count > (assetRequest ? 1500 : 180))
        deny('Too many editor requests. Wait a minute and retry.', 429);
      const requestOrigin = req.get('origin');
      if (requestOrigin && requestOrigin !== origin) deny('Editor request origin denied');
      if (!['GET', 'HEAD'].includes(req.method) && requestOrigin !== origin)
        deny('Editor save origin required');
      const pathname = req.path;
      if (/%|\\|\.\./.test(pathname)) deny('Editor path denied');
      const upstream = providers.get(claims.environmentId);
      if (!upstream) deny('Editor environment unavailable');
      const prefix = `/native-n8n/s/${claims.sessionId}/`;
      if (['GET', 'HEAD'].includes(req.method) && assetRequest) {
        if (pathname === '/static/base-path.js')
          return res
            .type('application/javascript')
            .send(`window.BASE_PATH = ${JSON.stringify(prefix)};`);
        const reply = await upstream.read(pathname);
        const contentType = reply.headers.get('content-type') || 'application/octet-stream';
        let body = reply.body;
        if (
          pathname === '/types/nodes.json' &&
          reply.status === 200 &&
          contentType.includes('json')
        ) {
          const selected = await selection(claims);
          if (
            selected.solution.spec?.kind === 'n8n_workflow_v2' ||
            selected.buildRequest?.preparationVersion === 2
          )
            body = JSON.stringify(mergeNativeEditorNodes(JSON.parse(reply.body.toString('utf8'))));
        }
        if (contentType.includes('text/css'))
          body = reply.body.toString('utf8').replace(/url\(\s*(['"]?)\/(?!\/)/g, `url($1${prefix}`);
        // The pinned native Vite preload helper uses root-relative module URLs.
        // Remap its base for this scoped mount; no n8n feature flags are changed.
        if (/^\/assets\/preload-helper-[A-Za-z0-9_-]+\.js$/.test(pathname))
          body = reply.body
            .toString('utf8')
            .replace(/return`\/`\+([A-Za-z_$][\w$]*)/g, 'return window.BASE_PATH+$1');
        if (
          claims.mode === 'edit' &&
          reply.status === 200 &&
          /^\/assets\/MainHeader-(?:legacy-)?[A-Za-z0-9_-]+\.js$/.test(pathname)
        )
          body = retainNativeSaveControl(pathname, reply.body);
        return res.status(reply.status).type(contentType).send(body);
      }
      const selected = await selection(claims);
      const selectedId = claims.buildRequestId || claims.revisionId || claims.solutionId;
      const workflowRoute = `/rest/workflows/${selectedId}`;
      const displayName = `${selected.solution.name}${selected.revision ? ` · Draft v${selected.revision.version}` : ''}${selected.member ? ` · ${selected.member.dependencyId}` : ''}`;
      const envelope = (value) => res.json({ data: value });
      async function projectData() {
        const projectResponse = await upstream.read('/rest/projects/personal');
        const value = JSON.parse(projectResponse.body.toString('utf8')).data;
        return { id: value.id, name: selected.solution.name, type: 'personal', icon: null };
      }
      async function workflowData() {
        const project = await projectData();
        return {
          ...selected.workflow,
          id: selectedId,
          name: displayName,
          active: false,
          isArchived: false,
          versionId: String(selected.version),
          activeVersionId: null,
          versionCounter: selected.version,
          checksum: canonicalJsonSha256(selected.workflow),
          createdAt: selected.revision?.createdAt || selected.solution.createdAt,
          updatedAt: selected.revision?.updatedAt || selected.solution.updatedAt,
          tags: [],
          pinData: {},
          shared: [
            { role: 'workflow:owner', workflowId: selectedId, projectId: project.id, project },
          ],
          homeProject: project,
          parentFolder: null,
          scopes: claims.mode === 'edit' ? ['workflow:read', 'workflow:update'] : ['workflow:read'],
        };
      }
      if (pathname === workflowRoute && req.method === 'GET') return envelope(await workflowData());
      if (pathname === `${workflowRoute}/exists` && req.method === 'GET')
        return envelope({ exists: true });
      if (pathname === `${workflowRoute}/collaboration/write-lock` && req.method === 'GET')
        return envelope(null);
      if (pathname === `${workflowRoute}/executions/last-successful` && req.method === 'GET')
        return envelope(null);
      if (
        pathname === `/rest/workflow-history/workflow/${selectedId}/version/${selected.version}` &&
        req.method === 'GET'
      )
        return envelope({ ...(await workflowData()), workflowId: selectedId, authors: 'Orqaly' });
      if (pathname === workflowRoute && req.method === 'PATCH') {
        if (claims.mode !== 'edit') deny('This canvas is read-only');
        const body = req.body;
        if (!body || String(body.versionId) !== String(selected.version))
          deny('The draft changed. Reload before saving.', 409);
        if (body.expectedChecksum !== canonicalJsonSha256(selected.workflow))
          deny('The draft changed. Reload before saving.', 409);
        if (
          (body.name !== undefined && body.name !== displayName) ||
          (body.description !== undefined && body.description !== null && body.description !== '')
        )
          deny(
            'Renaming and descriptions in this editor are not supported yet. The draft was not saved.',
            400
          );
        if (
          body.meta !== undefined &&
          body.meta !== null &&
          (typeof body.meta !== 'object' ||
            Array.isArray(body.meta) ||
            Object.keys(body.meta).length)
        )
          deny('This editor metadata is not supported. The draft was not saved.', 400);
        const allowed = new Set([
          'name',
          'nodes',
          'connections',
          'settings',
          'versionId',
          'expectedChecksum',
          'pinData',
          'meta',
          'tags',
          'description',
          'id',
          'autosaved',
          'aiBuilderAssisted',
          'nodeGroups',
          'active',
        ]);
        if (
          Object.keys(body).some((key) => !allowed.has(key)) ||
          (body.pinData && Object.keys(body.pinData).length) ||
          body.tags?.length ||
          (body.id && body.id !== selectedId) ||
          (body.active !== undefined && body.active !== false) ||
          (body.nodeGroups && (!Array.isArray(body.nodeGroups) || body.nodeGroups.length)) ||
          (body.autosaved !== undefined && typeof body.autosaved !== 'boolean') ||
          (body.aiBuilderAssisted !== undefined && typeof body.aiBuilderAssisted !== 'boolean')
        )
          deny('This draft edit contains unsupported fields', 400);
        const workflow = { ...selected.workflow };
        for (const key of ['nodes', 'connections', 'settings'])
          if (Object.hasOwn(body, key)) workflow[key] = body[key];
        // Native serialization materializes this existing implicit engine
        // default. Non-default modes still require semantic validation.
        if (
          workflow.settings?.binaryMode === 'separate' &&
          !Object.hasOwn(selected.workflow.settings || {}, 'binaryMode')
        ) {
          workflow.settings = { ...workflow.settings };
          delete workflow.settings.binaryMode;
        }
        const result = claims.buildRequestId
          ? await buildService.saveDraft({ userId: claims.userId }, claims.buildRequestId, {
              workflow,
              expectedVersion: selected.version,
              workflowHash: selected.buildRequest.workflowHash,
            })
          : await revisionService.saveDraft(
              { userId: claims.userId },
              claims.solutionId,
              claims.revisionId,
              { workflow, expectedVersion: selected.version }
            );
        const revision =
          result.buildRequest ||
          result.revision ||
          result.revisions?.find((value) => value.id === claims.revisionId) ||
          result;
        return envelope({
          ...(await workflowData()),
          ...revision.workflow,
          id: selectedId,
          name: displayName,
          versionId: String(revision.rowVersion),
          versionCounter: revision.rowVersion,
          checksum: canonicalJsonSha256(revision.workflow),
          active: false,
          activeVersionId: null,
        });
      }
      if (!['GET', 'HEAD'].includes(req.method)) deny();
      if (pathname === '/static/base-path.js')
        return res
          .type('application/javascript')
          .send(`window.BASE_PATH = ${JSON.stringify(prefix)};`);
      if (pathname === '/rest/orqaly/workflow') return envelope(await workflowData());
      if (pathname === '/rest/orqaly/editor-health') {
        // Native autosave needs a truthful editor connectivity check. A
        // platform-reserved health URL may never reach n8n, so verify its real
        // authenticated user/database endpoint after checking this session's
        // Orqaly selection. No user profile or execution health is exposed.
        const response = await upstream.read('/rest/login');
        const payload = JSON.parse(response.body.toString('utf8'));
        if (response.status !== 200 || typeof payload.data?.id !== 'string' || !payload.data.id)
          throw new Error('native_editor_health_unavailable');
        return res.json({ status: 'ok', component: 'native-editor' });
      }
      if (pathname === '/rest/projects/personal') return envelope(await projectData());
      if (pathname === '/rest/projects/my-projects') return envelope([await projectData()]);
      if (pathname === '/rest/projects/count') return envelope({ personal: 1, team: 0 });
      if (pathname === '/rest/workflows') return envelope([await workflowData()]);
      if (
        pathname === '/rest/active-workflows' ||
        pathname === '/rest/tags' ||
        pathname === '/rest/community-node-types'
      )
        return envelope([]);
      if (pathname === '/rest/credentials' || pathname === '/rest/credentials/for-workflow') {
        // n8n 2.37.10 WorkflowsView.fetchEmptyStateData uses /credentials,
        // whereas NodeView uses /credentials/for-workflow. Neither may become
        // an instance-wide credential inventory through this scoped adapter.
        const query = new URL(req.originalUrl, origin).searchParams;
        const allowed = new Set([
          'includeData',
          'includeScopes',
          'includeGlobal',
          'onlySharedWithMe',
          'workflowId',
          'projectId',
          'filter',
        ]);
        if (query.toString().length > 4096) deny('Editor credential query denied');
        for (const [key, value] of query) {
          if (!allowed.has(key) || query.getAll(key).length !== 1)
            deny('Editor credential query denied');
          if (key.startsWith('include') && !['true', 'false'].includes(value))
            deny('Editor credential query denied');
          if (key === 'onlySharedWithMe' && value !== 'false')
            deny('Shared credential browsing is not available in this editor');
          if (key === 'workflowId' && value !== selectedId)
            deny('Editor credential workflow scope mismatch');
        }
        let filter;
        try {
          filter = query.has('filter')
            ? z
                .object({ projectId: z.string().optional() })
                .strict()
                .parse(JSON.parse(query.get('filter')))
            : {};
        } catch {
          deny('Editor credential query denied');
        }
        const projectIds = [query.get('projectId'), filter.projectId].filter(
          (value) => value != null
        );
        if (projectIds.length) {
          const project = await projectData();
          if (projectIds.some((id) => id !== project.id))
            deny('Editor credential project scope mismatch');
        }
        // Only safe references already present on this exact owner-scoped graph.
        // Native includeData=true must not expose decrypted values. Credential
        // creation, selection, testing and verification remain Orqaly controls.
        const references = new Map();
        for (const node of selected.workflow.nodes ?? [])
          for (const [type, credential] of Object.entries(node.credentials ?? {})) {
            if (typeof credential?.id === 'string' && typeof credential?.name === 'string')
              references.set(`${type}:${credential.id}`, {
                id: credential.id,
                name: credential.name,
                type,
                isManaged: true,
                scopes: ['credential:read'],
              });
          }
        return envelope([...references.values()]);
      }
      if (pathname === '/rest/favorites') return envelope([]);
      if (pathname === '/rest/instance-ai/threads') return envelope({ threads: [], count: 0 });
      if (pathname === '/rest/users') return res.json({ data: [], count: 0 });
      if (pathname === '/rest/variables' || pathname.startsWith('/rest/data-tables-global'))
        deny('Variables and data tables are not connected to this Orqaly editor');
      if (pathname === '/rest/roles')
        return envelope({ global: [], project: [], credential: [], workflow: [] });
      if (pathname === '/rest/push') {
        // n8n's native SSE client treats an open EventSource as connected. This
        // channel describes only the scoped editor connection: no upstream run
        // events, collaborative lock claims or fabricated execution results.
        pushStreams.get(claims.sessionId)?.end();
        pushStreams.set(claims.sessionId, res);
        res.status(200).set({
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-store',
          'X-Accel-Buffering': 'no',
        });
        res.flushHeaders?.();
        res.write(': Orqaly native editor connection\n\n');
        let checking = false;
        const heartbeat = setInterval(async () => {
          if (checking || res.writableEnded) return;
          checking = true;
          try {
            if (claims.expiresAt <= now()) return res.end();
            await selection(claims);
            res.write(': editor heartbeat\n\n');
          } catch {
            res.end();
          } finally {
            checking = false;
          }
        }, 15000);
        heartbeat.unref?.();
        const expiry = setTimeout(() => res.end(), Math.max(0, claims.expiresAt - now()));
        expiry.unref?.();
        const cleanup = () => {
          clearInterval(heartbeat);
          clearTimeout(expiry);
          if (pushStreams.get(claims.sessionId) === res) pushStreams.delete(claims.sessionId);
        };
        res.once('close', cleanup);
        res.once('finish', cleanup);
        return;
      }
      const page = pathname === '/workflows/demo' || pathname === `/workflow/${selectedId}`;
      if (pathname.startsWith('/rest/workflows/') && !page) deny();
      // An unsupported editor route is not an n8n outage. Reject it before the
      // upstream reader; genuine authentication/network failures still use 502.
      if (!isNativeN8nReadPath(pathname))
        deny('This native feature is not available here. Use the Orqaly controls.');
      const reply = await upstream.read(pathname);
      const type = reply.headers.get('content-type') || 'application/octet-stream';
      res.status(reply.status).type(type);
      if (pathname === '/rest/login' && type.includes('json')) {
        const payload = JSON.parse(reply.body.toString('utf8'));
        // Keep genuine n8n session/capability fields, remove the operator's profile.
        payload.data.email = 'editor@orqaly.invalid';
        payload.data.firstName = 'Orqaly';
        payload.data.lastName = 'Workflow editor';
        payload.data.personalizationAnswers = null;
        payload.data.globalScopes =
          claims.mode === 'edit' ? ['workflow:read', 'workflow:update'] : ['workflow:read'];
        payload.data.isOwner = false;
        payload.data.role = 'global:member';
        return res.json(payload);
      }
      if (pathname === '/rest/settings' && type.includes('json')) {
        const payload = JSON.parse(reply.body.toString('utf8'));
        payload.data.urlBaseEditor = `${origin}${prefix}`;
        payload.data.urlBaseWebhook = `${origin}${prefix}`;
        payload.data.endpointHealth = `${prefix}rest/orqaly/editor-health`;
        payload.data.pushBackend = 'sse';
        payload.data.telemetry = { enabled: false };
        // n8n 2.37.10 derives canvas read-only state from workflow scopes, but
        // its autosave scheduler checks a separate editor-context flag. Native
        // initialization can mark a viewer dirty and repeatedly PATCH this
        // correctly protected route. Use the native settings gate for viewers;
        // preserve the upstream autosave setting for genuine draft editors.
        if (claims.mode === 'view') payload.data.workflowsAutosaveDisabled = true;
        // Pinned settings.store derives data-table availability from this list.
        // The embedded product has no scoped data-table/variable implementation;
        // do not advertise them or invent empty successful upstream inventories.
        payload.data.activeModules = (payload.data.activeModules ?? []).filter(
          (module) => module !== 'data-table'
        );
        payload.data.enterprise = { ...payload.data.enterprise, variables: false };
        return res.json(payload);
      }
      if (page && type.includes('text/html')) {
        const html = reply.body
          .toString('utf8')
          .replace(/(\b(?:src|href)=['"])\/(?!\/)/g, `$1${prefix}`);
        const integration = `<style>/* Affordances only; the gateway independently denies these actions. */
          #orqaly-native-control-note { color:#24292f !important; }
          [data-test-id^="execute-workflow-button"], [data-test-id="node-execute-button"], [data-test-id="execute-node-button"],
          button[aria-label="Execute step"], button[aria-label="Execute workflow"], button[aria-label="Publish"],
          button[title="Runs the current node. Will also run previous nodes if they have not been run yet"],
          [data-test-id="workflow-activate-switch"], [data-test-id="workflow-publish-button"], [data-test-id="workflow-open-publish-modal-button"],
          [data-test-id="execute-previous-node"], [data-test-id="context-menu-item-execute"],
          [data-test-id="context-menu-item-extract_sub_workflow"] { display:none !important; }
        </style><div id="orqaly-native-control-note" style="position:fixed;z-index:9999;bottom:4px;left:50%;transform:translateX(-50%);max-width:calc(100% - 24px);width:max-content;padding:5px 10px;background:#f6f7f9;border:1px solid #ddd;border-radius:6px;font:12px system-ui;pointer-events:none">Native n8n · ${claims.mode === 'edit' ? 'Draft edits save to Orqaly. Review and run from Orqaly controls.' : 'Read-only workflow. Review and run from Orqaly controls.'}<br>Manage connections in Orqaly. Variables and data tables are not connected here.</div>`;
        return res.send(html.replace('</body>', `${integration}</body>`));
      }
      return res.send(reply.body);
    })
  );
  router.use((_req, _res, next) =>
    next(new SolutionError('NATIVE_EDITOR_NOT_FOUND', 'Editor route not found', 404))
  );
  router.use((error, _req, res, _next) => {
    // Raw upstream errors can contain connection details. Never echo them.
    const known = error instanceof SolutionError || error instanceof SolutionBuildError;
    if (_req.get('sec-fetch-dest') === 'iframe') {
      const targets = JSON.stringify(browserOrigins).replaceAll('<', '\\u003c');
      return res
        .status(known ? error.status : 502)
        .type('text/html')
        .send(
          `<!doctype html><html><head><meta charset="utf-8"><title>Editor unavailable</title></head><body><p>The editor session could not open. Return to Orqaly and reconnect.</p><script>for (const origin of ${targets}) window.parent.postMessage({command:'orqaly:n8n:error'},origin);</script></body></html>`
        );
    }
    res.status(known ? error.status : 502).json({
      error: {
        code: known ? error.code : 'NATIVE_EDITOR_UNAVAILABLE',
        message: known
          ? error.message
          : 'The native editor could not connect. Reopen the canvas to retry.',
      },
    });
  });
  return { router, issue, issueBuild };
}
