// Real disposable PostgreSQL16, synthetic runtime receipts. No cloud/provider calls.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { nativeOwnedErrorFixture } from '../server/workflow-v2/fixtures/native-owned-error.js';
import { createNativeFailureProbeArtifact } from '../server/workflow-v2/native-failure-probe.js';
import { nativeBundleMembers, materializeNativeBundle } from '../server/workflow-v2/native-workflow-bundle.js';
import { canonicalJsonSha256 as hash } from '../services/agentic-control-plane/src/domain/canonical.js';
import { createSolutionFailureProbeService } from '../server/workflow-v2/solution-failure-probe-service.js';
import { verifyFailureProbeReadiness, verifyRevisionConnectionsReadiness } from '../server/workflow-v2/solution-revision-storage-readiness.js';

assert.deepEqual(process.argv.slice(2), ['--synthetic-runtime']);
const container = `orqaly-handler-pg-${randomBytes(6).toString('hex')}`;
const password = randomBytes(24).toString('hex');
const tenantId = randomUUID(), solutionId = randomUUID(), revisionId = randomUUID();
const scope = { tenantId, userId: 'user_syntheticowner' };
const source = nativeOwnedErrorFixture(revisionId);
const command = { expectedVersion: 0, workflowHash: source.workflowHash,
  bundleHash: source.bundleHash, confirmSyntheticFailure: true };
let db, pool, started = false, stage = 'start';
let calls = 0, uncertain = false;
let beforeProbeResult = null, beforeReconcileResult = null;
const docker = (args, environment = {}) => execFileSync('docker', args, {
  encoding: 'utf8', env: { ...process.env, ...environment }, stdio: ['ignore','pipe','pipe'],
}).trim();
const check = (label) => { stage = label; process.stdout.write(`check: ${label}\n`); };
try {
  docker(['image','inspect','postgres:16']);
  docker(['run','--pull=never','--detach','--name',container,'--publish','127.0.0.1::5432',
    '-e','POSTGRES_PASSWORD','postgres:16'], { POSTGRES_PASSWORD: password });
  started = true;
  const port = docker(['port',container,'5432/tcp']).match(/^127\.0\.0\.1:(\d+)$/)?.[1];
  assert(port);
  for (let i=0;i<60;i++) {
    try { docker(['exec',container,'pg_isready','-h','127.0.0.1','-U','postgres']); break; }
    catch { await delay(250); }
  }
  pool = new pg.Pool({ host:'127.0.0.1',port,user:'postgres',password,database:'postgres',max:4 });
  db = await pool.connect();
  check('apply001_through023');
  for (const file of readdirSync('database/workflow-v2/migrations').filter((name) => /^\d{3}_/.test(name) && Number(name.slice(0,3))<=23).sort()) {
    stage=file; await db.query(readFileSync(`database/workflow-v2/migrations/${file}`,'utf8'));
  }
  check('synthetic_owned_bundle');
  await db.query("INSERT INTO orqaly.tenants(id,display_name) VALUES($1,'Synthetic handler acceptance')",[tenantId]);
  await db.query(`INSERT INTO orqaly.customer_solutions
    (tenant_id,id,owner_user_id,agent_id,name,purpose,spec,agent_snapshot,workflow,workflow_hash,create_key,create_hash,environment_id)
    VALUES($1,$2,$3,$4,'Synthetic owned handler','No provider effects',$5,'{}',$6,$7,'synthetic_handler',$7,'synthetic-environment')`,
    [tenantId,solutionId,scope.userId,randomUUID(),source.spec,source.workflow,source.workflowHash]);
  await db.query(`INSERT INTO orqaly.solution_revisions
    (tenant_id,solution_id,id,owner_user_id,version,base_version,base_workflow,base_spec,workflow,workflow_hash,spec)
    VALUES($1,$2,$3,$4,2,1,$5,$6,$5,$7,$6)`,
    [tenantId,solutionId,revisionId,scope.userId,source.workflow,source.spec,source.workflowHash]);
  async function transaction(authScope, action, role='orqaly_api') {
    assert(['orqaly_api','orqaly_worker'].includes(role));
    const client=await pool.connect();
    try {
      await client.query('BEGIN'); await client.query(`SET LOCAL ROLE ${role}`);
      await client.query("SELECT set_config('orqaly.tenant_id',$1,true),set_config('orqaly.build_owner_user_id',$2,true)",
        [authScope.tenantId,authScope.userId]);
      const result=await action(client); await client.query('COMMIT'); return result;
    } catch(error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
  const runtime = {
    nativePolicy: () => ({ ownedErrorHandlerProbe:true,backgroundExecution:'instance_cpu_always' }),
    probeNativeFailure: async (_auth, input) => {
      calls++;
      if(uncertain) throw new Error('synthetic-lost-response');
      const artifact=createNativeFailureProbeArtifact(input);
      const child=nativeBundleMembers(artifact)[1];
      const pin={dependencyId:child.dependencyId,workflowId:'synthetic-handler',versionId:'synthetic-version',workflowHash:hash(child.workflow),specHash:hash(child.spec)};
      if(beforeProbeResult) await beforeProbeResult(input);
      return { ...artifact.source,kind:'handler_with_synthetic_failure',coverage:'handler_with_synthetic_failure',status:'succeeded',externalEffects:false,
        testArtifactHash:artifact.workflowHash,testBundleHash:artifact.bundleHash,materializedWorkflowHash:materializeNativeBundle(artifact,[pin]).workflowHash,
        mainExecution:{status:'failed',executionId:'101'},
        ownedDependencies:[{...pin,status:'succeeded',executionId:'102',parentExecutionId:'101'}],
        cleanup:{status:'removed'} };
    },
    reconcileNativeFailureProbe: async (_auth,input) => {
      const artifact=createNativeFailureProbeArtifact(input);
      if(beforeReconcileResult) await beforeReconcileResult(input);
      return {...artifact.source,kind:'handler_with_synthetic_failure',coverage:'handler_with_synthetic_failure',testArtifactHash:artifact.workflowHash,testBundleHash:artifact.bundleHash,
        status:'outcome_unknown',mainExecution:{status:'outcome_unknown',executionId:null},ownedDependencies:[],externalEffects:false,cleanup:{status:'removed'}};
    },
  };
  const service=createSolutionFailureProbeService({enabled:true,runtime,repository:{
    resolveTenant: async () => tenantId, solutionBuildTransaction:transaction,
  }});
  check('api_and_worker_catalog_readiness');
  await transaction(scope, async(client) => {
    await verifyRevisionConnectionsReadiness(client,{api:true});
    await verifyFailureProbeReadiness(client);
  });
  await transaction(scope,(client) => verifyRevisionConnectionsReadiness(client,{api:false}),'orqaly_worker');
  check('owner_boundary_and_explicit_failure_consent');
  await assert.rejects(() => service.read({userId:'user_other'},solutionId,revisionId),{code:'SOLUTION_REVISION_NOT_FOUND'});
  await assert.rejects(() => service.run(scope,solutionId,revisionId,{...command,confirmSyntheticFailure:false},'probe_0001'));
  await assert.rejects(() => service.run(scope,solutionId,revisionId,{...command,expectedVersion:3},'probe_0001'),{code:'SOLUTION_REVISION_CHANGED'});
  assert.equal(calls,0);
  check('durable_admission_success_and_idempotency');
  const first=await service.run(scope,solutionId,revisionId,command,'probe_0001');
  assert.equal(first.probe.status,'succeeded'); assert.equal(calls,1);
  assert.equal(first.probe.coverage,'handler_with_synthetic_failure');
  assert.equal((await service.run(scope,solutionId,revisionId,command,'probe_0001')).replayed,true);
  assert.equal(calls,1);
  await assert.rejects(() => service.run(scope,solutionId,revisionId,{...command,expectedVersion:1},'probe_0001'),{code:'FAILURE_PROBE_KEY_REUSED'});
  check('real_rls_and_immutable_evidence');
  await transaction({...scope,userId:'user_other'},async(client) => {
    assert.equal((await client.query('SELECT id FROM orqaly.solution_failure_probes')).rows.length,0);
  });
  await assert.rejects(() => transaction(scope,(client) => client.query('SELECT id FROM orqaly.solution_failure_probes'),'orqaly_worker'),{code:'42501'});
  await assert.rejects(() => transaction(scope,(client) => client.query("UPDATE orqaly.solution_failure_probes SET status='failed' WHERE id=$1",[first.probe.id])),{code:'42501'});
  check('insert_requires_clean_exact_owned_current_source');
  const firstStored=(await db.query('SELECT * FROM orqaly.solution_failure_probes WHERE id=$1',[first.probe.id])).rows[0];
  const cleanInsert=()=>({...structuredClone(firstStored),id:randomUUID(),idempotency_key:`probe_${randomUUID()}`,
    status:'running',evidence:null,error_code:null,completed_at:null,cleanup_state:'pending',cleanup_evidence:null});
  const insert=(value)=>transaction(scope,(client)=>client.query(
    'INSERT INTO orqaly.solution_failure_probes SELECT (jsonb_populate_record(NULL::orqaly.solution_failure_probes,$1::jsonb)).* RETURNING *',[value]));
  for(const patch of [
    {status:'succeeded',completed_at:new Date().toISOString()}, {cleanup_state:'removed'}, {evidence:{}}, {error_code:'forged'},
    {completed_at:new Date().toISOString()}, {cleanup_evidence:{}}, {source_row_version:1}, {source_version:3},
    {workflow_hash:'a'.repeat(64)}, {environment_id:'wrong-environment'}, {owner_user_id:'user_other'},
    {solution_id:randomUUID()}, {revision_id:randomUUID()}, {dependency_id:'wrong-handler'},
    {source_snapshot:{...firstStored.source_snapshot,sourceVersion:3}},
    {source_snapshot:{...firstStored.source_snapshot,workflowHash:'a'.repeat(64)}},
    {source_snapshot:{...firstStored.source_snapshot,bundleHash:'a'.repeat(64)}},
    {source_snapshot:{...firstStored.source_snapshot,environmentId:'wrong-environment'}},
    {source_snapshot:{...firstStored.source_snapshot,workflow:{...source.workflow,name:'different-source'}}},
    {source_snapshot:{...firstStored.source_snapshot,spec:{...source.spec,requirements:[]}}},
    {source_snapshot:{...firstStored.source_snapshot,extraAuthority:true}},
  ]) await assert.rejects(()=>insert({...cleanInsert(),...patch}),{code:'42501'});
  const canonicalInsert=(await insert({...cleanInsert(),created_at:'2000-01-01T00:00:00Z'})).rows[0];
  assert(new Date(canonicalInsert.created_at).getTime()>Date.now()-30000,'server_owned_probe_age');
  await transaction(scope,(client)=>client.query("UPDATE orqaly.solution_failure_probes SET status='outcome_unknown',completed_at=clock_timestamp(),cleanup_state='removed' WHERE id=$1",[canonicalInsert.id]));
  check('unknown_is_not_replayed_or_passed_and_cleanup_is_separate');
  uncertain=true;
  const unknown=await service.run(scope,solutionId,revisionId,command,'probe_0002');
  assert.equal(unknown.probe.status,'outcome_unknown'); assert.equal(calls,2);
  await service.run(scope,solutionId,revisionId,command,'probe_0002'); assert.equal(calls,2);
  await assert.rejects(() => service.run(scope,solutionId,revisionId,command,'probe_0003'),{code:'FAILURE_PROBE_UNRESOLVED'});
  check('suspended_tenant_denied_new_tests_but_resolved_owner_can_clean_exact_probe');
  await db.query("UPDATE orqaly.tenants SET status='suspended' WHERE id=$1",[tenantId]);
  await assert.rejects(()=>service.read(scope,solutionId,revisionId),{code:'TENANT_SUSPENDED'});
  await assert.rejects(()=>service.run(scope,solutionId,revisionId,command,'probe_suspended'),{code:'TENANT_SUSPENDED'});
  await assert.rejects(()=>insert(cleanInsert()),{code:'42501'});
  const reconciled=await service.reconcile(scope,solutionId,revisionId,unknown.probe.id);
  assert.equal(reconciled.probe.status,'outcome_unknown');
  assert.equal(reconciled.probe.cleanupState,'removed'); assert.equal(calls,2);
  // This tests an already resolved owner scope; the real identity resolver's
  // suspension denial remains unchanged and needs operator cleanup if reached.
  await db.query("UPDATE orqaly.tenants SET status='active' WHERE id=$1",[tenantId]);
  check('completion_losing_race_returns_authoritative_unknown_not_stale_success');
  uncertain=false;
  beforeProbeResult=async(input)=>transaction(scope,(client)=>client.query(
    "UPDATE orqaly.solution_failure_probes SET status='outcome_unknown',completed_at=clock_timestamp(),cleanup_state='removed' WHERE id=$1",[input.probeId]));
  const raced=await service.run(scope,solutionId,revisionId,command,'probe_raced_result');
  assert.equal(raced.probe.status,'outcome_unknown'); assert.equal(raced.probe.cleanupState,'removed');
  beforeProbeResult=null;
  check('concurrent_cleanup_returns_authoritative_removed_state');
  uncertain=true;
  const pendingCleanup=await service.run(scope,solutionId,revisionId,command,'probe_raced_cleanup');
  beforeReconcileResult=async(input)=>transaction(scope,(client)=>client.query(
    "UPDATE orqaly.solution_failure_probes SET cleanup_state='removed',cleanup_evidence='{}' WHERE id=$1",[input.probeId]));
  const cleanupRace=await service.reconcile(scope,solutionId,revisionId,pendingCleanup.probe.id);
  assert.equal(cleanupRace.probe.status,'outcome_unknown'); assert.equal(cleanupRace.probe.cleanupState,'removed');
  beforeReconcileResult=null;
  check('source_candidate_never_mutated_or_marked_tested');
  const saved=(await db.query('SELECT workflow_hash,row_version,status,tested_at FROM orqaly.solution_revisions WHERE id=$1',[revisionId])).rows[0];
  assert.equal(saved.workflow_hash,source.workflowHash); assert.equal(saved.row_version,0);
  assert.equal(saved.status,'draft'); assert.equal(saved.tested_at,null);
  process.stdout.write('PASS real PostgreSQL boundaries; runtime evidence is explicitly synthetic.\n');
} catch(error) {
  process.stderr.write(`FAIL ${stage}: ${error.code || error.name}: ${error.message}\n`); process.exitCode=1;
} finally {
  db?.release(); await pool?.end();
  if(started) docker(['rm','--force',container]);
}
