import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chmod, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DIFFICULTIES, evaluate, prepareFixture, prompt } from './orqanix-benchmark-tasks.mjs';
const execute = promisify(execFile);

const SOLUTIONS = {
  simple: {
    'src/pricing.mjs': `export function lineTotal(p,q,d=0){if(![p,q,d].every(Number.isSafeInteger)||p<0||q<0||d<0||d>10000)throw new RangeError();const total=p*q,discounted=total*(10000-d);if(!Number.isSafeInteger(total)||!Number.isSafeInteger(discounted))throw new RangeError();return Math.floor(discounted/10000);}\n`,
  },
  medium: {
    'src/triage.mjs': `export function normalizeTicket(raw){if(!raw||typeof raw!=='object')throw new TypeError();const result={};for(const key of ['id','title','customerId','severity','state']){if(typeof raw[key]!=='string'||!raw[key].trim())throw new TypeError();result[key]=raw[key].trim();}result.severity=result.severity.toLowerCase();result.state=result.state.toLowerCase();if(!['urgent','normal','low'].includes(result.severity)||!['open','closed'].includes(result.state))throw new TypeError();return result;}
export function summarizeTickets(tickets){if(!Array.isArray(tickets))throw new TypeError();const latest=new Map();for(const raw of tickets){const ticket=normalizeTicket(raw);latest.set(ticket.id,ticket);}const rows=[...latest.values()].filter(x=>x.state==='open'),bySeverity={urgent:0,normal:0,low:0},rank={urgent:0,normal:1,low:2};for(const row of rows)bySeverity[row.severity]++;return {openCount:rows.length,bySeverity,customerIds:[...new Set(rows.map(x=>x.customerId))].sort(),queue:rows.sort((a,b)=>rank[a.severity]-rank[b.severity]||(a.id<b.id?-1:a.id>b.id?1:0)).map(x=>x.id)};}\n`,
  },
  complex: {
    'src/inventory.mjs': `export function validateStock(stock){if(!stock||Object.getPrototypeOf(stock)!==Object.prototype||Object.entries(stock).some(([k,v])=>!k||!Number.isSafeInteger(v)||v<0))throw new TypeError();}
export function reserve(stock,lines){validateStock(stock);const fail=reason=>({accepted:false,remaining:{...stock},reason}),need=new Map();if(!Array.isArray(lines)||!lines.length)return fail('invalid_lines');for(const line of lines){if(!line||typeof line.sku!=='string'||!line.sku||!Number.isSafeInteger(line.quantity)||line.quantity<=0)return fail('invalid_lines');const amount=(need.get(line.sku)||0)+line.quantity;if(!Number.isSafeInteger(amount))return fail('invalid_lines');need.set(line.sku,amount);}for(const [sku,amount] of need){if(!Object.hasOwn(stock,sku)||stock[sku]<amount)return fail('insufficient_stock');}const remaining={...stock};for(const [sku,amount]of need)remaining[sku]-=amount;return {accepted:true,remaining,reason:null};}\n`,
    'src/orders.mjs': `import {reserve,validateStock} from './inventory.mjs';
export function fulfillOrders(stock,orders){validateStock(stock);if(!Array.isArray(orders))throw new TypeError();const seen=new Set(),pending=[],rejected=[],acceptedIds=[];let remaining={...stock};for(const order of orders){const id=typeof order?.id==='string'&&order.id?order.id:null;if(id===null){rejected.push({id:null,reason:'invalid_order'});continue;}if(seen.has(id))continue;seen.add(id);if(!['expedited','normal'].includes(order.priority)){rejected.push({id,reason:'invalid_order'});continue;}pending.push(order);}pending.sort((a,b)=>(a.priority==='expedited'?0:1)-(b.priority==='expedited'?0:1));for(const order of pending){const result=reserve(remaining,order.lines);if(result.accepted){acceptedIds.push(order.id);remaining=result.remaining;}else rejected.push({id:order.id,reason:result.reason});}return {acceptedIds,rejected,remaining};}\n`,
  },
};
const EXAMPLES = {
  simple: [{ id: 'zero', input: [1250,0,0], expected: 0 }, { id: 'rounding', input: [199,3,1250], expected: 522 }],
  medium: [{ id: 'latest_closed', input: [{id:'a',title:'Fix',customerId:'c',severity:'urgent',state:'open'},{id:'a',title:'Fixed',customerId:'c',severity:'urgent',state:'closed'}], expected:{openCount:0,bySeverity:{urgent:0,normal:0,low:0},customerIds:[],queue:[]} }],
  complex: [{ id:'priority_and_atomicity',input:{stock:{a:3,b:1},orders:[{id:'normal',priority:'normal',lines:[{sku:'a',quantity:2}]},{id:'fast',priority:'expedited',lines:[{sku:'a',quantity:2},{sku:'b',quantity:1}]}]},expected:{acceptedIds:['fast'],rejected:[{id:'normal',reason:'insufficient_stock'}],remaining:{a:1,b:0}} }],
};
const DOCS = {simple:'report.json',medium:'requirements.json',complex:'acceptance-plan.json'};
const LINKS = { medium:{latest_open:'I2',priority_order:'I1',customer_summary:'I3'},complex:{atomic_reservation:'E1',expedited_first:'E2',idempotent_ids:'E3',invalid_immutable:'E4'} };
async function fixture(t,difficulty){const root=await mkdtemp(join(tmpdir(),'orqanix-task-test-'));t.after(()=>rm(root,{recursive:true,force:true}));return prepareFixture(root,difficulty);}
async function complete(f,difficulty){
  for(const [file,source]of Object.entries(SOLUTIONS[difficulty]))await writeFile(join(f.workspace,file),source);
  let doc={summary:'Implementation follows supplied constraints.'};
  if(difficulty==='simple')doc.examples=structuredClone(EXAMPLES.simple);
  else {
    const evidence=JSON.parse(await readFile(join(f.workspace,'evidence/interviews.json'),'utf8'));
    doc={...doc,requirements:Object.entries(LINKS[difficulty]).map(([id,sourceId])=>({id,description:'This constraint is implemented.',sources:[{id:sourceId,quote:evidence.find(x=>x.id===sourceId).quote}],acceptance:{given:'Supplied inputs',when:'The operation runs',then:'The specified constraint holds'}})),assumptions:[],scenarios:structuredClone(EXAMPLES[difficulty])};
  }
  await writeFile(join(f.workspace,DOCS[difficulty]),JSON.stringify(doc));return doc;
}

test('prompt is fixed, synthetic and does not force native or specialist tools',()=>{
  for(const difficulty of DIFFICULTIES){assert.equal(prompt(difficulty),prompt(difficulty));assert.doesNotMatch(prompt(difficulty),/ast_search|hashline_edit|safe_edit_and_test|ask_axwise|lsp_query|Jev|flags/i);assert.match(prompt(difficulty),/synthetic/);}
  assert.throws(()=>prompt('unknown'),/UNKNOWN_DIFFICULTY/);
});

test('fixture is an isolated clean Git repository and oracle is outside agent workspace',async t=>{
  const f=await fixture(t,'medium');
  assert.ok(!f.oraclePath.startsWith(`${f.workspace}/`));
  const status=await execute('git',['status','--porcelain'],{cwd:f.workspace});assert.equal(status.stdout,'');
  const hooks=await execute('git',['config','--get','core.hooksPath'],{cwd:f.workspace});assert.equal(hooks.stdout.trim(),join(f.root,'oracle','hooks'));
  const before=await readFile(join(f.workspace,'README.md'),'utf8');assert.match(before,/Read-only exploration/);
  await assert.rejects(prepareFixture(f.root,'medium'),/EMPTY_ROOT_REQUIRED/);assert.equal(await readFile(join(f.workspace,'README.md'),'utf8'),before);
});

for(const difficulty of DIFFICULTIES){
  test(`${difficulty}: public starter smoke succeeds but independent oracle fails`,async t=>{
    const f=await fixture(t,difficulty);await execute(process.execPath,['--test','tests/public.test.mjs'],{cwd:f.workspace});
    const result=await evaluate(f.root,difficulty,process.execPath);assert.equal(result.integrity.passed,true);assert.equal(result.code.passed,false);assert.equal(result.documents.passed,false);assert.equal(result.passed,false);
  });
  test(`${difficulty}: independently implemented reference passes code and document contract`,async t=>{
    const f=await fixture(t,difficulty);await complete(f,difficulty);const result=await evaluate(f.root,difficulty,process.execPath);
    assert.equal(result.passed,true,JSON.stringify(result));assert.equal(result.documents.semanticQualityEvaluated,false);assert.ok(result.code.checks.length>=5);
  });
}

test('document checks reject incorrect evidence and mismatched expected outputs independently of working code',async t=>{
  const f=await fixture(t,'medium'),doc=await complete(f,'medium');doc.requirements[0].sources[0].quote='Invented interview quote';doc.scenarios[0].expected.openCount=5;
  await writeFile(join(f.workspace,DOCS.medium),JSON.stringify(doc));const result=await evaluate(f.root,'medium');
  assert.equal(result.code.passed,true);assert.equal(result.documents.passed,false);assert.ok(result.documents.checks.filter(x=>!x.passed).length>=2);
});

test('code mutations fail independently even with complete documents',async t=>{
  const f=await fixture(t,'medium');await complete(f,'medium');
  const mutations=[
    SOLUTIONS.medium['src/triage.mjs'].replace("x.state==='open'","x.state==='closed'"),
    SOLUTIONS.medium['src/triage.mjs'].replace('latest.set(ticket.id,ticket);','if(!latest.has(ticket.id))latest.set(ticket.id,ticket);'),
    SOLUTIONS.medium['src/triage.mjs'].replace('rank[a.severity]-rank[b.severity]','rank[b.severity]-rank[a.severity]'),
    SOLUTIONS.medium['src/triage.mjs'].replace('const result={};','const result=raw;'),
  ];
  for(const source of mutations){await writeFile(join(f.workspace,'src/triage.mjs'),source);const result=await evaluate(f.root,'medium');assert.equal(result.code.passed,false,source);assert.equal(result.documents.passed,true);}
});

test('complex oracle catches line aggregation, partial allocation and priority/idempotency mutants',async t=>{
  const f=await fixture(t,'complex');await complete(f,'complex');
  const pairs=[['src/inventory.mjs',SOLUTIONS.complex['src/inventory.mjs'].replace('(need.get(line.sku)||0)+line.quantity','line.quantity')],['src/inventory.mjs',SOLUTIONS.complex['src/inventory.mjs'].replace("return fail('insufficient_stock');","return {accepted:false,remaining:{},reason:'insufficient_stock'};")],['src/orders.mjs',SOLUTIONS.complex['src/orders.mjs'].replace("(a.priority==='expedited'?0:1)-(b.priority==='expedited'?0:1)","0")],['src/orders.mjs',SOLUTIONS.complex['src/orders.mjs'].replace('if(seen.has(id))continue;','')]];
  for(const [file,source] of pairs){await complete(f,'complex');await writeFile(join(f.workspace,file),source);const result=await evaluate(f.root,'complex');assert.equal(result.code.passed,false,source);assert.equal(result.documents.passed,true);}
});

test('modified public tests and oracle tampering never pass',async t=>{
  const f=await fixture(t,'simple');await complete(f,'simple');await writeFile(join(f.workspace,'tests/public.test.mjs'),'// weakened test');let result=await evaluate(f.root,'simple');assert.equal(result.integrity.passed,false);assert.equal(result.code.error,'FIXTURE_INTEGRITY_FAILED');
  await chmod(f.oraclePath,0o600);await writeFile(f.oraclePath,'process.stdout.write(JSON.stringify({passed:true,checks:[{passed:true}]}))');result=await evaluate(f.root,'simple');assert.equal(result.integrity.checks.find(x=>x.name==='independent oracle intact').passed,false);
});

test('source symlinks and external imports are rejected',async t=>{
  const f=await fixture(t,'simple');await complete(f,'simple');await rm(join(f.workspace,'src/pricing.mjs'));await symlink(f.oraclePath,join(f.workspace,'src/pricing.mjs'));let result=await evaluate(f.root,'simple');assert.equal(result.integrity.passed,false);
  await rm(join(f.workspace,'src/pricing.mjs'));await writeFile(join(f.workspace,'src/pricing.mjs'),"import fs from 'node:fs'; export function lineTotal(){return 0;}\n");result=await evaluate(f.root,'simple');assert.equal(result.code.passed,false);assert.match(result.code.checks[0].error,/EXTERNAL_IMPORT_UNAVAILABLE/);
});

test('nonterminating candidate is bounded and cannot be treated as success',async t=>{
  const f=await fixture(t,'simple');await complete(f,'simple');await writeFile(join(f.workspace,'src/pricing.mjs'),'export function lineTotal(){while(true){}}');const started=Date.now(),result=await evaluate(f.root,'simple');assert.equal(result.code.error,'ORACLE_TIMEOUT');assert.equal(result.passed,false);assert.ok(Date.now()-started<8000);
});
