/** Fixed synthetic workloads and independent checks for the 12-row selection A/B. */
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile, readdir, lstat } from 'node:fs/promises';
import { join, dirname, relative } from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export const DIFFICULTIES = ['simple', 'medium', 'complex'];
const common = {
  'package.json': '{"private":true,"type":"module"}\n',
  'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, noEmit: true, allowImportingTsExtensions: true }, include: ['src/**/*.ts'] }, null, 2),
};
const specs = {
  simple: {
    title: 'Invoice arithmetic bug',
    request: 'Fix lineTotal in src/pricing.ts: priceCents and quantity must be nonnegative safe integers, discountBps a safe integer from 0 through 10000. Invalid inputs and unsafe integer intermediates priceCents*quantity or product*(10000-discountBps) throw RangeError. Return Math.floor(product*(10000-discountBps)/10000). Zero quantity and full discount return positive zero. Preserve the export and default discount. Add useful regression tests in tests/regression.test.mjs and run the tests and type check.',
    editable: ['src/pricing.ts'],
    files: {
      'src/pricing.ts': `export function lineTotal(priceCents: number, quantity: number, discountBps = 0): number {\n  return Math.round(priceCents * (quantity || 1) * (1 - discountBps / 10000));\n}\n`,
      'tests/public.test.mjs': `import assert from 'node:assert/strict';\nimport {test} from 'node:test';\nimport {lineTotal} from '../src/pricing.ts';\ntest('ordinary invoice',()=>assert.equal(lineTotal(500,2),1000));\n`,
    },
    checks: `const {lineTotal:f}=await load('src/pricing.ts');
check('zero quantity',()=>eq(f(1250,0),0));
check('floor discount',()=>eq(f(199,3,1250),522));
check('defaults and full discount',()=>{eq(f(73,4),292);eq(f(500,2,10000),0);});
check('positive zero',()=>{eq(Object.is(f(-0,2),-0),false);eq(Object.is(f(2,-0),-0),false);});
check('invalid inputs',()=>{for(const args of [[-1,1],[1,-1],[1.5,1],[1,1,10001],[1,1,-1],['1',1],[1,NaN],[1,1,.2],[Infinity,0]])throws(()=>f(...args),'RangeError');});
check('safe integer limits',()=>{throws(()=>f(Number.MAX_SAFE_INTEGER,2),'RangeError');throws(()=>f(Number.MAX_SAFE_INTEGER,1),'RangeError');eq(f(900719925474,1),900719925474);});
check('input examples',()=>{for(let p=0;p<19;p++)for(let q=0;q<7;q++)for(const d of [0,3333,5000,10000])eq(f(p,q,d),Math.floor(p*q*(10000-d)/10000));});`,
    solution: { 'src/pricing.ts': `export function lineTotal(priceCents: number, quantity: number, discountBps = 0): number {\n  if(![priceCents,quantity,discountBps].every(Number.isSafeInteger)||priceCents<0||quantity<0||discountBps<0||discountBps>10000) throw new RangeError('input');\n  const product=priceCents*quantity, adjusted=product*(10000-discountBps);\n  if(!Number.isSafeInteger(product)||!Number.isSafeInteger(adjusted))throw new RangeError('overflow');\n  return Math.floor(adjusted/10000)||0;\n}\n` },
  },
  medium: {
    title: 'Forward asynchronous route failures',
    request: 'The API registers async handlers that currently reject without forwarding failures to next. Find every directly registered async handler on the Router in src/routes and wrap it with the existing withErrors adapter from src/framework/errors.ts. Cover GET, POST and DELETE registrations, including the named async function. Preserve response values, request handling, registration order and the synchronous route. Do not wrap unrelated async callbacks, the unrelated audit.get API, or ordinary helper functions. Add regression tests in tests/regression.test.mjs covering successful handling and error forwarding, and run the tests and type check.',
    editable: ['src/routes/accounts.ts', 'src/routes/orders.ts'],
    files: {
      'src/framework/router.ts': `export interface Request { fail?: boolean; id: string; }\nexport interface Response { send(value: string): string; }\nexport type Next = (error: unknown) => void;\nexport type Handler = (req: Request, res: Response, next: Next) => unknown;\nexport class Router {\n  routes: {method: string; path: string; handler: Handler}[] = [];\n  get(path: string, handler: Handler) { this.routes.push({method:'GET',path,handler}); }\n  post(path: string, handler: Handler) { this.routes.push({method:'POST',path,handler}); }\n  delete(path: string, handler: Handler) { this.routes.push({method:'DELETE',path,handler}); }\n}\n`,
      'src/framework/errors.ts': `import type {Handler} from './router.ts';\nexport function withErrors(handler: Handler): Handler {\n  return async (req,res,next) => { try { return await handler(req,res,next); } catch(error) { next(error); } };\n}\n`,
      'src/routes/accounts.ts': `import {Router} from '../framework/router.ts';\nexport function registerAccounts(router: Router) {\n  router.get('/accounts/:id', async (req, res) => {\n    if(req.fail) throw new Error('account read');\n    return res.send('account:'+req.id);\n  });\n  router.post('/accounts', async function createAccount(req, res) {\n    if(req.fail) throw new Error('account create');\n    return res.send('created:'+req.id);\n  });\n  router.get('/health', (_req,res) => res.send('ok'));\n}\nexport const documentation = "router.get('/fake', async handler)";\nexport async function unrelatedHelper() { throw new Error('helper'); }\n`,
      'src/routes/orders.ts': `import {Router} from '../framework/router.ts';\nconst audit = { get(_name: string, callback: () => Promise<string>) { return callback; } };\nexport const auditCallback = audit.get('orders', async () => { throw new Error('audit'); });\nexport function registerOrders(router: Router) {\n  router.get('/orders/:id', async (req,res) => {\n    const values = await Promise.all([req.id].map(async value => value.toUpperCase()));\n    if(req.fail) throw new Error('order read');\n    return res.send(values[0]);\n  });\n  router.delete('/orders/:id', async (req,res) => {\n    if(req.fail) throw new Error('order delete');\n    return res.send('deleted:'+req.id);\n  });\n}\n`,
      'src/app.ts': `import {Router} from './framework/router.ts';\nimport {registerAccounts} from './routes/accounts.ts';\nimport {registerOrders} from './routes/orders.ts';\nexport function makeRouter() {const router=new Router();registerAccounts(router);registerOrders(router);return router;}\n`,
      'tests/public.test.mjs': `import assert from 'node:assert/strict';\nimport {test} from 'node:test';\nimport {makeRouter} from '../src/app.ts';\ntest('five routes registered',()=>assert.equal(makeRouter().routes.length,5));\n`,
    },
    checks: `const {makeRouter}=await load('src/app.ts');const {auditCallback}=await load('src/routes/orders.ts');const {unrelatedHelper,documentation}=await load('src/routes/accounts.ts');
await check('registration order',()=>eq(makeRouter().routes.map(r=>[r.method,r.path]),[['GET','/accounts/:id'],['POST','/accounts'],['GET','/health'],['GET','/orders/:id'],['DELETE','/orders/:id']]));
const expected=['account:x','created:x','ok','X','deleted:x'];
for(let i=0;i<5;i++)await check('success route '+i,async()=>{let next=0;const sent=[];const result=await makeRouter().routes[i].handler({id:'x'},{send:v=>(sent.push(v),v)},()=>next++);eq(result,expected[i]);eq(sent,[expected[i]]);eq(next,0);});
for(const [i,message] of [[0,'account read'],[1,'account create'],[3,'order read'],[4,'order delete']])await check('forward failure route '+i,async()=>{const errors=[],sent=[];await makeRouter().routes[i].handler({id:'x',fail:true},{send:v=>(sent.push(v),v)},e=>errors.push(e));eq(errors.length,1);eq(errors[0].message,message);eq(sent,[]);});
await check('synchronous health preserved',()=>{const result=makeRouter().routes[2].handler({id:'x'},{send:v=>v},()=>{});eq(result,'ok');});
await check('unrelated audit and helper still reject',async()=>{for(const fn of [auditCallback,unrelatedHelper]){let error;try{await fn();}catch(e){error=e;}eq(!!error,true);}eq(documentation,"router.get('/fake', async handler)");});`,
  },
  complex: {
    title: 'Rename a shared context field across a typed request pipeline',
    request: 'Rename the RequestContext field requestId to traceId throughout its definition and all consumers under src. This is a source-level API rename: do not keep a requestId compatibility member on RequestContext. Update context construction, aliases, destructuring and propagation so a trace identifier reaches every stage. Keep all public function names and signatures apart from that context field, existing wire/output keys named requestId, and the unrelated Job.requestId and audit requestId variables unchanged. Keep the current output values and non-mutation behavior, including forkContext suffixes. Add regression tests in tests/regression.test.mjs for end-to-end propagation and the unrelated Job identifier; run the tests and type check. Start from the app entry point and trace the relevant references as needed.',
    editable: ['src/context.ts','src/context-factory.ts','src/logging.ts','src/middleware.ts','src/jobs.ts','src/response.ts','src/worker.ts','src/app.ts'],
    files: {
      'src/context.ts': `export interface RequestContext { readonly requestId: string; readonly userId: string; }\nexport type ActiveContext = RequestContext;\n`,
      'src/context-factory.ts': `import type {RequestContext} from './context.ts';\nexport function createContext(value: string, userId: string): RequestContext {return {requestId:value,userId};}\nexport function forkContext(context: RequestContext, suffix: string): RequestContext {return {...context, requestId: context.requestId+'/'+suffix};}\n`,
      'src/logging.ts': `import type {ActiveContext as Context} from './context.ts';\nexport function logFields(context: Context) {const {requestId,userId}=context;return {requestId,userId};}\n`,
      'src/middleware.ts': `import type {RequestContext} from './context.ts';\nexport function headers(context: RequestContext) {return {'x-request-id':context.requestId};}\n`,
      'src/job-types.ts': `export interface Job {requestId: string; name: string;}\nexport function auditLabel(requestId: string) {return 'job:'+requestId;}\n`,
      'src/jobs.ts': `import type {RequestContext} from './context.ts';\nimport {auditLabel} from './job-types.ts';\nimport type {Job} from './job-types.ts';\nexport function describeJob(job: Job, context: RequestContext) {return {requestId:job.requestId,trace:context.requestId,audit:auditLabel(job.requestId),name:job.name};}\n`,
      'src/response.ts': `import type {ActiveContext} from './context.ts';\nexport function response(context: ActiveContext, payload: unknown) {return {requestId:context.requestId,payload};}\n`,
      'src/worker.ts': `import {forkContext} from './context-factory.ts';\nimport type {RequestContext} from './context.ts';\nimport type {Job} from './job-types.ts';\nimport {describeJob} from './jobs.ts';\nexport function work(context: RequestContext, job: Job) {const child=forkContext(context,'worker');return describeJob(job,child);}\n`,
      'src/app.ts': `import {createContext} from './context-factory.ts';\nimport {headers} from './middleware.ts';\nimport {logFields} from './logging.ts';\nimport {response} from './response.ts';\nimport {work} from './worker.ts';\nimport type {Job} from './job-types.ts';\nexport function handle(trace: string,user: string,job: Job) {const context=createContext(trace,user);return {context,headers:headers(context),logs:logFields(context),body:response(context,work(context,job))};}\n`,
      'tests/public.test.mjs': `import assert from 'node:assert/strict';\nimport {test} from 'node:test';\nimport {handle} from '../src/app.ts';\ntest('wire identifier',()=>assert.equal(handle('t','u',{requestId:'j',name:'test'}).body.requestId,'t'));\n`,
    },
    checks: `const {handle}=await load('src/app.ts');const {createContext,forkContext}=await load('src/context-factory.ts');const {logFields}=await load('src/logging.ts');const {headers}=await load('src/middleware.ts');const {response}=await load('src/response.ts');const {describeJob}=await load('src/jobs.ts');
await check('new context shape',()=>eq(createContext('trace','user'),{traceId:'trace',userId:'user'}));
await check('fork propagation and immutability',()=>{const c=Object.freeze({traceId:'a',userId:'u'});eq(forkContext(c,'child'),{traceId:'a/child',userId:'u'});eq(c,{traceId:'a',userId:'u'});});
await check('destructuring keeps wire names',()=>eq(logFields({traceId:'t',userId:'u'}),{requestId:'t',userId:'u'}));
await check('header and body propagation',()=>{eq(headers({traceId:'t',userId:'u'}),{'x-request-id':'t'});eq(response({traceId:'t',userId:'u'},null),{requestId:'t',payload:null});});
await check('Job requestId remains independent',()=>{const job=Object.freeze({requestId:'job1',name:'send'});eq(describeJob(job,{traceId:'trace1',userId:'u'}),{requestId:'job1',trace:'trace1',audit:'job:job1',name:'send'});});
for(const id of ['trace','', '__proto__','x/y'])await check('end-to-end '+JSON.stringify(id),()=>{const job=Object.freeze({requestId:'different',name:'send'});eq(handle(id,'u',job),{context:{traceId:id,userId:'u'},headers:{'x-request-id':id},logs:{requestId:id,userId:'u'},body:{requestId:id,payload:{requestId:'different',trace:id+'/worker',audit:'job:different',name:'send'}}});});`,
  },
};

export function definition(difficulty) {
  const spec=specs[difficulty];if(!spec)throw Error('UNKNOWN_DIFFICULTY');return spec;
}
export function expectedSolution(difficulty) {
  const s=definition(difficulty);if(s.solution)return s.solution;
  if(difficulty==='medium')return Object.fromEntries(s.editable.map(name=>[name,"import {withErrors} from '../framework/errors.ts';\n"+s.files[name].replace(/(router\.(?:get|post|delete)\('[^']+', )(async [\s\S]*?\n  })\);/g,'$1withErrors($2));')]));
  return Object.fromEntries(s.editable.map(name=>[name,s.files[name]
    .replace('readonly requestId: string','readonly traceId: string')
    .replace('return {requestId:value,userId}', 'return {traceId:value,userId}')
    .replace('requestId: context.requestId', 'traceId: context.requestId')
    .replaceAll('context.requestId','context.traceId')
    .replace('const {requestId,userId}=context','const {traceId:requestId,userId}=context')]));
}
export async function prepareFixture(root,difficulty,runtime) {
  const s=definition(difficulty),workspace=join(root,'workspace');await mkdir(workspace,{recursive:true,mode:0o700});
  if((await readdir(workspace)).length)throw Error('FRESH_WORKSPACE_REQUIRED');
  const typecheck=`node ${JSON.stringify(join(runtime,'language-servers/node_modules/typescript/lib/tsc.js'))} --noEmit -p tsconfig.json`;
  const prompt=`${s.request}\nRead README.md for the workspace contract. Use any available tools that help. Work only in this synthetic workspace; do not search parent directories, other projects, or the benchmark harness. Do not install dependencies, access the network, alter settings, commit, push or run background processes. Report actual test results.`;
  const files={...common,...s.files,'README.md':`# ${s.title}\n\n${prompt}\n\nPermitted changes: ${s.editable.join(', ')} and tests/regression.test.mjs (create it). All other files are immutable inputs. Keep the implementation in its current modules.\n\nTests: node --experimental-strip-types --test tests/*.test.mjs\nType check: ${typecheck}\nDependencies and language servers are already supplied by the app.\n`};
  for(const [name,text]of Object.entries(files)){const path=join(workspace,name);await mkdir(dirname(path),{recursive:true});await writeFile(path,text,{mode:0o600,flag:'wx'});}
  return {root,workspace,difficulty,prompt,files,permittedFiles:[...s.editable,'tests/regression.test.mjs'],initialHashes:Object.fromEntries(Object.entries(files).map(([k,v])=>[k,sha(v)]))};
}
async function listFiles(root,path=root,result=[]) {
  for(const name of await readdir(path)){const p=join(path,name),s=await lstat(p);if(s.isSymbolicLink()||(!s.isDirectory()&&!s.isFile())||(s.isFile()&&s.nlink!==1))throw Error('UNSAFE_WORKSPACE_ENTRY');if(s.isDirectory())await listFiles(root,p,result);else result.push(relative(root,p));}return result;
}
async function bounded(command,args,options={}) {
  try{const r=await execute(command,args,{timeout:30000,maxBuffer:256*1024,killSignal:'SIGKILL',...options});return {passed:true,exitCode:0,stdout:r.stdout,stderr:r.stderr};}
  catch(e){return {passed:false,exitCode:e.code,signal:e.signal,stdout:e.stdout||'',stderr:e.stderr||String(e.message)};}
}
function oracleSource(fixture,runtime) {
  // Run in a separate, file-confined process; generated code receives only a VM
  // context and relative fixture imports. The checks are supplied via argv.
  return `import vm from 'node:vm';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createRequire} from 'node:module';import {resolve,relative,dirname} from 'node:path';
const ts=createRequire(${JSON.stringify(join(runtime,'language-servers/package.json'))})('typescript');
const root=${JSON.stringify(fixture.workspace)},allowed=new Set(${JSON.stringify(Object.keys(fixture.files).filter(n=>n.endsWith('.ts')))}),context=vm.createContext({}),cache=new Map(),checks=[];
async function module(name){if(!allowed.has(name))throw Error('UNDECLARED_MODULE:'+name);if(cache.has(name))return cache.get(name);const input=await readFile(resolve(root,name),'utf8');const source=ts.transpileModule(input,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;const m=new vm.SourceTextModule(source,{context,identifier:name,importModuleDynamically:()=>{throw Error('NO_DYNAMIC_IMPORT')}});cache.set(name,m);await m.link((id,parent)=>{if(!id.startsWith('.'))throw Error('NO_EXTERNAL_IMPORT');return module(relative(root,resolve(root,dirname(parent.identifier),id)));});return m;}
async function load(name){const m=await module(name);if(m.status!=='evaluated')await m.evaluate({timeout:1000});return m.namespace;}
const eq=(a,b)=>assert.deepStrictEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)));const throws=(fn,name)=>{let error;try{fn();}catch(e){error=e;}assert.equal(error?.name,name)};
async function check(name,fn){try{await fn();checks.push({name,passed:true});}catch(e){checks.push({name,passed:false,error:String(e.message).slice(0,1500)});}}
try{await vm.compileFunction(${JSON.stringify('return (async()=>{'+definition(fixture.difficulty).checks+'})();')},['load','check','eq','throws'],{parsingContext:context})(load,check,eq,throws);}catch(e){checks.push({name:'load',passed:false,error:String(e.message).slice(0,1500)});}
console.log(JSON.stringify({passed:checks.length>0&&checks.every(c=>c.passed),checks}));`;
}
export async function evaluate(fixture,runtime,boundaryFile,{mutation=true}={}) {
  const node=join(runtime,'node/bin/node');
  const env={PATH:`${join(runtime,'node/bin')}:/usr/bin:/bin:/usr/sbin:/sbin`,LANG:'C',NODE_NO_WARNINGS:'1'};
  const run=args=>bounded('/usr/bin/sandbox-exec',['-f',boundaryFile,node,...args],{cwd:fixture.workspace,env});
  const observed=await listFiles(fixture.workspace),immutableFailures=[];
  for(const [name,hash] of Object.entries(fixture.initialHashes))if(!fixture.permittedFiles.includes(name)&&(!observed.includes(name)||sha(await readFile(join(fixture.workspace,name)))!==hash))immutableFailures.push(name);
  const unexpectedFiles=observed.filter(name=>!Object.hasOwn(fixture.files,name)&&!fixture.permittedFiles.includes(name)&&!name.startsWith('.goose/'));
  const oracleProcess=await run(['--experimental-vm-modules','--input-type=module','-e',oracleSource(fixture,runtime)]);
  let behavior;try{behavior=JSON.parse(oracleProcess.stdout);}catch{behavior={passed:false,error:oracleProcess.stderr};}
  const types=await run([join(runtime,'language-servers/node_modules/typescript/lib/tsc.js'),'--noEmit','-p','tsconfig.json']);
  const publicTests=await run(['--experimental-strip-types','--test','tests/public.test.mjs']);
  const regressionExists=observed.includes('tests/regression.test.mjs');
  const regression=regressionExists?await run(['--experimental-strip-types','--test','tests/regression.test.mjs']):{passed:false,error:'MISSING_REGRESSION_TEST'};
  let originalMutation=null;
  if(mutation&&regressionExists&&regression.passed){
    const saved={};for(const name of definition(fixture.difficulty).editable){saved[name]=await readFile(join(fixture.workspace,name));await writeFile(join(fixture.workspace,name),fixture.files[name]);}
    try{const result=await run(['--experimental-strip-types','--test','tests/regression.test.mjs']);originalMutation={detected:result.exitCode===1 && /not ok/.test(result.stdout),...result};}
    finally{for(const [name,bytes]of Object.entries(saved))await writeFile(join(fixture.workspace,name),bytes);}
  }
  const passed=behavior.passed&&types.passed&&publicTests.passed&&regression.passed&&immutableFailures.length===0&&unexpectedFiles.length===0;
  return {passed,behavior,types,publicTests,regression,originalMutation,immutableFailures,unexpectedFiles};
}
