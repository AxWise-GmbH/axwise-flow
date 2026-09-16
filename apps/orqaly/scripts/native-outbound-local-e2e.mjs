import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSolutionRuntime } from '../server/workflow-v2/solution-runtime.js';
import { createBoundedHttpPolicy, reviewNativeWorkflow } from '../server/workflow-v2/native-workflow-review.js';
import { normalizeNativeWorkflow } from '../server/workflow-v2/native-workflow-runtime-contract.js';
import { describeNativeConnection, bindNativeConnections } from '../server/workflow-v2/native-workflow-connections.js';
import { BOUNDED_HTTP_PACKAGE_HASH } from '../server/workflow-v2/native-outbound-policy.js';
import { nativeOutboundFixture } from './fixtures/native-outbound-workflow.mjs';

// No external provider, live credentials, or private-address bypass. Both actual
// n8n and TLS receiver live on an INTERNAL Docker network. Its synthetic public
// unicast addresses exercise the production IP guard unchanged; no internet
// route exists. An ephemeral local CA verifies the synthetic DNS identity.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const suffix = randomUUID().slice(0, 12); const network = `orqaly-outbound-${suffix}`;
const n8n = `${network}-n8n`; const receiver = `${network}-receiver`;
const temp = mkdtempSync(join(tmpdir(), 'orqaly-outbound-tls-'));
const docker = (args) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }).trim();
const image = 'n8nio/n8n:2.37.10'; let networkCreated = false; let n8nStarted = false; let receiverStarted = false;
const scope = { tenantId: randomUUID(), userId: 'user_outboundFixture' };
const policy = createBoundedHttpPolicy({ imageDigest: `sha256:${'a'.repeat(64)}` });
const expectedSecret = `Synthetic-receiver-${randomUUID()}`;
const fetchInN8n = async (url, options = {}) => {
  const script = 'let raw="";process.stdin.on("data",x=>raw+=x);process.stdin.on("end",async()=>{try{const v=JSON.parse(raw);const r=await fetch(v.url,{method:v.method,headers:v.headers,body:v.body,redirect:"error",signal:AbortSignal.timeout(60000)});process.stdout.write(JSON.stringify({status:r.status,headers:[...r.headers],cookies:r.headers.getSetCookie(),body:await r.text()}))}catch{process.exitCode=2}})';
  let value;
  try { value = JSON.parse(execFileSync('docker',['exec','-i',n8n,'node','-e',script], {encoding:'utf8',input:JSON.stringify({url,method:options.method??'GET',headers:Object.fromEntries(new Headers(options.headers??{})),body:options.body}),stdio:['pipe','pipe','pipe']})); }
  catch { throw new Error('outbound_local_management_unavailable'); }
  const headers = new Headers(value.headers); headers.delete('set-cookie'); for(const cookie of value.cookies)headers.append('set-cookie',cookie);
  return new Response(value.body,{status:value.status,headers});
};
try {
  execFileSync('openssl', ['req','-x509','-newkey','rsa:2048','-noenc','-keyout',join(temp,'key.pem'),'-out',join(temp,'cert.pem'),'-days','1',
    '-subj','/CN=outbound-fixture.orqaly.example','-addext','subjectAltName=DNS:outbound-fixture.orqaly.example'], { stdio: 'ignore' });
  docker(['network','create','--internal','--subnet','93.184.217.0/24',network]); networkCreated = true;
  docker(['run','-d','--pull=never','--name',receiver,'--network',network,'--ip','93.184.217.20','--user','0',
    '-v',`${temp}:/fixture:ro`,'-v',`${join(root,'scripts/fixtures/native-outbound-receiver.cjs')}:/receiver.cjs:ro`,
    '-e',`SYNTHETIC_RECEIVER_KEY=${expectedSecret}`,'--entrypoint','node',image,'/receiver.cjs']); receiverStarted = true;
  docker(['run','-d','--pull=never','--name',n8n,'--network',network,'--ip','93.184.217.21','--add-host','outbound-fixture.orqaly.example:93.184.217.20',
    '-v',`${join(root,'infra/n8n/nodes-orqaly-bounded-http')}:/opt/orqaly-custom/nodes-orqaly-bounded-http:ro`,
    '-v',`${join(temp,'cert.pem')}:/fixture-ca.pem:ro`,'-e','NODE_EXTRA_CA_CERTS=/fixture-ca.pem',
    '-e','NODE_PATH=/usr/local/lib/node_modules/n8n/node_modules','-e','N8N_CUSTOM_EXTENSIONS=/opt/orqaly-custom/nodes-orqaly-bounded-http',
    '-e',`NODES_INCLUDE=${JSON.stringify([...new Set(policy.allowedNodes.map(node=>node.type))])}`,
    '-e','NODES_EXCLUDE=["n8n-nodes-base.executeCommand","n8n-nodes-base.readWriteFile","n8n-nodes-base.httpRequest","n8n-nodes-base.code"]',
    '-e','N8N_SSRF_PROTECTION_ENABLED=true','-e','N8N_BLOCK_ENV_ACCESS_IN_NODE=true','-e','N8N_BLOCK_FILE_ACCESS_TO_N8N_FILES=true',
    '-e','N8N_DIAGNOSTICS_ENABLED=false','-e','N8N_VERSION_NOTIFICATIONS_ENABLED=false','-e','N8N_TEMPLATES_ENABLED=false','-e','N8N_SECURE_COOKIE=false',image]); n8nStarted = true;
  // An internal Docker network deliberately has no published host port. Use
  // docker exec only for fixture management; delivery still traverses real TLS.
  const origin = 'http://127.0.0.1:5678';
  let ready = false;
  for(let attempt=0;attempt<100;attempt++) { try { const res=await fetchInN8n(`${origin}/rest/settings`); if(res.ok && (await res.json()).data){ready=true;break;} }catch{} await new Promise(resolve=>setTimeout(resolve,500)); }
  assert.equal(ready,true,'actual n8n ready'); console.log('Pinned n8n ready; controlled TLS receiver isolated from internet.');
  const setup=await fetchInN8n(`${origin}/rest/owner/setup`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'outbound@example.test',firstName:'Synthetic',lastName:'Owner',password:`SyntheticA9!${randomUUID()}`})});
  assert.equal(setup.ok,true,'synthetic owner setup'); const cookie=setup.headers.getSetCookie().map(entry=>entry.split(';')[0]).join('; ');
  const keyResponse=await fetchInN8n(`${origin}/rest/api-keys`,{method:'POST',headers:{'content-type':'application/json',cookie},body:JSON.stringify({label:'Disposable bounded outbound proof',expiresAt:Math.floor(Date.now()/1000)+3600,scopes:['workflow:create','workflow:read','workflow:list','workflow:delete','workflow:activate','workflow:deactivate','execution:list','execution:read','credential:create','credential:read','credential:delete']})});
  assert.equal(keyResponse.ok,true,'synthetic scoped management key'); const apiKey=(await keyResponse.json()).data.rawApiKey;
  const environmentId='outbound-local-environment';
  const runtime=createSolutionRuntime({bindings:[{...scope,id:environmentId,name:'Local bounded outbound',region:'local',origin,apiKey,useIdToken:false,nativePolicy:policy}],allowLocalHttp:true,fetchImpl:fetchInN8n});
  const receipts=[];
  for(const path of ['ok','redirect','disconnect','compressed']) {
    const f=nativeOutboundFixture(`https://outbound-fixture.orqaly.example/${path}`); const connectionId=randomUUID();
    const described=describeNativeConnection({requirement:f.spec.connections[0],workflow:f.workflow,environmentId}); assert.ok(described.scope);
    const credential=await runtime.createNativeCredential(scope,{environmentId,connectionId,type:'orqalyBoundedHttp',scope:described.scope,data:{name:'Authorization',value:expectedSecret}});
    const connection={id:connectionId,tenant_id:scope.tenantId,owner_user_id:scope.userId,environment_id:environmentId,requirement_id:'receiver',credential_type:'orqalyBoundedHttp',provider_credential_id:credential.id,scope:described.scope,status:'saved'};
    const bound=bindNativeConnections(f.workflow,f.spec,[connection],environmentId);
    const testId=randomUUID(); const artifact=normalizeNativeWorkflow({workflow:bound,id:testId,controlledTest:true});
    const review=reviewNativeWorkflow({workflow:{...artifact.workflow,settings:{...artifact.workflow.settings,saveDataErrorExecution:'none'}},spec:f.spec,runtimePolicy:policy,connections:[connection],environmentId});
    assert.equal(review.execution.allowed,true,JSON.stringify(review.execution.reasons));
    const result=await runtime.testNative(scope,{environmentId,workflow:artifact.workflow,spec:f.spec,testId,invocationId:randomUUID(),input:{event:'ready'},nativeConnections:[connection],allowExternalEffects:true});
    assert.equal(result.cleanup?.status,'removed');
    assert.ok(!JSON.stringify(result).includes(expectedSecret)); assert.ok(!JSON.stringify(result).includes(apiKey));
    if(path==='ok'){ assert.equal(result.status,'succeeded');assert.equal(result.output.delivery,'accepted');assert.equal(result.outboundDelivery.delivery,'accepted');assert.deepEqual(result.executedNodeIds,['deliver']); }
    if(path==='redirect'){ assert.equal(result.status,'succeeded');assert.equal(result.output.delivery,'rejected');assert.equal(result.output.diagnosticCode,'OUTBOUND_REDIRECT_DENIED'); }
    if(['disconnect','compressed'].includes(path)) assert.equal(result.status,'outcome_unknown');
    await runtime.revokeNativeCredential(scope,{environmentId,connectionId,credentialId:credential.id});
    receipts.push({case:path,status:result.status,executionId:result.executionId??null,cleanup:result.cleanup.status});
    console.log(JSON.stringify(receipts.at(-1)));
  }
  const receiverProof=JSON.parse(docker(['exec',receiver,'node','-e','fetch("http://127.0.0.1:8080").then(r=>r.text()).then(console.log)']));
  assert.deepEqual(receiverProof.counts,{'/ok':1,'/redirect':1,'/disconnect':1,'/compressed':1}); assert.equal(receiverProof.authenticated,4);assert.equal(receiverProof.leakedIncomingAuth,false);
  console.log(JSON.stringify({passed:true,packageHash:BOUNDED_HTTP_PACKAGE_HASH,receiver:receiverProof,receipts,cloudChanges:false}));
} finally {
  if(n8nStarted) docker(['rm','-f',n8n]); if(receiverStarted) docker(['rm','-f',receiver]); if(networkCreated) docker(['network','rm',network]);
  // Ephemeral synthetic TLS artifacts remain in the task-specific temp directory
  // for audit; no real credentials or user data were written there.
}
