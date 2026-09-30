import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { PROTOCOL, PROTOCOL_SHA256, evaluateQuality, freezeProtocol } from './orqanix-benchmark-quality.mjs';

// Independently authored from the fixed task contract AFTER the rubric was frozen.
// These are evaluator fixtures, never matrix-generated solutions.
const PRICING=`export function lineTotal(priceCents,quantity,discountBps=0){
 if(![priceCents,quantity,discountBps].every(Number.isSafeInteger)||priceCents<0||quantity<0||discountBps<0||discountBps>10000)throw new RangeError();
 const product=priceCents*quantity,weighted=product*(10000-discountBps);
 if(!Number.isSafeInteger(product)||!Number.isSafeInteger(weighted))throw new RangeError();
 return Math.floor(weighted/10000);
}`;
const TRIAGE=`export function normalizeTicket(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new TypeError();
 const result={};for(const key of ['id','title','customerId','severity','state']){if(typeof raw[key]!=='string')throw new TypeError();result[key]=raw[key].trim();}
 result.severity=result.severity.toLowerCase();result.state=result.state.toLowerCase();
 if(!result.id||!result.title||!result.customerId||!['urgent','normal','low'].includes(result.severity)||!['open','closed'].includes(result.state))throw new TypeError();return result;
}
export function summarizeTickets(tickets){
 if(!Array.isArray(tickets))throw new TypeError();const normalized=tickets.map(normalizeTicket);
 const latest=new Map();for(const ticket of normalized)latest.set(ticket.id,ticket);
 const open=[...latest.values()].filter(x=>x.state==='open');const bySeverity={urgent:0,normal:0,low:0};for(const ticket of open)bySeverity[ticket.severity]++;
 const rank={urgent:0,normal:1,low:2};open.sort((a,b)=>rank[a.severity]-rank[b.severity]||(a.id<b.id?-1:a.id>b.id?1:0));
 return {openCount:open.length,bySeverity,customerIds:[...new Set(open.map(x=>x.customerId))].sort(),queue:open.map(x=>x.id)};
}`;
const INVENTORY=`export function validateStock(stock){
 if(!stock||typeof stock!=='object'||Array.isArray(stock)||Object.keys(stock).some(key=>key.length===0)||Object.values(stock).some(x=>!Number.isSafeInteger(x)||x<0))throw new TypeError();
}
export function reserve(stock,lines){
 validateStock(stock);const failure=reason=>({accepted:false,remaining:{...stock},reason});
 if(!Array.isArray(lines)||!lines.length)return failure('invalid_lines');
 const totals=new Map();for(const item of lines){
  if(!item||typeof item.sku!=='string'||!item.sku||!Number.isSafeInteger(item.quantity)||item.quantity<=0)return failure('invalid_lines');
  const total=(totals.get(item.sku)||0)+item.quantity;if(!Number.isSafeInteger(total))return failure('invalid_lines');totals.set(item.sku,total);
 }
 for(const [sku,quantity]of [...totals])if(!Object.hasOwn(stock,sku)||stock[sku]<quantity)return failure('insufficient_stock');
 const remaining={...stock};for(const [sku,quantity]of [...totals])remaining[sku]-=quantity;
 return {accepted:true,remaining,reason:null};
}`;
const ORDERS=`import {reserve,validateStock} from './inventory.mjs';
export function fulfillOrders(stock,orders){
 validateStock(stock);if(!Array.isArray(orders))throw new TypeError();
 const seen=new Set(),valid=[],acceptedIds=[],rejected=[];let remaining={...stock};
 for(const order of orders){
  if(!order||typeof order.id!=='string'||!order.id){rejected.push({id:null,reason:'invalid_order'});continue;}
  if(seen.has(order.id))continue;seen.add(order.id);
  if(!['normal','expedited'].includes(order.priority)){rejected.push({id:order.id,reason:'invalid_order'});continue;}
  valid.push(order);
 }
 valid.sort((a,b)=>(a.priority==='expedited'?0:1)-(b.priority==='expedited'?0:1));
 for(const order of valid){const result=reserve(remaining,order.lines);if(result.accepted){remaining=result.remaining;acceptedIds.push(order.id);}else rejected.push({id:order.id,reason:result.reason});}
 return {acceptedIds,rejected,remaining};
}`;
const FILES={simple:{'pricing.mjs':PRICING},medium:{'triage.mjs':TRIAGE},complex:{'inventory.mjs':INVENTORY,'orders.mjs':ORDERS}};
async function fixture(t,difficulty,changes={}){
 const dir=await mkdtemp(join(tmpdir(),'quality-protocol-test-'));t.after(()=>rm(dir,{recursive:true,force:true}));await mkdir(join(dir,'src'));
 for(const [file,source]of Object.entries({...FILES[difficulty],...changes}))await writeFile(join(dir,'src',file),source);
 return dir;
}
const failedGroups=result=>new Set(result.checks.filter(check=>!check.passed).map(check=>check.group));

test('frozen concrete rubric is stable, deeply frozen and bound to the fixed task source',async()=>{
 assert.equal(PROTOCOL_SHA256,'bc6a8bd56f8098f796b557e79feea13c29014b9fe1af57b68335f88d2bce8996');
 assert.deepEqual(Object.fromEntries(Object.entries(PROTOCOL.cases).map(([key,cases])=>[key,cases.length])),{simple:173,medium:105,complex:138});
 assert.equal(createHash('sha256').update(await readFile(new URL('./orqanix-benchmark-tasks.mjs',import.meta.url))).digest('hex'),PROTOCOL.sourceContractSha256);
 assert.throws(()=>{PROTOCOL.cases.simple[0].expected.error='anything';},TypeError);
 for(const cases of Object.values(PROTOCOL.cases))assert.equal(new Set(cases.map(c=>c.id)).size,cases.length);
});

test('protocol artifact is read-only, exclusive, and preserves the canonical hash',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'quality-freeze-test-'));t.after(()=>rm(dir,{recursive:true,force:true}));const path=join(dir,'protocol.json');await freezeProtocol(path);
 const saved=JSON.parse(await readFile(path,'utf8'));assert.equal(saved.protocolSha256,PROTOCOL_SHA256);assert.equal(createHash('sha256').update(JSON.stringify(saved.protocol)).digest('hex'),PROTOCOL_SHA256);assert.equal((await stat(path)).mode&0o777,0o400);await assert.rejects(freezeProtocol(path),/EEXIST/);
});

for(const difficulty of ['simple','medium','complex'])test(`${difficulty}: independent reference satisfies every frozen case without modifying workspace`,async t=>{
 const dir=await fixture(t,difficulty),before=Object.fromEntries(await Promise.all(Object.keys(FILES[difficulty]).map(async name=>[name,await readFile(join(dir,'src',name),'utf8')])));
 const result=await evaluateQuality(dir,difficulty);assert.equal(result.passed,true,JSON.stringify(result.checks.filter(c=>!c.passed)));assert.equal(result.executionError,null);assert.equal(result.checks.length,PROTOCOL.cases[difficulty].length);assert.equal(result.protocolSha256,PROTOCOL_SHA256);assert.match(result.runnerSha256,/^[a-f0-9]{64}$/);
 for(const [name,content]of Object.entries(before))assert.equal(await readFile(join(dir,'src',name),'utf8'),content);
});

test('arithmetic mutants: nearest rounding and zero-result validation bypass are detected',async t=>{
 const rounding=await fixture(t,'simple',{'pricing.mjs':PRICING.replace('Math.floor','Math.round')});const r=await evaluateQuality(rounding,'simple');assert.equal(r.passed,false);assert.ok(failedGroups(r).has('deterministic_bigint_reference'));
 const bypass=await fixture(t,'simple',{'pricing.mjs':PRICING.replace(' if(![priceCents',' if(quantity===0||discountBps===10000)return 0;\n if(![priceCents')});const b=await evaluateQuality(bypass,'simple');assert.equal(b.passed,false);assert.ok(failedGroups(b).has('arithmetic_boundaries'));
});

test('ticket mutants: validate-after-deduplication and in-place normalization are detected',async t=>{
 const discarded=TRIAGE.replace('tickets.map(normalizeTicket)','tickets.filter((row,i)=>!tickets.slice(i+1).some(later=>later.id===row.id)).map(normalizeTicket)');
 const d=await evaluateQuality(await fixture(t,'medium',{'triage.mjs':discarded}),'medium');assert.equal(d.passed,false);assert.ok(failedGroups(d).has('validate_discarded_entries'));
 const mutating=TRIAGE.replace('const result={};','const result=raw;');const m=await evaluateQuality(await fixture(t,'medium',{'triage.mjs':mutating}),'medium');assert.equal(m.passed,false);assert.ok(failedGroups(m).has('frozen_input_immutability'));assert.ok(m.checks.some(c=>c.failure==='INPUT_MUTATED'));
});

test('reservation mutants: shortage-before-validation and stock-result alias are detected',async t=>{
 const early=INVENTORY.replace(' const totals=new Map();'," if(Array.isArray(lines))for(const item of lines)if(item&&!Object.hasOwn(stock,item.sku))return failure('insufficient_stock');\n const totals=new Map();");
 const e=await evaluateQuality(await fixture(t,'complex',{'inventory.mjs':early}),'complex');assert.equal(e.passed,false);assert.ok(failedGroups(e).has('invalid_lines_precede_stock_checks'));
 const alias=INVENTORY.replace('remaining:{...stock}','remaining:stock');const a=await evaluateQuality(await fixture(t,'complex',{'inventory.mjs':alias}),'complex');assert.equal(a.passed,false);assert.ok(a.checks.some(c=>c.failure==='RESULT_ALIASES_STOCK'));
});

test('ordinary-object accumulator mutant fails JSON own SKU names without custom prototypes',async t=>{
 const collision=INVENTORY.replace('const totals=new Map();','const totals={};').replace('totals.get(item.sku)','totals[item.sku]').replace('totals.set(item.sku,total)','totals[item.sku]=total').replaceAll('[...totals]','Object.entries(totals)');
 const result=await evaluateQuality(await fixture(t,'complex',{'inventory.mjs':collision}),'complex');assert.equal(result.passed,false);assert.ok(failedGroups(result).has('json_own_sku_keys'));
});

test('external static and dynamic imports fail closed without granting host APIs',async t=>{
 for(const source of ["import fs from 'node:fs';\n"+PRICING,"await import('node:fs');\n"+PRICING]){const result=await evaluateQuality(await fixture(t,'simple',{'pricing.mjs':source}),'simple');assert.equal(result.passed,false);assert.equal(result.executionError,'IMPORT_NOT_ALLOWED');assert.equal(result.checks.filter(c=>c.passed).length,0);}
 const escaped=await evaluateQuality(await fixture(t,'simple',{'pricing.mjs':"Function('return process')();\n"+PRICING}),'simple');assert.equal(escaped.passed,false);assert.equal(escaped.executionError,'IMPLEMENTATION_LOAD_OR_RUN_FAILED');
});

test('symlink sources are rejected before execution and malformed modules cannot pass',async t=>{
 const dir=await fixture(t,'simple');await rm(join(dir,'src','pricing.mjs'));await writeFile(join(dir,'outside.mjs'),PRICING);await symlink('../outside.mjs',join(dir,'src','pricing.mjs'));
 const linked=await evaluateQuality(dir,'simple');assert.equal(linked.executionError,'SYMLINK_REJECTED');assert.equal(linked.passed,false);
 const malformed=await evaluateQuality(await fixture(t,'simple',{'pricing.mjs':'this is not JavaScript'}),'simple');assert.equal(malformed.passed,false);assert.equal(malformed.executionError,'IMPLEMENTATION_LOAD_OR_RUN_FAILED');
});

test('runaway candidate computation is bounded and never counted as passing',async t=>{
 const dir=await fixture(t,'simple',{'pricing.mjs':'export function lineTotal(){while(true){}}'}),started=Date.now();const result=await evaluateQuality(dir,'simple');assert.equal(result.passed,false);assert.ok(['VM_TIMEOUT','PROCESS_TIMEOUT'].includes(result.executionError));assert.ok(Date.now()-started<7000);assert.ok(result.checks.every(c=>!c.passed));
});
