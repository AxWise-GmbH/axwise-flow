#!/usr/bin/env node
// Backend comparison: real Goose ACP and Orqanix production model router, no Electron UI.
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile,access} from 'node:fs/promises';
import {dirname,join,isAbsolute,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {AcpClient,redact,sessionInventory} from './benchmark-goose-reset.mjs';
import {authenticate} from './benchmark-local-axwise.mjs';
import {resolveLanguageServers} from './benchmark-native-engineering.mjs';
import {plan,WireRecorder} from './benchmark-orqanix-efficiency.mjs';
import {prepareFixture,evaluate} from './lib/orqanix-efficiency-tasks.mjs';
import {preflight as preflightBoundary} from './lib/orqanix-selection-sandbox.mjs';
import {startBenchmarkRelay} from './lib/orqanix-benchmark-relay.mjs';
import {startScopedRelay} from './lib/orqanix-scoped-benchmark-relay.mjs';
const sha=v=>createHash('sha256').update(v).digest('hex');
const delay=ms=>new Promise(done=>setTimeout(done,ms));
const native=['ast_search','lsp_query','hashline_edit','safe_edit_and_test'];
export function options(args){
 const o={preflight:false,live:false,timeoutSeconds:360};
 for(let i=0;i<args.length;i++){
  const arg=args[i];if(['--preflight','--live'].includes(arg)){o[arg.slice(2)]=true;continue;}
  if(!['--app','--output','--only-keys'].includes(arg)||!args[i+1])throw Error('INVALID_OPTION');
  o[arg.slice(2).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=args[++i];
 }
 if(o.live===o.preflight)throw Error('CHOOSE_PREFLIGHT_OR_LIVE');
 if(!isAbsolute(o.app||'')||!isAbsolute(o.output||''))throw Error('ABSOLUTE_PATHS_REQUIRED');
 return o;
}
export function backendEnvironment({profile,tmp,runtime,lsp,capability,boundary,arm},source=process.env){
 const env={};for(const k of ['HOME','USER','LOGNAME','SHELL','LANG','LC_ALL','TZ'])if(source[k])env[k]=source[k];
 return {...env,PATH:`${join(runtime,'node/bin')}:/usr/bin:/bin:/usr/sbin:/sbin`,TMPDIR:tmp+'/',
  GOOSE_PATH_ROOT:profile,GOOSE_PROVIDER:'orqaly',GOOSE_MODEL:'orqaly-gemini',GOOSE_MODE:'auto',GOOSE_STATE_MACHINE:'0',
  GOOSE_NATIVE_LSP_SERVERS:JSON.stringify(lsp.servers),GOOSE_DISABLE_TELEMETRY:'true',GOOSE_TELEMETRY_ENABLED:'false',
  GOOSE_SERVER__SECRET_KEY:'local-capability-auth-marker',ORQANIX_BENCHMARK_CAPABILITY:capability,
  ORQANIX_BENCHMARK_BOUNDARY:boundary,ORQANIX_BENCHMARK_ARM:arm,GIT_CONFIG_GLOBAL:'/dev/null',GIT_CONFIG_NOSYSTEM:'1',GIT_OPTIONAL_LOCKS:'0'};
}
class BackendClient extends AcpClient {
 send(message){this.wire?.frame('sent',JSON.stringify(message));super.send(message);}
 async onRequest(message){
  this.send({jsonrpc:'2.0',id:message.id,error:{code:-32601,message:'Unexpected client request in autonomous fixture'}});
  this.fail(new Error('UNEXPECTED_CLIENT_REQUEST:'+message.method));
 }
}
async function runRow(test,o,relay,auth,lsp,template){
 const directory=join(o.output,test.key);await mkdir(directory,{mode:0o700});
 const fixture=await prepareFixture(join(directory,'fixture'),test.difficulty,o.runtime);
 const profile=join(directory,'profile'),tmp=join(directory,'tmp');
 await mkdir(join(profile,'config/custom_providers'),{recursive:true,mode:0o700});await mkdir(tmp,{mode:0o700});
 const boundary=await preflightBoundary({appBundle:o.app,profile,workspace:fixture.workspace,tmp});
 const boundaryFile=join(directory,'filesystem-boundary.sb');await writeFile(boundaryFile,boundary.profile,{mode:0o600});
 const capability=relay.activateAuth({oauthToken:auth.token,trial:test.key,resolveOAuthToken:auth.resolveToken});
 const provider={...template,base_url:relay.url,headers:{'X-Orqaly-Account-Hash':auth.accountHash}};
 await writeFile(join(profile,'config/custom_providers/orqaly.json'),JSON.stringify(provider),{mode:0o600});
 await writeFile(join(profile,'config/config.yaml'),JSON.stringify({GOOSE_PROVIDER:'orqaly',GOOSE_MODEL:'orqaly-gemini',GOOSE_MODE:'auto',extensions:{developer:{enabled:true,type:'platform',name:'developer'},todo:{enabled:true,type:'platform',name:'todo'},native_engineering:{enabled:false,type:'platform',name:'native_engineering'}}}),{mode:0o600});
 const wire=new WireRecorder();let transcript='',sessionId,progressTimer,started;
 const row={...test,startedAt:new Date().toISOString(),directory,workspace:fixture.workspace,decisions:[],confinedAuthVerified:true,
  flagsAppliedVia:'Goose ACP platform extension mount',boundary:{sha256:boundary.sha256,checks:boundary.checks,description:boundary.boundary}};
 const setupAt=Date.now();
 const client=new BackendClient(join(o.app,'Contents/Resources/bin/goose'),['acp','--with-builtin','developer,todo','--enable-scheduler'],{
  cwd:fixture.workspace,env:backendEnvironment({profile,tmp,runtime:o.runtime,lsp,capability,boundary:boundaryFile,arm:test.arm}),secrets:[capability]});
 client.wire=wire;client.recorder={update(message){wire.frame('received',JSON.stringify(message));const u=message.params?.update;if(u?.sessionUpdate==='agent_message_chunk'&&u.content?.type==='text')transcript+=u.content.text||'';}};
 try{
  await client.request('initialize',{protocolVersion:1,clientInfo:{name:'orqanix-efficiency-backend',version:'1'},clientCapabilities:{_meta:{goose:{customNotifications:true,toolCallLabelEnrichment:false}}}},30000);
  const session=await client.request('session/new',{cwd:fixture.workspace,mcpServers:[],_meta:{title:'Synthetic efficiency comparison'}},45000);sessionId=session.sessionId;
  row.configOptions=session.configOptions?.filter(x=>['model','thinking_effort','mode'].includes(x.id));
  await client.request('_goose/unstable/session/extensions/add',{sessionId,extension:{type:'mcp',server:{name:'desktop-utilities',command:lsp.node,args:[join(o.runtime,'connector/src/utilities-mcp.mjs'),'--config',join(o.runtime,'connector/production.config.example.json'),'--conversation-id',sessionId,'--account-hash',auth.accountHash,'--api-url',relay.url],env:[]},description:'Independent weather, currency and grounded search tools. Results are evidence for the conversation; choose other available tools when useful.',timeout:180,bundled:true}},30000);
  if(test.flags.nativeGemsEnabled)await client.request('_goose/unstable/session/extensions/add',{sessionId,extension:{type:'platform',name:'native_engineering'}},15000);
  const [extensions,tools]=await Promise.all([client.request('_goose/unstable/session/extensions/list',{sessionId},15000),client.request('_goose/unstable/tools/list',{sessionId},15000)]);
  row.inventory=sessionInventory(extensions,tools);row.mounts=row.inventory.extensions.map(x=>x.name);const names=row.inventory.tools.map(t=>t.name);
  row.inventoryMatches=native.every(name=>names.includes(name)===test.flags.nativeGemsEnabled)&&!names.some(n=>/execute_typescript|omp__|orqanix_engineering|axwise/.test(n));
  if(!row.inventoryMatches)throw Error('INVENTORY_MISMATCH');
  row.setupMs=Date.now()-setupAt;
  if(o.preflight){row.status='preflight_ready';return row;}
  relay.setTrial(test.key);started=wire.startedAt=Date.now();
  progressTimer=setInterval(()=>console.log(JSON.stringify({event:'progress',key:test.key,elapsedMs:Date.now()-started,toolCalls:wire.tools.size,providerRequests:relay.snapshot(test.key).modelRequests.length})),30000);
  const result=await client.request('session/prompt',{sessionId,prompt:[{type:'text',text:fixture.prompt}]},o.timeoutSeconds*1000);
  row.response={result};row.status=result.stopReason==='end_turn'?'completed':'incomplete';
 }catch(error){row.error=redact(String(error.message),[capability]);row.status=started?(/deadline/.test(error.message)?'timeout':'error'):'harness_or_app_error';}
 finally{
  if(started){row.elapsedMs=Date.now()-started;row.firstActivityMs=wire.firstActivityAt?wire.firstActivityAt-started:null;}
  clearInterval(progressTimer);await client.stop(sessionId);
  row.tools=[...wire.tools.values()];row.transcript=[transcript];
  for(let i=0;i<30&&relay.snapshot(test.key).pending;i++)await delay(100);
  row.telemetry=relay.snapshot(test.key);row.scopedRelay=relay.authSnapshot().find(x=>x.trial===test.key);relay.setTrial(null);relay.deactivateAuth();
  if(!o.preflight){
   row.oracle=await evaluate(fixture,o.runtime,boundaryFile);
   row.actualToolInventory=[...new Set(row.telemetry.modelRequests.flatMap(x=>x.toolNames||[]))];
   row.passed=row.status==='completed'&&row.inventoryMatches&&row.oracle.passed&&row.oracle.originalMutation?.detected===true;
   if(row.telemetry.pending){row.status='unsettled_telemetry';row.passed=false;}
  }
  await writeFile(join(directory,'wire.json'),JSON.stringify(wire.events),{mode:0o600});
  await writeFile(join(directory,'backend.log'),client.stderr,{mode:0o600});
  await writeFile(join(directory,'row.json'),JSON.stringify(row,null,2),{mode:0o600});
 }
 return row;
}
export async function main(args){
 const o=options(args);o.runtime=join(o.app,'Contents/Resources/orqaly-runtime');await mkdir(o.output,{recursive:true,mode:0o700});
 let schedule=plan();if(o.onlyKeys){const keys=o.onlyKeys.split(',');schedule=schedule.filter(r=>keys.includes(r.key));if(schedule.length!==keys.length)throw Error('INVALID_KEYS');}
 const config=join(o.runtime,'connector/production.config.example.json');
 const authOptions={config,node:join(o.runtime,'node/bin/node'),connector:join(o.runtime,'connector')};
 const auth=await authenticate(authOptions),lsp=await resolveLanguageServers({runtime:o.runtime});
 const template=JSON.parse(await readFile(new URL('../review-evidence/2026-09-29/native-efficiency/backend-provider-template.json',import.meta.url),'utf8'));
 const fingerprint={preflight:o.preflight,timeoutSeconds:o.timeoutSeconds,accountHash:auth.accountHash,languageServers:lsp.provenance};
 for(const file of ['bin/goose','bin/goose-baseline','bin/goose-candidate','orqaly-runtime/connector/src/cli.mjs','orqaly-runtime/runtime-manifest.json'])fingerprint[file]=sha(await readFile(join(o.app,'Contents/Resources',file)));
 for(const file of ['benchmark-goose-efficiency.mjs','benchmark-orqanix-efficiency.mjs','benchmark-goose-reset.mjs','benchmark-local-axwise.mjs','benchmark-native-engineering.mjs','lib/orqanix-efficiency-tasks.mjs','lib/orqanix-selection-sandbox.mjs','lib/orqanix-specialist-sandbox.mjs','lib/orqanix-benchmark-relay.mjs','lib/orqanix-scoped-benchmark-relay.mjs'])fingerprint[file]=sha(await readFile(new URL(file,import.meta.url)));
 fingerprint.providerTemplate=sha(JSON.stringify(template));
 const reportFile=join(o.output,'report.json');let report;
 try{report=JSON.parse(await readFile(reportFile,'utf8'));if(JSON.stringify(report.fingerprint)!==JSON.stringify(fingerprint))throw Error('RESUME_FINGERPRINT_MISMATCH');}
 catch(e){if(e.code!=='ENOENT')throw e;report={schema:'orqanix.goose-backend-native-efficiency.v1',startedAt:new Date().toISOString(),fingerprint,schedule:plan(),rows:[],method:'12 Goose backend trials through Orqanix production model router, using ACP stdio instead of Electron. Default previous binary/native off, previous binary/native on, optimized binary/native on x four calibrated TypeScript tasks. Actual default Goose builtins plus developer/todo, scheduler and desktop utilities; native platform extension mounted via ACP. Gemini 3.8 Flash, unspecified effort, legacy loop, Jev/Axwise off, no Code Mode. Fresh Git fixtures/profiles, backend filesystem confinement. 360-second task limit, normal action default, 60-call local capability. Elapsed time is ACP task submission to final response, excluding setup/evaluation. Not desktop UI timing. Parent Keychain OAuth refresh uses the normal connector; real credentials never enter Goose. No model trial retries or replacements. All correctness outcomes retained; one sample per build/task is exploratory.'};}
 const save=()=>writeFile(reportFile,JSON.stringify(report,null,2),{mode:0o600});
 const upstream=await startBenchmarkRelay({connectorConfigPath:config}),scoped=await startScopedRelay(upstream.url);
 const relay={...upstream,url:scoped.url,activateAuth:scoped.activate,deactivateAuth:scoped.deactivate,authSnapshot:scoped.snapshot};
 try{for(const test of schedule){
  if(report.rows.some(r=>r.key===test.key))continue;
  try{await access(join(o.output,'STOP_BEFORE_NEXT_ROW'));report.stoppedBeforeKey=test.key;break;}catch(e){if(e.code!=='ENOENT')throw e;}
  console.log(JSON.stringify({event:'starting',key:test.key}));
  const rowAuth=await authenticate(authOptions);if(rowAuth.accountHash!==auth.accountHash)throw Error('ACCOUNT_CHANGED');
  let latest=rowAuth,refreshedAt=Date.now(),refreshing;
  rowAuth.resolveToken=async()=>{if(Date.now()-refreshedAt<20000)return latest.token;refreshing??=authenticate(authOptions).then(value=>{if(value.accountHash!==auth.accountHash)throw Error('ACCOUNT_CHANGED');latest=value;refreshedAt=Date.now();return value.token;}).finally(()=>{refreshing=null;});return refreshing;};
  const row=await runRow(test,o,relay,rowAuth,lsp,template);report.rows.push(row);await save();
  console.log(JSON.stringify({event:'finished',key:row.key,status:row.status,elapsedMs:row.elapsedMs,passed:row.passed,error:row.error}));
  if(row.status==='harness_or_app_error'||(!o.preflight&&!row.telemetry.modelRequests.length))throw Error('SETUP_REQUIRES_DIAGNOSIS');
 }}finally{await scoped.close();await upstream.close();await save();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main(process.argv.slice(2)).catch(e=>{console.error(e.message);process.exitCode=1;});
