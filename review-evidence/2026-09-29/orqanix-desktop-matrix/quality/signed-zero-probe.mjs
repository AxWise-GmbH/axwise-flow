/** POST-INSPECTION signed-zero diagnostic. Kept separate from the frozen 416-case audit.
 * Run with no arguments only after report.json contains all 48 unique rows.
 * The protocol and this script must match the exclusive freeze manifest.
 * No candidates, review mapping, or existing results are rewritten.
 */
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { lstat, readFile, realpath, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = '/private/tmp/orqanix-quality-audit-20260929';
const REPORT = '/private/tmp/orqanix-matrix-autonomous-20260929/report.json';
const OUTPUT = join(ROOT, 'signed-zero-result.json');
const PROTOCOL_PATH = join(ROOT, 'signed-zero-protocol.json');
const FREEZE_PATH = join(ROOT, 'signed-zero-freeze.json');
const CONTRACT_PATH = '/Users/admin/axwise-opensource/axwise-flow-oss/scripts/lib/orqanix-benchmark-tasks.mjs';
const QUALITY_PATH = '/Users/admin/axwise-opensource/axwise-flow-oss/scripts/lib/orqanix-benchmark-quality.mjs';
const NODE_PATH = '/private/tmp/orqanix-native-desktop-benchmark-20260929/Orqanix Benchmark-darwin-arm64/Orqanix Benchmark.app/Contents/Resources/orqaly-runtime/node/bin/node';
const DESIGNATION = 'POST-INSPECTION signed-zero diagnostic; selected after reviewers observed explicit -0 rejection. Separate from the original oracle, the frozen 416-case supplemental audit, and the blinded qualitative review. Correlated checks, not independent trials.';
const LIMITS = Object.freeze({ sourceBytes: 131072, inputBytes: 4194304, outputBytes: 262144, vmTimeoutMs: 1500, processTimeoutMs: 4000, heapMiB: 96 });
const MODULES = Object.freeze({ simple: ['src/pricing.mjs'], complex: ['src/inventory.mjs', 'src/orders.mjs'] });
const sha = value => createHash('sha256').update(value).digest('hex');

// Only VM-native values/functions are reachable by implementation modules.
// Sign is significant for input immutability, but not returned numeric equality.
const CHECK_SOURCE = String.raw`
function decode(value) {
  if (value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 1 && value.$signedZero === '-0') return -0;
  if (Array.isArray(value)) return value.map(decode);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, decode(child)]));
  return value;
}
function canonical(value, preserveZeroSign = false) {
  const encode = item => {
    if (typeof item === 'number') return ['number', preserveZeroSign && Object.is(item, -0) ? '-0' : String(item)];
    if (item === null) return ['null'];
    if (typeof item !== 'object') return [typeof item, String(item)];
    const entries = Object.keys(item).sort().map(key => [key, encode(item[key])]);
    return Array.isArray(item) ? ['array', item.length, entries] : ['object', entries];
  };
  return JSON.stringify(encode(value));
}
function numberObservation(value) {
  if (typeof value !== 'number') return null;
  if (Object.is(value, -0)) return '-0';
  if (value === 0) return '+0';
  return Number.isFinite(value) ? value : String(value);
}
function run(cases) {
  return cases.map(test => {
    const args = decode(test.args), before = canonical(args, true), invocations = [];
    for (let repeat = 0; repeat < 2; repeat++) {
      let value, thrown = false, errorName = null;
      try { value = implementations[test.module][test.fn](...args); }
      catch (error) { thrown = true; errorName = ['Error', 'TypeError', 'RangeError', 'SyntaxError', 'ReferenceError'].includes(error?.name) ? error.name : 'OtherError'; }
      const inputUnchanged = canonical(args, true) === before;
      const valueMatches = !thrown && canonical(value) === canonical(test.expected);
      const remainingCopy = test.remainingCopy ? !thrown && value?.remaining !== args[0] : null;
      const failure = !inputUnchanged ? 'INPUT_MUTATED' : thrown ? 'UNEXPECTED_ERROR' : !valueMatches ? 'RESULT_MISMATCH' : remainingCopy === false ? 'RESULT_ALIASES_STOCK' : null;
      invocations.push({ repeat: repeat + 1, passed: failure === null, failure, inputUnchanged, valueMatches, remainingCopy,
        observed: thrown ? { outcome: 'throw', errorName } : { outcome: 'return', valueType: value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value, numericResult: numberObservation(value), stockZero: numberObservation(value?.remaining?.a) } });
    }
    return { id: test.id, group: test.group, variant: test.variant, passed: invocations.every(item => item.passed), invocations };
  });
}
`;

const WORKER_SOURCE = String.raw`
import vm from 'node:vm';
import { posix } from 'node:path';
let input = '';
for await (const chunk of process.stdin) { input += chunk; if (Buffer.byteLength(input) > 4194304) throw Error('INPUT_LIMIT'); }
try {
  const payload = JSON.parse(input);
  const context = vm.createContext(Object.create(null), { codeGeneration: { strings: false, wasm: false } });
  const importError = new vm.Script('new Error("IMPORT_NOT_ALLOWED")').runInContext(context, { timeout: payload.vmTimeoutMs });
  const cache = new Map();
  const get = name => {
    if (!Object.hasOwn(payload.sources, name)) throw importError;
    if (!cache.has(name)) cache.set(name, new vm.SourceTextModule(payload.sources[name], {
      context, identifier: name, importModuleDynamically: () => { throw importError; }
    }));
    return cache.get(name);
  };
  const names = Object.keys(payload.sources);
  const source = names.map((name, i) => 'import * as m' + i + ' from ' + JSON.stringify('./' + name) + ';').join('\n')
    + '\nconst implementations = {' + names.map((name, i) => JSON.stringify(name) + ':m' + i).join(',') + '};\n'
    + payload.checkSource + '\nexport const resultJson = JSON.stringify(run(JSON.parse(' + JSON.stringify(JSON.stringify(payload.cases)) + ')));';
  const verifier = new vm.SourceTextModule(source, { context, identifier: '__signed_zero_verifier__.mjs' });
  await verifier.link((specifier, parent) => {
    if (!specifier.startsWith('./') && !specifier.startsWith('../')) throw importError;
    return get(posix.normalize(posix.join(posix.dirname(parent.identifier), specifier)));
  });
  await verifier.evaluate({ timeout: payload.vmTimeoutMs });
  process.stdout.write(verifier.namespace.resultJson);
} catch (error) {
  process.stdout.write(JSON.stringify({ error: error?.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT' ? 'VM_TIMEOUT' : error?.message === 'IMPORT_NOT_ALLOWED' ? 'IMPORT_NOT_ALLOWED' : 'IMPLEMENTATION_LOAD_OR_RUN_FAILED' }));
  process.exitCode = 1;
}
`;

async function readSources(workspace, difficulty) {
  if (!isAbsolute(workspace)) throw Error('ABSOLUTE_WORKSPACE_REQUIRED');
  const root = await realpath(workspace), sources = {}, sourceHashes = {};
  for (const name of MODULES[difficulty]) {
    let path = root;
    for (const part of name.split('/')) {
      path = join(path, part);
      if ((await lstat(path)).isSymbolicLink()) throw Error('SYMLINK_REJECTED');
    }
    const info = await lstat(path), actual = await realpath(path), rel = relative(root, actual);
    if (!info.isFile() || info.size > LIMITS.sourceBytes || rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) throw Error('SOURCE_NOT_BOUNDED_REGULAR_FILE');
    const bytes = await readFile(path);
    if (bytes.length > LIMITS.sourceBytes) throw Error('SOURCE_NOT_BOUNDED_REGULAR_FILE');
    sources[name] = bytes.toString('utf8');
    sourceHashes[name] = sha(bytes);
  }
  return { sources, sourceHashes };
}

async function execute(payload) {
  const input = JSON.stringify(payload);
  if (Buffer.byteLength(input) > LIMITS.inputBytes) return { error: 'INPUT_LIMIT' };
  return new Promise(resolve => {
    let child;
    try { child = spawn(NODE_PATH, ['--experimental-vm-modules', '--max-old-space-size=' + LIMITS.heapMiB, '--input-type=module', '-e', WORKER_SOURCE], { cwd: ROOT, env: { NODE_NO_WARNINGS: '1', LANG: 'C', LC_ALL: 'C' }, stdio: ['pipe', 'pipe', 'pipe'] }); }
    catch { resolve({ error: 'RUNNER_UNAVAILABLE' }); return; }
    let output = '', bytes = 0, reason = null, settled = false;
    const timer = setTimeout(() => { reason = 'PROCESS_TIMEOUT'; child.kill('SIGKILL'); }, LIMITS.processTimeoutMs);
    const finish = value => { if (settled) return; settled = true; clearTimeout(timer); resolve(value); };
    child.on('error', () => finish({ error: 'RUNNER_UNAVAILABLE' }));
    child.stdout.on('data', chunk => { bytes += chunk.length; if (bytes > LIMITS.outputBytes) { reason = 'OUTPUT_LIMIT'; child.kill('SIGKILL'); } else output += chunk; });
    child.stderr.on('data', chunk => { bytes += chunk.length; if (bytes > LIMITS.outputBytes) { reason = 'OUTPUT_LIMIT'; child.kill('SIGKILL'); } });
    child.stdin.on('error', () => {});
    child.on('close', code => {
      if (reason) return finish({ error: reason });
      try { const value = JSON.parse(output); finish(code === 0 || value?.error ? value : { error: 'RUNNER_FAILED' }); }
      catch { finish({ error: 'RUNNER_FAILED' }); }
    });
    child.stdin.end(input);
  });
}

async function evaluate(row, cases) {
  let loaded, result;
  try { loaded = await readSources(row.workspace, row.difficulty); result = await execute({ sources: loaded.sources, cases, checkSource: CHECK_SOURCE, vmTimeoutMs: LIMITS.vmTimeoutMs }); }
  catch (error) { result = { error: ['ABSOLUTE_WORKSPACE_REQUIRED', 'SYMLINK_REJECTED', 'SOURCE_NOT_BOUNDED_REGULAR_FILE'].includes(error?.message) ? error.message : 'SOURCE_READ_FAILED' }; }
  const valid = Array.isArray(result) && result.length === cases.length && result.every((check, i) =>
    check?.id === cases[i].id && check.group === cases[i].group && check.variant === cases[i].variant && typeof check.passed === 'boolean'
    && Array.isArray(check.invocations) && check.invocations.length === 2 && check.invocations.every(item => typeof item.passed === 'boolean')
    && check.passed === check.invocations.every(item => item.passed));
  const executionError = valid ? null : result?.error || 'INVALID_RUNNER_OUTPUT';
  const checks = valid ? result : cases.map(test => ({ id: test.id, group: test.group, variant: test.variant, passed: false, executionError, invocations: [] }));
  return { key: row.key, difficulty: row.difficulty, status: executionError ? 'execution_error' : checks.every(check => check.passed) ? 'passed' : 'failed', passed: valid && checks.every(check => check.passed), executionError, sourceHashes: loaded?.sourceHashes || null, checks };
}

async function main() {
  if (process.argv.length !== 2) throw Error('NO_ARGUMENTS_SUPPORTED');
  // Gate occurs before protocol verification, candidate reads, child spawning or writes.
  const reportRaw = await readFile(REPORT, 'utf8'), report = JSON.parse(reportRaw);
  if (!Array.isArray(report.rows) || report.rows.length !== 48 || new Set(report.rows.map(row => row.key)).size !== 48) throw Error('WAIT_FOR_ALL_48_ROWS');
  if (report.rows.some(row => typeof row.key !== 'string' || !row.key || !['simple', 'medium', 'complex'].includes(row.difficulty))) throw Error('INVALID_MATRIX_ROW');
  for (const difficulty of ['simple', 'medium', 'complex']) if (report.rows.filter(row => row.difficulty === difficulty).length !== 16) throw Error('EXPECTED_16_ROWS_PER_DIFFICULTY');
  try { await lstat(OUTPUT); throw Error('RESULT_ALREADY_EXISTS'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const [protocolRaw, freezeRaw, scriptRaw, contractRaw, qualityRaw, nodeBytes] = await Promise.all([
    readFile(PROTOCOL_PATH), readFile(FREEZE_PATH, 'utf8'), readFile(fileURLToPath(import.meta.url)), readFile(CONTRACT_PATH), readFile(QUALITY_PATH), readFile(NODE_PATH)
  ]);
  const frozen = JSON.parse(freezeRaw), protocol = JSON.parse(protocolRaw);
  if (sha(protocolRaw) !== frozen.protocolFileSha256 || sha(scriptRaw) !== frozen.probeSha256) throw Error('SIGNED_ZERO_FREEZE_CHANGED');
  if (sha(contractRaw) !== frozen.sourceContractSha256 || sha(qualityRaw) !== frozen.frozenSupplementalSourceSha256) throw Error('FROZEN_SOURCE_CHANGED');
  if (protocol.designation !== DESIGNATION || JSON.stringify(protocol.limits) !== JSON.stringify(LIMITS)) throw Error('PROTOCOL_CONFIGURATION_MISMATCH');
  if (protocol.cases?.simple?.length !== 11 || protocol.cases?.complex?.length !== 6) throw Error('PROTOCOL_CASE_COUNT_MISMATCH');
  const startedAt = new Date().toISOString(), rows = [];
  for (const row of report.rows) {
    if (row.difficulty === 'medium') {
      rows.push({ key: row.key, difficulty: row.difficulty, status: 'not_applicable', passed: null, reason: 'The signed-zero numeric-input diagnostic covers only invoice and stock contracts.', sourceHashes: null, checks: [] });
    } else rows.push(await evaluate(row, protocol.cases[row.difficulty]));
  }
  // The snapshot and on-disk candidate bytes must remain stable throughout execution.
  if (sha(await readFile(REPORT)) !== sha(reportRaw)) throw Error('SOURCE_REPORT_CHANGED_DURING_RUN');
  for (let i = 0; i < report.rows.length; i++) {
    if (!rows[i].sourceHashes) continue;
    const current = await readSources(report.rows[i].workspace, report.rows[i].difficulty);
    if (JSON.stringify(current.sourceHashes) !== JSON.stringify(rows[i].sourceHashes)) throw Error('CANDIDATE_SOURCE_CHANGED_DURING_RUN');
  }
  const applicable = rows.filter(row => row.status !== 'not_applicable');
  const summary = { matrixRows: rows.length, evaluatedSolutions: applicable.length, notApplicableSolutions: rows.length - applicable.length, passedSolutions: applicable.filter(row => row.passed).length, failedSolutions: applicable.filter(row => row.status === 'failed').length, executionErrors: applicable.filter(row => row.status === 'execution_error').length, cases: applicable.reduce((sum, row) => sum + row.checks.length, 0), passedCases: applicable.reduce((sum, row) => sum + row.checks.filter(check => check.passed).length, 0), invocations: applicable.reduce((sum, row) => sum + row.checks.reduce((count, check) => count + check.invocations.length, 0), 0) };
  const result = { schema: 'orqanix.signed-zero-diagnostic-result.v1', designation: DESIGNATION, startedAt, completedAt: new Date().toISOString(), protocolFrozenAt: frozen.frozenAt, sourceReport: REPORT, sourceReportSha256: sha(reportRaw), sourceContractSha256: frozen.sourceContractSha256, frozenSupplementalSourceSha256: frozen.frozenSupplementalSourceSha256, protocolFileSha256: frozen.protocolFileSha256, probeSha256: frozen.probeSha256, workerAndChecksSha256: sha(WORKER_SOURCE + CHECK_SOURCE), nodePath: NODE_PATH, nodeSha256: sha(nodeBytes), limits: LIMITS, summary, rows };
  await writeFile(OUTPUT, JSON.stringify(result, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ output: OUTPUT, designation: 'POST-INSPECTION', ...summary }));
}
main().catch(error => { console.error(JSON.stringify({ error: error?.message || 'SIGNED_ZERO_RUN_FAILED' })); process.exitCode = 1; });
