// Disposable real PostgreSQL16 proof. No production DB, credentials or rows.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import express from 'express';
import { createPostgresRepositories } from '../server/workflow-v2/postgres-repository.js';
import { compileSolutionWorkflow } from '../server/workflow-v2/solution-compiler.js';
import { createPostgresCodingStore } from '../server/workflow-v2/coding-worker-postgres.js';
import { createCodingWorkerService } from '../server/workflow-v2/coding-worker-service.js';
import { createCodingWorkerRouter, createCodingDispatchRouter } from '../server/workflow-v2/coding-worker-http.js';
import { createDockerCodingSandbox } from '../server/workflow-v2/coding-worker-docker.js';
import { codingHash, contentHash } from '../server/workflow-v2/coding-worker-contracts.js';
import { runCodingNativeLocalAcceptance } from './coding-worker-native-local.mjs';

const suffix=randomBytes(6).toString('hex'), name=`orqaly-coding-pg-${suffix}`, password=randomBytes(24).toString('hex');
const docker=(args,env={})=>execFileSync('docker',args,{encoding:'utf8',env:{...process.env,...env},stdio:['ignore','pipe','pipe']}).trim();
let started=false,admin,repository,worker,api,server,phase='start';
const check=(name)=>{phase=name;console.log(`check: ${name}`);};
try {
  docker(['run','-d','--name',name,'--publish','127.0.0.1::5432','-e','POSTGRES_PASSWORD','postgres:16'],{POSTGRES_PASSWORD:password});started=true;
  const port=docker(['port',name,'5432/tcp']).match(/^127\.0\.0\.1:(\d+)$/)[1];
  for(let i=0;i<60;i++){try{docker(['exec',name,'pg_isready','-h','127.0.0.1','-U','postgres']);break;}catch{await delay(250);}}
  admin=new pg.Client({connectionString:`postgresql://postgres:${password}@127.0.0.1:${port}/postgres`});await admin.connect();
  check('actual additive migrations through017');
  for(const file of(await readdir('database/workflow-v2/migrations')).filter(file=>/^\d{3}.*\.sql$/.test(file)&&Number(file.slice(0,3))<=17).sort()){
    phase=file;await admin.query(await readFile(`database/workflow-v2/migrations/${file}`,'utf8'));
  }
  for(const role of ['identity','api','worker'])await admin.query(`CREATE ROLE coding_test_${role} LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS IN ROLE orqaly_${role}`);
  const url=role=>`postgresql://coding_test_${role}:${password}@127.0.0.1:${port}/postgres`;
  repository=createPostgresRepositories({environment:'preview',identityDatabaseUrl:url('identity'),apiDatabaseUrl:url('api'),workerDatabaseUrl:url('worker'),requireCoding:true});
  worker=createPostgresRepositories({environment:'preview',workerDatabaseUrl:url('worker'),requireCoding:true});
  await repository.readiness();await worker.readiness();
  api=new pg.Client({connectionString:url('api')});await api.connect();
  const auth={userId:`user_code${suffix}`},other={userId:`user_other${suffix}`};const tenantId=await repository.resolveTenant(auth);
  await admin.query("INSERT INTO orqaly.tenant_identity_bindings(tenant_id,environment,subject_type,subject_id) VALUES($1,'preview','user',$2)",[tenantId,other.userId]);
  const runId=randomUUID(),otherRun=randomUUID();
  for(const [id,owner]of[[runId,auth.userId],[otherRun,other.userId]])await admin.query(`INSERT INTO orqaly.workflow_runs(tenant_id,id,owner_user_id,mode,status,contract_version,request_hash,request_payload)
    VALUES($1,$2,$3,'simple','completed','orqaly.workflow.v2',$4,$5)`,[tenantId,id,owner,codingHash({id}),{request:'Fix the addition function; no external repository action.'}]);
  const solutionId=randomUUID(),spec={kind:'webhook_transform_v1',fields:[{source:'name',target:'name',transform:'trim'}]};const compiled=compileSolutionWorkflow({id:solutionId,spec});
  await admin.query(`INSERT INTO orqaly.customer_solutions(tenant_id,id,owner_user_id,agent_id,name,purpose,spec,agent_snapshot,workflow,workflow_hash,create_key,create_hash,status)
    VALUES($1,$2,$3,$4,'Coding security fixture','Disposable local proof',$5,$6,$7,$8,$9,$8,'draft')`,[tenantId,solutionId,auth.userId,randomUUID(),spec,{name:'Fixture',profileVersion:1},compiled.workflow,compiled.workflowHash,`fixture_${solutionId}`]);
  const scope={tenantId,userId:auth.userId,solutionId,runId};const store=createPostgresCodingStore(repository);
  const sandbox=createDockerCodingSandbox({image:'sha256:307d6065be25619aa24cfc63a7c2f04ca56d084a08c05c8e9f189a89f353b1ec',isolation:'local_fixture',allowLocalFixture:true});
  const signingKey=randomBytes(32);const service=createCodingWorkerService({repository,store,sandbox,signingKey});
  const workerService=()=>createCodingWorkerService({repository:worker,store:createPostgresCodingStore(worker),sandbox,signingKey});
  const source='export const add=(a,b)=>a-b;';
  const proposal={kind:'node_source_patch_v1',title:'Fix addition',source:[{path:'add.mjs',content:source}],changes:[{path:'add.mjs',previousHash:contentHash(source),content:'export const add=(a,b)=>a+b;'}],
    tests:[{path:'add.test.mjs',content:"import test from 'node:test';import assert from 'node:assert/strict';import {add} from '/workspace/add.mjs';test('adds',()=>assert.equal(add(2,3),5));"}],outputs:['add.mjs'],timeoutMs:10000};
  const make=async()=>{let job=(await service.create(auth,solutionId,{runId,proposal},randomUUID())).job;
    job=(await service.approve(auth,solutionId,job.id,{runId,expectedVersion:job.rowVersion,specHash:job.specHash},randomUUID())).job;return job;};
  check('same-tenant different owner/run denied; immutable approval/spec and worker-only claim');
  const first=await make();
  await assert.rejects(service.read(other,solutionId,first.id,{runId}),{code:'CODING_SCOPE_NOT_FOUND'});
  await assert.rejects(service.create(auth,solutionId,{runId:otherRun,proposal},randomUUID()),{code:'CODING_SCOPE_NOT_FOUND'});
  await assert.rejects(api.query('SELECT orqaly.claim_solution_coding_job($1)',[randomUUID()]),{code:'42501'});
  const tx=fn=>repository.solutionBuildTransaction(scope,fn);
  await assert.rejects(tx(c=>c.query("UPDATE orqaly.solution_coding_jobs SET approval_id=$3,row_version=row_version+1 WHERE tenant_id=$1 AND id=$2",[tenantId,first.id,randomUUID()])),{code:'42501'});
  await assert.rejects(tx(c=>c.query("UPDATE orqaly.solution_coding_jobs SET spec='{}' WHERE tenant_id=$1 AND id=$2",[tenantId,first.id])),{code:'42501'});
  await assert.rejects(tx(c=>c.query(`INSERT INTO orqaly.solution_coding_jobs(tenant_id,id,owner_user_id,solution_id,run_id,spec,spec_hash,request_key,status,approval_id,approved_at)
    SELECT tenant_id,$3,owner_user_id,solution_id,run_id,spec,spec_hash,$4,'approved',$5,clock_timestamp() FROM orqaly.solution_coding_jobs WHERE tenant_id=$1 AND id=$2`,[tenantId,first.id,randomUUID(),randomUUID(),randomUUID()])),{code:'42501'});
  await assert.rejects(tx(c=>c.query(`INSERT INTO orqaly.solution_coding_jobs(tenant_id,id,owner_user_id,solution_id,run_id,spec,spec_hash,request_key)
    SELECT tenant_id,$3,owner_user_id,solution_id,$4,spec,spec_hash,$5 FROM orqaly.solution_coding_jobs WHERE tenant_id=$1 AND id=$2`,[tenantId,first.id,randomUUID(),otherRun,randomUUID()])),{code:'42501'});
  assert.equal((await api.query('SELECT count(*)::int AS n FROM orqaly.solution_coding_jobs')).rows[0].n,0);
  for(const fn of['guard_solution_coding_job()','guard_solution_coding_dispatch()'])assert.equal((await admin.query("SELECT has_function_privilege('public',$1,'EXECUTE') AS yes",[`orqaly.${fn}`])).rows[0].yes,false);
  check('HTTP owner approval -> signed broker202 -> restarted worker actual code and immutable artifact');
  const app=express();app.use('/coding/v1',createCodingDispatchRouter({service}));app.use(express.json());app.use((req,_res,next)=>{req.authContext=auth;next();});
  app.use('/v2/solutions/:solutionId/coding-jobs',createCodingWorkerRouter({service}));
  server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(`${origin}/v2/solutions/${solutionId}/coding-jobs/${first.id}/dispatch-capability`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,404);
  const capability=await service.dispatchCapability(auth,solutionId,first.id,{runId,specHash:first.specHash});
  const request=extra=>fetch(`${origin}/coding/v1/jobs/${first.id}/dispatch`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${capability.token}`,...extra},body:JSON.stringify({specHash:first.specHash})});
  assert.equal((await request({Origin:'https://evil.example'})).status,403);assert.equal((await request({Cookie:'session=not-authority'})).status,403);
  const accepted=await request();assert.equal(accepted.status,202);assert.equal((await accepted.json()).job.status,'queued');
  const result=await workerService().advanceOne();assert.deepEqual(result,{processed:true,jobId:first.id,status:'succeeded'});
  const done=(await service.read(auth,solutionId,first.id,{runId})).job;assert.equal(done.artifacts[0].content,'export const add=(a,b)=>a+b;');assert.equal(done.evidence.command.exitCode,0);
  assert.equal((await(await request()).json()).replayed,true);assert.deepEqual(await workerService().advanceOne(),{processed:false});
  await assert.rejects(tx(c=>c.query("UPDATE orqaly.solution_coding_jobs SET status='queued',row_version=row_version+1 WHERE tenant_id=$1 AND id=$2",[tenantId,first.id])),{code:'42501'});
  check('concurrent claims globally serialized; uncertain cleanup bars next queued job');
  const second=await make(),third=await make();
  for(const job of[second,third]){const cap=await service.dispatchCapability(auth,solutionId,job.id,{runId,specHash:job.specHash});await service.dispatch(cap.token,job.id,job.specHash);}
  await assert.rejects(tx(c=>c.query("UPDATE orqaly.solution_coding_jobs SET status='running',execution_id=$3,row_version=row_version+1 WHERE tenant_id=$1 AND id=$2",[tenantId,second.id,randomUUID()])),{code:'42501'});
  const claims=await Promise.all([worker.claimCodingJob(randomUUID()),worker.claimCodingJob(randomUUID())]);assert.equal(claims.filter(Boolean).length,1);
  const claimed=claims.find(Boolean);const row=await store.read(scope,claimed.jobId);
  await store.transition(scope,row.id,{from:['running'],status:'outcome_unknown',evidence:{specHash:row.spec_hash,executionId:row.execution_id,cleanup:{status:'pending'},failureCode:'SYNTHETIC_INTERRUPTED_DISPATCH'},artifacts:[]});
  assert.equal(await worker.claimCodingJob(randomUUID()),null);
  const unknown=await store.read(scope,row.id);
  await assert.rejects(store.transition(scope,row.id,{from:['outcome_unknown'],status:'succeeded',evidence:{...unknown.evidence,cleanup:{status:'removed'}}}),{code:'42501'});
  await store.transition(scope,row.id,{from:['outcome_unknown'],status:'outcome_unknown',evidence:{...unknown.evidence,cleanup:{status:'removed'}}});
  const next=await worker.claimCodingJob(randomUUID());assert.ok(next);assert.notEqual(next.jobId,row.id);
  await store.transition(scope,next.jobId,{from:['running'],status:'outcome_unknown',evidence:{specHash:third.specHash,executionId:next.executionId,cleanup:{status:'removed'},failureCode:'SYNTHETIC_NO_EXECUTION'},artifacts:[]});
  check('durable single n8n dispatch intent, exact scope and terminal immutability');
  const fourth=await make();const intent=await store.beginDispatch(scope,fourth.id,{id:randomUUID(),key:randomUUID(),expectedVersion:fourth.rowVersion,environmentId:'local-native'});assert.equal(intent.created,true);
  const replay=await store.beginDispatch(scope,fourth.id,{id:randomUUID(),key:randomUUID(),expectedVersion:fourth.rowVersion,environmentId:'local-native'});assert.equal(replay.created,false);assert.equal(replay.dispatch.id,intent.dispatch.id);
  await store.updateDispatch(scope,intent.dispatch.id,{credentialId:'synthetic-provider-id'});
  await store.updateDispatch(scope,intent.dispatch.id,{status:'outcome_unknown',evidence:{workflowCleanup:'pending',credentialCleanup:'pending'}});
  await assert.rejects(store.updateDispatch(scope,intent.dispatch.id,{status:'accepted'}),{code:'CODING_DISPATCH_STATE_CONFLICT'});
  await store.updateDispatch(scope,intent.dispatch.id,{status:'outcome_unknown',cleanupOnly:true,evidence:{workflowCleanup:'removed',credentialCleanup:'removed'}});
  assert.equal((await service.read(auth,solutionId,fourth.id,{runId})).job.orchestration.status,'outcome_unknown');
  check('real n8n graph -> TLS broker -> durable queue -> reconstructed worker -> actual code test and artifact');
  await runCodingNativeLocalAcceptance({scope,repository,store,sandbox,workerService,postgresContainer:name,password,proposal,signingKey});
  console.log(JSON.stringify({passed:true,postgres:16,actualDockerCodeTest:true,nativeN8nExecution:true,cloudChanges:false}));
}catch(error){console.error(JSON.stringify({phase,code:error.code||error.name,message:String(error.message).slice(0,500)}));process.exitCode=1;}
finally{if(server)await new Promise(resolve=>server.close(resolve));await api?.end();await repository?.close();await worker?.close();await admin?.end();if(started)docker(['rm','-f',name]);}
