/** Supplemental/post-hoc behavioral protocol, designed after 12 matrix rows existed,
 * using only the fixed task contract; no generated solutions/results/flags inspected.
 * API: PROTOCOL, PROTOCOL_SHA256, RUNNER_SHA256, freezeProtocol(path),
 *      evaluateQuality(absoluteWorkspace, difficulty, nodePath=process.execPath).
 * The original oracle remains authoritative for its original outcome. These cases
 * assess specified behavior only, never tool usage or semantic document quality.
 * No inference, dependencies, workspace writes, or provider/network calls.
 */
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { lstat, readFile, realpath, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';

const sha = value => createHash('sha256').update(value).digest('hex');
const CONTRACT_SHA = '061521b69c9a3b4bed770b139671a50d8b44346a5d2f3fd728d7322a00191a25';
const MODULES = { simple: ['src/pricing.mjs'], medium: ['src/triage.mjs'], complex: ['src/inventory.mjs', 'src/orders.mjs'] };
const LIMITS = Object.freeze({ sourceBytes: 131072, outputBytes: 262144, vmTimeoutMs: 1500, processTimeoutMs: 4000, heapMiB: 96 });
const tagged = value => ({ $qualityValue: value });
const INVALID_NUMBERS = [tagged('NaN'), tagged('Infinity'), tagged('-Infinity'), Number.MAX_SAFE_INTEGER + 1, null, true, '7', {}, []];
const freeze = value => { if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } return value; };
function random(seed) { let state = seed >>> 0; return max => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state % max; }; }
function arithmeticExpected(args) {
  const [price, quantity, discount = 0] = args;
  if (![price, quantity, discount].every(Number.isSafeInteger) || price < 0 || quantity < 0 || discount < 0 || discount > 10000) return { error: 'RangeError' };
  const product = BigInt(price) * BigInt(quantity), weighted = product * BigInt(10000 - discount), max = BigInt(Number.MAX_SAFE_INTEGER);
  return product > max || weighted > max ? { error: 'RangeError' } : { value: Number(weighted / 10000n) };
}
function ticketExpected(rows) {
  const normalized = rows.map(row => ({ id: row.id.trim(), title: row.title.trim(), customerId: row.customerId.trim(), severity: row.severity.trim().toLowerCase(), state: row.state.trim().toLowerCase() }));
  const latest = normalized.filter((row, i) => !normalized.slice(i + 1).some(later => later.id === row.id)).filter(row => row.state === 'open');
  const rank = { urgent: 0, normal: 1, low: 2 };
  return { openCount: latest.length, bySeverity: { urgent: latest.filter(row => row.severity === 'urgent').length, normal: latest.filter(row => row.severity === 'normal').length, low: latest.filter(row => row.severity === 'low').length }, customerIds: [...new Set(latest.map(row => row.customerId))].sort(), queue: [...latest].sort((a,b) => rank[a.severity] - rank[b.severity] || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).map(row => row.id) };
}
function reserveExpected(stock, lines) {
  const fail = reason => ({ accepted: false, remaining: { ...stock }, reason });
  if (!Array.isArray(lines) || !lines.length || lines.some(line => !line || typeof line.sku !== 'string' || !line.sku || !Number.isSafeInteger(line.quantity) || line.quantity <= 0)) return fail('invalid_lines');
  const totals = Object.fromEntries([...new Set(lines.map(line => line.sku))].map(sku => [sku, lines.filter(line => line.sku === sku).reduce((total, line) => total + BigInt(line.quantity), 0n)]));
  if (Object.values(totals).some(total => total > BigInt(Number.MAX_SAFE_INTEGER))) return fail('invalid_lines');
  if (Object.entries(totals).some(([sku,total]) => !Object.hasOwn(stock,sku) || total > BigInt(stock[sku]))) return fail('insufficient_stock');
  return { accepted: true, remaining: Object.fromEntries(Object.entries(stock).map(([sku,quantity]) => [sku, quantity - Number(Object.hasOwn(totals,sku) ? totals[sku] : 0n)])), reason: null };
}
function ordersExpected(stock, orders) {
  const seen = new Set(), valid = [], rejected = [], acceptedIds = [];
  for (const order of orders) {
    if (!order || typeof order.id !== 'string' || !order.id) { rejected.push({ id: null, reason: 'invalid_order' }); continue; }
    if (seen.has(order.id)) continue;
    seen.add(order.id);
    if (!['expedited','normal'].includes(order.priority)) rejected.push({ id: order.id, reason: 'invalid_order' });
    else valid.push(order);
  }
  let remaining = { ...stock };
  for (const priority of ['expedited','normal']) for (const order of valid.filter(order => order.priority === priority)) {
    const result = reserveExpected(remaining, order.lines);
    if (result.accepted) { acceptedIds.push(order.id); remaining = result.remaining; }
    else rejected.push({ id: order.id, reason: result.reason });
  }
  return { acceptedIds, rejected, remaining };
}

function buildProtocol() {
  const cases = { simple: [], medium: [], complex: [] };
  const add = (difficulty, group, fn, args, expected, options = {}) => cases[difficulty].push({ id: `${difficulty}-${String(cases[difficulty].length + 1).padStart(3,'0')}`, group, module: fn === 'reserve' ? 'src/inventory.mjs' : fn === 'fulfillOrders' ? 'src/orders.mjs' : MODULES[difficulty][0], fn, args, expected, ...options });
  for (let position = 0; position < 3; position++) for (const invalid of INVALID_NUMBERS) { const args = [7,3,100]; args[position] = invalid; add('simple','argument_validation','lineTotal',args,{ error:'RangeError' }); }
  for (const args of [[tagged('undefined'),2], [2,tagged('undefined')], [-1,0], [1,0,10001], [Number.MAX_SAFE_INTEGER,2,10000], [Number.MAX_SAFE_INTEGER,0,0], [Number.MAX_SAFE_INTEGER,1,9999], [Number.MAX_SAFE_INTEGER,1,10000], [4503599627370495,1,9998], [4503599627370496,1,9998]]) add('simple','arithmetic_boundaries','lineTotal',args,arithmeticExpected(args));
  const priceRandom = random(0x516a9d);
  for (let i = 0; i < 96; i++) { const args = [priceRandom(1000000),priceRandom(1000),[0,1,9999,10000,priceRandom(10001)][i%5]]; add('simple','deterministic_bigint_reference','lineTotal',args,arithmeticExpected(args)); }
  for (const price of [1,37,199,99991]) for (const discount of [0,1250,3333,9999,10000]) { const args = [price,13,discount]; add('simple','discount_monotonicity_and_symmetry','lineTotal',args,arithmeticExpected(args)); const mirrored = [13,price,discount]; add('simple','discount_monotonicity_and_symmetry','lineTotal',mirrored,arithmeticExpected(mirrored)); }

  const ticket = (id, severity='normal', state='open', customerId='c1') => ({ id, title:'Issue', customerId, severity, state });
  for (const field of ['id','title','customerId','severity','state']) for (const invalid of [tagged('undefined'),null,4,{},true]) add('medium','required_field_validation','normalizeTicket',[{ ...ticket('a'), [field]:invalid }],{ error:'TypeError' });
  for (const field of ['id','title','customerId']) for (const invalid of ['', '   ']) add('medium','required_field_validation','normalizeTicket',[{ ...ticket('a'), [field]:invalid }],{ error:'TypeError' });
  for (const rows of [[{ ...ticket('a'),title:4 },ticket('a')], [{ ...ticket('a','normal','closed'),customerId:null }], [ticket('a'),{ ...ticket('a'),severity:'other' },ticket('a')]]) add('medium','validate_discarded_entries','summarizeTickets',[rows],{ error:'TypeError' });
  const reopened = [ticket('a','urgent','closed','old'),ticket('a','low','open','new')];
  add('medium','reopening_replaces_prior_data','summarizeTickets',[reopened],{ value:ticketExpected(reopened) });
  const raw = { id:' a ',title:' Fix ',customerId:' c ',severity:' URGENT ',state:' OPEN ',extra:'discard' };
  add('medium','frozen_input_immutability','normalizeTicket',[raw],{ value:{ id:'a',title:'Fix',customerId:'c',severity:'urgent',state:'open' } },{ freezeArgs:true });
  const uniqueTickets = [ticket('d','low','open','c2'),ticket('c','urgent'),ticket('a','urgent'),ticket('b','normal','open','c2'),ticket('e','normal','closed','c9')];
  for (let shift=0;shift<uniqueTickets.length;shift++) { const rows=[...uniqueTickets.slice(shift),...uniqueTickets.slice(0,shift)]; add('medium','unique_id_permutation_invariance','summarizeTickets',[rows],{ value:ticketExpected(rows) },{ freezeArgs:true }); }
  const ticketRandom=random(0x726a11);
  for(let i=0;i<64;i++) { const rows=Array.from({length:1+ticketRandom(24)},()=>({ id:` t${ticketRandom(8)} `,title:' Issue ',customerId:` c${ticketRandom(5)} `,severity:` ${['URGENT','normal','LOW'][ticketRandom(3)]} `,state:` ${['OPEN','closed'][ticketRandom(2)]} `,extra:ticketRandom(100) })); add('medium','deterministic_ticket_histories','summarizeTickets',[rows],{ value:ticketExpected(rows) },{ freezeArgs:i%2===0 }); }

  const line=(sku,quantity)=>({sku,quantity}), order=(id,priority,lines)=>({id,priority,lines});
  for(const value of INVALID_NUMBERS) {
    add('complex','stock_safe_integer_validation','reserve',[{a:value},[line('a',1)]],{ error:'TypeError' });
    add('complex','stock_safe_integer_validation','fulfillOrders',[{a:value},[]],{ error:'TypeError' });
    add('complex','line_safe_integer_validation','reserve',[{a:5},[line('a',value)]],{ value:{accepted:false,remaining:{a:5},reason:'invalid_lines'} },{ remainingCopy:true });
  }
  for(const lines of [[line('missing',1),line('a',0)], [line('a',0),line('missing',1)], [line('a',Number.MAX_SAFE_INTEGER),line('a',1)], [null], [{sku:'a'}], [{quantity:1}], [line(4,1)]]) add('complex','invalid_lines_precede_stock_checks','reserve',[{a:0},lines],{ value:{accepted:false,remaining:{a:0},reason:'invalid_lines'} },{ remainingCopy:true });
  for(const lines of [[],[line('a',6)],[line('missing',1)]]) add('complex','failure_returns_stock_copy','reserve',[{a:5},lines],{value:reserveExpected({a:5},lines)},{remainingCopy:true,freezeArgs:true});
  add('complex','safe_quantity_boundary','reserve',[{a:Number.MAX_SAFE_INTEGER},[line('a',Number.MAX_SAFE_INTEGER)]],{value:{accepted:true,remaining:{a:0},reason:null}},{freezeArgs:true});
  // Ordinary JSON own keys are explicit nonempty SKUs, not custom prototypes.
  const collisionStock=JSON.parse('{"constructor":4,"toString":2,"__proto__":3,"a":6}');
  for(const lines of [[line('constructor',1),line('constructor',2),line('__proto__',1),line('__proto__',1)], [line('toString',2)], [line('a',2)]]) add('complex','json_own_sku_keys','reserve',[collisionStock,lines],{value:reserveExpected(collisionStock,lines)},{freezeArgs:true});
  const collisionOrders=[order('first','normal',[line('__proto__',1),line('__proto__',1)]),order('fast','expedited',[line('constructor',2),line('constructor',1)]),order('last','normal',[line('toString',2)])];
  add('complex','json_own_sku_keys','fulfillOrders',[collisionStock,collisionOrders],{value:ordersExpected(collisionStock,collisionOrders)},{freezeArgs:true});
  for(const orders of [null,true,'orders',{}])add('complex','orders_array_validation','fulfillOrders',[{a:2},orders],{error:'TypeError'});
  const explicitOrders=[
    [order('dup','normal',[line('a',0)]),order('dup','expedited',[line('a',1)])],
    [order('n','normal',[line('a',1)]),order('e','expedited',[line('a',1)]),{}],
    [order('dup','invalid',[line('a',1)]),order('dup','normal',[line('a',1)])],
    [order('a','normal',[line('a',1)]),order('a','invalid',null),order('b','expedited',[])],
  ];
  for(const rows of explicitOrders) add('complex','idempotency_and_rejection_order','fulfillOrders',[{a:0},rows],{value:ordersExpected({a:0},rows)},{freezeArgs:true});
  const orderRandom=random(0xa117c9);
  for(let i=0;i<64;i++) {
    const stock={a:orderRandom(10),b:orderRandom(10),c:orderRandom(10)};
    const rows=Array.from({length:1+orderRandom(18)},()=>order(`o${orderRandom(9)}`,['expedited','normal','invalid'][orderRandom(3)],Array.from({length:orderRandom(4)},()=>line(['a','b','c','missing'][orderRandom(4)],orderRandom(5)))));
    add('complex','deterministic_atomic_order_histories','fulfillOrders',[stock,rows],{value:ordersExpected(stock,rows)},{freezeArgs:i%2===0});
    if(i<12) { const scaledStock=Object.fromEntries(Object.entries(stock).map(([key,value])=>[key,value*2]));const scaled=rows.map(row=>({...row,lines:row.lines.map(item=>({...item,quantity:item.quantity*2}))})); add('complex','scale_conservation_and_duplicate_idempotency','fulfillOrders',[scaledStock,scaled],{value:ordersExpected(scaledStock,scaled)},{freezeArgs:true}); const duplicated=[...rows,...rows];add('complex','scale_conservation_and_duplicate_idempotency','fulfillOrders',[stock,duplicated],{value:ordersExpected(stock,rows)},{freezeArgs:true}); }
  }
  return { schema:'orqanix.supplemental-behavior-protocol.v1', designation:'supplemental_post_hoc', designTiming:'Designed after 12 matrix rows existed, without reading their generated code, results or flag identities.', sourceContract:'scripts/lib/orqanix-benchmark-tasks.mjs', sourceContractSha256:CONTRACT_SHA, scope:'Specified code behavior only. Separate from original oracle; no document semantics, tool-use scoring, performance scoring or statistical significance.', caseSemantics:'Each case runs twice on the same inputs; exact result/error type and unchanged arguments required. freezeArgs recursively freezes inputs. remainingCopy checks the explicit failure copy contract. Tagged undefined/nonfinite numbers are decoded before invocation.', seeds:{simple:0x516a9d,medium:0x726a11,complex:0xa117c9}, limits:LIMITS, exclusions:['No generated solutions or result rows used in design','No whitespace-only complex IDs/SKUs, unusual prototypes/getters or locale-dependent ordering; JSON own constructor/toString/__proto__ SKU keys are included','Fixed correlated synthetic cases are not independent reliability trials','VM and process bounds are defense in depth, not an OS security sandbox'], cases };
}
export const PROTOCOL=freeze(buildProtocol());
export const PROTOCOL_SHA256=sha(JSON.stringify(PROTOCOL));
export async function freezeProtocol(path) {
  if(!isAbsolute(path))throw Error('ABSOLUTE_PROTOCOL_PATH_REQUIRED');
  await writeFile(path,`${JSON.stringify({protocolSha256:PROTOCOL_SHA256,protocol:PROTOCOL},null,2)}\n`,{flag:'wx',mode:0o400});
  return {path,protocolSha256:PROTOCOL_SHA256,counts:Object.fromEntries(Object.entries(PROTOCOL.cases).map(([key,value])=>[key,value.length]))};
}

// This runner is not accessible to implementation imports. It exposes no host
// functions in the VM. All source is supplied through stdin; no candidate imports
// can reach the filesystem, process, timers or network APIs.
const CHECK_SOURCE=String.raw`
function decode(value){if(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===1&&Object.hasOwn(value,'$qualityValue')){return {undefined:undefined,NaN:NaN,Infinity:Infinity,'-Infinity':-Infinity}[value.$qualityValue];}if(Array.isArray(value))return value.map(decode);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,decode(v)]));return value;}
function canonical(value){if(value===undefined)return 'undefined';if(typeof value==='number'&&!Number.isFinite(value))return String(value);if(value===null||typeof value!=='object')return typeof value+':'+String(value);if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';}
function freezeInput(value){if(value&&typeof value==='object'){for(const child of Object.values(value))freezeInput(child);Object.freeze(value);}return value;}
function run(cases){return cases.map(test=>{const args=decode(test.args),before=canonical(args);if(test.freezeArgs)freezeInput(args);let failure=null;for(let repeat=0;repeat<2;repeat++){let result,error;try{result=implementations[test.module][test.fn](...args);}catch(e){error=e;}
 if(canonical(args)!==before){failure='INPUT_MUTATED';break;}
 if(test.expected.error){if(error?.name!==test.expected.error){failure=error?'WRONG_ERROR_TYPE':'EXPECTED_ERROR_NOT_THROWN';break;}}
 else if(error){failure='UNEXPECTED_ERROR';break;}else if(canonical(result)!==canonical(test.expected.value)){failure='RESULT_MISMATCH';break;}else if(test.remainingCopy&&result.remaining===args[0]){failure='RESULT_ALIASES_STOCK';break;}
 }return {id:test.id,group:test.group,passed:failure===null,...(failure?{failure}:{})};});}
`;
const WORKER_SOURCE=String.raw`
import vm from 'node:vm';
import {posix} from 'node:path';
let input='';for await(const chunk of process.stdin){input+=chunk;if(input.length>4194304)throw Error('INPUT_LIMIT');}
try{
 const payload=JSON.parse(input), context=vm.createContext(Object.create(null),{codeGeneration:{strings:false,wasm:false}}),cache=new Map();
 const get=name=>{if(!Object.hasOwn(payload.sources,name))throw Error('IMPORT_NOT_ALLOWED');if(!cache.has(name))cache.set(name,new vm.SourceTextModule(payload.sources[name],{context,identifier:name,importModuleDynamically:()=>{throw Error('IMPORT_NOT_ALLOWED');}}));return cache.get(name);};
 const source=Object.keys(payload.sources).map((name,i)=>'import * as m'+i+' from '+JSON.stringify('./'+name)+';').join('\n')+'\nconst implementations={'+Object.keys(payload.sources).map((name,i)=>JSON.stringify(name)+':m'+i).join(',')+'};\n'+payload.checkSource+'\nexport const resultJson=JSON.stringify(run(JSON.parse('+JSON.stringify(JSON.stringify(payload.cases))+')));';
 const verifier=new vm.SourceTextModule(source,{context,identifier:'__quality_verifier__.mjs'});
 await verifier.link((specifier,parent)=>{if(!specifier.startsWith('./')&&!specifier.startsWith('../'))throw Error('IMPORT_NOT_ALLOWED');const name=posix.normalize(posix.join(posix.dirname(parent.identifier),specifier));return get(name);});
 await verifier.evaluate({timeout:payload.vmTimeoutMs});
 process.stdout.write(verifier.namespace.resultJson);
}catch(error){process.stdout.write(JSON.stringify({error:error?.code==='ERR_SCRIPT_EXECUTION_TIMEOUT'?'VM_TIMEOUT':error?.message==='IMPORT_NOT_ALLOWED'?'IMPORT_NOT_ALLOWED':'IMPLEMENTATION_LOAD_OR_RUN_FAILED'}));process.exitCode=1;}
`;
export const RUNNER_SHA256=sha(WORKER_SOURCE+CHECK_SOURCE);
async function readSources(workspace,difficulty) {
  if(!isAbsolute(workspace))throw Error('ABSOLUTE_WORKSPACE_REQUIRED');
  const root=await realpath(workspace),sources={};
  for(const name of MODULES[difficulty]){
    let path=root;for(const part of name.split('/')){path=join(path,part);if((await lstat(path)).isSymbolicLink())throw Error('SYMLINK_REJECTED');}
    const info=await lstat(path),actual=await realpath(path),rel=relative(root,actual);
    if(!info.isFile()||info.size>LIMITS.sourceBytes||rel==='..'||rel.startsWith(`..${sep}`)||isAbsolute(rel))throw Error('SOURCE_NOT_BOUNDED_REGULAR_FILE');
    sources[name]=await readFile(path,'utf8');
    if(Buffer.byteLength(sources[name])>LIMITS.sourceBytes)throw Error('SOURCE_NOT_BOUNDED_REGULAR_FILE');
  }
  return sources;
}
async function execute(nodePath,payload) {
  return new Promise(resolve=>{
    let child;try{child=spawn(nodePath,['--experimental-vm-modules',`--max-old-space-size=${LIMITS.heapMiB}`,'--input-type=module','-e',WORKER_SOURCE],{env:{NODE_NO_WARNINGS:'1',LANG:'C',LC_ALL:'C'},stdio:['pipe','pipe','pipe']});}catch{return resolve({error:'RUNNER_UNAVAILABLE'});}
    let output='',size=0,reason=null,settled=false;
    const timer=setTimeout(()=>{reason='PROCESS_TIMEOUT';child.kill('SIGKILL');},LIMITS.processTimeoutMs);
    const finish=value=>{if(settled)return;settled=true;clearTimeout(timer);resolve(value);};
    child.on('error',()=>finish({error:'RUNNER_UNAVAILABLE'}));
    child.stdout.on('data',chunk=>{size+=chunk.length;if(size>LIMITS.outputBytes){reason='OUTPUT_LIMIT';child.kill('SIGKILL');}else output+=chunk;});
    child.stderr.on('data',chunk=>{size+=chunk.length;if(size>LIMITS.outputBytes){reason='OUTPUT_LIMIT';child.kill('SIGKILL');}});
    child.stdin.on('error',()=>{});
    child.on('close',code=>{if(reason)return finish({error:reason});try{const value=JSON.parse(output);finish(code===0||value.error?value:{error:'RUNNER_FAILED'});}catch{finish({error:'RUNNER_FAILED'});}});
    child.stdin.end(JSON.stringify(payload));
  });
}
export async function evaluateQuality(workspace,difficulty,nodePath=process.execPath) {
  if(!Object.hasOwn(PROTOCOL.cases,difficulty))throw Error('UNKNOWN_DIFFICULTY');
  let sources,result;
  try{sources=await readSources(workspace,difficulty);result=await execute(nodePath,{sources,cases:PROTOCOL.cases[difficulty],checkSource:CHECK_SOURCE,vmTimeoutMs:LIMITS.vmTimeoutMs});}
  catch(error){result={error:['ABSOLUTE_WORKSPACE_REQUIRED','SYMLINK_REJECTED','SOURCE_NOT_BOUNDED_REGULAR_FILE'].includes(error.message)?error.message:'SOURCE_READ_FAILED'};}
  const expected=PROTOCOL.cases[difficulty];
  const valid=Array.isArray(result)&&result.length===expected.length&&result.every((check,i)=>check.id===expected[i].id&&check.group===expected[i].group&&typeof check.passed==='boolean');
  const checks=valid?result:expected.map(test=>({id:test.id,group:test.group,passed:false,failure:result.error||'INVALID_RUNNER_OUTPUT'}));
  return {schema:'orqanix.supplemental-behavior-result.v1',designation:PROTOCOL.designation,protocolSha256:PROTOCOL_SHA256,runnerSha256:RUNNER_SHA256,sourceContractSha256:CONTRACT_SHA,difficulty,passed:valid&&checks.every(check=>check.passed),executionError:valid?null:result.error||'INVALID_RUNNER_OUTPUT',checks,groups:Object.fromEntries([...new Set(checks.map(check=>check.group))].map(group=>{const selected=checks.filter(check=>check.group===group);return [group,{passed:selected.every(check=>check.passed),checks:selected.length,passedChecks:selected.filter(check=>check.passed).length}];})),sourceHashes:sources?Object.fromEntries(Object.entries(sources).map(([name,source])=>[name,sha(source)])):null,limits:LIMITS};
}
