#!/usr/bin/env node
// Actual Electron renderer Send path; the harness never sends an ACP prompt itself.
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawn, execFileSync } from 'node:child_process';
import { access, mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { createServer } from 'node:net';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { authenticate } from './benchmark-local-axwise.mjs';
import { redact } from './benchmark-goose-reset.mjs';
import { prepareFixture, evaluate, DIFFICULTIES } from './lib/orqanix-efficiency-tasks.mjs';
import { preflight as preflightBoundary } from './lib/orqanix-selection-sandbox.mjs';
import { startBenchmarkRelay } from './lib/orqanix-benchmark-relay.mjs';
import { startScopedRelay } from './lib/orqanix-scoped-benchmark-relay.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const delay = ms => new Promise(done => setTimeout(done, ms));
export function plan(repetitions = 1) {
  if(repetitions!==1)throw Error('EXACTLY_TWELVE_ROWS_REQUIRED');
  const orders=[['default','previous','candidate'],['previous','candidate','default'],['candidate','default','previous'],['default','candidate','previous']];
  return DIFFICULTIES.flatMap((difficulty,index)=>orders[index].map(arm=>({
    key:`${difficulty}-${arm}`,difficulty,arm,repeat:1,
    flags:{jevReviewEnabled:false,nativeGemsEnabled:arm!=='default',axwiseLocalEnabled:false}
  })));
}

export function parseOptions(args) {
  const o = { live: false, preflight: false, repetitions: 1, timeoutSeconds: 360 };
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (key === '--live' || key === '--preflight') { o[key.slice(2)] = true; continue; }
    if (!['--executable', '--desktop', '--runtime', '--output', '--repetitions', '--timeout-seconds', '--only-keys'].includes(key) || !args[i + 1]) throw Error('INVALID_OPTION');
    o[key.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = args[++i];
  }
  o.repetitions = Number(o.repetitions); o.timeoutSeconds = Number(o.timeoutSeconds);
  plan(o.repetitions);
  if (!Number.isInteger(o.timeoutSeconds) || o.timeoutSeconds < 30 || o.timeoutSeconds > 600) throw Error('INVALID_TIMEOUT');
  if (o.live || o.preflight) for (const name of ['executable','desktop','runtime','output']) if (!isAbsolute(o[name] || '')) throw Error(`ABSOLUTE_${name.toUpperCase()}_REQUIRED`);
  return o;
}

export class WireRecorder {
  constructor() { this.requests = new Map(); this.pending = new Map(); this.tools = new Map(); this.events = []; this.promptId = null; }
  frame(direction, payload, at = Date.now()) {
    for (const text of String(payload).split('\n')) {
      let m; try { m = JSON.parse(text); } catch { continue; }
      if (direction === 'sent' && m.method) {
        this.requests.set(m.id, m.method);
        if (m.method === 'session/prompt') { this.promptId = m.id; this.promptSentAt = at; this.sessionId = m.params?.sessionId; }
      }
      if (direction === 'sent' && !m.method && m.id !== undefined) this.pending.delete(m.id);
      if (direction === 'received' && m.method === 'session/request_permission') {
        this.pending.set(m.id, { ...m.params, requestId: m.id, at });
      }
      if (direction === 'received' && m.id === this.promptId && this.promptId !== null && !m.method) {
        this.response = m; this.responseAt = at;
      }
      const update = m.params?.update;
      if (direction === 'received' && update) {
        if(this.startedAt&&(update.sessionUpdate==='agent_message_chunk'||update.sessionUpdate==='tool_call'))this.firstActivityAt??=at;
        if (update.sessionUpdate === 'agent_message_chunk') this.firstOutputAt ??= at;
        if (update.toolCallId) {
          const prev = this.tools.get(update.toolCallId) || {};
          this.tools.set(update.toolCallId, { ...prev, ...update, _meta:{...prev._meta,...update._meta,goose:{...prev._meta?.goose,...update._meta?.goose,toolCall:{...prev._meta?.goose?.toolCall,...update._meta?.goose?.toolCall}}}, firstAt: prev.firstAt ?? at, lastAt: at });
        }
      }
      if (this.startedAt && (m.method === 'session/update' || m.method === 'session/request_permission' || m.id === this.promptId))
        this.events.push({ direction, at, message: redact(m) });
    }
  }
}

async function freePort() {
  const s = createServer(); await new Promise(done => s.listen(0, '127.0.0.1', done));
  const port = s.address().port; await new Promise(done => s.close(done)); return port;
}
function appEnvironment(url, port, runtime) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (/API_KEY|SECRET|PASSWORD|TOKEN|CLERK_.*KEY|PRIVATE_KEY|ORQALY_LOCAL_TEST|GOOSE_/.test(key)) delete env[key];
  return { ...env, ORQANIX_LOCAL_API_URL: url, ORQALY_LOCAL_RELAY_URL: url, ENABLE_PLAYWRIGHT: 'true', PLAYWRIGHT_DEBUG_PORT: String(port), PATH: `${join(runtime, 'node/bin')}:/usr/bin:/bin:/usr/sbin:/sbin`, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_OPTIONAL_LOCKS: '0' };
}
async function stopApp(app, browser) {
  if (app && app.exitCode === null && app.signalCode === null) {
    app.kill('SIGTERM');
    for (let i = 0; i < 30 && app.exitCode === null && app.signalCode === null; i++) await delay(100);
    if (app.exitCode === null && app.signalCode === null) app.kill('SIGKILL');
  }
  await Promise.race([browser?.close().catch(() => {}),delay(2000)]);
}
async function setFlags(page, flags) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('tab', { name: 'Chat', exact: true }).click();
  for (const [key, id] of [['jevReviewEnabled','jev-capability'], ['nativeGemsEnabled','native-engineering-capability'], ['axwiseLocalEnabled','axwise-local-capability']]) {
    const toggle = page.locator(`#${id}`);
    await page.waitForFunction(id => { const e = document.getElementById(id); return e && !e.disabled; }, id);
    if ((await toggle.getAttribute('aria-checked') === 'true') !== flags[key]) await toggle.click();
    await page.waitForFunction(async ({key, id, value}) => {
      const e = document.getElementById(id);
      const settings = await window.electron.getSetting(key === 'axwiseLocalEnabled' ? key : 'engineeringCapabilities');
      return e && !e.disabled && e.getAttribute('aria-checked') === String(value) && (key === 'axwiseLocalEnabled' ? settings : settings[key]) === value;
    }, {key,id,value:flags[key]});
  }
  await page.getByRole('button', { name: 'New Chat', exact: true }).click();
  await page.getByTestId('chat-input').waitFor({state:'visible'});
  return page.evaluate(async () => ({ ...(await window.electron.getSetting('engineeringCapabilities')), axwiseLocalEnabled: await window.electron.getSetting('axwiseLocalEnabled') }));
}
function mountState(db, sessionId) {
  if (!/^[A-Za-z0-9_-]+$/.test(sessionId || '')) throw Error('NO_SESSION_ID');
  const query = `SELECT json_extract(j.value,'$.name') AS name FROM sessions s,json_each(s.extension_data,'$."enabled_extensions.v0".extensions') j WHERE s.id='${sessionId}'`;
  const rows = JSON.parse(execFileSync('sqlite3', ['-readonly','-json',db,query], {encoding:'utf8',timeout:10000}) || '[]');
  return rows.map(x => x.name);
}
async function locateDb(root) {
  for (const e of await readdir(root,{withFileTypes:true}).catch(() => [])) {
    const p = join(root,e.name);
    if (e.isFile() && e.name === 'sessions.db') return p;
    if (e.isDirectory()) { const found = await locateDb(p); if (found) return found; }
  }
}

async function runRow(test, options, relay, auth, chromium) {
  const directory = join(options.output,test.key); await mkdir(directory,{mode:0o700});
  const fixture = await prepareFixture(join(directory,'fixture'),test.difficulty,options.runtime);
  const profile = join(directory,'profile');
  const account = join(profile,'goose/accounts',auth.accountHash);
  await mkdir(join(account,'config'),{recursive:true,mode:0o700});
  await writeFile(join(account,'config/config.yaml'),JSON.stringify({GOOSE_MODE:'auto',extensions:{developer:{enabled:true,type:'platform',name:'developer'},todo:{enabled:true,type:'platform',name:'todo'}}}),{mode:0o600});
  const temporary=join(directory,'tmp');await mkdir(temporary,{mode:0o700});
  const boundary=await preflightBoundary({appBundle:dirname(dirname(dirname(options.executable))),profile,workspace:fixture.workspace,tmp:temporary});
  const boundaryFile=join(directory,'filesystem-boundary.sb');await writeFile(boundaryFile,boundary.profile,{mode:0o600});
  const scopeCapability=relay.activateAuth({oauthToken:auth.token,trial:test.key,resolveOAuthToken:auth.resolveToken});
  let authProbe;
  try { authProbe=execFileSync('/usr/bin/sandbox-exec',['-f',boundaryFile,join(options.runtime,'node/bin/node'),join(options.runtime,'connector/src/cli.mjs'),'token','--config',join(options.runtime,'connector/production.config.example.json')],{encoding:'utf8',timeout:15000,maxBuffer:20000,cwd:fixture.workspace,env:{HOME:process.env.HOME,PATH:'/usr/bin:/bin',TMPDIR:temporary,GOOSE_SERVER__SECRET_KEY:'auth-probe',ORQANIX_BENCHMARK_CAPABILITY:scopeCapability}}); }
  catch { throw Error('CONFINED_AUTH_PROBE_FAILED'); }
  if(authProbe.trim()!==scopeCapability)throw Error('CONFINED_AUTH_PROBE_MISMATCH');
  authProbe=null;
  const port = await freePort(); const wire = new WireRecorder();
  const row = {...test,startedAt:new Date().toISOString(),directory,workspace:fixture.workspace,decisions:[],confinedAuthVerified:true,boundary:{sha256:boundary.sha256,checks:boundary.checks,description:boundary.boundary}};
  let app,browser,page,progressTimer,log=''; const setupAt = Date.now();
  try {
    app = spawn(options.executable,[`--user-data-dir=${profile}`,'--dir',fixture.workspace],{cwd:fixture.workspace,env:{...appEnvironment(relay.url,port,options.runtime),TMPDIR:temporary,ORQANIX_BENCHMARK_BOUNDARY:boundaryFile,ORQANIX_BENCHMARK_ARM:test.arm,ORQANIX_BENCHMARK_CAPABILITY:scopeCapability},stdio:['ignore','pipe','pipe']});
    for(const stream of [app.stdout,app.stderr])stream.on('data',chunk=>{log=(log+redact(chunk.toString(),[auth.token,scopeCapability])).slice(-80000);});
    for(let i=0;i<120;i++){
      if(app.exitCode!==null||app.signalCode!==null)throw Error(`APP_EXIT:${app.exitCode}:${app.signalCode}`);
      try{browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`,{timeout:1000});break;}catch{await delay(500);}
    }
    if(!browser)throw Error('CDP_UNAVAILABLE');
    for(let i=0;i<(options.preflight?1800:240);i++){page=browser.contexts().flatMap(c=>c.pages())[0];if(page)break;await delay(500);}
    if(!page)throw Error('RENDERER_UNAVAILABLE');
    page.setDefaultTimeout(25000);
    const cdp=await page.context().newCDPSession(page); await cdp.send('Network.enable');
    cdp.on('Network.webSocketFrameSent',e=>wire.frame('sent',e.response.payloadData));
    cdp.on('Network.webSocketFrameReceived',e=>wire.frame('received',e.response.payloadData));
    await page.getByTestId('chat-input').waitFor({state:'visible',timeout:90000});
    row.persistedFlags=await setFlags(page,test.flags);
    row.setupMs=Date.now()-setupAt;
    if(options.preflight){row.status='preflight_ready';return row;}
    await page.getByTestId('chat-input').fill(fixture.prompt);
    relay.setTrial(test.key); wire.startedAt=Date.now();
    progressTimer=setInterval(()=>console.log(JSON.stringify({event:'progress',key:test.key,elapsedMs:Date.now()-wire.startedAt,toolCalls:wire.tools.size,pendingApprovals:wire.pending.size,providerRequests:relay.snapshot(test.key).modelRequests.length})),30000);
    await page.getByRole('button',{name:'Send',exact:true}).click();
    const deadline=Date.now()+options.timeoutSeconds*1000;let terminalObserved=false;
    while(Date.now()<deadline){
      if(wire.pending.size)throw Error('UNEXPECTED_APPROVAL_IN_AUTONOMOUS_MODE');
      if(wire.response && !await page.getByRole('button',{name:'Stop',exact:true}).isVisible() && !wire.pending.size){terminalObserved=true;break;}
      if(app.exitCode!==null||app.signalCode!==null)throw Error('APP_EXIT_DURING_TURN');
      await delay(100);
    }
    row.elapsedMs=Date.now()-wire.startedAt;
    row.firstOutputMs=wire.firstOutputAt?wire.firstOutputAt-wire.startedAt:null;
    row.firstActivityMs=wire.firstActivityAt?wire.firstActivityAt-wire.startedAt:null;
    row.acpPromptDelayMs=wire.promptSentAt?wire.promptSentAt-wire.startedAt:null;
    row.acpResponseMs=wire.responseAt?wire.responseAt-wire.startedAt:null;
    row.response=wire.response;
    row.status=!terminalObserved?'timeout':wire.response.error?'error':wire.response.result?.stopReason==='end_turn'?'completed':'incomplete';
    row.tools=[...wire.tools.values()];
    row.transcript=await page.locator('.goose-message .agent-message-bubble').allTextContents();
    const db=await locateDb(account); row.mounts=mountState(db,wire.sessionId);
    await writeFile(join(directory,'wire.json'),JSON.stringify(wire.events,null,2),{mode:0o600});
    return row;
  } catch(error){row.status='harness_or_app_error';row.error=redact(String(error.message),[auth.token,scopeCapability]);return row;}
  finally{
    clearInterval(progressTimer);
    if(page){await page.screenshot({path:join(directory,'final.png'),fullPage:true}).catch(()=>{});row.visibleText=await page.locator('body').innerText().catch(()=>'');}
    row.tools=[...wire.tools.values()];row.response=wire.response;row.pendingApprovals=[...wire.pending.keys()];
    await writeFile(join(directory,'wire.json'),JSON.stringify(wire.events,null,2),{mode:0o600});
    await stopApp(app,browser);
    for(let i=0;i<30&&relay.snapshot(test.key).pending;i++)await delay(100);
    row.telemetry=relay.snapshot(test.key);row.scopedRelay=relay.authSnapshot().find(x=>x.trial===test.key);relay.setTrial(null);relay.deactivateAuth();
    if(!options.preflight){
      row.oracle=await evaluate(fixture,options.runtime,boundaryFile);
      row.actualToolInventory=[...new Set((row.telemetry.modelRequests||[]).filter(r=>r.source==='primary').flatMap(r=>r.toolNames||[]))];
      const names=row.actualToolInventory.map(n=>n.split('__').at(-1));
      const native=['ast_search','lsp_query','hashline_edit','safe_edit_and_test'];
      const axwise=['create_prd','analyze_interviews','simulate_interviews','prepare_discovery','generate_personas','chat_with_persona','research_market','create_delivery_brief'];
      row.inventoryMatches=(test.flags.nativeGemsEnabled?native.every(n=>names.includes(n)):native.every(n=>!names.includes(n)))&&(test.flags.axwiseLocalEnabled?axwise.every(n=>names.includes(n)):axwise.every(n=>!names.includes(n)))&&names.length>0;
      row.passed=row.status==='completed'&&row.inventoryMatches&&row.oracle.passed&&row.oracle.originalMutation?.detected===true;
      if(row.telemetry.pending){row.status='unsettled_telemetry';row.passed=false;}
    }
    await writeFile(join(directory,'app.log'),log,{mode:0o600});
    await writeFile(join(directory,'row.json'),JSON.stringify(redact(row,[auth.token,scopeCapability]),null,2),{mode:0o600});
  }
}

export async function main(args) {
  const o=parseOptions(args);let schedule=plan(o.repetitions);
  if(o.onlyKeys){const keys=o.onlyKeys.split(',');schedule=schedule.filter(x=>keys.includes(x.key));if(schedule.length!==keys.length)throw Error('INVALID_KEYS');}
  if(!o.live&&!o.preflight){console.log(JSON.stringify(schedule,null,2));return;}
  await access(o.executable);await mkdir(o.output,{recursive:true,mode:0o700});
  const config=join(o.runtime,'connector/production.config.example.json');
  const auth=await authenticate({config,node:join(o.runtime,'node/bin/node'),connector:join(o.runtime,'connector')});
  const {chromium}=createRequire(join(o.desktop,'package.json'))('playwright-core');
  const fingerprint={executableSha256:sha(await readFile(o.executable)),repetitions:o.repetitions,timeoutSeconds:o.timeoutSeconds,preflight:o.preflight};
  fingerprint.accountHash=auth.accountHash;
  fingerprint.jevTransport=process.env.TYPESAFE_API_KEY?'current_local_service':'deployed_endpoint';
  for(const name of ['goose-provider-http.js','desktop-decision-service.js','engineering-review-service.js'])fingerprint[name]=sha(await readFile(new URL(`../apps/orqaly/server/workflow-v2/${name}`,import.meta.url)));
  const resources=dirname(o.runtime);
  for(const file of ['app.asar','bin/goose','bin/goose-baseline','bin/goose-candidate','bin/selection-ab-build.json','bin/orqanix-goose-benchmark-build.json','orqaly-runtime/runtime-manifest.json','orqaly-runtime/connector/src/cli.mjs','orqaly-runtime/connector/production.config.example.json','axwise-runtime/runtime-manifest.json'])fingerprint[file]=sha(await readFile(join(resources,file)));
  for(const file of ['benchmark-orqanix-efficiency.mjs','lib/orqanix-efficiency-tasks.mjs','lib/orqanix-selection-sandbox.mjs','lib/orqanix-specialist-sandbox.mjs','lib/orqanix-benchmark-relay.mjs','lib/orqanix-scoped-benchmark-relay.mjs'])fingerprint[file]=sha(await readFile(new URL(file,import.meta.url)));
  const reportFile=join(o.output,'report.json');let report;
  try{report=JSON.parse(await readFile(reportFile,'utf8'));if(JSON.stringify(report.fingerprint)!==JSON.stringify(fingerprint))throw Error('RESUME_FINGERPRINT_MISMATCH');}
  catch(e){if(e.code!=='ENOENT')throw e;report={schema:'orqanix.actual-desktop-native-efficiency.v1',startedAt:new Date().toISOString(),fingerprint,schedule:plan(o.repetitions),rows:[],method:'12 trials: default Goose/native off, previous build/native on, optimized build/native on x four TypeScript tasks. Same model Gemini 3.8 Flash, desktop default effort, legacy loop, Jev/Axwise off, no Code Mode. Actual Electron Settings and Send. Fresh Git repositories and profiles. Per-row backend filesystem confinement, Electron/network/IPC not fully isolated. Send-to-terminal timing includes parent OAuth refresh when needed; setup and independent evaluation excluded. 360-second task limit, normal Rust action default, 60 local model calls. No discarded/replaced model trials. Parent authenticates through Keychain and refreshes credentials throughout each row, never exposing real credentials to Goose. Confined Goose receives only a short-lived model-only localhost capability. Four cases per build are a screening comparison, not statistical proof. Sources frozen before live inference.'};}
  const save=()=>writeFile(reportFile,JSON.stringify(report,null,2),{mode:0o600});
  const upstream=await startBenchmarkRelay({connectorConfigPath:config});
  const scoped=await startScopedRelay(upstream.url);
  const relay={...upstream,url:scoped.url,activateAuth:scoped.activate,deactivateAuth:scoped.deactivate,authSnapshot:scoped.snapshot,close:async()=>{await scoped.close();await upstream.close();}};
  try{
    for(const test of schedule){
      if(report.rows.some(r=>r.key===test.key))continue;
      try{await access(join(o.output,'STOP_BEFORE_NEXT_ROW'));report.stoppedBeforeKey=test.key;break;}catch(e){if(e.code!=='ENOENT')throw e;}
      console.log(JSON.stringify({event:'starting',key:test.key}));
      const rowAuth=await authenticate({config,node:join(o.runtime,'node/bin/node'),connector:join(o.runtime,'connector')});
      if(rowAuth.accountHash!==auth.accountHash)throw Error('ACCOUNT_CHANGED');
      let latest=rowAuth, refreshedAt=Date.now(),refreshing;
      rowAuth.resolveToken=async()=>{
        if(Date.now()-refreshedAt<20000)return latest.token;
        refreshing??=authenticate({config,node:join(o.runtime,'node/bin/node'),connector:join(o.runtime,'connector')})
          .then(value=>{if(value.accountHash!==auth.accountHash)throw Error('ACCOUNT_CHANGED');latest=value;refreshedAt=Date.now();return value.token;})
          .finally(()=>{refreshing=null;});
        return refreshing;
      };
      const row=await runRow(test,o,relay,rowAuth,chromium);report.rows.push(row);await save();
      console.log(JSON.stringify({event:'finished',key:row.key,status:row.status,elapsedMs:row.elapsedMs,passed:row.passed,error:row.error}));
      if(row.status==='harness_or_app_error'||(!o.preflight&&row.telemetry.modelRequests.length===0))throw Error('APP_OR_HARNESS_REQUIRES_DIAGNOSIS');
    }
  }finally{await relay.close();await save();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main(process.argv.slice(2)).catch(e=>{console.error(e.message);process.exitCode=1;});
