/**
 * Fixed, synthetic workloads for all flag combinations. No provider calls/dependencies.
 * prepareFixture(root, difficulty) -> {root, workspace, oraclePath, permittedFiles,
 *   publicTestCommand, prompt}; requires an empty absolute root, never deletes it.
 * prompt(difficulty) is stable and has no feature-flag/tool-specific instructions.
 * evaluate(root, difficulty, nodePath) runs independent bounded code checks and
 * separately reports document schema, exact evidence links and example checks.
 * Documents are NOT graded for semantic quality. Oracle is outside workspace;
 * the caller must enforce that workspace is the only agent-writable directory.
 */
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const sha = value => createHash('sha256').update(value).digest('hex');
export const DIFFICULTIES = Object.freeze(['simple', 'medium', 'complex']);
const MAX_BYTES = 128 * 1024;

const EVIDENCE = {
  medium: [
    { id: 'I1', role: 'Support lead', quote: 'Urgent open tickets must appear before normal and low tickets; ties should use the ticket ID in ascending order.' },
    { id: 'I2', role: 'Operations analyst', quote: 'Repeated IDs are updates: keep the last occurrence, and exclude tickets whose latest state is closed.' },
    { id: 'I3', role: 'Account manager', quote: 'The summary must count open tickets by severity and list each affected customer once in ascending ID order.' },
  ],
  complex: [
    { id: 'E1', role: 'Warehouse operator', quote: 'Reserve all lines of an order together or reserve nothing; repeated SKU lines must be added together before checking stock.' },
    { id: 'E2', role: 'Dispatch manager', quote: 'Expedited orders get stock before normal orders; preserve arrival order within each priority.' },
    { id: 'E3', role: 'Payments analyst', quote: 'An order ID is idempotent: process only its first occurrence and ignore later duplicates.' },
    { id: 'E4', role: 'Quality analyst', quote: 'Invalid order lines must be rejected without changing stock, and callers must retain their original input objects.' },
  ],
};

const SPECS = {
  simple: {
    title: 'Repair an invoice line total',
    files: {
      'src/pricing.mjs': 'export function lineTotal(priceCents, quantity, discountBps = 0) {\n  return Math.round(priceCents * (quantity || 1) * (1 - discountBps / 10000));\n}\n',
    },
    document: 'report.json',
    instructions: `Fix lineTotal(priceCents, quantity, discountBps=0) in src/pricing.mjs. All inputs must be safe integers: priceCents and quantity are nonnegative, discountBps is 0..10000. Invalid input or an unsafe integer intermediate priceCents*quantity or product*(10000-discountBps) throws RangeError. Return Math.floor(product*(10000-discountBps)/10000). Zero quantity and full discount return zero. Keep the named export. Write report.json with {"summary": a short explanation string, "examples":[{"id":"zero","input":[1250,0,0],"expected":0},{"id":"rounding","input":[199,3,1250],"expected":522}]}. Explain the change and run the available tests.`,
    publicTest: `import assert from 'node:assert/strict';\nimport { test } from 'node:test';\nimport { lineTotal } from '../src/pricing.mjs';\ntest('ordinary invoice line', () => assert.equal(lineTotal(500, 2), 1000));\n`,
    scenarios: [{ id: 'zero', input: [1250, 0, 0], expected: 0 }, { id: 'rounding', input: [199, 3, 1250], expected: 522 }],
  },
  medium: {
    title: 'Turn support interviews into requirements and repair the triage summary',
    files: {
      'src/triage.mjs': `export function normalizeTicket(raw) {\n  return { ...raw, title: raw.title.trim() };\n}\nexport function summarizeTickets(tickets) {\n  return { openCount: tickets.length, bySeverity: {}, customerIds: tickets.map(x => x.customerId), queue: tickets.map(x => x.id) };\n}\n`,
    },
    document: 'requirements.json',
    requirementSources: { latest_open: 'I2', priority_order: 'I1', customer_summary: 'I3' },
    instructions: `Read the three synthetic interviews in evidence/interviews.json and turn their needs into requirements.json while fixing src/triage.mjs. normalizeTicket(raw) returns only {id,title,customerId,severity,state}; trim all strings, lowercase severity/state, require nonempty id/title/customerId, severity urgent|normal|low and state open|closed. Bad input throws TypeError, and inputs must not be mutated. summarizeTickets(tickets) rejects a non-array with TypeError, normalizes every entry, keeps the last occurrence per ID, then considers only open tickets. Return {openCount,bySeverity:{urgent,normal,low},customerIds,queue}; customerIds are unique ascending strings, queue holds IDs ordered urgent then normal then low, with ascending IDs for ties. Preserve both named exports. The document schema and required evidence IDs are in README.md. Run the available tests and describe any unverified behavior.`,
    publicTest: `import assert from 'node:assert/strict';\nimport { test } from 'node:test';\nimport { normalizeTicket } from '../src/triage.mjs';\ntest('trims ticket title', () => assert.equal(normalizeTicket({id:'a',title:' Fix ',customerId:'c',severity:'normal',state:'open'}).title, 'Fix'));\n`,
    scenarios: [{ id: 'latest_closed', input: [{ id: 'a', title: 'Fix', customerId: 'c', severity: 'urgent', state: 'open' }, { id: 'a', title: 'Fixed', customerId: 'c', severity: 'urgent', state: 'closed' }], expected: { openCount: 0, bySeverity: { urgent: 0, normal: 0, low: 0 }, customerIds: [], queue: [] } }],
  },
  complex: {
    title: 'Implement evidence-backed order allocation across two modules',
    files: {
      'src/inventory.mjs': `export function reserve(stock, lines) {\n  return { accepted: true, remaining: stock, reason: null };\n}\n`,
      'src/orders.mjs': `import { reserve } from './inventory.mjs';\nexport function fulfillOrders(stock, orders) {\n  return { acceptedIds: [], rejected: [], remaining: { ...stock } };\n}\n`,
    },
    document: 'acceptance-plan.json',
    requirementSources: { atomic_reservation: 'E1', expedited_first: 'E2', idempotent_ids: 'E3', invalid_immutable: 'E4' },
    instructions: `Use evidence/interviews.json to produce acceptance-plan.json and implement a small warehouse allocation feature in src/inventory.mjs and src/orders.mjs. reserve(stock,lines) accepts a plain object of nonempty SKU keys with nonnegative safe-integer stock; invalid stock throws TypeError. A valid nonempty lines array contains {sku,quantity}, exact nonempty SKU strings and positive safe-integer quantities. Aggregate repeated SKUs, reject unsafe aggregate quantities as invalid_lines. Invalid lines return {accepted:false,remaining:<copy of original stock>,reason:'invalid_lines'}. Unknown or insufficient stock returns the same shape with reason:'insufficient_stock'. Successful reservation atomically subtracts all quantities and returns {accepted:true,remaining,reason:null}. Never mutate inputs. fulfillOrders(stock,orders) validates stock identically and rejects a non-array orders value with TypeError. Each order needs a nonempty exact string id, priority expedited|normal, and lines. Ignore later occurrences of an ID entirely (first occurrence wins); an identifiable first occurrence with invalid priority is rejected as invalid_order and still claims its ID. Invalid/missing ID is rejected with id:null and reason:'invalid_order'. Process valid expedited orders before normal orders, retaining input order within each priority. Record invalid_order rejections in input order first, then reservation failures in processing order. Return {acceptedIds,rejected:[{id,reason}],remaining}. Failed reservations do not consume stock. Preserve both named exports, keep inventory and orchestration in their separate modules, and never mutate any input. The document schema and example are in README.md. Run the available tests and summarize the result.`,
    publicTest: `import assert from 'node:assert/strict';\nimport { test } from 'node:test';\nimport { fulfillOrders } from '../src/orders.mjs';\ntest('no orders preserve stock', () => assert.deepEqual(fulfillOrders({a:3}, []), {acceptedIds:[],rejected:[],remaining:{a:3}}));\n`,
    scenarios: [{ id: 'priority_and_atomicity', input: { stock: { a: 3, b: 1 }, orders: [{ id: 'normal', priority: 'normal', lines: [{ sku: 'a', quantity: 2 }] }, { id: 'fast', priority: 'expedited', lines: [{ sku: 'a', quantity: 2 }, { sku: 'b', quantity: 1 }] }] }, expected: { acceptedIds: ['fast'], rejected: [{ id: 'normal', reason: 'insufficient_stock' }], remaining: { a: 1, b: 0 } } }],
  },
};

function spec(difficulty) {
  if (!Object.hasOwn(SPECS, difficulty)) throw new Error('UNKNOWN_DIFFICULTY');
  return SPECS[difficulty];
}

export function prompt(difficulty) {
  return `${spec(difficulty).instructions}\nAll evidence is synthetic and supplied locally; no external research is needed. Read README.md for the workspace contract. Choose whatever available tools help. Only modify the listed permitted files; do not install dependencies, change settings, commit, push or run background processes. Report actual test results; do not claim an unavailable check passed.`;
}

function documentContract(difficulty) {
  const s = spec(difficulty);
  if (difficulty === 'simple') return 'report.json follows the schema stated in the task prompt. Its explanation is retained for human review, not automatically graded for meaning.';
  return `Write ${s.document} as JSON: {"summary":string,"requirements":[{"id":string,"description":string,"sources":[{"id":string,"quote":string}],"acceptance":{"given":string,"when":string,"then":string}}],"assumptions":[string],"scenarios":[{"id":string,"input":any,"expected":any}]}. Required requirement ID → supporting interview ID: ${JSON.stringify(s.requirementSources)}. Include each requirement once, with a nonempty description and acceptance fields, and the exact supporting interview quote. Include this independently checkable example exactly: ${JSON.stringify(s.scenarios)}. You may add further scenarios. Prose meaning, completeness beyond these stated constraints and overall product quality need human review; machine checks cover schema, evidence links and example consistency only.`;
}

function frozenFiles(difficulty) {
  const s = spec(difficulty);
  const permitted = [...Object.keys(s.files), s.document];
  return {
    'README.md': `# ${s.title}\n\n${prompt(difficulty)}\n\nPermitted modified files: ${permitted.join(', ')}. All other fixture files are inputs. Read-only exploration commands (including ls, cat, sed, rg, git status and git diff) are allowed within this workspace. Public verification: node --test tests/public.test.mjs. You can run additional bounded local checks of the permitted implementation files. Do not access files outside this workspace.\n\n${documentContract(difficulty)}\n`,
    'package.json': '{"private":true,"type":"module"}\n',
    'tests/public.test.mjs': s.publicTest,
    ...(EVIDENCE[difficulty] ? { 'evidence/interviews.json': `${JSON.stringify(EVIDENCE[difficulty], null, 2)}\n` } : {}),
  };
}

// These checks run in a separate process, not in the model-visible public tests.
const CODE_CHECKS = {
  simple: `
const {lineTotal} = await load('src/pricing.mjs');
check('zero quantity', () => eq(lineTotal(1250,0),0));
check('floor fractional discount', () => eq(lineTotal(199,3,1250),522));
check('full discount and defaults', () => { eq(lineTotal(500,2,10000),0); eq(lineTotal(73,4),292); });
check('invalid inputs', () => { for(const args of [[-1,1],[1,-1],[1.5,1],[1,1,10001],[1,1,-1],['1',1],[1,NaN],[1,1,0.2]]) throws(() => lineTotal(...args),'RangeError'); });
check('safe arithmetic boundaries', () => { throws(() => lineTotal(Number.MAX_SAFE_INTEGER,2),'RangeError'); throws(() => lineTotal(Number.MAX_SAFE_INTEGER,1),'RangeError'); eq(lineTotal(900719925474,1,0),900719925474); });
`,
  medium: `
const {normalizeTicket,summarizeTickets} = await load('src/triage.mjs');
const ticket=(id,severity='normal',state='open',customerId='c1')=>({id,title:'Issue',customerId,severity,state});
check('normalization and no input mutation',()=>{const v={id:' a ',title:' Fix ',customerId:' c ',severity:' URGENT ',state:' OPEN ',extra:1},before=JSON.stringify(v);eq(normalizeTicket(v),{id:'a',title:'Fix',customerId:'c',severity:'urgent',state:'open'});eq(JSON.stringify(v),before);});
check('reject invalid input',()=>{for(const v of [null,{},ticket(''),{...ticket('a'),severity:'critical'},{...ticket('a'),state:'pending'},{...ticket('a'),customerId:4}])throws(()=>normalizeTicket(v),'TypeError');throws(()=>summarizeTickets({}),'TypeError');throws(()=>summarizeTickets([ticket('a'),null]),'TypeError');});
check('latest update controls open state',()=>eq(summarizeTickets([ticket('a','urgent'),ticket('a','low','closed')]),{openCount:0,bySeverity:{urgent:0,normal:0,low:0},customerIds:[],queue:[]}));
check('priority, tie order, counts and distinct customers',()=>{const rows=[ticket('z','normal','open','c2'),ticket('b','urgent'),ticket('a','urgent'),ticket('q','low','closed'),ticket('x','low','open','c2')];const before=JSON.stringify(rows);eq(summarizeTickets(rows),{openCount:4,bySeverity:{urgent:2,normal:1,low:1},customerIds:['c1','c2'],queue:['a','b','z','x']});eq(JSON.stringify(rows),before);});
check('normalized IDs deduplicate and latest customer wins',()=>eq(summarizeTickets([ticket(' a ','low','open','c2'),ticket('a','urgent','open','c3')]),{openCount:1,bySeverity:{urgent:1,normal:0,low:0},customerIds:['c3'],queue:['a']}));
check('empty summary',()=>eq(summarizeTickets([]),{openCount:0,bySeverity:{urgent:0,normal:0,low:0},customerIds:[],queue:[]}));
`,
  complex: `
const {reserve}=await load('src/inventory.mjs');const {fulfillOrders}=await load('src/orders.mjs');
const order=(id,priority,lines)=>({id,priority,lines});const line=(sku,quantity)=>({sku,quantity});
check('aggregate duplicate lines without mutation',()=>{const stock={a:5,b:2},lines=[line('a',2),line('a',1),line('b',2)],before=JSON.stringify([stock,lines]);eq(reserve(stock,lines),{accepted:true,remaining:{a:2,b:0},reason:null});eq(JSON.stringify([stock,lines]),before);});
check('atomic failure and unknown SKU',()=>{eq(reserve({a:2,b:0},[line('a',1),line('b',1)]),{accepted:false,remaining:{a:2,b:0},reason:'insufficient_stock'});eq(reserve({a:2},[line('missing',1)]),{accepted:false,remaining:{a:2},reason:'insufficient_stock'});});
check('line and stock validation',()=>{for(const lines of [[],null,[line('',1)],[line('a',0)],[line('a',1.2)],[line('a',Number.MAX_SAFE_INTEGER),line('a',1)]])eq(reserve({a:2},lines),{accepted:false,remaining:{a:2},reason:'invalid_lines'});for(const stock of [null,[],{a:-1},{a:1.2},{'':1}]){throws(()=>reserve(stock,[line('a',1)]),'TypeError');throws(()=>fulfillOrders(stock,[]),'TypeError');}throws(()=>fulfillOrders({a:1},{}),'TypeError');});
check('expedited priority and atomicity',()=>eq(fulfillOrders({a:3,b:1},[order('normal','normal',[line('a',2)]),order('fast','expedited',[line('a',2),line('b',1)])]),{acceptedIds:['fast'],rejected:[{id:'normal',reason:'insufficient_stock'}],remaining:{a:1,b:0}}));
check('first ID wins before priority sorting',()=>eq(fulfillOrders({a:3},[order('dup','normal',[line('a',2)]),order('dup','expedited',[line('a',1)]),order('later','normal',[line('a',2)])]),{acceptedIds:['dup'],rejected:[{id:'later',reason:'insufficient_stock'}],remaining:{a:1}}));
check('invalid order claims ID and rejection order',()=>eq(fulfillOrders({a:2},[{id:'bad',priority:'other'},order('bad','normal',[line('a',1)]),{},order('fail','expedited',[line('a',3)]),order('ok','normal',[line('a',1)])]),{acceptedIds:['ok'],rejected:[{id:'bad',reason:'invalid_order'},{id:null,reason:'invalid_order'},{id:'fail',reason:'insufficient_stock'}],remaining:{a:1}}));
check('same-priority arrival order and input immutability',()=>{const stock={a:3},orders=[order('z','expedited',[line('a',2)]),order('a','expedited',[line('a',2)]),order('n','normal',[line('a',1)])],before=JSON.stringify([stock,orders]);eq(fulfillOrders(stock,orders),{acceptedIds:['z','n'],rejected:[{id:'a',reason:'insufficient_stock'}],remaining:{a:0}});eq(JSON.stringify([stock,orders]),before);});
`,
};

function oracleSource(difficulty) {
  return `import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve,relative,dirname,sep} from 'node:path';
import vm from 'node:vm';
const workspace=process.argv[2], allowed=new Set(${JSON.stringify(Object.keys(spec(difficulty).files))}), cache=new Map();
const context=vm.createContext({});
async function loadModule(name){
 if(!allowed.has(name))throw new Error('UNDECLARED_MODULE');
 if(cache.has(name))return cache.get(name);
 const source=await readFile(resolve(workspace,name),'utf8');
 const m=new vm.SourceTextModule(source,{context,identifier:name,importModuleDynamically:()=>{throw new Error('DYNAMIC_IMPORT_UNAVAILABLE');}});cache.set(name,m);
 await m.link((id,parent)=>{if(!id.startsWith('./')&&!id.startsWith('../'))throw new Error('EXTERNAL_IMPORT_UNAVAILABLE');const name=relative(workspace,resolve(workspace,dirname(parent.identifier),id)).split(sep).join('/');return loadModule(name);});return m;
}
async function load(name){const m=await loadModule(name);if(m.status!=='evaluated')await m.evaluate({timeout:1000});return m.namespace;}
const checks=[];const eq=(a,b)=>assert.deepEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)));const throws=(fn,name)=>{let error;try{fn();}catch(e){error=e;}assert.equal(error?.name,name);};
function check(name,fn){try{fn();checks.push({name,passed:true});}catch(error){checks.push({name,passed:false,error:String(error.message).slice(0,1500)});}}
try{const run=vm.compileFunction(${JSON.stringify('return (async()=>{' + CODE_CHECKS[difficulty] + '})();')},['load','check','eq','throws'],{parsingContext:context});await run(load,check,eq,throws);}catch(error){checks.push({name:'load implementation',passed:false,error:String(error.message).slice(0,1500)});}
process.stdout.write(JSON.stringify({passed:checks.length>0&&checks.every(x=>x.passed),checks}));
`;
}

function environment() {
  return { PATH: process.env.PATH || '/usr/bin:/bin', ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}), LANG: 'C', LC_ALL: 'C', NODE_NO_WARNINGS: '1', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' };
}

export async function prepareFixture(root, difficulty) {
  const s = spec(difficulty);
  if (!isAbsolute(root)) throw new Error('ABSOLUTE_ROOT_REQUIRED');
  await mkdir(root, { recursive: true, mode: 0o700 });
  if ((await readdir(root)).length) throw new Error('EMPTY_ROOT_REQUIRED');
  root = await realpath(root);
  const workspace = join(root, 'workspace'), oraclePath = join(root, 'oracle', 'verify.mjs');
  await mkdir(dirname(oraclePath), { recursive: true, mode: 0o700 });
  await mkdir(join(root, 'oracle', 'hooks'), { mode: 0o700 });
  for (const [name, value] of Object.entries({ ...frozenFiles(difficulty), ...s.files })) {
    const path = join(workspace, name); await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await writeFile(path, value, { flag: 'wx', mode: 0o600 });
  }
  await writeFile(oraclePath, oracleSource(difficulty), { flag: 'wx', mode: 0o400 });
  const git = args => execute('git', ['-c', `core.hooksPath=${join(root, 'oracle', 'hooks')}`, '-c', 'commit.gpgsign=false', ...args], { cwd: workspace, env: environment(), timeout: 10000, maxBuffer: MAX_BYTES });
  await git(['init', '--quiet']);
  await git(['config', 'core.hooksPath', join(root, 'oracle', 'hooks')]);
  await git(['add', '--all']);
  await git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@invalid', 'commit', '--quiet', '-m', 'synthetic benchmark fixture']);
  return { root, workspace, oraclePath, permittedFiles: [...Object.keys(s.files), s.document], publicTestCommand: ['node', '--test', 'tests/public.test.mjs'], prompt: prompt(difficulty) };
}

async function safeRead(workspace, name) {
  let path = workspace;
  for (const part of name.split('/')) { path = join(path, part); if ((await lstat(path)).isSymbolicLink()) throw new Error('SYMLINK_REJECTED'); }
  const info = await lstat(path);
  if (!info.isFile() || info.size > MAX_BYTES) throw new Error('BOUNDED_REGULAR_FILE_REQUIRED');
  const actual = await realpath(path), rel = relative(workspace, actual);
  if (rel.startsWith(`..${sep}`) || rel === '..' || isAbsolute(rel)) throw new Error('WORKSPACE_ESCAPE');
  return readFile(path, 'utf8');
}

function documentChecks(value, difficulty) {
  const s = spec(difficulty), checks = [];
  const record = v => v && typeof v === 'object' && !Array.isArray(v);
  const text = v => typeof v === 'string' && !!v.trim();
  const add = (name, passed) => checks.push({ name, passed: !!passed });
  add('document object and summary', record(value) && text(value.summary));
  if (difficulty !== 'simple') {
    const requirements = value?.requirements;
    add('requirements and assumptions schema', Array.isArray(requirements) && requirements.every(item => record(item) && text(item.id) && text(item.description) && ['given','when','then'].every(k => text(item.acceptance?.[k])) && Array.isArray(item.sources) && item.sources.length > 0 && item.sources.every(source => EVIDENCE[difficulty].some(e => e.id === source?.id && e.quote === source?.quote))) && new Set(requirements.map(item => item.id)).size === requirements.length && Array.isArray(value?.assumptions) && value.assumptions.every(text));
    for (const [id, sourceId] of Object.entries(s.requirementSources)) {
      const items = Array.isArray(value?.requirements) ? value.requirements.filter(x => x?.id === id) : [];
      const item = items[0];
      add(`${id}: unique requirement and acceptance schema`, items.length === 1 && text(item?.description) && ['given','when','then'].every(k => text(item?.acceptance?.[k])));
      const sources = Array.isArray(item?.sources) ? item.sources : [];
      const evidence = EVIDENCE[difficulty];
      add(`${id}: exact supplied evidence binding`, sources.some(x => x?.id === sourceId) && sources.every(x => evidence.some(e => e.id === x?.id && e.quote === x?.quote)));
    }
  }
  const examples = difficulty === 'simple' ? value?.examples : value?.scenarios;
  add('example schema', Array.isArray(examples) && examples.every(item => record(item) && text(item.id) && Object.hasOwn(item, 'input') && Object.hasOwn(item, 'expected')) && new Set(examples.map(item => item.id)).size === examples.length);
  for (const scenario of s.scenarios) {
    const items = Array.isArray(examples) ? examples.filter(x => x?.id === scenario.id) : [];
    const item = items[0];
    add(`${scenario.id}: exact input and independently known output`, items.length === 1 && canonical(item?.input) === canonical(scenario.input) && canonical(item?.expected) === canonical(scenario.expected));
  }
  return { passed: checks.every(x => x.passed), checks, semanticQualityEvaluated: false };
}
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}

export async function evaluate(root, difficulty, nodePath = process.execPath) {
  const s = spec(difficulty), workspace = join(await realpath(root), 'workspace'), oraclePath = join(await realpath(root), 'oracle', 'verify.mjs');
  const checks = [];
  for (const [name, content] of Object.entries(frozenFiles(difficulty))) {
    let passed = false; try { passed = sha(await safeRead(workspace, name)) === sha(content); } catch {}
    checks.push({ name: `unchanged ${name}`, passed });
  }
  for (const name of Object.keys(s.files)) { let passed = false; try { await safeRead(workspace, name); passed = true; } catch {} checks.push({ name: `bounded source ${name}`, passed }); }
  let oracleIntact = false; try { oracleIntact = !(await lstat(oraclePath)).isSymbolicLink() && sha(await readFile(oraclePath)) === sha(oracleSource(difficulty)); } catch {}
  checks.push({ name: 'independent oracle intact', passed: oracleIntact });
  const integrity = { passed: checks.every(x => x.passed), checks };
  let code = { passed: false, checks: [], error: 'FIXTURE_INTEGRITY_FAILED' };
  if (integrity.passed) {
    try {
      const result = await execute(nodePath, ['--experimental-vm-modules', oraclePath, workspace], { cwd: workspace, env: environment(), timeout: 5000, killSignal: 'SIGKILL', maxBuffer: MAX_BYTES });
      code = JSON.parse(result.stdout);
      if (!Array.isArray(code.checks) || !code.checks.length || code.passed !== code.checks.every(x => x.passed === true)) throw new Error('INVALID_ORACLE_OUTPUT');
    } catch (error) { code = { passed: false, checks: [], error: error.killed ? 'ORACLE_TIMEOUT' : 'ORACLE_EXECUTION_FAILED' }; }
  }
  let documents;
  try { documents = documentChecks(JSON.parse(await safeRead(workspace, s.document)), difficulty); }
  catch { documents = { passed: false, checks: [{ name: 'read valid bounded JSON document', passed: false }], semanticQualityEvaluated: false }; }
  return { difficulty, passed: integrity.passed && code.passed && documents.passed, integrity, code, documents };
}
