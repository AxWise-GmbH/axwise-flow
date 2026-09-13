// Local-only adapter smoke test. Storage and identity below are explicit
// synthetic fixtures; this does not replace the real PostgreSQL lifecycle test.
// Requires a disposable n8n service and N8N_PROBE_EMAIL/N8N_PROBE_PASSWORD.
import express from 'express';
import { randomBytes } from 'node:crypto';
import { createNativeN8nUpstream } from '../server/workflow-v2/native-editor-upstream.js';
import { createNativeN8nGateway } from '../server/workflow-v2/native-n8n-gateway.js';
import { compileSolutionWorkflow } from '../server/workflow-v2/solution-compiler.js';
import { SolutionError } from '../server/workflow-v2/solution-service.js';

const origin = 'http://127.0.0.1:15780';
const parentOrigin = 'http://127.0.0.1:15781';
const solutionId = '7031decc-b21e-48b5-9bd5-3ed3d4dfd024';
const revisionId = '8031decc-b21e-48b5-9bd5-3ed3d4dfd024';
const identity = { userId: 'user_syntheticBrowserProbe' };
const createdAt = new Date().toISOString();
const { workflow, workflowHash } = compileSolutionWorkflow({
  id: solutionId,
  spec: {
    kind: 'webhook_transform_v1',
    fields: [{ source: 'name', target: 'name', transform: 'trim' }],
  },
});
const solution = {
  id: solutionId,
  name: 'Synthetic contact workflow',
  workflow,
  workflowHash,
  rowVersion: 1,
  createdAt,
  updatedAt: createdAt,
  environment: { id: 'synthetic-local-n8n' },
};
let revision = {
  id: revisionId,
  status: 'draft',
  workflow: structuredClone(workflow),
  rowVersion: 1,
  version: 2,
  createdAt,
  updatedAt: createdAt,
};
let saves = 0;
const requests = [];
function assertScope(auth, id) {
  if (auth?.userId !== identity.userId || id !== solutionId)
    throw new SolutionError('SOLUTION_NOT_FOUND', 'Synthetic solution not found', 404);
}
const upstream = createNativeN8nUpstream({
  origin: process.env.N8N_PROBE_ORIGIN || 'http://127.0.0.1:15678',
  email: process.env.N8N_PROBE_EMAIL,
  password: process.env.N8N_PROBE_PASSWORD,
  allowLocalHttp: true,
});
const gateway = createNativeN8nGateway({
  origin,
  browserOrigins: [parentOrigin],
  allowLocalHttp: true,
  signingKey: randomBytes(32).toString('base64url'),
  bindings: [{ environmentId: solution.environment.id, upstream }],
  solutionService: {
    read: async (auth, id) => {
      assertScope(auth, id);
      return { solution };
    },
  },
  revisionService: {
    read: async (auth, id) => {
      assertScope(auth, id);
      return { revisions: [revision] };
    },
    saveDraft: async (auth, id, draftId, body) => {
      assertScope(auth, id);
      if (draftId !== revision.id || body.expectedVersion !== revision.rowVersion)
        throw new SolutionError('REVISION_CONFLICT', 'Synthetic revision changed', 409);
      revision = {
        ...revision,
        workflow: structuredClone(body.workflow),
        rowVersion: revision.rowVersion + 1,
        updatedAt: new Date().toISOString(),
      };
      saves += 1;
      return { revision };
    },
  },
});
const api = express();
api.use((req, res, next) => {
  res.on('finish', () => {
    // Deliberately omit session path IDs, query strings, headers and bodies.
    requests.push({
      method: req.method,
      path: req.path.replace(/\/s\/[^/]+/, '/s/session'),
      status: res.statusCode,
    });
    if (requests.length > 1200) requests.shift();
  });
  next();
});
api.use('/native-n8n', gateway.router);
const parent = express();
parent.get('/state', (_req, res) =>
  res.json({
    syntheticFixture: true,
    saves,
    revision,
    deployedWorkflow: solution.workflow,
    failures: requests.filter((r) => r.status >= 400),
  })
);
parent.get('/', async (_req, res) => {
  const view = await gateway.issue(identity, solutionId, { mode: 'view', revisionId: null });
  const edit = await gateway.issue(identity, solutionId, { mode: 'edit', revisionId });
  res
    .type('html')
    .send(
      `<!doctype html><html><head><title>Native n8n local adapter smoke</title><style>body{font:16px system-ui;margin:20px;background:#f6f7f9}form{display:inline-block;margin-right:12px}button{padding:10px 18px}iframe{display:block;background:white;border:1px solid #ddd;margin-top:16px;width:100%;height:800px}</style></head><body><h1>Native n8n adapter smoke</h1><p>Synthetic local fixture. Native canvas edits save only the fixture draft. No real workflow executes.</p><form method="POST" action="${view.launchUrl}" target="nativeCanvas"><input type="hidden" name="token" value="${view.token}"><button>View workflow</button></form><form method="POST" action="${edit.launchUrl}" target="nativeCanvas"><input type="hidden" name="token" value="${edit.token}"><button>Edit draft</button></form><a href="/state">Inspect fixture saves</a><iframe name="nativeCanvas" title="Native n8n canvas" sandbox="allow-scripts allow-same-origin allow-forms" referrerpolicy="no-referrer"></iframe></body></html>`
    );
});
const servers = [api.listen(15780, '127.0.0.1'), parent.listen(15781, '127.0.0.1')];
console.log(`Synthetic native n8n browser smoke ready: ${parentOrigin}`);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => {
    for (const server of servers) server.close();
  });
