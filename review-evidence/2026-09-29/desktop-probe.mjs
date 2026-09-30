// Repeatable offline checks of checked-in source. No production edits, network,
// running desktop, shipped app or DMG access. Run with Node 26:
// node review-evidence/2026-09-29/desktop-probe.mjs /path/to/orqaly-goose
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { registerHooks } from 'node:module';
const root = process.argv[2] || '/Users/admin/axwise-opensource/orqaly-goose';
const url = (path) => pathToFileURL(`${root}/${path}`).href;
const report = {};
const { TOOLS, createMcpTools } = await import(url('vendor/orqanix-omp-mcp-server/src/mcp.mjs'));
const { engineeringInstruction } = await import(url('ui/desktop/src/orqaly/replyQuestionPrompt.ts'));
const nativeNames = ['ast_search', 'hashline_edit', 'lsp_query', 'safe_edit_and_test'];
const advertised = engineeringInstruction({ ompEnabled: true, jevReviewEnabled: true });
assert(nativeNames.every(name => advertised.includes(name)));
assert(nativeNames.every(name => !TOOLS.some(tool => tool.name === name)));
const call = createMcpTools({ config: {}, inspect: async () => { throw Error('Must not run'); }, run: async () => { throw Error('Must not run'); } });
const unknownNative = await Promise.all(nativeNames.map(async name => ({ name, result: (await call(name, {})).structuredContent })));
assert(unknownNative.every(item => item.result.code === 'INVALID_ARGUMENTS'));
report.engineering = { advertised: nativeNames, registered: TOOLS.map(x => x.name), nativeDirectCalls: unknownNative };

const { normalizeMarkdownContent } = await import(url('ui/desktop/src/utils/markdownNormalize.ts'));
const markdownCases = [
  ['currency', 'The price is $10 to $20 for entry.', 'The price is 10 to20 for entry.'],
  ['inline-code', 'Use `\\text{hello}` in LaTeX.', 'Use `hello` in LaTeX.'],
  ['display-math', '$$\n\\mathbf{x} = \\frac{\\text{profit}}{\\text{sales}}\n$$', '$$\n**x** = \\frac{profit}{sales}\n$$'],
  ['tilde-fence', '~~~latex\n\\textbf{Do not change code} \\rightarrow x\n~~~', '~~~latex\n**Do not change code** → x\n~~~'],
  ['valid-inline-math', 'Euler: $e^{i\\pi}+1=0$.', 'Euler: e^{iπ}+1=0.'],
];
report.markdown = markdownCases.map(([name, input, expectedCurrent]) => {
  const output = normalizeMarkdownContent(input);
  assert.equal(output, expectedCurrent);
  return { name, input, output };
});

// Import actual ACP prompt functions, replacing only their SDK/IPC dependencies.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL === url('ui/desktop/src/acp/prompt.ts')) {
      const mocks = {
        '@agentclientprotocol/sdk': "export const methods = {agent:{session:{prompt:'session/prompt',cancel:'session/cancel',setConfigOption:'session/set_config_option'}}};",
        './acpConnection': 'export async function getAcpClient(){return globalThis.__desktopProbe.client}',
        './extensions': "export function gooseExtensionName(x){return x.type==='mcp'?x.server.name:x.name}",
      };
      if (mocks[specifier]) return { url: `data:text/javascript,${encodeURIComponent(mocks[specifier])}`, shortCircuit: true };
      if (specifier === '../orqaly/replyQuestionPrompt') return { url: url('ui/desktop/src/orqaly/replyQuestionPrompt.ts'), shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
const { acpPromptSession } = await import(url('ui/desktop/src/acp/prompt.ts'));
async function probePrompt(text, decisionOrFunction, jevReviewEnabled = true) {
  const calls = [];
  globalThis.__desktopProbe = { client: {
    goose: {
      sessionInfo_unstable: async () => ({ session: { cwd: '/offline/workspace' } }),
      sessionExtensionsList_unstable: async () => ({ extensions: [] }),
      sessionSystemPromptSet_unstable: async value => calls.push({ method: 'setSystemPrompt', value }),
    },
    connection: { agent: { request: async (method, value) => { calls.push({ method, value }); return { stopReason: 'end_turn' }; } } },
  }};
  globalThis.window = { electron: {
    orqalyDecision: async value => { calls.push({ method: 'decision', value }); return typeof decisionOrFunction === 'function' ? decisionOrFunction(value) : decisionOrFunction; },
    orqaly: { workspace: {
      beginTurn: async () => ({ leaseId: 'lease', capabilities: { ompEnabled: true, jevReviewEnabled }, resource: { type: 'resource', resource: { uri: 'orqaly://offline', text: '{}' } } }),
      extensions: async () => [],
      endTurn: async value => calls.push({ method: 'endTurn', value }),
    } },
  }};
  await acpPromptSession('offline_session', { role: 'user', content: [{ type: 'text', text }] });
  return calls;
}
const effortCalls = await probePrompt('Explain this code and update the tests', { decision: 'mixed', thinkingEffort: 'low', confidence: 0.99, reason: 'classified' });
const prompt = effortCalls.find(x => x.method === 'session/prompt').value.prompt;
const triage = JSON.parse(prompt[1].resource.text);
assert.equal(triage.lane, 'mixed');
assert.equal(triage.thinkingEffort, undefined);
assert(!effortCalls.some(x => x.method.includes('config_option')));
const greetingCalls = await probePrompt('Hello!', { decision: 'conversation' });
assert(!greetingCalls.some(x => x.method === 'decision'));
assert(greetingCalls.some(x => x.method === 'session/prompt'));
const disabledCalls = await probePrompt('Inspect the project', { decision: 'local_engineering' }, false);
assert(!disabledCalls.some(x => x.method === 'decision'));
report.prompt = { suppliedThinkingEffort: 'low', emittedTriage: triage, methods: effortCalls.map(x => x.method), greetingDecisionCalls: 0, disabledDecisionCalls: 0 };

// Execute the exact source decision() method with mocked authenticated state/fetch.
// This avoids importing unrelated Electron/auth dependencies. The real source
// AbortSignal.timeout(1200) runs unchanged, and fake fetch honours its signal.
const connectionSource = await readFile(`${root}/ui/desktop/src/orqaly/connection.ts`, 'utf8');
const start = connectionSource.indexOf('    async decision(input) {');
const end = connectionSource.indexOf('\n    async dispose()', start);
assert(start >= 0 && end > start);
const decisionMethodSource = connectionSource.slice(start, end);
const factory = new Function('profileRoot','generation','state','decisionCredential','status','ConnectorFailure','fetch','apiUrl','basename', `return ({${decisionMethodSource}}).decision`);
function timedDecision(latency) {
  let seenAbort = false;
  const fakeFetch = (_url, { signal }) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(new Response(JSON.stringify({ decision: 'conversation', reason: 'classified' }), { status: 200 })), latency);
    signal.addEventListener('abort', () => { seenAbort = true; clearTimeout(timer); reject(signal.reason); }, { once: true });
  });
  const root = '/offline/profile';
  const decision = factory(root, 1, {status:'connected'}, { root, generation:1, expires:Date.now()+60_000, token:'FAKE_OFFLINE_TOKEN'}, async()=>{}, class extends Error{}, fakeFetch, 'https://offline.invalid', basename);
  return { decision, aborted: () => seenAbort };
}
const fast = timedDecision(10);
assert.equal((await fast.decision({ kind:'lane_triage', sessionId:'offline_session', message:'Inspect the project' })).decision, 'conversation');
const slow = timedDecision(1500);
const before = performance.now();
let slowFailure;
try { await slow.decision({ kind:'lane_triage', sessionId:'offline_session', message:'Inspect the project' }); }
catch(error) { slowFailure = error.name; }
assert.equal(slowFailure, 'TimeoutError');
assert.equal(slow.aborted(), true);
// Also test the actual ACP caller catches a decision failure and still submits.
const failureCalls = await probePrompt('Inspect the project', async () => { throw new DOMException('Offline timeout', 'TimeoutError'); });
const failurePrompt = failureCalls.find(x => x.method === 'session/prompt').value.prompt;
assert.equal(failurePrompt.length, 2);
report.timeout = { fastResponseMs:10, slowResponseMs:1500, actualAbortAfterMs:Math.round(performance.now()-before), error:slowFailure, afterFailure:'Prompt submitted without triage; no blanket chat failure' };
console.log(JSON.stringify(report, null, 2));
