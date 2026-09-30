#!/usr/bin/env node
/** Controlled native-Goose engineering experiment. Offline preflight never contacts a provider. */
import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { AcpClient, TurnRecorder, redact, sessionInventory } from './benchmark-goose-reset.mjs';

const execute = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const MODEL = 'gemini-3.8-flash';
export const EFFORT = 'high';
export const MAX_HTTP_CALLS = 120;
const FATAL_HTTP = [400, 401, 403, 404, 405, 422, 501];
export const NATIVE_TOOLS = ['ast_search', 'lsp_query', 'hashline_edit', 'safe_edit_and_test'];
export const SOURCE = [
  '// function commentDecoy(values: number[]): number { return 999; }',
  "const quotedDeclaration = 'function stringDecoy() { return 888; }';",
  'export function average(values: readonly number[]): number {',
  '  return values.reduce((sum, value) => sum + value, 0) / values.length;',
  '}',
  'export const sample = average([2, 4, 6]);', '',
].join('\n');
export const TEST = "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { average } from './average.ts';\ntest('ordinary mean', () => assert.equal(average([2, 4, 6]), 4));\n";
export const PROMPT = [
  'Fix average.ts so average([]) returns 0, preserving arithmetic means for nonempty inputs and never mutating inputs. Preserve unrelated comments, the quoted declaration and sample export.',
  'Add a meaningful empty-input regression test to average.test.mjs and run node --test average.test.mjs. Node supports this erasable TypeScript fixture directly; no build or dependencies are needed.',
  'This is a controlled tool-policy experiment, not organic tool selection: IF ast_search, lsp_query, hashline_edit and safe_edit_and_test are available, use all four directly in this conversation. First query real function_declaration captures in average.ts with ast_search (ignore comment/string decoys), and use lsp_query symbols plus definition at the average call on zero-based line 5, character 22. Read both editable files with hashline_edit action=read, copy current complete SHA/anchors, then apply each file correction with safe_edit_and_test using test_command ["node","--test","average.test.mjs"]. Fix the source first, then add the regression test. Include line-ending newlines in replacements. Do not use developer write/edit/shell to bypass the native edit/test treatment.',
  'IF those four tools are absent, use common developer file read/edit/write tools and shell only, then run node --test average.test.mjs.',
  'Only read README.md, average.ts and average.test.mjs in the workspace. Only modify average.ts and average.test.mjs. Never install dependencies, access external files, use network tools, change settings, enable extensions, commit, push or launch background processes.',
  'Keep the final answer short. State observed test outcomes; missing, failed or cancelled checks are not verification. Remain in this same Goose loop.',
].join('\n');
const SHA = (value) => createHash('sha256').update(value).digest('hex');
export const PLAN = [false, true].flatMap((native) => ['0', '1'].map((loop) => ({ id: `native-${native ? 'on' : 'off'}_loop-${loop}`, native, loop })));
export function benchmarkPlan() { return [PLAN, [...PLAN].reverse()].flatMap((arms, index) => arms.map((arm) => ({ ...arm, repetition: index + 1 }))); }

export function parseOptions(argv) {
  const opts = { live: false, preflight: false, goose: '/private/tmp/orqaly-goose-verified-fixes/target/debug/goose', runtime: null, lspServers: null, resume: null, output: join(ROOT, 'review-evidence/2026-09-29/native-engineering/live.json'), timeoutSeconds: 240 };
  const keys = { '--goose': 'goose', '--runtime': 'runtime', '--lsp-servers': 'lspServers', '--output': 'output', '--timeout-seconds': 'timeoutSeconds', '--resume': 'resume' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--live') opts.live = true;
    else if (argv[i] === '--preflight') opts.preflight = true;
    else if (keys[argv[i]] && argv[i + 1]) opts[keys[argv[i]]] = argv[++i];
    else throw new Error('UNKNOWN_OPTION');
  }
  opts.timeoutSeconds = Number(opts.timeoutSeconds);
  if (!Number.isInteger(opts.timeoutSeconds) || opts.timeoutSeconds < 30 || opts.timeoutSeconds > 600) throw new Error('TIMEOUT_MUST_BE_30_TO_600_SECONDS');
  if (opts.live && opts.preflight) throw new Error('CHOOSE_LIVE_OR_PREFLIGHT');
  if (opts.runtime && opts.lspServers) throw new Error('CHOOSE_RUNTIME_OR_LSP_SERVERS');
  if (opts.resume && (!opts.live || opts.resume !== opts.output)) throw new Error('RESUME_REQUIRES_LIVE_AND_SAME_OUTPUT');
  for (const key of ['goose', 'runtime', 'output', 'resume']) if (opts[key] && !isAbsolute(opts[key])) throw new Error('PATHS_MUST_BE_ABSOLUTE');
  if ((opts.live || opts.preflight) && !opts.runtime && !opts.lspServers) throw new Error('LSP_CONFIGURATION_REQUIRED');
  return opts;
}

function inside(root, target) {
  const rel = relative(root, target);
  return !isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`);
}
export async function resolveLanguageServers(opts) {
  if (opts.lspServers) {
    const value = JSON.parse(opts.lspServers);
    if (!value || Array.isArray(value) || typeof value !== 'object' || !Array.isArray(value.typescript)) throw new Error('TYPESCRIPT_LSP_REQUIRED');
    for (const [language, argv] of Object.entries(value)) {
      if (!['typescript', 'javascript', 'python'].includes(language) || !Array.isArray(argv) || !argv.length || !argv.every((x) => typeof x === 'string' && x.length && !x.includes('\0')) || !isAbsolute(argv[0])) throw new Error('INVALID_LSP_SERVERS');
      await realpath(argv[0]);
    }
    return { servers: value, node: process.execPath, provenance: { kind: 'explicit-host-argv' } };
  }
  const runtime = await realpath(opts.runtime);
  const manifestBytes = await readFile(join(runtime, 'runtime-manifest.json'));
  const manifest = JSON.parse(manifestBytes);
  if (manifest.schemaVersion !== 'orqanix.desktop-runtime.v3') throw new Error('RUNTIME_MANIFEST_V3_REQUIRED');
  const node = manifest.target?.nodeRelativePath;
  if (!['node/bin/node', 'node/node.exe'].includes(node)) throw new Error('INVALID_RUNTIME_NODE');
  const scripts = { typescript: 'language-servers/node_modules/typescript-language-server/lib/cli.mjs', javascript: 'language-servers/node_modules/typescript-language-server/lib/cli.mjs', python: 'language-servers/node_modules/pyright/langserver.index.js' };
  const verified = new Map();
  async function verify(file) {
    if (verified.has(file)) return verified.get(file);
    const path = await realpath(join(runtime, file));
    if (!inside(runtime, path) || SHA(await readFile(path)) !== manifest.files?.[file]) throw new Error('RUNTIME_FILE_INTEGRITY_FAILED');
    verified.set(file, path); return path;
  }
  const servers = {};
  for (const [language, script] of Object.entries(scripts)) {
    if (JSON.stringify(manifest.languageServers?.[language]) !== JSON.stringify([node, script, '--stdio'])) throw new Error('RUNTIME_LSP_ARGV_MISMATCH');
    servers[language] = [await verify(node), await verify(script), '--stdio'];
  }
  return { servers, node: await verify(node), provenance: { kind: 'manifest-verified-entrypoints', manifestSha256: SHA(manifestBytes), versions: manifest.languageServerVersions, runtime } };
}

export function canonicalToolName(value, inventory) {
  if (inventory.includes(value)) return value;
  const title = String(value || '').split(' · ')[0];
  return inventory.find((name) => name.split('__').map((part) => part.replaceAll('_', ' ')).join(': ') === title) || null;
}
function allowedFile(path, workspace, write = false) {
  if (typeof path !== 'string' || !path || path.includes('\0')) return false;
  const filename = relative(workspace, resolve(workspace, path));
  return (write ? ['average.ts', 'average.test.mjs'] : ['README.md', 'average.ts', 'average.test.mjs']).includes(filename);
}
function boundedEdits(args) {
  return /^[a-f0-9]{64}$/.test(args.expected_sha256 || '') && Array.isArray(args.edits) && args.edits.length > 0 && args.edits.length <= 20 && args.edits.every((edit) =>
    Number.isInteger(edit.start_line) && Number.isInteger(edit.end_line) && edit.start_line > 0 && edit.end_line >= edit.start_line && edit.end_line <= 1000 &&
    typeof edit.start_anchor === 'string' && /^\d+:[a-f0-9]{64}$/.test(edit.start_anchor) && typeof edit.end_anchor === 'string' && /^\d+:[a-f0-9]{64}$/.test(edit.end_anchor) && typeof edit.replacement === 'string' && edit.replacement.length <= 16000);
}
export function fixturePermission(name, args, workspace, native = false) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return false;
  if (name === 'ast_search') return native && allowedFile(args.path, workspace) && typeof args.query === 'string' && args.query.length <= 4096 && (args.language === undefined || args.language === 'typescript');
  if (name === 'lsp_query') return native && allowedFile(args.path, workspace) && ['symbols', 'definition', 'references', 'hover', 'diagnostics'].includes(args.action) && (args.language === undefined || ['typescript', 'javascript'].includes(args.language));
  if (name === 'hashline_edit') return native && args.action === 'read' && allowedFile(args.path, workspace);
  if (name === 'safe_edit_and_test') return native && allowedFile(args.path, workspace, true) && boundedEdits(args) && JSON.stringify(args.test_command) === '["node","--test","average.test.mjs"]' && (args.timeout_secs === undefined || Number.isInteger(args.timeout_secs) && args.timeout_secs >= 1 && args.timeout_secs <= 60);
  if (['edit', 'write', 'developer__edit', 'developer__write'].includes(name)) return !native && allowedFile(args.path, workspace, true);
  if (['read_file', 'developer__read_file'].includes(name)) return allowedFile(args.path || args.file_path, workspace);
  if (['text_editor', 'developer__text_editor'].includes(name)) return ['view', 'str_replace', 'create', 'insert'].includes(args.command) && allowedFile(args.path, workspace, args.command !== 'view') && (!native || args.command === 'view');
  if (['shell', 'developer__shell'].includes(name)) return !native && /^(?:node --test average\.test\.mjs|cat (?:README\.md|average\.ts|average\.test\.mjs)(?: (?:README\.md|average\.ts|average\.test\.mjs))*)$/.test(String(args.command || '').trim());
  return false;
}
export function permissionPolicyFingerprint() {
  return SHA([allowedFile, boundedEdits, fixturePermission].map((fn) => fn.toString()).join('\n'));
}

export function benchmarkExitCode(report) {
  if (!Array.isArray(report?.rows)) return 1;
  const expected = report.live ? benchmarkPlan() : benchmarkPlan().filter((row) => row.repetition === 1);
  if (report.rows.length !== expected.length) return 1;
  return expected.every((arm, index) => {
    const row = report.rows[index];
    return row.arm === arm.id && row.repetition === arm.repetition && row.native === arm.native && row.loop === arm.loop && (report.live ? row.accepted === true : row.status === 'preflight_passed' && row.primaryRequests?.length === 0);
  }) ? 0 : 1;
}

export class NativeRecorder extends TurnRecorder {
  constructor() { super(); this.outputs = new Map(); }
  update(message) {
    const update = message.params?.update;
    const name = update?._meta?.goose?.toolCall?.toolName;
    if (name) message = { ...message, params: { ...message.params, update: { ...update, _meta: { ...update._meta, toolName: name } } } };
    super.update(message);
    if (!update || !['tool_call', 'tool_call_update'].includes(update.sessionUpdate || update.type)) return;
    const values = [update.rawOutput, ...(update.content || []).map((item) => item?.content?.text ?? item?.text)];
    for (let value of values) {
      if (typeof value === 'string') { try { value = JSON.parse(value); } catch { continue; } }
      if (value?.structuredContent || value?.structured_content) value = value.structuredContent || value.structured_content;
      else if (Array.isArray(value?.content)) {
        const text = value.content.find((item) => item.type === 'text')?.text;
        if (text) { try { value = JSON.parse(text); } catch { continue; } }
      }
      if (value && typeof value === 'object') this.outputs.set(String(update.toolCallId), value);
    }
  }
}
export class NativeAcpClient extends AcpClient {
  async onRequest(message) {
    if (message.method !== 'session/request_permission') {
      this.send({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Unsupported benchmark client operation' } }); return;
    }
    const call = message.params?.toolCall;
    const known = this.recorder?.tools.get(String(call?.toolCallId));
    const raw = call?._meta?.goose?.toolCall?.toolName || call?._meta?.toolName || known?.name || call?.title || '';
    const name = canonicalToolName(raw, this.toolInventory || []);
    const args = call?.rawInput || known?.input || {};
    const allow = fixturePermission(name, args, this.workspace, this.nativeEnabled);
    const option = message.params?.options?.find((item) => item.kind === (allow ? 'allow_once' : 'reject_once'));
    this.send({ jsonrpc: '2.0', id: message.id, result: { outcome: option ? { outcome: 'selected', optionId: option.optionId } : { outcome: 'cancelled' } } });
    if (!allow) { this.recorder?.denials.push({ tool: name, input: args, reason: 'Outside controlled fixture policy' }); this.fail(new Error(`BENCHMARK_PERMISSION_DENIED: ${name}`)); }
  }
}

export function providerConfig(origin) {
  return { name: 'custom_native_benchmark', engine: 'openai', display_name: 'Direct Gemini native benchmark', api_key_env: 'NATIVE_BENCHMARK_PROXY_TOKEN', base_url: origin, base_path: 'v1/chat/completions', requires_auth: true, supports_streaming: true, preserves_thinking: true, dynamic_models: false, timeout_seconds: 180, models: [{ name: MODEL, context_limit: 1048576, reasoning: true, request_params: { reasoning_effort: EFFORT } }] };
}
export function childEnvironment(paths, arm, relay, lsp, source = process.env) {
  const env = {};
  for (const key of ['HOME', 'USER', 'LOGNAME', 'SHELL', 'LANG', 'LC_ALL', 'TZ', 'SYSTEMROOT']) if (source[key]) env[key] = source[key];
  return { ...env, PATH: `${dirname(lsp.node)}${process.platform === 'win32' ? ';' : ':'}${source.PATH || '/usr/bin:/bin'}`, GOOSE_PATH_ROOT: paths.profile, TMPDIR: `${paths.temporary}/`, GOOSE_PROVIDER: 'custom_native_benchmark', GOOSE_MODEL: MODEL, GOOSE_MODE: 'approve', GOOSE_MAX_TURNS: '12', GOOSE_STATE_MACHINE: arm.loop, GOOSE_NATIVE_LSP_SERVERS: JSON.stringify(lsp.servers), GOOSE_TELEMETRY_ENABLED: 'false', GOOSE_DISABLE_TELEMETRY: 'true', NATIVE_BENCHMARK_PROXY_TOKEN: relay.token };
}

/** Only validated Gemini model/effort requests can cross the one allowed provider route. */
export async function startForwarder({ apiKey = null, offline = true, fetchImpl = fetch, maxCalls = MAX_HTTP_CALLS, attemptOffset = 0, onFatal = () => {} } = {}) {
  if (!offline && !apiKey) throw new Error('GEMINI_API_KEY_REQUIRED');
  const token = randomUUID(), telemetry = [];
  let attempts = 0;
  const server = createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/v1/chat/completions' || req.headers.authorization !== `Bearer ${token}`) { res.writeHead(403).end(); return; }
    const started = performance.now(); let record;
    try {
      const chunks = []; let length = 0;
      for await (const chunk of req) { length += chunk.length; if (length > 4 * 1024 * 1024) throw new Error('REQUEST_TOO_LARGE'); chunks.push(chunk); }
      const body = Buffer.concat(chunks), request = JSON.parse(body);
      record = { requestModel: request.model, requestEffort: request.reasoning_effort ?? null, returnedModels: [], usage: [], forwarded: false };
      telemetry.push(record);
      if (request.model !== MODEL || request.reasoning_effort !== EFFORT) throw new Error('MODEL_OR_EFFORT_MISMATCH');
      if (offline) throw new Error('OFFLINE_PREFLIGHT_FORBIDS_INFERENCE');
      if (attempts >= maxCalls) throw new Error('HTTP_CALL_BUDGET_EXHAUSTED');
      record.droppedRequestKeys = ['temperature', 'top_p', 'store'].filter((key) => Object.hasOwn(request, key));
      for (const key of record.droppedRequestKeys) delete request[key];
      const upstreamBody = JSON.stringify(request);
      attempts += 1; record.forwarded = true; record.attempt = attemptOffset + attempts;
      const abort = new AbortController(); const deadline = setTimeout(() => abort.abort(), 180000);
      res.on('close', () => { if (!res.writableEnded) abort.abort(); });
      try {
        const response = await fetchImpl('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: upstreamBody, redirect: 'error', signal: abort.signal });
        record.httpStatus = response.status;
        if (FATAL_HTTP.includes(response.status)) {
          record.error = `PROVIDER_HTTP_${response.status}`;
          onFatal(new Error(record.error));
        }
        res.writeHead(response.status, Object.fromEntries([...response.headers].filter(([key]) => !['connection', 'transfer-encoding', 'content-encoding', 'content-length'].includes(key))));
        let pending = ''; const decoder = new TextDecoder();
        const inspect = (line) => {
          let value; try { value = JSON.parse(line.replace(/^data:\s*/, '')); } catch { return; }
          if (typeof value.model === 'string' && !record.returnedModels.includes(value.model)) {
            record.returnedModels.push(value.model);
            if (value.model !== MODEL) { record.error = 'RETURNED_MODEL_MISMATCH'; onFatal(new Error(record.error)); abort.abort(); }
          }
          if (value.usage && typeof value.usage === 'object') record.usage.push(value.usage);
          if (typeof value.error?.code === 'string' || typeof value.error?.code === 'number') record.providerErrorCode = value.error.code;
        };
        for await (const chunk of response.body) {
          res.write(chunk); pending += decoder.decode(chunk, { stream: true });
          const lines = pending.split('\n'); pending = lines.pop(); for (const line of lines) inspect(line);
          if (pending.length > 1024 * 1024) throw new Error('RESPONSE_LINE_TOO_LARGE');
        }
        pending += decoder.decode(); inspect(pending); res.end();
      } finally { clearTimeout(deadline); }
    } catch (error) {
      if (record) record.error ||= ['MODEL_OR_EFFORT_MISMATCH', 'OFFLINE_PREFLIGHT_FORBIDS_INFERENCE', 'HTTP_CALL_BUDGET_EXHAUSTED', 'REQUEST_TOO_LARGE', 'RESPONSE_LINE_TOO_LARGE'].includes(error.message) ? error.message : 'PROVIDER_FORWARD_FAILED';
      if (['MODEL_OR_EFFORT_MISMATCH', 'HTTP_CALL_BUDGET_EXHAUSTED'].includes(record?.error)) onFatal(new Error(record.error));
      if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: record?.error || 'PROXY_REJECTED', type: 'benchmark_guard' } }));
    } finally { if (record) record.elapsedMs = Math.round(performance.now() - started); }
  });
  await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); });
  return { token, telemetry, origin: `http://127.0.0.1:${server.address().port}`, close: () => { server.closeAllConnections(); server.close(); } };
}

export async function prepareFixture(directory, origin = 'http://127.0.0.1:1') {
  const workspace = join(directory, 'workspace'), profile = join(directory, 'profile'), temporary = join(directory, 'tmp');
  for (const path of [workspace, join(profile, 'config/custom_providers'), temporary]) await mkdir(path, { recursive: true, mode: 0o700 });
  await writeFile(join(profile, 'config/custom_providers/custom_native_benchmark.json'), JSON.stringify(providerConfig(origin)), { mode: 0o600 });
  await writeFile(join(profile, 'config/config.yaml'), JSON.stringify({ GOOSE_PROVIDER: 'custom_native_benchmark', GOOSE_MODEL: MODEL, GOOSE_MODE: 'approve', extensions: { developer: { enabled: true, type: 'platform', name: 'developer' }, code_execution: { enabled: false, type: 'platform', name: 'code_execution' }, native_engineering: { enabled: false, type: 'platform', name: 'native_engineering' } } }), { mode: 0o600 });
  await writeFile(join(workspace, 'average.ts'), SOURCE);
  await writeFile(join(workspace, 'average.test.mjs'), TEST);
  await writeFile(join(workspace, 'README.md'), '# Average fixture\nReturn 0 for empty input, preserve nonempty means and readonly inputs. Add a regression test. The comment and string are AST decoys. Node supports this TypeScript directly; no install is needed.\n');
  return { directory, workspace, profile, temporary };
}

export async function acceptance(paths, node = process.execPath) {
  const checks = { functionBehavior: false, fixtureTests: false, regressionDetectsOriginalBug: false, unrelatedDecoysPreserved: false };
  const code = `import assert from 'node:assert/strict'; import { average, sample } from ${JSON.stringify(pathToFileURL(join(paths.workspace, 'average.ts')).href)}; assert.equal(average([]),0); assert.equal(average([2,4,6]),4); assert.equal(average([-2,2]),0); assert.equal(average([3]),3); assert.equal(average([0.5,1.5]),1); assert.equal(sample,4); const values=Object.freeze([1,2,3]); assert.equal(average(values),2);`;
  const run = (args, cwd = paths.workspace) => execute(node, args, { cwd, timeout: 10000, maxBuffer: 32000, env: { PATH: dirname(node), NODE_NO_WARNINGS: '1' } });
  try { await run(['--input-type=module', '-e', code]); checks.functionBehavior = true; } catch { /* Independent oracle failure retained. */ }
  try { await run(['--test', 'average.test.mjs']); checks.fixtureTests = true; } catch { /* Independent test failure retained. */ }
  const test = await readFile(join(paths.workspace, 'average.test.mjs'), 'utf8');
  const source = await readFile(join(paths.workspace, 'average.ts'), 'utf8');
  checks.unrelatedDecoysPreserved = SOURCE.split('\n').slice(0, 2).every((line) => source.includes(line));
  const mutant = await mkdtemp(join(paths.directory, 'mutant-'));
  await writeFile(join(mutant, 'average.ts'), SOURCE); await writeFile(join(mutant, 'average.test.mjs'), test);
  try { await run(['--test', 'average.test.mjs'], mutant); }
  catch (error) { checks.regressionDetectsOriginalBug = error.code === 1 && /AssertionError|ERR_ASSERTION/.test(`${error.stdout}${error.stderr}`); }
  return { ...checks, passed: Object.values(checks).every(Boolean), sourceSha256: SHA(source), testSha256: SHA(test) };
}

export async function offlineAcceptanceCalibration(root, node) {
  const paths = await prepareFixture(join(root, 'oracle-calibration'));
  const original = await acceptance(paths, node);
  await writeFile(join(paths.workspace, 'average.ts'), SOURCE.replace('  return values.reduce', '  if (values.length === 0) return 0;\n  return values.reduce'));
  const missingRegression = await acceptance(paths, node);
  await writeFile(join(paths.workspace, 'average.test.mjs'), `${TEST}test('empty input', () => assert.equal(average([]), 0));\n`);
  const corrected = await acceptance(paths, node);
  return { original, missingRegression, corrected, passed: !original.passed && !original.functionBehavior && !original.regressionDetectsOriginalBug && !missingRegression.passed && missingRegression.functionBehavior && !missingRegression.regressionDetectsOriginalBug && corrected.passed };
}
function policyCalibration(workspace) {
  const anchor = `1:${'a'.repeat(64)}`;
  const args = { path: 'average.ts', expected_sha256: 'a'.repeat(64), edits: [{ start_line: 1, end_line: 1, start_anchor: anchor, end_anchor: anchor, replacement: 'x\n' }], test_command: ['node', '--test', 'average.test.mjs'] };
  return fixturePermission('safe_edit_and_test', args, workspace, true) && !fixturePermission('safe_edit_and_test', { ...args, path: '../outside' }, workspace, true) && !fixturePermission('safe_edit_and_test', { ...args, test_command: ['sh', '-c', 'anything'] }, workspace, true) && !fixturePermission('developer__shell', { command: 'node --test average.test.mjs' }, workspace, true) && fixturePermission('developer__shell', { command: 'node --test average.test.mjs' }, workspace, false);
}
export function treatmentEvidence(result, native) {
  const tools = result.tools || [];
  if (!native) return !tools.some((tool) => NATIVE_TOOLS.includes(tool.name));
  if (!NATIVE_TOOLS.every((name) => tools.some((tool) => tool.name === name && tool.status === 'completed'))) return false;
  const outputs = result.nativeOutputs || [];
  const values = (name) => outputs.filter((output) => output.tool === name).map((output) => output.value);
  const file = (path, wanted) => typeof path === 'string' && (path === wanted || path.endsWith(`/${wanted}`));
  const ast = values('ast_search').some((value) => value.status === 'completed' && value.engine === 'tree-sitter' && Array.isArray(value.matches) && value.matches.length > 0 && value.matches.some((match) => /\baverage\b/.test(match.snippet)) && value.matches.every((match) => !/commentDecoy|stringDecoy/.test(match.snippet)));
  const lsp = values('lsp_query').filter((value) => value.status === 'completed' && value.positionEncoding === 'utf-16');
  const hasSymbol = (symbols) => Array.isArray(symbols) && symbols.some((symbol) => symbol.name === 'average' || hasSymbol(symbol.children));
  const symbols = lsp.some((value) => value.action === 'symbols' && hasSymbol(value.result));
  const definition = lsp.some((value) => value.action === 'definition' && (Array.isArray(value.result) ? value.result : [value.result]).some((location) => location && file(location.uri || location.targetUri, 'average.ts') && (location.range || location.targetRange)?.start?.line === 2));
  const reads = ['average.ts', 'average.test.mjs'].every((path) => values('hashline_edit').some((value) => value.status === 'read' && file(value.path, path) && /^[a-f0-9]{64}$/.test(value.sha256) && Array.isArray(value.lines) && value.lines.length > 0));
  const checkedEdits = ['average.ts', 'average.test.mjs'].every((path) => values('safe_edit_and_test').some((value) => file(value.path, path) && value.status === 'verified' && value.verified === true && value.target_unchanged_during_test === true && value.test?.executed === true && value.test.exit_code === 0 && value.test.timed_out === false && value.test.cancelled === false && value.test.output_error == null));
  return ast && symbols && definition && reads && checkedEdits;
}
export function modelEvidence(requests) {
  const successful = requests.filter((call) => call.httpStatus >= 200 && call.httpStatus < 300);
  return successful.length > 0 && requests.every((call) => call.forwarded && call.requestModel === MODEL && call.requestEffort === EFFORT && !FATAL_HTTP.includes(call.httpStatus) && !['MODEL_OR_EFFORT_MISMATCH', 'RETURNED_MODEL_MISMATCH'].includes(call.error)) && successful.every((call) => Array.isArray(call.returnedModels) && call.returnedModels.length > 0 && call.returnedModels.every((model) => model === MODEL));
}

export function validateResume(previous, current) {
  if (previous?.schemaVersion !== 'native-engineering-benchmark.v1' || previous.live !== true || previous.model?.requested !== MODEL || previous.model?.requestedEffort !== EFFORT || previous.promptSha256 !== SHA(PROMPT) || previous.sourceSha256 !== SHA(SOURCE) || previous.testSha256 !== SHA(TEST) || JSON.stringify(previous.plan) !== JSON.stringify(benchmarkPlan())) throw new Error('RESUME_CONTRACT_MISMATCH');
  if (previous.permissionPolicySha256 !== permissionPolicyFingerprint()) throw new Error('RESUME_PERMISSION_POLICY_MISMATCH');
  if ((previous.timeoutSeconds ?? 240) !== current.timeoutSeconds) throw new Error('RESUME_TIMEOUT_MISMATCH');
  if (previous.binaries?.goose?.sha256 !== current.gooseSha256 || previous.binaries?.node?.sha256 !== current.nodeSha256 || JSON.stringify(previous.languageServers) !== JSON.stringify(current.languageServers)) throw new Error('RESUME_RUNTIME_MISMATCH');
  if (!Array.isArray(previous.rows) || previous.rows.length >= 8) throw new Error('RESUME_ROWS_INVALID');
  const plan = benchmarkPlan(), keys = new Set(); let used = 0;
  for (const [index, row] of previous.rows.entries()) {
    const expected = plan[index];
    if (row.arm !== expected.id || row.repetition !== expected.repetition || row.native !== expected.native || row.loop !== expected.loop) throw new Error('RESUME_ROWS_INVALID');
    keys.add(`${row.arm}/${row.repetition}`);
    if (!Array.isArray(row.primaryRequests)) throw new Error('RESUME_TELEMETRY_MISSING');
    for (const call of row.primaryRequests) {
      if (call.forwarded) used += 1;
      if (call.requestModel !== MODEL || call.requestEffort !== EFFORT || FATAL_HTTP.includes(call.httpStatus) || ['MODEL_OR_EFFORT_MISMATCH', 'RETURNED_MODEL_MISMATCH', 'HTTP_CALL_BUDGET_EXHAUSTED'].includes(call.error) || call.returnedModels?.some((model) => model !== MODEL)) throw new Error('RESUME_PROVIDER_FAILURE_REQUIRES_REVIEW');
    }
  }
  if (used >= MAX_HTTP_CALLS) throw new Error('HTTP_CALL_BUDGET_EXHAUSTED');
  return { keys, used };
}

export async function main(argv) {
  const opts = parseOptions(argv), plan = benchmarkPlan();
  if (!opts.live && !opts.preflight) { console.log(JSON.stringify({ model: MODEL, requestedEffort: EFFORT, plan, prompt: PROMPT, maxHttpCalls: MAX_HTTP_CALLS, paidCallsStarted: false }, null, 2)); return; }
  const lsp = await resolveLanguageServers(opts), root = await mkdtemp(join(tmpdir(), 'native-engineering-bench-'));
  const calibration = await offlineAcceptanceCalibration(root, lsp.node);
  const policyPassed = policyCalibration(join(root, 'workspace'));
  if (!calibration.passed || !policyPassed) throw new Error('OFFLINE_CALIBRATION_FAILED');
  // Read this secret only for a live run; never persist it or pass it to Goose/LSP/test children.
  const apiKey = opts.live ? process.env.GEMINI_API_KEY : null;
  if (opts.live && !apiKey) throw new Error('GEMINI_API_KEY_REQUIRED');
  const gooseSha256 = SHA(await readFile(opts.goose));
  const nodeSha256 = SHA(await readFile(lsp.node));
  const previous = opts.resume ? JSON.parse(await readFile(opts.resume, 'utf8')) : null;
  const resumed = previous ? validateResume(previous, { gooseSha256, nodeSha256, languageServers: lsp.provenance, timeoutSeconds: opts.timeoutSeconds }) : { keys: new Set(), used: 0 };
  let failActiveInference = () => {};
  const relay = await startForwarder({ apiKey, offline: !opts.live, maxCalls: MAX_HTTP_CALLS - resumed.used, attemptOffset: resumed.used, onFatal: (error) => failActiveInference(error) });
  const report = previous || { schemaVersion: 'native-engineering-benchmark.v1', startedAt: new Date().toISOString(), live: opts.live, timeoutSeconds: opts.timeoutSeconds, kind: 'native-Goose-ACP-controlled-policy', tempRoot: root, model: { requested: MODEL, requestedEffort: EFFORT, providerEndpoint: 'Google OpenAI-compatible API directly' }, plan, permissionPolicySha256: permissionPolicyFingerprint(), promptSha256: SHA(PROMPT), sourceSha256: SHA(SOURCE), testSha256: SHA(TEST), binaries: { goose: { path: opts.goose, sha256: gooseSha256 }, node: { path: lsp.node, sha256: nodeSha256 } }, languageServers: lsp.provenance, offlineCalibration: { acceptance: calibration, permissionsPassed: policyPassed }, maxHttpCalls: MAX_HTTP_CALLS, rows: [], limitations: ['Two repetitions per feature/loop combination are exploratory, not statistical proof.', 'The identical conditional prompt enforces treatment use; this is not organic routing.', 'Local ACP exercises Goose backend, not Electron rendering.', 'Feature-off still includes developer tools; code_execution and delegated engines are absent.', 'Permissions constrain fixture files and argv; approved test code is not OS sandboxed.', 'Requested high effort and returned model/usage metadata are recorded; internal reasoning effort cannot be independently observed.', 'The direct Google proxy drops temperature, top_p and store consistently with production normalization; dropped key names are recorded.'] };
  if (previous) {
    for (const row of report.rows) {
      const revised = modelEvidence(row.primaryRequests);
      const accepted = row.status === 'completed' && row.acceptance?.passed === true && row.treatmentExercised === true && revised;
      if (row.modelAndEffortVerified !== revised || row.accepted !== accepted) {
        row.assessmentRevisions ||= [];
        row.assessmentRevisions.push({ at: new Date().toISOString(), previousModelAndEffortVerified: row.modelAndEffortVerified, previousAccepted: row.accepted, reason: 'Verify model identity on all successful generation responses; transient non-200 responses have no generated model identity. Every attempted request model/effort, failed HTTP attempt, retry and full wall time remain retained.' });
        row.modelAndEffortVerified = revised; row.accepted = accepted;
      }
    }
    report.resumeRuns ||= [];
    report.resumeRuns.push({ at: new Date().toISOString(), tempRoot: root, retainedRows: previous.rows.length, priorHttpAttempts: resumed.used, remainingHttpBudget: MAX_HTTP_CALLS - resumed.used, offlineCalibration: { acceptance: calibration, permissionsPassed: policyPassed } });
  }
  let preservedPrevious = false;
  const save = async () => {
    await mkdir(dirname(opts.output), { recursive: true });
    if (!preservedPrevious) {
      try { const previous = await readFile(opts.output); await writeFile(`${opts.output}.previous-${Date.now()}-${randomUUID()}.json`, previous, { flag: 'wx', mode: 0o600 }); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      preservedPrevious = true;
    }
    await writeFile(opts.output, JSON.stringify(redact(report, [apiKey, relay.token].filter(Boolean)), null, 2), { mode: 0o600 });
  };
  let interrupted = false, client = null, sessionId = null;
  const interrupt = () => { interrupted = true; void client?.stop(sessionId); relay.close(); };
  process.on('SIGINT', interrupt); process.on('SIGTERM', interrupt);
  try {
    for (const arm of opts.preflight ? plan.filter((row) => row.repetition === 1) : plan.filter((row) => !resumed.keys.has(`${row.id}/${row.repetition}`))) {
      const started = performance.now(), paths = await prepareFixture(join(root, `${arm.id}_rep-${arm.repetition}`), relay.origin);
      const result = { arm: arm.id, native: arm.native, loop: arm.loop, repetition: arm.repetition, workspace: paths.workspace };
      const firstCall = relay.telemetry.length;
      client = new NativeAcpClient(opts.goose, ['acp', '--with-builtin', 'developer'], { cwd: paths.workspace, env: childEnvironment(paths, arm, relay, lsp), secrets: [relay.token] });
      client.nativeEnabled = arm.native;
      failActiveInference = (error) => { client?.fail(error); void client?.stop(sessionId); };
      try {
        await client.request('initialize', { protocolVersion: 1, clientInfo: { name: 'native-engineering-benchmark', version: '1' }, clientCapabilities: { _meta: { goose: { customNotifications: true, toolCallLabelEnrichment: false } } } }, 30000);
        const session = await client.request('session/new', { cwd: paths.workspace, mcpServers: [], _meta: { title: 'Native engineering benchmark' } }, 45000);
        sessionId = session.sessionId;
        const initialExtensions = await client.request('_goose/unstable/session/extensions/list', { sessionId }, 15000);
        result.removedDefaultExtensions = [];
        for (const entry of initialExtensions.extensions || []) {
          if (entry.extensionKey === 'developer') continue;
          await client.request('_goose/unstable/session/extensions/remove', { sessionId, extensionKey: entry.extensionKey }, 15000);
          result.removedDefaultExtensions.push(entry.extensionKey);
        }
        if (arm.native) await client.request('_goose/unstable/session/extensions/add', { sessionId, extension: { type: 'platform', name: 'native_engineering' } }, 15000);
        const effort = await client.request('session/set_config_option', { sessionId, configId: 'thinking_effort', value: EFFORT }, 15000);
        result.effortConfig = effort.configOptions?.filter((option) => ['model', 'thinking_effort'].includes(option.id)) || [];
        if (!result.effortConfig.some((option) => option.id === 'model' && option.currentValue === MODEL) || !result.effortConfig.some((option) => option.id === 'thinking_effort' && option.currentValue === EFFORT)) throw new Error('SESSION_MODEL_OR_EFFORT_MISMATCH');
        const [extensions, tools] = await Promise.all([client.request('_goose/unstable/session/extensions/list', { sessionId }, 15000), client.request('_goose/unstable/tools/list', { sessionId }, 15000)]);
        result.inventory = sessionInventory(extensions, tools); client.toolInventory = result.inventory.tools.map((tool) => tool.name);
        const present = NATIVE_TOOLS.filter((name) => client.toolInventory.includes(name));
        if (present.length !== (arm.native ? 4 : 0) || result.inventory.extensions.some((entry) => !['developer', 'native_engineering'].includes(entry.name)) || client.toolInventory.some((name) => /execute_typescript|omp__|orqanix_engineering|axwise/.test(name))) throw new Error('INVENTORY_MISMATCH');
        result.setupMs = Math.round(performance.now() - started);
        if (opts.preflight) result.status = 'preflight_passed';
        else {
          const recorder = new NativeRecorder(); client.recorder = recorder;
          let response, error;
          try { response = await client.request('session/prompt', { sessionId, prompt: [{ type: 'text', text: PROMPT }] }, opts.timeoutSeconds * 1000); } catch (failure) { error = failure; }
          Object.assign(result, recorder.finish(response, error));
          result.nativeOutputs = [...recorder.outputs.entries()].map(([id, value]) => ({ id, tool: recorder.tools.get(id)?.name || null, value }));
          // Stop the agent before inspecting final bytes, even after a timed-out prompt.
          await client.stop(sessionId);
          const acceptanceStarted = performance.now();
          result.acceptance = await acceptance(paths, lsp.node);
          result.acceptanceMs = Math.round(performance.now() - acceptanceStarted);
          result.treatmentExercised = treatmentEvidence(result, arm.native);
        }
      } catch (error) { result.status = 'setup_failed'; result.error = String(error.message || error); result.setupMs ??= Math.round(performance.now() - started); }
      finally { await client.stop(sessionId); result.stderr = client.stderr; client = null; sessionId = null; }
      result.primaryRequests = relay.telemetry.slice(firstCall);
      result.primaryHttpAttempts = result.primaryRequests.filter((call) => call.forwarded).length;
      result.modelAndEffortVerified = modelEvidence(result.primaryRequests);
      result.accepted = result.status === 'completed' && result.acceptance?.passed === true && result.treatmentExercised === true && result.modelAndEffortVerified;
      result.harnessElapsedMs = Math.round(performance.now() - started);
      report.rows.push(result); await save();
      console.log(JSON.stringify({ event: 'arm_finished', arm: result.arm, repetition: result.repetition, status: result.status, accepted: result.accepted, elapsedMs: result.endToEndMs ?? null, tools: result.toolCount ?? null }));
      if (interrupted || result.status === 'setup_failed' || result.primaryRequests.some((call) => FATAL_HTTP.includes(call.httpStatus) || ['HTTP_CALL_BUDGET_EXHAUSTED', 'RETURNED_MODEL_MISMATCH', 'MODEL_OR_EFFORT_MISMATCH'].includes(call.error))) break;
    }
  } finally { relay.close(); process.off('SIGINT', interrupt); process.off('SIGTERM', interrupt); }
  report.finishedAt = new Date().toISOString();
  report.summary = PLAN.map((arm) => {
    const rows = report.rows.filter((row) => row.arm === arm.id), accepted = rows.filter((row) => row.accepted);
    const times = accepted.map((row) => row.endToEndMs).sort((a, b) => a - b);
    return { arm: arm.id, samples: rows.length, completed: rows.filter((row) => row.status === 'completed').length, accepted: accepted.length, oraclePassed: rows.filter((row) => row.acceptance?.passed).length, permissionRejectedRows: rows.filter((row) => row.permissionDenials?.length).length, primaryHttpAttempts: rows.reduce((sum, row) => sum + row.primaryHttpAttempts, 0), meanAcceptedMs: times.length ? Math.round(times.reduce((sum, x) => sum + x, 0) / times.length) : null, minAcceptedMs: times[0] ?? null, maxAcceptedMs: times.at(-1) ?? null };
  });
  report.preflightPassed = opts.preflight ? report.rows.length === 4 && report.rows.every((row) => row.status === 'preflight_passed' && row.primaryRequests.length === 0) : null;
  await save(); console.log(JSON.stringify({ event: 'finished', output: opts.output, preflightPassed: report.preflightPassed, summary: report.summary }));
  process.exitCode = benchmarkExitCode(report);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main(process.argv.slice(2)).catch((error) => { console.error(/^[A-Z_]+$/.test(error.message || '') ? error.message : 'NATIVE_ENGINEERING_BENCHMARK_FAILED'); process.exitCode = 1; });
