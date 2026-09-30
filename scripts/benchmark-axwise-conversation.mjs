#!/usr/bin/env node
/** Opt-in native Goose multi-turn routing checks. No direct specialist calls. */
import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { access, lstat, mkdtemp, open, readdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import {
  authenticate, preparePaths, parseOptions as baseOptions,
  SpecialistAcpClient, SpecialistRecorder, inspectOutcome, benchmarkPermission,
  AXWISE_TOOL_CALLBACKS, AXWISE_EXTENSION_DESCRIPTION, expectedSpecialistInventory,
} from './benchmark-local-axwise.mjs';
import { BUILTINS, loadTypescriptParser, redact, sessionInventory, validateCodeModeScript } from './benchmark-goose-reset.mjs';
import { AXWISE_CONVERSATION_POLICY } from '../packages/axwise-local/src/conversation-policy.mjs';

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const UUID_FILE = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.json$/;
export const TRANSCRIPTS = Object.freeze([
  { id: 'interview-a', title: 'Synthetic dispatcher', origin: 'synthetic_transcript', turns: [
    { speaker: 'mara', role: 'participant', questionId: 'q1', text: 'I copy repair requests from email into a spreadsheet every morning. It takes about 40 minutes.' },
    { speaker: 'mara', role: 'participant', questionId: 'q2', text: 'I need a queue showing owner and status. We must export CSV for our weekly review.' },
  ] },
  { id: 'interview-b', title: 'Synthetic technician', origin: 'synthetic_transcript', turns: [
    { speaker: 'ivo', role: 'participant', questionId: 'q1', text: 'I often arrive without the apartment number. I need complete address details before accepting a job.' },
    { speaker: 'ivo', role: 'participant', questionId: 'q2', text: 'Mobile access matters more than a dashboard. I do not want automatic assignment.' },
  ] },
  { id: 'interview-c', title: 'Synthetic operations lead', origin: 'synthetic_transcript', turns: [
    { speaker: 'lena', role: 'participant', questionId: 'q1', text: 'We have not agreed a budget or measured willingness to pay.' },
    { speaker: 'lena', role: 'participant', questionId: 'q2', text: 'Start with one building and five staff. Tenants will still use email. Do not add payments or predictive maintenance to the pilot.' },
  ] },
]);
const news = { id: 'news', expectedOperation: 'none', requireLinks: true,
  prompt: 'What are the latest local headlines in Bremen? Give me three short bullets with publication dates and source links. Do not invent current news.' };
const deeperNews = { id: 'deeper_news', expectedOperation: 'none', requireLinks: true, prompt: 'Go deeper into those news stories and explain why they matter, with source links.' };
export const SCENARIOS = Object.freeze([
  { id: 'discovery_news_return', turns: [
    { id: 'analysis', expectedOperation: 'analyze_interviews', exactTranscripts: true,
      prompt: `Create and save an evidence-linked interview analysis for this repair-request software pilot: needs, tensions, exact supporting quotations and evidence gaps. Keep it concise. All interviews below are synthetic examples, not real customer evidence. Preserve the source IDs, origins, original participant text and original question IDs. Original questions: q1 = "What makes your current process difficult?"; q2 = "What would stop you adopting a shared repair queue?"\n${JSON.stringify(TRANSCRIPTS)}` },
    news, deeperNews,
    { id: 'return_to_prd', expectedOperation: 'create_prd', requireAnalysisReference: true,
      prompt: 'Back to those interviews: create and save a software PRD using the exact saved analysis. Include requirements, acceptance criteria, in/out scope and evidence gaps. Reuse the saved analysis rather than regenerating it, and keep synthetic evidence clearly labelled.' },
  ] },
  { id: 'news_deeper', turns: [news, deeperNews] },
  { id: 'project_deeper', turns: [
    { id: 'project_read', expectedOperation: 'none', prompt: 'I attached a coding project: read README.md and src/pricing.js in this workspace. Explain how totalWithTax rounds. Do not edit or execute code.' },
    { id: 'project_deeper', expectedOperation: 'none', prompt: 'Go deeper into that function: explain zero quantity and fractional-cent rounding. Do not edit or execute code.' },
  ] },
  { id: 'brainstorm', turns: [
    { id: 'brainstorm', expectedOperation: 'none', prompt: 'Brainstorm three playful names for a repair scheduling app. Just a quick list, no research or document.' },
    { id: 'brainstorm_deeper', expectedOperation: 'none', prompt: 'Go deeper on the second name: what tone does it convey?' },
  ] },
  { id: 'ambiguous_deeper', turns: [
    { id: 'ambiguous', expectedOperation: 'none', requireClarification: true, prompt: 'Go deeper.' },
  ] },
]);
export const SAFETY = 'This isolated benchmark uses only synthetic examples. Use available capabilities when useful. You may read only this fixture workspace and save generated research artifacts. New Markdown files may be created only at the fixture workspace root: at most eight files, 64 KB each and 256 KB total. Never overwrite existing files, including README.md, or modify source code. Do not install software, edit repository files, access unrelated accounts or files, execute arbitrary code, commit, push, deploy or start background tasks. For current facts use available public-information capabilities. Report failures honestly.';
const CAPABILITIES = Object.freeze({ nativeGemsEnabled: false, jevReviewEnabled: true });
const WRITE_NAMES = new Set(['write', 'developer__write']);
const SHELL_NAMES = new Set(['shell', 'developer__shell', 'execute_bash']);
const CALLBACKS = new Map([...AXWISE_TOOL_CALLBACKS, ['Developer.analyze', 'developer__analyze'],
  ['Analyze.analyze', 'developer__analyze'], ['Developer.tree', 'developer__tree'],
  ['Developer.write', 'developer__write'], ['Write.write', 'write']]);
const callName = (call) => String(call?._meta?.toolName || call?.name || call?.title || '')
  .split(' · ')[0].toLowerCase().replaceAll(' ', '_').replace(':_', '__');

function markdownWrite(args, workspace) {
  if (!args || typeof args !== 'object' || Array.isArray(args)
    || Object.keys(args).length !== 2 || typeof args.path !== 'string' || typeof args.content !== 'string'
    || args.path.includes('\0') || args.path.includes('\\') || args.path.split('/').includes('..')) return null;
  const path = resolve(workspace, args.path), filename = basename(path);
  const bytes = Buffer.byteLength(args.content, 'utf8');
  if (dirname(path) !== resolve(workspace) || !/^[A-Za-z0-9][A-Za-z0-9 _.-]{0,99}\.md$/i.test(filename)
    || /^readme\.md$/i.test(filename) || bytes < 1 || bytes > 64_000) return null;
  return { path, filename, bytes, sha256: digest(args.content) };
}

function reservedMarkdownRead(args, workspace, reservations) {
  if (!args || typeof args !== 'object' || Array.isArray(args)
    || Object.keys(args).length !== 1 || typeof args.command !== 'string') return null;
  for (const reservation of reservations.values()) {
    if (dirname(reservation.path) !== resolve(workspace)) continue;
    for (const path of [reservation.filename, reservation.path]) {
      // Compare complete commands, never parse shell operators or options. Quote
      // spaces as one literal argument; unquoted forms contain only safe bytes.
      const quoted = `'${path.replaceAll("'", "'\\''")}'`;
      const forms = [quoted];
      if (/^[A-Za-z0-9_./-]+$/.test(path)) forms.push(path);
      if (/^[A-Za-z0-9 _./-]+$/.test(path)) forms.push(`"${path}"`);
      if (['ls -lh', 'wc -c', 'cat'].some((command) => forms.some((form) => args.command === `${command} ${form}`))) return reservation;
    }
  }
  return null;
}

/** Read-only output checks for previously approved generated Markdown files. */
export async function authorizeFixtureMarkdownReads(call, workspace, reservations, parser) {
  const name = callName(call);
  let selected;
  if (SHELL_NAMES.has(name)) selected = [reservedMarkdownRead(call.rawInput, workspace, reservations)];
  else if (['code_execution__execute_typescript', 'execute_typescript'].includes(name)) {
    const checked = validateCodeModeScript(call.rawInput?.code, workspace, parser, {
      additionalCallbacks: CALLBACKS, allowToolTryCatch: true, allowShorthandOutput: true,
      allowStaticLiteralData: true, allowLabelledConsoleOutput: true,
      allowStaticParallelCalls: true,
      responseProperties: new Map([['developer__shell', new Set(['stdout'])]]),
      permissionAllowed: (nested, root) => SHELL_NAMES.has(callName(nested))
        && Boolean(reservedMarkdownRead(nested.rawInput, root, reservations))
        || benchmarkPermission(nested, root, parser),
    });
    if (!checked.allowed) return false;
    selected = checked.calls.filter((row) => SHELL_NAMES.has(row.tool))
      .map((row) => reservedMarkdownRead(row.args, workspace, reservations)).filter(Boolean);
  } else return false;
  if (!selected.length || selected.some((row) => !row)) return false;
  try {
    const root = await lstat(workspace);
    if (!root.isDirectory() || root.isSymbolicLink()) return false;
    const actualRoot = await realpath(workspace);
    for (const row of selected) {
      const file = await lstat(row.path);
      if (!file.isFile() || file.isSymbolicLink() || file.nlink !== 1 || file.size > 64_000
        || dirname(await realpath(row.path)) !== actualRoot) return false;
    }
    return true;
  } catch { return false; }
}

/** Reservation-based approval in an isolated fixture, never arbitrary filesystem writes. */
export async function authorizeFixtureMarkdownWrites(call, workspace, reservations, parser) {
  const name = callName(call);
  let proposals;
  if (WRITE_NAMES.has(name)) proposals = [markdownWrite(call.rawInput, workspace)];
  else if (['code_execution__execute_typescript', 'execute_typescript'].includes(name)) {
    const checked = validateCodeModeScript(call.rawInput?.code, workspace, parser, {
      additionalCallbacks: CALLBACKS, allowToolTryCatch: true, allowShorthandOutput: true,
      allowStaticLiteralData: true, allowLabelledConsoleOutput: true,
      allowStaticParallelCalls: true,
      responseProperties: new Map([['developer__shell', new Set(['stdout'])]]),
      permissionAllowed: (nested, root) => WRITE_NAMES.has(callName(nested))
        ? Boolean(markdownWrite(nested.rawInput, root)) : benchmarkPermission(nested, root, parser),
    });
    if (!checked.allowed) return false;
    proposals = checked.calls.filter((row) => WRITE_NAMES.has(row.tool)).map((row) => markdownWrite(row.args, workspace));
  } else return false;
  if (!proposals.length || proposals.some((proposal) => !proposal)
    || new Set(proposals.map((proposal) => proposal.filename.toLowerCase())).size !== proposals.length) return false;
  try {
    // No nested directory is writable. Check the exact fixture and every target,
    // including dangling symlinks; failed writes also consume their reservation.
    const root = await lstat(workspace);
    if (!root.isDirectory() || root.isSymbolicLink()) return false;
    const actualRoot = await realpath(workspace);
    for (const proposal of proposals) {
      if (await realpath(dirname(proposal.path)) !== actualRoot) return false;
      try { await lstat(proposal.path); return false; }
      catch (error) { if (error.code !== 'ENOENT') return false; }
    }
  } catch { return false; }
  // Recheck after awaits so concurrent permission requests cannot reuse a name
  // or exceed the per-conversation count/bytes budget.
  if (proposals.some((proposal) => reservations.has(proposal.filename.toLowerCase()))
    || reservations.size + proposals.length > 8
    || [...reservations.values(), ...proposals].reduce((sum, row) => sum + row.bytes, 0) > 256_000) return false;
  for (const proposal of proposals) reservations.set(proposal.filename.toLowerCase(), proposal);
  return true;
}

export class ConversationAcpClient extends SpecialistAcpClient {
  constructor(command, args, options) { super(command, args, options); this.fixtureWriteReservations = new Map(); }
  async onRequest(message) {
    if (message.method !== 'session/request_permission') return super.onRequest(message);
    const call = message.params?.toolCall;
    const known = this.recorder?.tools.get(String(call?.toolCallId));
    const enriched = { ...call, ...(known?.name ? { _meta: { toolName: known.name } } : {}) };
    if (await authorizeFixtureMarkdownWrites(enriched, this.workspace, this.fixtureWriteReservations, this.parser)
      || await authorizeFixtureMarkdownReads(enriched, this.workspace, this.fixtureWriteReservations, this.parser)) {
      const option = message.params?.options?.find((item) => item.kind === 'allow_once');
      this.send({ jsonrpc: '2.0', id: message.id, result: { outcome: option
        ? { outcome: 'selected', optionId: option.optionId } : { outcome: 'cancelled' } } });
      return;
    }
    return super.onRequest(message);
  }
}

export function parseOptions(argv) {
  const rest = [], extra = { scenario: null, workspaceSource: '/private/tmp/orqaly-goose-ux-233/ui/desktop/src/orqaly/workspace.ts' };
  for (let i = 0; i < argv.length; i++) {
    if (['--scenario', '--workspace-source'].includes(argv[i])) {
      const field = argv[i] === '--scenario' ? 'scenario' : 'workspaceSource';
      if (field === 'scenario' && extra.scenario !== null) throw new Error('Duplicate --scenario; use one comma-separated selection');
      if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error(`Missing ${field}`);
      extra[field] = argv[++i];
    } else {
      if (['--only-case', '--specialist-mode', '--arms'].includes(argv[i])) throw new Error('Conversation benchmark always uses natural prompts with the extension enabled');
      rest.push(argv[i]);
    }
  }
  if (extra.scenario !== null && extra.scenario.split(',').some((id) => !SCENARIOS.some((s) => s.id === id))) throw new Error('Unknown scenario');
  if (!isAbsolute(extra.workspaceSource)) throw new Error('workspaceSource must be absolute');
  return { ...baseOptions(rest), ...extra, arms: 'on' };
}

/** Use the actual desktop resource, not a benchmark-only copy of its guidance. */
export async function loadWorkspaceResource(path, ts) {
  const replyPath = join(dirname(path), 'replyQuestionPrompt.ts');
  const [workspace, reply] = await Promise.all([readFile(path, 'utf8'), readFile(replyPath, 'utf8')]);
  const transpile = (source, filename) => ts.transpileModule(source, { fileName: filename,
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const dataUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
  const replyCode = transpile(reply, replyPath);
  if (/\bimport\s*(?:\(|["'{*])/.test(replyCode)) throw new Error('WORKSPACE_DEPENDENCY_CHANGED: inspect new runtime imports');
  let code = transpile(workspace, path), replaced = 0;
  code = code.replace(/from\s+(['"])\.\/replyQuestionPrompt\1/g, () => { replaced++; return `from ${JSON.stringify(dataUrl(replyCode))}`; });
  if (replaced !== 1) throw new Error('WORKSPACE_IMPORT_CHANGED');
  const ast = ts.createSourceFile(path, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  for (const statement of ast.statements) if (ts.isImportDeclaration(statement)) {
    const specifier = statement.moduleSpecifier.text;
    if (!['node:crypto', 'node:fs', 'node:fs/promises', 'node:path'].includes(specifier) && !specifier.startsWith('data:text/javascript;base64,')) throw new Error('WORKSPACE_IMPORT_NOT_ALLOWED');
  }
  const loaded = await import(dataUrl(code));
  if (typeof loaded.workspacePromptResource !== 'function') throw new Error('WORKSPACE_RESOURCE_EXPORT_MISSING');
  return { sourceHashes: { workspace: digest(workspace), replyQuestionPrompt: digest(reply) },
    resourceFor: (sessionId) => loaded.workspacePromptResource({ sessionId, capabilities: CAPABILITIES, busy: false }, CAPABILITIES) };
}

/** Read only UUID artifacts from the host-selected isolated account/conversation. */
export async function readArtifacts(directory, accountHash, conversationId) {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const result = [];
  for (const entry of entries.filter((item) => item.isFile() && UUID_FILE.test(item.name))) {
    const path = join(directory, entry.name);
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    let bytes;
    try {
      const info = await file.stat();
      if (!info.isFile() || info.size < 1 || info.size > 1_048_576) throw new Error('ARTIFACT_SIZE_INVALID');
      const buffer = Buffer.alloc(1_048_577); let count = 0;
      while (count < buffer.length) {
        const next = await file.read(buffer, count, buffer.length - count, null);
        if (!next.bytesRead) break;
        count += next.bytesRead;
      }
      if (count > 1_048_576) throw new Error('ARTIFACT_SIZE_INVALID');
      bytes = buffer.subarray(0, count);
    } finally { await file.close(); }
    const record = JSON.parse(bytes.toString('utf8'));
    const references = record.references ?? [];
    const referencesValid = Array.isArray(references) && references.length <= 8 && references.every((reference) =>
      reference && typeof reference === 'object' && !Array.isArray(reference)
      && Object.keys(reference).length === 2 && UUID_FILE.test(`${reference.operationId}.json`)
      && typeof reference.sha256 === 'string' && /^[a-f0-9]{64}$/.test(reference.sha256));
    const valid = referencesValid && record.version === 'axwise.local-artifact.v2'
      && record.accountHash === accountHash && record.conversationId === conversationId
      && `${record.operationId}.json` === entry.name && record.validation?.valid === true
      && (record.tool === 'simulate_interviews' || record.qualityReview?.passed === true)
      && record.inputSha256 === digest(JSON.stringify(record.selectedInput))
      && record.artifactSha256 === digest(JSON.stringify(record.artifact));
    result.push({ path, sha256: digest(bytes), operationId: record.operationId, tool: record.tool, valid,
      selectedInput: record.selectedInput, analysisReference: record.analysisReference ?? null, references: referencesValid ? references : [],
      inferenceCalls: record.execution?.calls ?? null, timings: record.timings ?? null });
  }
  return result.sort((a, b) => a.path.localeCompare(b.path));
}

const FAILURE = /(?:Ran into this error:|PROVIDER_UNAVAILABLE|LOGIN_REQUIRED|AXWISE_[A-Z_]+|\b(?:could not|couldn't|unable to|failed to)\s+(?:complete|retrieve|verify|search|access|fetch|run)|service error|No artifact was saved)/i;
function exactTranscripts(artifacts) {
  const project = (rows) => Array.isArray(rows) ? rows.map(({ id, origin, turns }) => ({ id, origin, turns })).sort((a, b) => a.id.localeCompare(b.id)) : null;
  return artifacts.length === 1 && isDeepStrictEqual(project(artifacts[0].selectedInput?.transcripts), project(TRANSCRIPTS));
}

export function assessTurn(turn, row, newArtifacts, previousArtifacts) {
  const signals = inspectOutcome({ id: turn.id, kind: turn.expectedOperation === 'none' ? 'common' : 'specialist' }, row).structuralChecks;
  const successfulResponse = signals.completed && Boolean(row.markdown?.trim()) && !FAILURE.test(row.markdown)
    && !(row.permissionDenials || []).length && !(row.tools || []).some((tool) => tool.status === 'failed') && !row.artifactReadError;
  const expectedArtifacts = newArtifacts.filter((artifact) => artifact.tool === turn.expectedOperation);
  const matchingOperation = turn.expectedOperation === 'none'
    ? !signals.axwiseProposed && !newArtifacts.length
    : signals.axwiseUsed && newArtifacts.length === 1 && expectedArtifacts.length === 1 && expectedArtifacts.every((a) => a.valid);
  const sourcePreserved = !turn.exactTranscripts || exactTranscripts(expectedArtifacts);
  const matchingReference = !turn.requireAnalysisReference || expectedArtifacts.length === 1
    && previousArtifacts.some((a) => a.tool === 'analyze_interviews' && a.valid
      && [expectedArtifacts[0].analysisReference, ...(Array.isArray(expectedArtifacts[0].references) ? expectedArtifacts[0].references : [])]
        .some((reference) => reference?.operationId === a.operationId && reference?.sha256 === a.sha256));
  const hasLinks = !turn.requireLinks || (row.sourceUrls || []).length > 0;
  const clarification = !turn.requireClarification || /\?/.test(row.markdown) && /what|which|clarif|specif|topic|context|mean/i.test(row.markdown);
  return { ...signals, successfulResponse, matchingOperation, sourcePreserved, matchingReference, hasLinks, clarification,
    passed: successfulResponse && matchingOperation && sourcePreserved && matchingReference && hasLinks && clarification,
    semanticQuality: 'not_assessed', note: 'Structural routing/lineage checks only; manual review must verify relevance, factual accuracy and clarification quality.' };
}

/** One session for every turn; failed sessions are stopped and remaining turns recorded as skipped. */
export async function runTurns({ client, sessionId, scenario, timeoutSeconds, artifacts = async () => [], onRow = async () => {}, secrets = [], resourceFor = null }) {
  const rows = []; let priorArtifacts = await artifacts(), sessionFailure = null;
  for (const [index, turn] of scenario.turns.entries()) {
    const recorder = new SpecialistRecorder(); client.recorder = recorder;
    let response, failure = sessionFailure, artifactReadError = null, currentArtifacts = priorArtifacts;
    if (!failure) {
      try {
        const prompt = resourceFor ? [resourceFor(sessionId)] : [];
        prompt.push({ type: 'text', text: `${index === 0 ? `${SAFETY}\n\n` : ''}${turn.prompt}` });
        response = await client.request('session/prompt', { sessionId, prompt }, timeoutSeconds * 1000);
      }
      catch (error) { failure = error; }
      try { currentArtifacts = await artifacts(); } catch (error) { artifactReadError = String(error.message || error); failure ||= error; }
    }
    const newArtifacts = currentArtifacts.filter((a) => !priorArtifacts.some((old) => old.path === a.path));
    const row = { scenario: scenario.id, turn: turn.id, turnIndex: index + 1, sessionId, prompt: turn.prompt,
      expectedOperation: turn.expectedOperation, failurePhase: sessionFailure ? 'not_started' : failure ? 'prompt' : null,
      ...recorder.finish(response, failure), artifactReadError, artifacts: newArtifacts };
    row.checks = assessTurn(turn, row, newArtifacts, priorArtifacts);
    const safe = redact(row, secrets); rows.push(safe); await onRow(safe);
    priorArtifacts = currentArtifacts; client.recorder = null;
    if (failure && !sessionFailure) { sessionFailure = new Error('Not started because an earlier turn failed; see original failure.'); await client.stop(sessionId); }
  }
  return rows;
}

export async function runBenchmark(options, { emit = (event) => console.log(JSON.stringify(event)) } = {}) {
  if (!options.live) throw new Error('Live model calls require --live');
  for (const key of ['goose', 'node', 'connector', 'config', 'utilities', 'adapter', 'python', 'kernel']) await access(options[key]);
  const parser = loadTypescriptParser(options.typescript);
  const desktopResource = await loadWorkspaceResource(options.workspaceSource, parser);
  const root = await mkdtemp(join(options.outputRoot, 'axwise-conversation-'));
  const report = { schemaVersion: 'orqanix.axwise-conversation.v1', startedAt: new Date().toISOString(),
    binarySha256: digest(await readFile(options.goose)), model: 'orqaly-gemini', repeats: options.repeats,
    adapter: { path: options.adapter, entrySha256: digest(await readFile(options.adapter)) },
    safetyPrompt: SAFETY, sourceConversationPolicyForReference: AXWISE_CONVERSATION_POLICY, desktopResourceHashes: desktopResource.sourceHashes, capabilities: CAPABILITIES, rows: [], sessions: [],
    notes: ['Natural user prompts; no tool names or forced call sequence. Production MCP instructions and the actual per-turn desktop workspace resource supply capability guidance.',
      'One native Goose ACP session per scenario/repetition, isolated profiles. Local extension enabled in every scenario.',
      'Permission failures and skipped turns cannot pass. Structural checks do not establish semantic quality or statistical reliability.',
      'The production workspace resource precedes the user text on every turn, matching desktop message order.',
      'Bounded new Markdown writes in the isolated fixture are permitted but never count as validated specialist artifacts. Wrong routing remains a failed check; subsequent turns continue unless the session or permission boundary fails.',
      'The source policy is recorded for reference only; rebuild or select the adapter containing that policy before comparing policy changes.',
      'This tests agent/MCP behavior, not Electron rendering. The project case is a selected local fixture, not a GUI attachment test.'] };
  const save = () => writeFile(join(root, 'report.json'), JSON.stringify(report, null, 2), { mode: 0o600 });
  const scenarios = options.scenario ? SCENARIOS.filter((s) => options.scenario.split(',').includes(s.id)) : SCENARIOS;
  for (let repeat = 1; repeat <= options.repeats; repeat++) for (const scenario of scenarios) {
    const auth = await authenticate(options);
    const paths = await preparePaths(root, `${repeat}-${scenario.id}`, options, auth);
    const conversationId = `conversation_${randomUUID().replaceAll('-', '')}`;
    const shared = ['--config', options.config, '--conversation-id', conversationId, '--account-hash', auth.accountHash];
    const servers = [
      { name: 'desktop-utilities', command: options.node, args: [options.utilities, ...shared], env: [] },
      { name: 'axwise-local', command: options.node, args: [options.adapter, ...shared, '--state-dir', join(paths.profile, 'axwise'), '--python', options.python, '--kernel-root', options.kernel, '--connector-root', options.connector], env: [] },
    ];
    const client = new ConversationAcpClient(options.goose, ['acp', '--with-builtin', BUILTINS.join(',')], { env: paths.env, cwd: paths.workspace, secrets: [auth.token], parser });
    let sessionId; const started = performance.now();
    try {
      await client.request('initialize', { protocolVersion: 1, clientInfo: { name: 'axwise-conversation-benchmark', version: '1.0.0' }, clientCapabilities: { _meta: { goose: { customNotifications: true, toolCallLabelEnrichment: false } } } }, 30_000);
      sessionId = (await client.request('session/new', { cwd: paths.workspace, mcpServers: [], _meta: { title: `Synthetic conversation benchmark ${scenario.id}` } }, 45_000)).sessionId;
      if (!sessionId) throw new Error('SESSION_ID_MISSING');
      for (const server of servers) await client.request('_goose/unstable/session/extensions/add', { sessionId,
        extension: { type: 'mcp', server, timeout: 240, bundled: true, description: server.name === 'axwise-local' ? AXWISE_EXTENSION_DESCRIPTION : 'Public weather, currency and search tools.' } }, 30_000);
      const [extensions, tools] = await Promise.all([
        client.request('_goose/unstable/session/extensions/list', { sessionId }, 15_000),
        client.request('_goose/unstable/tools/list', { sessionId }, 15_000),
      ]);
      const inventory = sessionInventory(extensions, tools);
      if (!expectedSpecialistInventory(inventory)) throw new Error('EXTENSION_INVENTORY_MISMATCH');
      report.sessions.push(redact({ repeat, scenario: scenario.id, sessionId, conversationId, inventory, setupMs: Math.round(performance.now() - started) }, [auth.token]));
      await runTurns({ client, sessionId, scenario, timeoutSeconds: options.timeoutSeconds, secrets: [auth.token],
        resourceFor: desktopResource.resourceFor,
        artifacts: () => readArtifacts(join(paths.profile, 'axwise', auth.accountHash, conversationId), auth.accountHash, conversationId),
        onRow: async (row) => { report.rows.push({ repeat, ...row }); await save(); emit({ event: 'turn_finished', repeat, scenario: scenario.id, turn: row.turn, status: row.status, endToEndMs: row.endToEndMs, checks: row.checks }); } });
    } catch (error) {
      report.sessions.push(redact({ repeat, scenario: scenario.id, sessionId: sessionId ?? null, error: String(error.message || error), setupMs: Math.round(performance.now() - started) }, [auth.token]));
      for (const [index, turn] of scenario.turns.entries()) if (!report.rows.some((row) => row.repeat === repeat && row.scenario === scenario.id && row.turn === turn.id)) {
        const row = { repeat, scenario: scenario.id, turn: turn.id, turnIndex: index + 1, sessionId: sessionId ?? null, prompt: turn.prompt, expectedOperation: turn.expectedOperation,
          ...new SpecialistRecorder().finish(null, error), failurePhase: index ? 'not_started' : 'setup', artifacts: [] };
        row.checks = assessTurn(turn, row, [], []); report.rows.push(redact(row, [auth.token]));
      }
    } finally {
      client.recorder = null; await client.stop(sessionId);
      await writeFile(join(paths.directory, 'stderr.txt'), redact(client.stderr, [auth.token]), { mode: 0o600 }); await save();
    }
  }
  report.finishedAt = new Date().toISOString();
  report.summary = { attempted: report.rows.length, passed: report.rows.filter((row) => row.checks.passed).length,
    unexpectedSpecialistTurns: report.rows.filter((row) => row.expectedOperation === 'none' && row.checks.axwiseProposed).length,
    missedOrFailedSpecialistTurns: report.rows.filter((row) => row.expectedOperation !== 'none' && !row.checks.passed).length,
    allPassed: report.rows.length > 0 && report.rows.every((row) => row.checks.passed) };
  await save(); emit({ event: 'benchmark_finished', report: join(root, 'report.json'), summary: report.summary }); return { root, report };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runBenchmark(parseOptions(process.argv.slice(2))).then(({ report }) => { if (!report.summary.allPassed) process.exitCode = 2; })
    .catch((error) => { console.error(error.message); process.exitCode = 1; });
}
