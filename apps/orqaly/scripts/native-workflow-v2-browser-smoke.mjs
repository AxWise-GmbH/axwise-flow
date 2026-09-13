// Native frontend/gateway integration only: explicit synthetic in-memory
// Solution/revision storage. The separate PG+n8n test proves durable execution.
// Manual regression: View current, open a node/zoom/pan, wait 30 seconds; /state
// must show zero workflow PATCHes/saves. Repeat with View ready candidate.
// Neither viewer may show enabled Save or repeated autosave errors. Edit draft,
// move a node and wait for Saved/use Save: require a successful PATCH and changed
// draft row/hash. View again for 30 seconds: no extra save; both frozen sources
// unchanged. Every button issues a fresh session. Never execute or publish.
import express from 'express';
import { randomBytes, randomUUID } from 'node:crypto';
import { startNativeLocalRuntime } from './native-local-runtime.mjs';
import { createNativeN8nGateway } from '../server/workflow-v2/native-n8n-gateway.js';
import { normalizeNativeWorkflow } from '../server/workflow-v2/native-workflow-runtime-contract.js';
import { nativeOrderWorkflow, nativeOrderSpec } from '../server/workflow-v2/fixtures/native-order-routing.js';
import { canonicalJsonSha256 as hash } from '../services/agentic-control-plane/src/domain/canonical.js';
import { SolutionError } from '../server/workflow-v2/solution-service.js';

const origin = 'http://127.0.0.1:15796'; const parentOrigin = 'http://127.0.0.1:15797';
const scope = { tenantId: randomUUID(), userId: 'user_nativeVisualFixture' };
const local = await startNativeLocalRuntime(scope);
const id = randomUUID(); const revisionId = randomUUID(); const createdAt = new Date().toISOString();
const readyId = randomUUID();
const prepared = normalizeNativeWorkflow({ workflow: nativeOrderWorkflow(), id });
const solution = { id, name: 'Synthetic native order router', spec: nativeOrderSpec(), ...prepared,
  status: 'active', rowVersion: 1, createdAt, updatedAt: createdAt, environment: { id: local.environmentId } };
let revision = { id: revisionId, status: 'draft', workflow: structuredClone(prepared.workflow),
  workflowHash: prepared.workflowHash, rowVersion: 1, version: 2, createdAt, updatedAt: createdAt };
const readyRevision = { id: readyId, status: 'ready',
  ...normalizeNativeWorkflow({ workflow: nativeOrderWorkflow(), id: readyId }),
  spec: nativeOrderSpec(), rowVersion: 5, version: 3, createdAt, updatedAt: createdAt };
const originalCurrentHash = hash(solution.workflow); const originalReadyHash = hash(readyRevision);
let saves = 0; let totalRequests = 0; const requests = [];
const workflowPatches = { attempted: 0, succeeded: 0, denied: 0 };
function assertScope(auth, solutionId) {
  if (auth?.userId !== scope.userId || solutionId !== id) throw new SolutionError('SOLUTION_NOT_FOUND', 'Fixture not found', 404);
}
const gateway = createNativeN8nGateway({ origin, browserOrigins: [parentOrigin], allowLocalHttp: true,
  signingKey: randomBytes(32).toString('base64url'), bindings: [{ environmentId: local.environmentId, upstream: local.upstream }],
  solutionService: { read: async (auth, solutionId) => { assertScope(auth, solutionId); return { solution }; } },
  revisionService: {
    read: async (auth, solutionId) => { assertScope(auth, solutionId); return { revisions: [revision, readyRevision] }; },
    saveDraft: async (auth, solutionId, selectedId, command) => {
      assertScope(auth, solutionId);
      if (selectedId !== revisionId || command.expectedVersion !== revision.rowVersion) throw new SolutionError('REVISION_CONFLICT', 'Fixture changed', 409);
      revision = { ...revision, workflow: structuredClone(command.workflow), workflowHash: hash(command.workflow),
        rowVersion: revision.rowVersion + 1, updatedAt: new Date().toISOString() };
      saves += 1;
      return { revision };
    },
  },
});
const api = express();
api.use((req, res, next) => { res.on('finish', () => {
  // Never retain query strings, session IDs, headers, cookies or bodies.
  const path = req.path.replace(/\/s\/[^/]+/g, '/s/session');
  requests.push({ sequence: ++totalRequests, method: req.method, path, status: res.statusCode });
  if (requests.length > 1200) requests.shift();
  if (req.method === 'PATCH' && /\/rest\/workflows\//.test(path)) {
    workflowPatches.attempted++;
    if (res.statusCode >= 200 && res.statusCode < 300) workflowPatches.succeeded++;
    if (res.statusCode === 403) workflowPatches.denied++;
  }
}); next(); });
api.use('/native-n8n', gateway.router);
const parent = express();
parent.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
parent.get('/state', (_req, res) => res.json({ syntheticFixture: true, saves, revision, readyRevision,
  deployedWorkflow: solution.workflow, totalRequests, workflowPatches, requests,
  failures: requests.filter((entry) => entry.status >= 400),
  sourcePreserved: { current: hash(solution.workflow) === originalCurrentHash, readyCandidate: hash(readyRevision) === originalReadyHash } }));
const launches = {
  'view-current': { mode: 'view', revisionId: null },
  'view-ready': { mode: 'view', revisionId: readyId },
  'edit-draft': { mode: 'edit', revisionId },
};
const escapeAttribute = (value) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
for (const [action, selection] of Object.entries(launches)) parent.get(`/launch/${action}`, async (_req, res) => {
  try {
    const launch = await gateway.issue(scope, id, selection);
    // The fresh token stays in a POST body, never a GET URL or request evidence.
    res.type('html').send(`<!doctype html><html><body><form method="POST" action="${escapeAttribute(launch.launchUrl)}"><input type="hidden" name="token" value="${escapeAttribute(launch.token)}"><button>Open native canvas</button></form><script>document.forms[0].submit()</script></body></html>`);
  } catch { res.status(503).type('text').send('Synthetic native session could not be issued.'); }
});
parent.get('/', (_req, res) => {
  res.type('html').send(`<!doctype html><html><head><title>Native V2 canvas verification</title><style>body{font:16px system-ui;margin:16px;background:#f6f7f9}form{display:inline-block;margin-right:12px}button{padding:10px 16px}iframe{display:block;width:100%;height:780px;border:1px solid #ddd;background:white;margin-top:16px}</style></head><body><h1>Native V2 canvas verification</h1><p>UI-only synthetic fixture. Actual n8n frontend; edits affect this in-memory draft only.</p><form method="GET" action="/launch/view-current" target="nativeCanvas"><button>View current workflow</button></form><form method="GET" action="/launch/view-ready" target="nativeCanvas"><button>View ready candidate v3</button></form><form method="GET" action="/launch/edit-draft" target="nativeCanvas"><button>Edit draft v2</button></form><a href="/state" target="_blank" rel="noreferrer">Inspect synthetic request/save evidence</a><iframe name="nativeCanvas" title="Native n8n canvas" sandbox="allow-scripts allow-same-origin allow-forms" referrerpolicy="no-referrer"></iframe></body></html>`);
});
const servers = [];
try {
  for (const [app, port] of [[api, 15796], [parent, 15797]]) {
    const server = await new Promise((resolve, reject) => { const listener = app.listen(port, '127.0.0.1', () => resolve(listener)); listener.once('error', reject); });
    servers.push(server);
  }
  console.log(`Native V2 synthetic browser fixture ready: ${parentOrigin}`);
} catch { for (const server of servers) server.close(); await local.close(); throw new Error('native_visual_fixture_start_failed'); }
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => {
  for (const server of servers) { server.closeAllConnections(); server.close(); }
  await local.close(); process.exit(0);
});
