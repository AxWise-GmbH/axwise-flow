#!/usr/bin/env node
/** Opt-in, isolated local Goose extension comparison using synthetic evidence. */
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { isDeepStrictEqual, promisify } from 'node:util';
import { readFile, writeFile, mkdir, mkdtemp, access } from 'node:fs/promises';
import { join, resolve, dirname, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  AcpClient, BUILTINS, TurnRecorder, childEnvironment, loadTypescriptParser,
  permissionAllowed, providerConfig, redact, sessionInventory, validateCodeModeScript,
} from './benchmark-goose-reset.mjs';

const execute = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DESKTOP = '/private/tmp/orqaly-goose-ux-233/ui/desktop';
export const EVIDENCE = Object.freeze([
  { id: 'interview-a', text: 'Mara, dispatcher: I copy incoming repair requests from email into our spreadsheet every morning. It takes about 40 minutes. I need a queue showing owner and status. We must export CSV for our weekly review.' },
  { id: 'interview-b', text: 'Ivo, technician: I often arrive without the apartment number. I need complete address details before accepting a job. Mobile access matters more than a dashboard. I do not want automatic assignment.' },
  { id: 'interview-c', text: 'Lena, operations lead: Start with one building and five staff. Tenants will still use email. We have not agreed a budget or measured willingness to pay. Do not add payments or predictive maintenance to the pilot.' },
]);
const evidenceText = EVIDENCE.map((source) => `[${source.id}] ${source.text}`).join('\n');
export const CASES = Object.freeze([
  { id: 'arithmetic', kind: 'common', prompt: 'What is 19 + 23? Answer with the number only.' },
  { id: 'ordinary_chat', kind: 'common', prompt: 'Explain two-factor authentication in two short sentences.' },
  { id: 'weather', kind: 'common', prompt: 'What is the weather in Kaunas today? Celsius, concise, with a source link.' },
  { id: 'news', kind: 'common', prompt: 'Give me three recent local headlines from Bremen, Germany, with dates and source links. Say when recency cannot be verified.' },
  { id: 'repository', kind: 'common', prompt: 'Read README.md and src/pricing.js in this fixture. Explain how totalWithTax rounds and its return value for zero quantity. Do not edit or execute files.' },
  { id: 'prd', kind: 'specialist', prompt: `Create a concise PRD for a building repair-request pilot from these selected interview excerpts. Cover problem, users, in/out scope, requirements, acceptance criteria and open questions. Cite the exact source IDs; distinguish assumptions and do not invent budget, pricing or demand evidence. Keep the answer under 500 words.\n${evidenceText}` },
  { id: 'interview_analysis', kind: 'specialist', prompt: `Analyze these three selected interview excerpts about a building repair-request pilot. Give the main themes, conflicting needs, exact supporting quotations with source IDs, and evidence gaps. Do not turn three interviews into population-level statistics. Keep the answer under 400 words.\n${evidenceText}` },
  { id: 'simulation', kind: 'specialist', prompt: `Create a SMALL SYNTHETIC interview simulation to test a building repair-request pilot: two participants, one dispatcher and one technician, answering two questions: "What makes your current process difficult?" and "What would stop you adopting a shared repair queue?" Use the selected evidence below as grounding. Clearly label every participant and response synthetic; do not claim these are real research findings. Keep the answer under 400 words.\n${evidenceText}` },
]);
const SAFETY = 'This is a local benchmark using synthetic fixtures. Use available tools when useful. You may send these selected synthetic excerpts to the configured model and save specialist artifacts through the local Axwise extension if you choose it. You may read only the fixture workspace. Do not install software, edit repository files, access other accounts/files, run arbitrary code, commit, push, deploy, or launch background tasks. For current facts, use available public-information tools. Return an honest limitation if a capability fails.';
const SPECIALIST = /^axwise[-_]?local__(?:create_prd|analyze_interviews|simulate_interviews)$/;
const CALLBACKS = new Map([
  ['AxwiseLocal.createPrd', 'axwise-local__create_prd'],
  ['AxwiseLocal.analyzeInterviews', 'axwise-local__analyze_interviews'],
  ['AxwiseLocal.simulateInterviews', 'axwise-local__simulate_interviews'],
  ['Developer.analyze', 'developer__analyze'],
  ['Analyze.analyze', 'developer__analyze'],
  ['Developer.tree', 'developer__tree'],
]);
const RESPONSE_PROPERTIES = new Map([['developer__shell', new Set(['stdout'])]]);
const FIXTURE_SHELL_COMMANDS = new Set(['pwd', 'cat README.md', 'cat src/pricing.js',
  "cat README.md; echo '===SPLIT==='; cat src/pricing.js"]);
const hash = (value) => createHash('sha256').update(value).digest('hex');
function toolName(call) {
  return String(call?._meta?.toolName || call?.name || call?.title || '').split(' · ')[0]
    .toLowerCase().replaceAll(' ', '_').replace(':_', '__');
}

export function benchmarkPermission(call, workspace, parser) {
  const name = toolName(call);
  if (['analyze', 'developer__analyze'].includes(name)) {
    const args = call.rawInput;
    return Boolean(args && typeof args === 'object' && !Array.isArray(args)
      && Object.keys(args).length === 1 && typeof args.path === 'string'
      && ['README.md', 'src/pricing.js'].some((path) => args.path === path || args.path === join(workspace, path)));
  }
  if (['tree', 'developer__tree'].includes(name)) {
    const args = call.rawInput;
    const path = args?.path;
    const depth = args?.depth ?? 2; // Native Developer.tree's documented default.
    return Boolean(args && typeof args === 'object' && !Array.isArray(args)
      && Object.keys(args).every((key) => ['path', 'depth'].includes(key))
      && typeof path === 'string' && !path.includes('\0') && resolve(workspace, path) === resolve(workspace)
      && Number.isInteger(depth) && depth >= 0 && depth <= 3);
  }
  if (SPECIALIST.test(name)) {
    const args = call.rawInput;
    return Boolean(args && typeof args === 'object' && !Array.isArray(args)
      && JSON.stringify(args).length < 40_000);
  }
  if (['code_execution__execute_typescript', 'execute_typescript'].includes(name)) {
    return validateCodeModeScript(call.rawInput?.code, workspace, parser, {
      additionalCallbacks: CALLBACKS,
      responseProperties: RESPONSE_PROPERTIES,
      allowToolTryCatch: true,
      allowShorthandOutput: true,
      permissionAllowed: (nested, root) => benchmarkPermission(nested, root, parser),
    }).allowed;
  }
  // No shell search, package installs or network shell commands in this suite.
  if (/(?:^|__)(?:shell|execute_bash)$/.test(name)) {
    const args = call.rawInput;
    return Boolean(args && typeof args === 'object' && !Array.isArray(args)
      && Object.keys(args).length === 1 && FIXTURE_SHELL_COMMANDS.has(args.command));
  }
  return permissionAllowed(call, workspace);
}

/** Tool catalog contents are not executions. Inspect names and actual code AST. */
export function hasSpecialistInvocation(tool, parser) {
  const name = toolName(tool);
  if (SPECIALIST.test(name)) return true;
  if (!['code_execution__execute_typescript', 'execute_typescript'].includes(name)) return false;
  const code = (tool.input || tool.rawInput)?.code;
  if (typeof code !== 'string' || code.length > 12_000) return false;
  const ts = parser || loadTypescriptParser();
  const source = ts.createSourceFile('observed-benchmark.ts', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  if (source.parseDiagnostics.length) return false;
  let found = false;
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === 'AxwiseLocal'
      && ts.isIdentifier(node.expression.name)
      && ['createPrd', 'analyzeInterviews', 'simulateInterviews'].includes(node.expression.name.text)) found = true;
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

export function specialistPrompt(item, mode = 'natural') {
  if (!['natural', 'explicit'].includes(mode)) throw new Error('Invalid specialist mode');
  if (mode === 'natural' || item.kind !== 'specialist') return item.prompt;
  return `${item.prompt}\n\nUse the local Axwise specialist extension if available and return its locally validated saved artifact. If the extension is unavailable, answer directly but clearly say no locally validated Axwise artifact was created.`;
}

export class SpecialistAcpClient extends AcpClient {
  constructor(command, args, options) { super(command, args, options); this.parser = options.parser; }
  async onRequest(message) {
    if (message.method !== 'session/request_permission') return super.onRequest(message);
    const call = message.params?.toolCall;
    const known = this.recorder?.tools.get(String(call?.toolCallId));
    const enriched = { ...call, ...(known?.name ? { _meta: { toolName: known.name } } : {}) };
    const allowed = benchmarkPermission(enriched, this.workspace, this.parser);
    const option = message.params?.options?.find((item) => item.kind === (allowed ? 'allow_once' : 'reject_once'));
    this.send({ jsonrpc: '2.0', id: message.id, result: { outcome: option
      ? { outcome: 'selected', optionId: option.optionId } : { outcome: 'cancelled' } } });
    if (!allowed) {
      this.recorder?.denials.push({ title: call?.title, input: call?.rawInput, reason: 'Outside bounded benchmark permissions' });
      this.fail(new Error('MANUAL_APPROVAL_REQUIRED: call outside benchmark scope'));
    }
  }
}

export class SpecialistRecorder extends TurnRecorder {
  update(message) {
    super.update(message);
    const event = message.params?.update;
    if (event?.toolCallId && (event.rawOutput !== undefined || event.content !== undefined)) {
      const tool = this.tools.get(String(event.toolCallId));
      if (tool) tool.result = event.rawOutput ?? event.content;
    }
  }
}

// ACP marks the Code Mode wrapper completed even when TypeScript compilation
// prevented every nested callback. Require evidence from the callback result,
// not just an intended call in its input or the wrapper's transport status.
const AXWISE_ERROR_MARKERS = [
  'The selected specialist input is invalid. Check the tool schema and supplied evidence.',
  'The generated artifact did not pass local validation. No artifact was saved.',
  'The repaired artifact did not pass local validation. No artifact was saved.',
  'The generated simulation did not pass local validation. No artifact was saved.',
  'The artifact did not pass its final quality review. No artifact was saved.',
  'The specialist quality review was invalid. No artifact was saved.',
  'The local Axwise specialist could not complete this request.',
  'The Axwise specialist request was cancelled.',
  'The Axwise specialist timed out. No automatic retry was performed.',
  'Axwise model inference is unavailable.',
  'Sign in to use Axwise model inference.',
  'Sign in with the expected account to use Axwise.',
  'Another local Axwise operation is running. Wait or cancel it first.',
  'Use a valid saved interview-analysis reference from this account and conversation.',
  'Synthetic transcript turns require their original questionId.',
  'Every selected source or transcript requires its original origin.',
];

function resultText(value, depth = 0) {
  if (depth > 8) return [];
  if (typeof value === 'string') return value.length <= 1_048_576 ? [value] : [];
  if (Array.isArray(value)) return value.slice(0, 128).flatMap((item) => resultText(item, depth + 1));
  if (!value || typeof value !== 'object') return [];
  if (value.type === 'text' && typeof value.text === 'string') return resultText(value.text, depth + 1);
  // Only output content is evidence. Do not inspect echoed inputs, tool graphs,
  // discovery metadata, or arbitrary object properties for marker strings.
  return resultText(value.content, depth + 1);
}

function confirmedSpecialistExecution(tool) {
  if (SPECIALIST.test(toolName(tool))) return ['completed', 'failed'].includes(tool.status);
  if (tool.status !== 'completed') return false;
  const blocks = resultText(tool.result ?? tool.rawOutput);
  return blocks.some((text) => {
    if (!/^Code Executed Successfully: true\s*(?:\r?\n|$)/.test(text.trimStart())) return false;
    const saved = /Saved local Axwise JSON artifact: [^\r\n]{1,2000}[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.json/.test(text);
    return saved || AXWISE_ERROR_MARKERS.some((marker) => text.includes(marker));
  });
}

export function inspectOutcome(item, row) {
  const proposedAxwise = (row.tools || []).filter((tool) => hasSpecialistInvocation(tool));
  const denied = (tool) => (row.permissionDenials || []).some((denial) =>
    denial.input !== undefined && isDeepStrictEqual(denial.input, tool.input || tool.rawInput));
  const deniedAxwise = proposedAxwise.filter(denied);
  const usedAxwise = proposedAxwise.some((tool) => !denied(tool) && confirmedSpecialistExecution(tool));
  const embeddedProviderFailure = /^Ran into this error:|PROVIDER_UNAVAILABLE|LOGIN_REQUIRED/.test(row.markdown);
  const checks = { completed: row.status === 'completed' && !embeddedProviderFailure, axwiseUsed: usedAxwise,
    axwiseProposed: proposedAxwise.length > 0, axwiseDenied: deniedAxwise.length > 0,
    axwiseExecutionUnconfirmed: proposedAxwise.some((tool) => !denied(tool) && !confirmedSpecialistExecution(tool)) };
  if (item.kind === 'common') checks.noSpecialistInterference = proposedAxwise.length === 0 && checks.completed;
  if (item.id === 'arithmetic') checks.correctExactAnswer = row.markdown.trim() === '42';
  if (item.id === 'repository') checks.mentionsZero = /\b0\b|\bzero\b/i.test(row.markdown);
  if (['prd', 'interview_analysis'].includes(item.id)) {
    checks.sourceIdsPresent = EVIDENCE.every((source) => row.markdown.includes(source.id));
    checks.uncertaintyMentioned = /unknown|not agreed|not measured|gap|assum|unvalidated|open question/i.test(row.markdown);
  }
  if (item.id === 'simulation') checks.syntheticLabelPresent = /synthetic/i.test(row.markdown);
  return { structuralChecks: checks, qualityAssessment: 'requires_human_review',
    qualityNote: 'Structural signals are not semantic evidence accuracy, artifact parity, or a user-experience score.' };
}

export function summarize(rows) {
  const modes = [...new Set(rows.map((row) => row.specialistMode || 'natural'))];
  return modes.flatMap((specialistMode) => ['common', 'specialist'].flatMap((kind) => ['off', 'on'].map((arm) => {
    const selected = rows.filter((row) => row.kind === kind && row.arm === arm && (row.specialistMode || 'natural') === specialistMode);
    const completed = selected.filter((row) => row.status === 'completed');
    const times = completed.map((row) => row.endToEndMs).sort((a, b) => a - b);
    return { specialistMode, kind, arm, attempted: selected.length, completed: completed.length,
      failed: selected.length - completed.length,
      medianCompletedMs: times.length ? times.length % 2 ? times[(times.length - 1) / 2]
        : (times[times.length / 2 - 1] + times[times.length / 2]) / 2 : null,
      unintendedAxwiseTurns: kind === 'common' ? selected.filter((row) => row.structuralChecks.axwiseUsed).length : null,
      proposedAxwiseTurns: selected.filter((row) => row.structuralChecks.axwiseProposed).length,
      deniedAxwiseTurns: selected.filter((row) => row.structuralChecks.axwiseDenied).length };
  })));
}

export function parseOptions(argv) {
  const options = { live: false, repeats: 2, timeoutSeconds: 180, onlyCase: null, specialistMode: 'natural',
    goose: `${DESKTOP}/src/bin/goose`, node: `${DESKTOP}/src/orqaly-runtime/node/bin/node`,
    connector: `${DESKTOP}/src/orqaly-runtime/connector`,
    config: `${DESKTOP}/src/orqaly-runtime/connector/preview.config.example.json`,
    utilities: `${DESKTOP}/src/orqaly-runtime/connector/src/utilities-mcp.mjs`,
    adapter: `${DESKTOP}/src/axwise-runtime/adapter/src/mcp.mjs`,
    python: `${DESKTOP}/src/axwise-runtime/python/bin/python3`,
    kernel: `${DESKTOP}/src/axwise-runtime/kernel`,
    typescript: '/private/tmp/orqaly-goose-ux-233/ui/node_modules/typescript/lib/typescript.js',
    outputRoot: tmpdir(), arms: 'off,on' };
  const fields = { '--repeats': 'repeats', '--timeout-seconds': 'timeoutSeconds', '--only-case': 'onlyCase',
    '--goose': 'goose', '--node': 'node', '--connector': 'connector', '--config': 'config',
    '--utilities': 'utilities', '--adapter': 'adapter', '--python': 'python', '--kernel': 'kernel',
    '--typescript': 'typescript', '--output-root': 'outputRoot', '--arms': 'arms', '--specialist-mode': 'specialistMode' };
  for (let index = 0; index < argv.length; index++) {
    const key = argv[index];
    if (key === '--live') options.live = true;
    else if (fields[key] && argv[index + 1] && !argv[index + 1].startsWith('--')) options[fields[key]] = argv[++index];
    else throw new Error(`Unknown or incomplete option: ${key}`);
  }
  for (const key of ['repeats', 'timeoutSeconds']) options[key] = Number(options[key]);
  if (!Number.isInteger(options.repeats) || options.repeats < 1 || options.repeats > 3) throw new Error('repeats must be 1..3');
  if (!Number.isInteger(options.timeoutSeconds) || options.timeoutSeconds < 10 || options.timeoutSeconds > 240) throw new Error('timeout must be 10..240 seconds');
  if (!['off,on', 'on,off', 'off', 'on'].includes(options.arms)) throw new Error('Invalid arms');
  if (!['natural', 'explicit'].includes(options.specialistMode)) throw new Error('Invalid specialist mode');
  if (options.onlyCase && options.onlyCase.split(',').some((id) => !CASES.some((item) => item.id === id))) throw new Error('Unknown case');
  for (const key of ['goose', 'node', 'connector', 'config', 'utilities', 'adapter', 'python', 'kernel', 'typescript', 'outputRoot']) {
    if (!isAbsolute(options[key])) throw new Error(`${key} must be absolute`);
  }
  return options;
}

async function authenticate(options) {
  const config = JSON.parse(await readFile(options.config, 'utf8'));
  const url = new URL(config.apiUrl);
  if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash || url.username || url.password) throw new Error('Expected public HTTPS API origin');
  let token;
  try {
    const result = await execute(options.node, [join(options.connector, 'src/cli.mjs'), 'token', '--config', options.config],
      { encoding: 'utf8', timeout: 45_000, maxBuffer: 64_000 });
    token = result.stdout.trim();
  } catch { throw new Error('OAUTH_TOKEN_UNAVAILABLE: sign in through the existing desktop connector'); }
  if (token.length < 20 || token.length > 16384 || /\s/.test(token)) throw new Error('OAUTH_TOKEN_INVALID');
  const response = await fetch(`${url.origin}/desktop/v1/session`, {
    headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`SESSION_HTTP_${response.status}`);
  const session = await response.json();
  if (session.accountScoped !== true || typeof session.userId !== 'string') throw new Error('Expected account-scoped desktop session');
  return { token, origin: url.origin, accountHash: hash(session.userId) };
}

async function preparePaths(root, label, options, auth) {
  const directory = join(root, label);
  const profile = join(directory, 'profile'), workspace = join(directory, 'workspace'), temporary = join(directory, 'tmp');
  for (const path of [join(profile, 'config/custom_providers'), join(workspace, 'src'), temporary]) await mkdir(path, { recursive: true, mode: 0o700 });
  await writeFile(join(profile, 'config/custom_providers/custom_local_benchmark.json'), JSON.stringify({
    ...providerConfig(auth.origin), api_key_env: 'AXWISE_BENCHMARK_PROVIDER_TOKEN',
  }), { flag: 'wx', mode: 0o600 });
  await writeFile(join(profile, 'config/config.yaml'), JSON.stringify({ GOOSE_PROVIDER: 'custom_local_benchmark', GOOSE_MODEL: 'orqaly-gemini', GOOSE_MODE: 'approve', CODE_MODE_TOOL_DISCLOSURE: 'catalog',
    extensions: Object.fromEntries(BUILTINS.map((name) => [name, { enabled: true, type: 'platform', name }])) }), { flag: 'wx', mode: 0o600 });
  await writeFile(join(workspace, 'README.md'), '# Fixture\nThe project mentions coding but does not need a specialist workflow. totalWithTax rounds the complete line to cents, not each unit.\n', { flag: 'wx', mode: 0o600 });
  await writeFile(join(workspace, 'src/pricing.js'), 'export function totalWithTax(unitPrice, quantity, taxRate) { return Math.round(unitPrice * quantity * (1 + taxRate) * 100) / 100; }\n', { flag: 'wx', mode: 0o600 });
  const env = childEnvironment({ profile, temporary, token: auth.token, searchCache: join(directory, 'cache') });
  delete env.ORQALY_LOCAL_TEST_MODE;
  delete env.ORQALY_LOCAL_TEST_TOKEN;
  env.AXWISE_BENCHMARK_PROVIDER_TOKEN = auth.token;
  return { directory, profile, workspace, temporary, env };
}

export async function runBenchmark(options, { emit = (event) => console.log(JSON.stringify(event)) } = {}) {
  if (!options.live) throw new Error('Live model calls require --live');
  for (const key of ['goose', 'node', 'connector', 'config', 'utilities', 'adapter', 'python', 'kernel']) await access(options[key]);
  const parser = loadTypescriptParser(options.typescript);
  const root = await mkdtemp(join(options.outputRoot, 'local-axwise-benchmark-'));
  const report = { schemaVersion: 'orqanix.local-axwise-benchmark.v1', startedAt: new Date().toISOString(),
    binarySha256: hash(await readFile(options.goose)), model: 'orqaly-gemini', transport: 'Goose ACP + local MCP',
    builtins: BUILTINS, repeats: options.repeats, specialistMode: options.specialistMode || 'natural', rows: [],
    notes: ['Same native Goose binary/model/fixtures with Axwise absent versus mounted; utilities in both arms.',
      'Fresh isolated session per case; setup measured separately. Cloud provider cache state unknown.',
      'Synthetic evidence only. Model inference still uses authenticated cloud transport; no cloud Axwise workflow.',
      'Bounded fixture permissions only. Failures and denied calls are recorded, not silently retried.',
      'Structural checks are not proof of semantic quality. Review saved outputs and source correspondence.',
      'This measures agent/MCP paths, not Electron rendering or the users entire extension configuration.',
      (options.specialistMode || 'natural') === 'explicit'
        ? 'Explicit specialist request appended identically in both arms, only for specialist cases. Compare separately from natural tool-choice results.'
        : 'Natural tool choice: no instruction to use Axwise for specialist cases.'] };
  const save = () => writeFile(join(root, 'report.json'), JSON.stringify(report, null, 2), { mode: 0o600 });
  const cases = options.onlyCase ? CASES.filter((item) => options.onlyCase.split(',').includes(item.id)) : CASES;
  const promptOverrides = options.promptOverrides || {};
  if (typeof promptOverrides !== 'object' || Array.isArray(promptOverrides)
    || Object.entries(promptOverrides).some(([id, prompt]) => !CASES.some((item) => item.id === id)
      || typeof prompt !== 'string' || prompt.length > 30_000)) throw new Error('Invalid benchmark prompt overrides');
  report.promptOverrides = promptOverrides;
  report.benchmarkSafetyPrompt = SAFETY;
  emit({ event: 'benchmark_started', root, cases: cases.map((item) => item.id), repeats: options.repeats });
  for (let repeat = 0; repeat < options.repeats; repeat++) {
    for (const [index, item] of cases.entries()) {
      const order = (repeat + index) % 2 ? options.arms.split(',').reverse() : options.arms.split(',');
      for (const arm of order) {
        const prompt = specialistPrompt({ ...item, prompt: promptOverrides[item.id] ?? item.prompt }, options.specialistMode || 'natural');
        const auth = await authenticate(options);
        const paths = await preparePaths(root, `${repeat + 1}-${item.id}-${arm}`, options, auth);
        const conversationId = `bench_${randomUUID().replaceAll('-', '')}`;
        const commonArgs = ['--config', options.config, '--conversation-id', conversationId, '--account-hash', auth.accountHash];
        const mcpServers = [{ name: 'desktop-utilities', command: options.node, args: [options.utilities, ...commonArgs], env: [] }];
        if (arm === 'on') mcpServers.push({ name: 'axwise-local', command: options.node,
          args: [options.adapter, ...commonArgs, '--state-dir', join(paths.profile, 'axwise'), '--python', options.python,
            '--kernel-root', options.kernel, '--connector-root', options.connector], env: [] });
        const client = new SpecialistAcpClient(options.goose, ['acp', '--with-builtin', BUILTINS.join(',')],
          { env: paths.env, cwd: paths.workspace, secrets: [auth.token], parser });
        let sessionId, response, failure, inventory;
        const setupStart = performance.now();
        let setupMs;
        let recorder;
        try {
          await client.request('initialize', { protocolVersion: 1, clientInfo: { name: 'local-axwise-benchmark', version: '1.0.0' },
            clientCapabilities: { _meta: { goose: { customNotifications: true, toolCallLabelEnrichment: false } } } }, 30_000);
          const session = await client.request('session/new', { cwd: paths.workspace, mcpServers: [], _meta: { title: `Synthetic benchmark ${item.id} ${arm}` } }, 45_000);
          sessionId = session.sessionId;
          // Match desktop registration and surface startup errors immediately,
          // instead of accepting a session that silently omitted failed MCPs.
          for (const server of mcpServers) await client.request('_goose/unstable/session/extensions/add', {
            sessionId, extension: { type: 'mcp', server, timeout: 240, bundled: true,
              description: server.name === 'axwise-local'
                ? 'Optional local Axwise specialist for explicit PRDs, interview analysis and synthetic simulations. Goose chooses whether useful; not an ordinary chat, weather, search or coding router.'
                : 'Public weather, currency and search tools.' },
          }, 30_000);
          const [extensions, tools] = await Promise.all([
            client.request('_goose/unstable/session/extensions/list', { sessionId }, 15_000),
            client.request('_goose/unstable/tools/list', { sessionId }, 15_000),
          ]);
          inventory = sessionInventory(extensions, tools);
          const present = inventory.tools.filter((tool) => /axwise[-_]?local/i.test(tool.name));
          if (present.length !== (arm === 'on' ? 3 : 0)) throw new Error('EXTENSION_INVENTORY_MISMATCH');
          if (inventory.tools.filter((tool) => /desktop[-_]utilities/i.test(tool.name)).length !== 3) throw new Error('UTILITY_INVENTORY_MISMATCH');
          setupMs = Math.round(performance.now() - setupStart);
          recorder = new SpecialistRecorder(); client.recorder = recorder;
          response = await client.request('session/prompt', { sessionId, prompt: [{ type: 'text', text: `${SAFETY}\n\n${prompt}` }] }, options.timeoutSeconds * 1000);
        } catch (error) { failure = error; }
        finally {
          const row = redact({ repeat: repeat + 1, arm, case: item.id, kind: item.kind, prompt,
            specialistMode: options.specialistMode || 'natural',
            setupMs: setupMs ?? Math.round(performance.now() - setupStart), inventory,
            failurePhase: recorder ? failure ? 'prompt' : null : 'setup',
            ...(recorder || new SpecialistRecorder()).finish(response, failure) }, [auth.token]);
          if (row.status === 'completed' && /^Ran into this error:/.test(row.markdown)) {
            row.status = 'provider_error';
            row.error = 'Goose returned an end_turn containing a provider error, not an answer.';
          }
          Object.assign(row, inspectOutcome(item, row));
          report.rows.push(row);
          client.recorder = null;
          await client.stop(sessionId);
          await writeFile(join(paths.directory, 'stderr.txt'), redact(client.stderr, [auth.token]), { mode: 0o600 });
          await save();
          emit({ event: 'turn_finished', arm, case: item.id, repeat: repeat + 1, status: row.status,
            setupMs: row.setupMs, endToEndMs: row.endToEndMs, tools: row.toolCount, checks: row.structuralChecks });
        }
      }
    }
  }
  report.finishedAt = new Date().toISOString(); report.summary = summarize(report.rows);
  await save(); emit({ event: 'benchmark_finished', report: join(root, 'report.json'), summary: report.summary });
  return { root, report };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runBenchmark(parseOptions(process.argv.slice(2))).then(({ report }) => {
    if (report.rows.some((row) => row.status !== 'completed')) process.exitCode = 2;
  }).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
