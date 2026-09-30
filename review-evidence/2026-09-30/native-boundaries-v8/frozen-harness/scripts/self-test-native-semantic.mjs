#!/usr/bin/env node
// Separate functional recipe validation; never included in the twelve timed trials.
import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {spawn} from 'node:child_process';
import {authenticate} from './benchmark-local-axwise.mjs';
import {redact} from './benchmark-goose-reset.mjs';
import {preflight} from './lib/orqanix-selection-sandbox.mjs';
import {startBenchmarkRelay} from './lib/orqanix-benchmark-relay.mjs';
import {startScopedRelay} from './lib/orqanix-semantic-scoped-relay.mjs';
const [app,output,recipe]=process.argv.slice(2);
if(![app,output,recipe].every(p=>p?.startsWith('/')))throw Error('ABSOLUTE_PATHS_REQUIRED');
const runtime=join(app,'Contents/Resources/orqaly-runtime'),node=join(runtime,'node/bin/node');
const workspace=join(output,'workspace'),profile=join(output,'profile'),tmp=join(output,'tmp');
for(const p of [workspace,join(profile,'config/custom_providers'),tmp])await mkdir(p,{recursive:true,mode:0o700});
await writeFile(join(workspace,'README.md'),'Disposable native self-test workspace. Work only here. No network access, dependency installation, unrelated project access or background processes. Pinned TypeScript and Python language servers are provided by the host. Run only the native-engineering phase.\n');
await copyFile(recipe,join(workspace,'goose-self-test.yaml'));
const boundary=await preflight({appBundle:app,profile,workspace,tmp});
const boundaryFile=join(output,'boundary.sb');await writeFile(boundaryFile,boundary.profile);
const authOptions={config:join(runtime,'connector/production.config.example.json'),node,connector:join(runtime,'connector')};
const auth=await authenticate(authOptions),upstream=await startBenchmarkRelay({connectorConfigPath:authOptions.config}),scoped=await startScopedRelay(upstream.url);
let latest=auth,refreshedAt=Date.now();
const capability=scoped.activate({oauthToken:auth.token,trial:'functional-recipe',resolveOAuthToken:async()=>{if(Date.now()-refreshedAt>20000){latest=await authenticate(authOptions);if(latest.accountHash!==auth.accountHash)throw Error('ACCOUNT_CHANGED');refreshedAt=Date.now();}return latest.token;}});
const template=JSON.parse(await readFile(new URL('../review-evidence/2026-09-29/native-efficiency/backend-provider-template.json',import.meta.url),'utf8'));
template.base_url=scoped.url;template.base_path='desktop/v1/chat/completions';template.headers={'X-Orqaly-Account-Hash':auth.accountHash};
template.auth={command:node,args:[join(runtime,'connector/src/cli.mjs'),'token','--config',authOptions.config],cwd:workspace,refresh_interval:300,timeout_seconds:60};
await writeFile(join(profile,'config/custom_providers/orqaly.json'),JSON.stringify(template),{mode:0o600});
await writeFile(join(profile,'config/config.yaml'),JSON.stringify({GOOSE_PROVIDER:'orqaly',GOOSE_MODEL:'orqaly-gemini',GOOSE_MODE:'auto',extensions:{developer:{enabled:true,type:'platform',name:'developer'},native_engineering:{enabled:true,type:'platform',name:'native_engineering'}}}),{mode:0o600});
const servers={typescript:[node,join(runtime,'language-servers/node_modules/typescript-language-server/lib/cli.mjs'),'--stdio'],python:[node,join(runtime,'language-servers/node_modules/pyright/langserver.index.js'),'--stdio']};
const env={HOME:process.env.HOME,USER:process.env.USER,LANG:'en_US.UTF-8',PATH:`${dirname(node)}:/usr/bin:/bin:/usr/sbin:/sbin`,TMPDIR:tmp+'/',GOOSE_PATH_ROOT:profile,GOOSE_PROVIDER:'orqaly',GOOSE_MODEL:'orqaly-gemini',GOOSE_MODE:'auto',GOOSE_STATE_MACHINE:'0',GOOSE_NATIVE_LSP_SERVERS:JSON.stringify(servers),GOOSE_SERVER__SECRET_KEY:'local-self-test-marker',GOOSE_DISABLE_TELEMETRY:'true',ORQANIX_BENCHMARK_CAPABILITY:capability,ORQANIX_BENCHMARK_BOUNDARY:boundaryFile,ORQANIX_BENCHMARK_ARM:'candidate'};
upstream.setTrial('functional-recipe');let stdout='',stderr='',timedOut=false;
try{
 const child=spawn(join(app,'Contents/Resources/bin/goose'),['run','--with-builtin','native_engineering','--recipe',join(workspace,'goose-self-test.yaml'),'--params','test_phases=native-engineering','--params','test_depth=quick','--params',`workspace_dir=${join(workspace,'results')}`,'--params','parallel_tests=false','--params','cleanup_after=false','--output-format','json','--max-turns','70'],{cwd:workspace,env,stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',x=>{stdout+=redact(x.toString(),[auth.token,capability]);});child.stderr.on('data',x=>{stderr+=redact(x.toString(),[auth.token,capability]);});
 const timer=setTimeout(()=>{timedOut=true;child.kill('SIGTERM');setTimeout(()=>{if(child.exitCode===null)child.kill('SIGKILL');},3000).unref();},600000);
 const progress=setInterval(()=>console.log(JSON.stringify({event:'recipe_progress',modelRequests:upstream.snapshot('functional-recipe').modelRequests.length})),30000);
 const exit=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',(code,signal)=>resolve({code,signal}));});clearTimeout(timer);clearInterval(progress);
 await writeFile(join(output,'stdout.json'),stdout,{mode:0o600});await writeFile(join(output,'stderr.log'),stderr,{mode:0o600});
 const nativeToolCalls={};let parsed;try{parsed=JSON.parse(stdout.slice(stdout.indexOf('{\n  \"messages\"')));for(const m of parsed.messages||[])for(const c of m.content||[]){const name=c.type==='toolRequest'?c.toolCall?.value?.name:null;if(name)nativeToolCalls[name]=(nativeToolCalls[name]||0)+1;}}catch{}
 const nativeExercised=['ast_search','lsp_query','hashline_edit','safe_edit_and_test'].every(n=>nativeToolCalls[n]>0);
 await writeFile(join(output,'result.json'),JSON.stringify({nativeExercised,nativeToolCalls,kind:'functional-recipe-not-timed-benchmark',exit,timedOut,boundaryChecks:boundary.checks,telemetry:upstream.snapshot('functional-recipe'),capability:scoped.snapshot()},null,2),{mode:0o600});
 console.log(JSON.stringify({event:'recipe_exit',...exit,timedOut,modelRequests:upstream.snapshot('functional-recipe').modelRequests.length}));
 if(exit.code!==0||timedOut||!nativeExercised)process.exitCode=1;
}finally{await scoped.close();await upstream.close();}
