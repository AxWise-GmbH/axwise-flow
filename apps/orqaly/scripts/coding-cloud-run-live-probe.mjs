import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { cloudRunCodingDescriptor } from '../server/workflow-v2/coding-worker-cloud-run.js';
import { codingHash, contentHash, prepareCodingSpec } from '../server/workflow-v2/coding-worker-contracts.js';

const proxy = 'http://127.0.0.1:15817';
const ready = await (await fetch(`${proxy}/readyz`)).json();
const runtime = cloudRunCodingDescriptor(ready.runtime.image);
const scope = { tenantId: randomUUID(), userId: 'user_syntheticCodingProbe', solutionId: randomUUID(), runId: randomUUID() };
const original = 'export const total=(a,b)=>a-b;';
const source = "import fs from 'node:fs'; export const total=(a,b)=>a+b;fs.writeFileSync('/workspace/result.json',JSON.stringify({total:total(2,3)}));";
const tests = "import test from 'node:test';import assert from 'node:assert/strict';import {total} from '/workspace/src/total.mjs';test('actual code change',()=>assert.equal(total(2,3),5));";
const proposal = { kind: 'node_source_patch_v1', title: 'Synthetic code change and artifact verification', source: [{ path: 'src/total.mjs', content: original }],
  changes: [{ path: 'src/total.mjs', previousHash: contentHash(original), content: source }],
  tests: [{ path: 'total.test.mjs', content: tests }], outputs: ['src/total.mjs', 'result.json'], timeoutMs: 10000 };
async function execute(label, candidate) {
  const spec = prepareCodingSpec(candidate, runtime);
  const job = { id: randomUUID(), tenant_id: scope.tenantId, owner_user_id: scope.userId, solution_id: scope.solutionId, run_id: scope.runId,
    status: 'running', approval_id: randomUUID(), execution_id: randomUUID(), spec, spec_hash: codingHash(spec) };
  const response = await fetch(`${proxy}/v1/execute`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ scope, job }) });
  const result = await response.json();
  console.log(JSON.stringify({ label, http: response.status, jobId: job.id, status: result.status, executionId: result.evidence?.executionId,
    command: result.evidence?.command, cleanup: result.evidence?.cleanup, failureCode: result.evidence?.failureCode,
    artifacts: result.artifacts?.map(({ path, hash, bytes }) => ({ path, hash, bytes })),
    ...(result.status === 'outcome_unknown' || result.status === 'failed' ? { log: result.evidence?.log } : {}) }));
  assert.equal(response.status, 200); assert.equal(result.evidence.cleanup.status, 'removed'); return result;
}
const result = await execute('actual source change, tests, generated artifact', proposal);
assert.equal(result.status, 'succeeded');
assert.equal(result.artifacts.find((file) => file.path === 'src/total.mjs').content, source);
assert.deepEqual(JSON.parse(result.artifacts.find((file) => file.path === 'result.json').content), { total: 5 });
assert.equal(result.evidence.cleanup.status, 'removed');

const isolationTests = String.raw`
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import net from 'node:net';
test('parent environment absent',()=>{for(const key of ['ORQALY_CODING_WORKER_IMAGE_SHA256','ORQALY_CODING_PREVIEW_ACCEPTANCE','K_SERVICE','GOOGLE_APPLICATION_CREDENTIALS','CLERK_SECRET_KEY'])assert.equal(process.env[key],undefined)});
test('supervisor files, cloud configuration and Docker socket absent',()=>{for(const path of ['/app/server/workflow-v2/coding-worker-main.js','/var/run/docker.sock','/root/.config/gcloud/application_default_credentials.json'])assert.equal(fs.existsSync(path),false)});
test('root filesystem and approved tests immutable',()=>{assert.throws(()=>fs.writeFileSync('/etc/unauthorized','x'));assert.throws(()=>fs.writeFileSync('/approved-tests/isolation.test.mjs','x'))});
test('metadata and public network unreachable',async()=>{for(const [host,port] of [['169.254.169.254',80],['1.1.1.1',443]]){const blocked=await new Promise(resolve=>{const socket=net.connect({host,port});socket.on('connect',()=>{socket.destroy();resolve(false)});socket.on('error',()=>resolve(true));socket.setTimeout(1000,()=>{socket.destroy();resolve(true)})});assert.equal(blocked,true)}});
test('no parent job directories',()=>assert.equal(fs.readdirSync('/tmp').some(name=>name.startsWith('orqaly-coding-')),false));
`;
const isolated = await execute('actual parent/network/metadata/filesystem isolation', { ...proposal, tests: [{ path: 'isolation.test.mjs', content: isolationTests }], outputs: ['src/total.mjs'] });
assert.equal(isolated.status, 'succeeded');
const failed = await execute('genuine failing test', { ...proposal, changes: [{ ...proposal.changes[0], content: 'export const total=(a,b)=>a-b;' }], outputs: ['src/total.mjs'] });
assert.equal(failed.status, 'failed'); assert.equal(failed.artifacts.length, 0);
const timedOut = await execute('timeout kills full sandbox', { ...proposal, changes: [{ ...proposal.changes[0], content: 'export const total=(a,b)=>{while(true){}};' }], outputs: ['src/total.mjs'], timeoutMs: 1000 });
assert.equal(timedOut.status, 'timed_out'); assert.equal(timedOut.evidence.command.timedOut, true);
