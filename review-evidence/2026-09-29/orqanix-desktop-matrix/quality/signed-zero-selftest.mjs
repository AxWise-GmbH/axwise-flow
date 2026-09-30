/** Synthetic-only validation of the frozen POST-INSPECTION signed-zero diagnostic.
 * Does not import its module, invoke its gated main, or read benchmark solutions.
 * Extracts the exact frozen worker, checker and subprocess executor for validation.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { lstat, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = '/private/tmp/orqanix-quality-audit-20260929';
const OUTPUT = join(ROOT, 'selftest-result.json');
const sha = value => createHash('sha256').update(value).digest('hex');
const [probeBytes, protocolBytes, freezeBytes] = await Promise.all([
  readFile(join(ROOT, 'signed-zero-probe.mjs')),
  readFile(join(ROOT, 'signed-zero-protocol.json')),
  readFile(join(ROOT, 'signed-zero-freeze.json')),
]);
const frozen = JSON.parse(freezeBytes), protocol = JSON.parse(protocolBytes), probe = probeBytes.toString('utf8');
assert.equal(sha(probeBytes), frozen.probeSha256, 'Frozen probe hash changed');
assert.equal(sha(protocolBytes), frozen.protocolFileSha256, 'Frozen protocol hash changed');
try { await lstat(OUTPUT); throw Error('SELFTEST_RESULT_ALREADY_EXISTS'); } catch (error) { if (error.code !== 'ENOENT') throw error; }

function extractRaw(name) {
  const prefix = 'const ' + name + ' = String.raw`';
  const start = probe.indexOf(prefix);
  assert(start >= 0 && probe.indexOf(prefix, start + 1) === -1, 'Unique raw declaration required');
  const end = probe.indexOf('\n`;', start + prefix.length);
  assert(end > start, 'Raw closing delimiter required');
  const body = probe.slice(start + prefix.length, end + 1);
  assert(!body.includes('${') && !body.includes('`'), 'Unexpected raw interpolation or backtick');
  return body;
}
const CHECK_SOURCE = extractRaw('CHECK_SOURCE'), WORKER_SOURCE = extractRaw('WORKER_SOURCE');
const executeStart = probe.indexOf('async function execute(payload) {');
const executeEnd = probe.indexOf('\nasync function evaluate(', executeStart);
assert(executeStart >= 0 && executeEnd > executeStart);
const EXECUTOR_SOURCE = probe.slice(executeStart, executeEnd).trim();
const NODE_PATH = probe.match(/^const NODE_PATH = '([^']+)';$/m)?.[1];
assert(NODE_PATH, 'Frozen runtime path required');
const LIMITS = protocol.limits;
// This trusted function only spawns the exact frozen worker. No candidate source
// runs in this host context, and no frozen module top-level code is evaluated.
const execute = new Function('spawn', 'NODE_PATH', 'ROOT', 'LIMITS', 'WORKER_SOURCE', 'return (' + EXECUTOR_SOURCE + ');')(spawn, NODE_PATH, ROOT, LIMITS, WORKER_SOURCE);

const pricing = String.raw`
export function lineTotal(priceCents, quantity, discountBps = 0) {
  if (![priceCents, quantity, discountBps].every(Number.isSafeInteger) || priceCents < 0 || quantity < 0 || discountBps < 0 || discountBps > 10000) throw new RangeError('Invalid input');
  const product = priceCents * quantity;
  if (!Number.isSafeInteger(product)) throw new RangeError('Unsafe product');
  const weighted = product * (10000 - discountBps);
  if (!Number.isSafeInteger(weighted)) throw new RangeError('Unsafe weighted product');
  return Math.floor(weighted / 10000);
}
`;
const inventory = String.raw`
export function validateStock(stock) {
  if (!stock || typeof stock !== 'object' || Array.isArray(stock) || Object.getPrototypeOf(stock) !== Object.prototype) throw new TypeError('Invalid stock');
  for (const [sku, quantity] of Object.entries(stock)) if (!sku || !Number.isSafeInteger(quantity) || quantity < 0) throw new TypeError('Invalid stock');
}
export function reserve(stock, lines) {
  validateStock(stock);
  const fail = reason => ({ accepted: false, remaining: { ...stock }, reason });
  if (!Array.isArray(lines) || lines.length === 0) return fail('invalid_lines');
  const quantities = new Map();
  for (const line of lines) {
    if (!line || typeof line.sku !== 'string' || !line.sku || !Number.isSafeInteger(line.quantity) || line.quantity <= 0) return fail('invalid_lines');
    const amount = (quantities.get(line.sku) || 0) + line.quantity;
    if (!Number.isSafeInteger(amount)) return fail('invalid_lines');
    quantities.set(line.sku, amount);
  }
  for (const [sku, quantity] of quantities) if (!Object.hasOwn(stock, sku) || stock[sku] < quantity) return fail('insufficient_stock');
  const remaining = { ...stock };
  for (const [sku, quantity] of quantities) remaining[sku] -= quantity;
  return { accepted: true, remaining, reason: null };
}
`;
const orders = String.raw`
import { reserve, validateStock } from './inventory.mjs';
export function fulfillOrders(stock, orders) {
  validateStock(stock);
  if (!Array.isArray(orders)) throw new TypeError('Invalid orders');
  const seen = new Set(), pending = [], rejected = [], acceptedIds = [];
  for (const order of orders) {
    const id = typeof order?.id === 'string' && order.id ? order.id : null;
    if (id === null) { rejected.push({ id: null, reason: 'invalid_order' }); continue; }
    if (seen.has(id)) continue;
    seen.add(id);
    if (!['expedited', 'normal'].includes(order.priority)) { rejected.push({ id, reason: 'invalid_order' }); continue; }
    pending.push(order);
  }
  let remaining = { ...stock };
  for (const priority of ['expedited', 'normal']) for (const order of pending) {
    if (order.priority !== priority) continue;
    const result = reserve(remaining, order.lines);
    if (result.accepted) { acceptedIds.push(order.id); remaining = result.remaining; }
    else rejected.push({ id: order.id, reason: result.reason });
  }
  return { acceptedIds, rejected, remaining };
}
`;
const correct = {
  simple: { 'src/pricing.mjs': pricing },
  complex: { 'src/inventory.mjs': inventory, 'src/orders.mjs': orders },
};
const rejecting = {
  simple: { 'src/pricing.mjs': pricing.replace('  if (![priceCents', "  if ([priceCents, quantity, discountBps].some(value => Object.is(value, -0))) throw new RangeError('Synthetic signed-zero rejection');\n  if (![priceCents") },
  complex: { 'src/inventory.mjs': inventory.replace('export function validateStock(stock) {', "export function validateStock(stock) {\n  if (stock && Object.values(stock).some(value => Object.is(value, -0))) throw new TypeError('Synthetic signed-zero rejection');"), 'src/orders.mjs': orders },
};
assert.notEqual(correct.simple['src/pricing.mjs'], rejecting.simple['src/pricing.mjs']);
assert.notEqual(correct.complex['src/inventory.mjs'], rejecting.complex['src/inventory.mjs']);
const records = [];
const startedAt = new Date().toISOString();
async function runTest(name, sources, cases, verify) {
  const start = performance.now();
  const actual = await execute({ sources, cases, checkSource: CHECK_SOURCE, vmTimeoutMs: LIMITS.vmTimeoutMs });
  const elapsedMs = Math.round(performance.now() - start);
  let assertionFailure = null;
  try { verify(actual, elapsedMs); } catch (error) { assertionFailure = String(error.message); }
  const record = { name, passed: assertionFailure === null, assertionFailure, elapsedMs, fixtureSourceHashes: Object.fromEntries(Object.entries(sources).map(([key, source]) => [key, sha(source)])), actual };
  records.push(record);
  console.log(JSON.stringify({ test: name, passed: record.passed, elapsedMs, ...(Array.isArray(actual) ? { passedCases: actual.filter(check => check.passed).length, failedCases: actual.filter(check => !check.passed).length } : actual) }));
}
function shape(result, cases) {
  assert(Array.isArray(result), 'Worker should return a case array: ' + JSON.stringify(result));
  assert.equal(result.length, cases.length);
  result.forEach((check, i) => { assert.equal(check.id, cases[i].id); assert.equal(check.variant, cases[i].variant); assert.equal(check.invocations.length, 2); });
}
for (const difficulty of ['simple', 'complex']) {
  const cases = protocol.cases[difficulty];
  await runTest('correct-' + difficulty, correct[difficulty], cases, result => {
    shape(result, cases);
    for (const check of result) { assert.equal(check.passed, true, check.id); for (const call of check.invocations) { assert.equal(call.passed, true); assert.equal(call.inputUnchanged, true); } }
    const minus = result.filter(check => check.variant === 'minus_zero');
    assert.equal(minus.length, difficulty === 'simple' ? 5 : 3);
    if (difficulty === 'simple') assert(minus.some(check => check.invocations.some(call => call.observed.numericResult === '-0')), 'Literal formula must exercise returned -0');
    else assert(minus.every(check => check.invocations.every(call => call.observed.stockZero === '-0')), 'Correct fixture should preserve stock zero sign');
  });
  await runTest('rejecting-' + difficulty, rejecting[difficulty], cases, result => {
    shape(result, cases);
    for (const check of result) {
      const negative = check.variant === 'minus_zero';
      assert.equal(check.passed, !negative, check.id);
      for (const call of check.invocations) {
        assert.equal(call.passed, !negative, check.id);
        if (negative) { assert.equal(call.failure, 'UNEXPECTED_ERROR'); assert.equal(call.observed.errorName, difficulty === 'simple' ? 'RangeError' : 'TypeError'); }
      }
    }
    assert.equal(result.filter(check => !check.passed).length, difficulty === 'simple' ? 5 : 3);
  });
}

await runTest('normalizing-returned-zero-is-accepted', { 'src/pricing.mjs': pricing.replace('return Math.floor(weighted / 10000);', 'return Math.floor(weighted / 10000) || 0;') }, protocol.cases.simple, result => {
  shape(result, protocol.cases.simple);
  assert(result.every(check => check.passed));
  assert(!result.some(check => check.invocations.some(call => call.observed.numericResult === '-0')));
});
await runTest('static-builtin-import-is-blocked', { 'src/pricing.mjs': "import fs from 'node:fs';\n" + pricing }, protocol.cases.simple, result => assert.equal(result.error, 'IMPORT_NOT_ALLOWED'));
await runTest('unprovided-relative-import-is-blocked', { 'src/pricing.mjs': "import './unprovided.mjs';\n" + pricing }, protocol.cases.simple, result => assert.equal(result.error, 'IMPORT_NOT_ALLOWED'));
await runTest('dynamic-import-is-blocked', { 'src/pricing.mjs': "await import('node:fs');\n" + pricing }, protocol.cases.simple, result => assert.equal(result.error, 'IMPORT_NOT_ALLOWED'));
await runTest('dynamic-import-error-keeps-vm-realm', { 'src/pricing.mjs': String.raw`
let rejected = false, escaped = false;
try { await import('node:fs'); } catch (error) {
  rejected = true;
  try { error.constructor.constructor('return process')(); escaped = true; } catch {}
}
if (!rejected || escaped) throw new Error('Import rejection crossed realm');
if (['process', 'require', 'fetch', 'setTimeout'].some(name => typeof globalThis[name] !== 'undefined')) throw new Error('Unexpected host API');
` + pricing }, protocol.cases.simple, result => { shape(result, protocol.cases.simple); assert(result.every(check => check.passed)); });
await runTest('synchronous-loop-hits-vm-timeout', { 'src/pricing.mjs': 'export function lineTotal() { while (true) {} }' }, protocol.cases.simple, (result, elapsedMs) => {
  assert.equal(result.error, 'VM_TIMEOUT');
  assert(elapsedMs < LIMITS.processTimeoutMs + 2000, 'VM timeout should settle before extended outer limit');
});
// The synthetic error getter runs in the worker's outer catch, outside evaluate's
// synchronous timeout. The exact frozen executor must kill the whole subprocess.
await runTest('outer-error-getter-hits-process-timeout', { 'src/pricing.mjs': 'throw { get code() { while (true) {} } }; export function lineTotal() { return 0; }' }, protocol.cases.simple, (result, elapsedMs) => {
  assert.equal(result.error, 'PROCESS_TIMEOUT');
  assert(elapsedMs >= LIMITS.processTimeoutMs - 100);
  assert(elapsedMs < LIMITS.processTimeoutMs + 5000, 'Child kill should settle promptly');
});

assert.equal(sha(await readFile(join(ROOT, 'signed-zero-probe.mjs'))), frozen.probeSha256);
assert.equal(sha(await readFile(join(ROOT, 'signed-zero-protocol.json'))), frozen.protocolFileSha256);
assert.equal(sha(await readFile(join(ROOT, 'signed-zero-freeze.json'))), sha(freezeBytes));
const correctRecords = records.filter(record => /^correct-/.test(record.name));
const mutantRecords = records.filter(record => /^rejecting-/.test(record.name));
const count = (selected, passed) => selected.reduce((sum, record) => sum + (Array.isArray(record.actual) ? record.actual.filter(check => check.passed === passed).length : 0), 0);
const summary = { validations: records.length, passedValidations: records.filter(record => record.passed).length, correctFixturePassedCases: count(correctRecords, true), correctFixtureFailedCases: count(correctRecords, false), rejectingMutantFailedMinusZeroCases: count(mutantRecords, false), rejectingMutantPassedControlCases: count(mutantRecords, true), benchmarkCandidatesReadOrExecuted: 0 };
const result = {
  schema: 'orqanix.signed-zero-synthetic-selftest.v1', designation: 'Synthetic validation of the frozen POST-INSPECTION diagnostic; no benchmark candidates inspected or executed.',
  startedAt, completedAt: new Date().toISOString(), passed: records.every(record => record.passed), summary,
  frozenProbeSha256: frozen.probeSha256, frozenProtocolSha256: frozen.protocolFileSha256, frozenManifestSha256: sha(freezeBytes),
  selftestSha256: sha(await readFile(fileURLToPath(import.meta.url))), checkerSha256: sha(CHECK_SOURCE), workerSha256: sha(WORKER_SOURCE), extractedExecutorSha256: sha(EXECUTOR_SOURCE),
  nodePath: NODE_PATH, nodeSha256: sha(await readFile(NODE_PATH)), limits: LIMITS,
  limitations: ['Synthetic fixture success validates these exact diagnostic cases, not every possible contract behavior.', 'The VM is not an OS security sandbox; frozen shared-intrinsics limitations still apply.'], records,
};
await writeFile(OUTPUT, JSON.stringify(result, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify({ output: OUTPUT, passed: result.passed, ...summary }));
if (!result.passed) process.exitCode = 1;
