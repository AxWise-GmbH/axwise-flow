// Synthetic local integration fixture ONLY. The real application uses the same
// router/service/store mounted behind the existing Orqaly API boundaries.
import https from 'node:https';
import { readFileSync } from 'node:fs';
import express from 'express';
import pg from 'pg';
import { createPostgresCodingStore } from '../../server/workflow-v2/coding-worker-postgres.js';
import { createCodingWorkerService } from '../../server/workflow-v2/coding-worker-service.js';
import { createCodingDispatchRouter } from '../../server/workflow-v2/coding-worker-http.js';
const pool = new pg.Pool({ connectionString: process.env.CODING_FIXTURE_DATABASE_URL });
const repository = { async solutionBuildTransaction(scope, callback) {
  const client = await pool.connect();
  try { await client.query('BEGIN'); await client.query("SELECT set_config('orqaly.tenant_id',$1,true),set_config('orqaly.build_owner_user_id',$2,true)", [scope.tenantId, scope.userId]);
    const result = await callback(client); await client.query('COMMIT'); return result; }
  catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
} };
const service = createCodingWorkerService({ repository, store: createPostgresCodingStore(repository), sandbox: { descriptor: {} },
  signingKey: Buffer.from(process.env.CODING_FIXTURE_SIGNING_KEY, 'base64') });
const app = express(); app.get('/readyz', (_req, res) => res.json({ ready: true })); app.use('/coding/v1', createCodingDispatchRouter({ service }));
https.createServer({ key: readFileSync('/fixture/key.pem'), cert: readFileSync('/fixture/cert.pem') }, app).listen(443, '0.0.0.0');
