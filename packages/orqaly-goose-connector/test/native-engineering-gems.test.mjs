import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isNativeGemsEnabled, FEATURE_FLAG, searchTokenOccurrences, astSearch,
  computeLineHash, formatHashlines, applyHashlineEdit, inspectSourceHeuristically,
  lspQuery, safeEditAndTest } from '../src/native-engineering-gems.mjs';

const enabled = { [FEATURE_FLAG]: 'true' };
const source = 'first line\nsecond line\nthird line';
const edit = { startLine: 2, startHash: computeLineHash('second line'), replacement: 'updated second line' };
const passedSafety = async () => ({ evaluated: true, passed: true, status: 'passed' });
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'axwise-native-prototype-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const filePath = join(directory, 'source.txt');
  await writeFile(filePath, source);
  return { directory, filePath, args: { filePath, hashlineEdit: edit, env: enabled } };
}

test('experimental helpers are disabled by default', async () => {
  for (const flag of [undefined, 'false', '0', 'unexpected']) assert.equal(isNativeGemsEnabled({ [FEATURE_FLAG]: flag }), false);
  for (const flag of ['true', '1']) assert.equal(isNativeGemsEnabled({ [FEATURE_FLAG]: flag }), true);
  assert.equal((await safeEditAndTest({ env: {} })).status, 'disabled');
});

test('text occurrence search names its heuristic behavior and avoids longer identifiers', () => {
  const code = '// validateToken comment\nconst s = "validateToken";\nfunction validateTokenExtra() {}\nfunction validateToken() {}';
  const matches = searchTokenOccurrences({ code, pattern: 'function validateToken($$$ARGS)' });
  assert.deepEqual(matches.map((match) => match.line), [1, 2, 4]);
  assert.ok(matches.every((match) => match.matchType === 'text_token'));
  assert.equal(astSearch, searchTokenOccurrences);
});

test('hashlines remain stable across CRLF and preserve line numbering', () => {
  assert.equal(computeLineHash('test\r'), computeLineHash('test'));
  assert.equal(computeLineHash('test').length, 6);
  assert.deepEqual(formatHashlines('one\ntwo').map((line) => line.line), [1, 2]);
});

test('valid anchors apply an in-memory edit', () => {
  const result = applyHashlineEdit({ content: source, ...edit });
  assert.equal(result.success, true);
  assert.equal(result.content, 'first line\nupdated second line\nthird line');
});

test('missing, malformed, fractional and stale anchors/ranges are rejected', () => {
  for (const changes of [{ startHash: undefined }, { startHash: null }, { startHash: 'x' },
    { startLine: 1.5 }, { startLine: NaN }, { endLine: Infinity },
    { endLine: 3 }, { replacement: {} }]) {
    assert.equal(applyHashlineEdit({ content: source, ...edit, ...changes }).success, false);
  }
  assert.equal(applyHashlineEdit({ content: source, ...edit, startHash: 'aaaaaa' }).error, 'HASHLINE_ANCHOR_MISMATCH');
  assert.equal(applyHashlineEdit({ content: source, ...edit, endLine: 3, endHash: computeLineHash('third line') }).success, true);
});

test('source hints explicitly lack LSP and compiler capabilities', () => {
  const result = inspectSourceHeuristically({ code: '// function fake() {}\nconst notAFunction = (123);\nconst arrow = x => x;\nclass Account {}\nconsole.log("x")' });
  assert.deepEqual(result.symbols.map((symbol) => symbol.name), ['arrow', 'Account']);
  assert.equal(result.method, 'regex_heuristic');
  assert.equal(result.capabilities.syntaxValidation, false);
  assert.equal(result.capabilities.languageServer, false);
  assert.equal(result.diagnostics[0].severity, 'hint');
  assert.equal(lspQuery, inspectSourceHeuristically);
});

test('actual edit helper dry run changes no file and is never verified', async (t) => {
  const { filePath, args } = await fixture(t);
  const result = await safeEditAndTest({ ...args, dryRun: true, safetyEvaluator: passedSafety });
  assert.equal(result.status, 'preview');
  assert.equal(result.verified, false);
  assert.match(result.proposedContent, /updated second/);
  assert.equal(await readFile(filePath, 'utf8'), source);
});

test('no-test edit is applied but not verified; remote safety is not enabled by an API key', async (t) => {
  const { filePath, args } = await fixture(t);
  const result = await safeEditAndTest({ ...args, apiKey: 'dummy-key' });
  assert.equal(result.status, 'applied');
  assert.equal(result.verified, false);
  assert.equal(result.tests, 'not_run');
  assert.equal(result.safety.status, 'not_evaluated');
  assert.equal(result.safety.reason, 'REMOTE_CHECK_NOT_ENABLED');
  assert.match(await readFile(filePath, 'utf8'), /updated second/);
});

test('concurrent edits during asynchronous safety review are preserved', async (t) => {
  const { filePath, args, directory } = await fixture(t);
  const result = await safeEditAndTest({ ...args, safetyEvaluator: async () => {
    await writeFile(filePath, 'concurrent update');
    return passedSafety();
  } });
  assert.equal(result.error, 'FILE_CHANGED');
  assert.equal(result.verified, false);
  assert.equal(await readFile(filePath, 'utf8'), 'concurrent update');
  assert.deepEqual(await readdir(directory), ['source.txt']);
});

test('explicit failed safety verdict blocks without writing candidate', async (t) => {
  const { filePath, args } = await fixture(t);
  const result = await safeEditAndTest({ ...args, safetyEvaluator: async () => ({ evaluated: true, passed: false, status: 'failed' }) });
  assert.equal(result.status, 'blocked');
  assert.equal(await readFile(filePath, 'utf8'), source);
});

test('unavailable safety is surfaced as not evaluated', async (t) => {
  const { args } = await fixture(t);
  const result = await safeEditAndTest({ ...args, dryRun: true, safetyEvaluator: async () => { throw new Error('offline'); } });
  assert.equal(result.safety.status, 'not_evaluated');
  assert.equal(result.safety.passed, null);
  assert.equal(result.verified, false);
});

test('only a real successful test command verifies a stable edited file', async (t) => {
  const { args, filePath } = await fixture(t);
  const command = { file: process.execPath, args: ['-e', 'const fs=require("fs"); process.exit(fs.readFileSync(process.argv[1],"utf8").includes("updated second")?0:1)', filePath] };
  const result = await safeEditAndTest({ ...args, testCommand: command });
  assert.equal(result.status, 'passed');
  assert.equal(result.verified, true);
  assert.equal(result.exitCode, 0);
});

test('failed tests restore the original file when no other writer changed it', async (t) => {
  const { args, filePath } = await fixture(t);
  const result = await safeEditAndTest({ ...args, testCommand: { file: process.execPath, args: ['-e', 'process.exit(1)'] } });
  assert.equal(result.status, 'test_failed');
  assert.equal(result.verified, false);
  assert.equal(result.rollback, 'restored');
  assert.equal(await readFile(filePath, 'utf8'), source);
});

test('failed-test rollback never overwrites a change made during testing', async (t) => {
  const { args, filePath } = await fixture(t);
  const result = await safeEditAndTest({ ...args, testCommand: { file: process.execPath, args: ['-e', 'require("fs").writeFileSync(process.argv[1],"external update");process.exit(1)', filePath] } });
  assert.equal(result.status, 'test_failed');
  assert.equal(result.rollback, 'skipped_file_changed');
  assert.equal(await readFile(filePath, 'utf8'), 'external update');
});

test('tests modifying the edited file do not verify that new content', async (t) => {
  const { args, filePath } = await fixture(t);
  const result = await safeEditAndTest({ ...args, testCommand: { file: process.execPath, args: ['-e', 'require("fs").writeFileSync(process.argv[1],"test-modified content")', filePath] } });
  assert.equal(result.verified, false);
  assert.equal(result.error, 'FILE_CHANGED');
});

test('timed-out tests fail and restore original content', async (t) => {
  const { args, filePath } = await fixture(t);
  const result = await safeEditAndTest({ ...args, testTimeoutMs: 50,
    testCommand: { file: process.execPath, args: ['-e', 'setTimeout(()=>{}, 10000)'] } });
  assert.equal(result.status, 'test_failed');
  assert.equal(result.rollback, 'restored');
  assert.equal(await readFile(filePath, 'utf8'), source);
});

test('caller cannot override the actual source snapshot used to check anchors', async (t) => {
  const { args, filePath } = await fixture(t);
  const result = await safeEditAndTest({ ...args, hashlineEdit: { ...edit, content: 'forged', startHash: computeLineHash('forged') } });
  assert.equal(result.status, 'rejected');
  assert.equal(result.error, 'HASHLINE_ANCHOR_MISMATCH');
  assert.equal(await readFile(filePath, 'utf8'), source);
});

test('invalid test command is rejected before file modification', async (t) => {
  const { args, filePath } = await fixture(t);
  for (const testCommand of ['', {}, { file: 'node', args: [1] }]) {
    const result = await safeEditAndTest({ ...args, testCommand });
    assert.equal(result.error, 'INVALID_TEST_COMMAND');
  }
  assert.equal(await readFile(filePath, 'utf8'), source);
});


test('oversized replacement is rejected before changing the file', async (t) => {
  const { args, filePath } = await fixture(t);
  const result = await safeEditAndTest({ ...args, hashlineEdit: { ...edit, replacement: 'x'.repeat(2 * 1024 * 1024) } });
  assert.equal(result.error, 'EDIT_TOO_LARGE');
  assert.equal(await readFile(filePath, 'utf8'), source);
});

test('concurrent calls in the same process cannot edit the same file together', async (t) => {
  const { args } = await fixture(t);
  let announce;
  let release;
  const started = new Promise((resolve) => { announce = resolve; });
  const gate = new Promise((resolve) => { release = resolve; });
  const first = safeEditAndTest({ ...args, safetyEvaluator: async () => { announce(); await gate; return passedSafety(); } });
  await started;
  const second = await safeEditAndTest(args);
  assert.equal(second.error, 'FILE_EDIT_IN_PROGRESS');
  release();
  assert.equal((await first).status, 'applied');
});
