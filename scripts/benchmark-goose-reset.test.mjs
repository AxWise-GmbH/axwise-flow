import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { AcpClient, BUILTINS, CASES, InteractiveReviewer, TurnRecorder, childEnvironment, compareInventories, loadTypescriptParser, parseOptions, permissionAllowed, providerConfig, redact, safeSearchCommand, sessionInventory, shellWords, validateCodeModeScript } from './benchmark-goose-reset.mjs';

test('comparison defaults to exactly two arms and bounded multi-turn public cases', () => {
  const options = parseOptions([], {});
  assert.equal(options.repeats, 2);
  assert.equal(options.live, false);
  assert.equal(options.interactiveReview, false);
  assert.equal(parseOptions(['--interactive-review'], {}).interactiveReview, true);
  assert.equal(options.caseCount, 4);
  assert.equal(options.timeoutSeconds, 90);
  assert.deepEqual(BUILTINS, ['developer', 'todo', 'code_execution']);
  assert.match(CASES[1].prompt, /there/);
  assert.match(CASES[2].prompt, /150 km/);
  assert.match(CASES[3].prompt, /Do not edit or run/);
});

test('rejects nonlocal relays and unbounded settings', () => {
  for (const url of ['https://example.com', 'http://localhost:3456', 'http://127.0.0.1/a', 'http://user:pass@127.0.0.1', 'http://127.0.0.1/?token=x']) assert.throws(() => parseOptions(['--relay-url', url], {}));
  for (const args of [['--repeats', '100'], ['--timeout-seconds', '999'], ['--cases', '0'], ['--token-env', 'wrong-value'], ['--vanilla', 'relative'], ['--wat']]) assert.throws(() => parseOptions(args, {}));
  assert.equal(parseOptions(['--relay-url', 'http://127.0.0.1:47831', '--repeats', '3', '--live'], {}).live, true);
});

test('provider has local relay model, shared settings and no secret value', () => {
  const config = providerConfig('http://127.0.0.1:47831');
  assert.equal(config.engine, 'openai');
  assert.equal(config.base_path, 'desktop/v1/chat/completions');
  assert.equal(config.api_key_env, 'ORQALY_LOCAL_TEST_TOKEN');
  assert.equal(config.models[0].name, 'orqaly-gemini');
  assert.equal(config.dynamic_models, false);
  assert.equal('api_key' in config, false);
});

test('child env isolates Goose data and keeps only the local test credential', () => {
  const env = childEnvironment({ profile: '/private/tmp/bench/profile', temporary: '/private/tmp/bench/tmp', token: 'local-only', searchCache: '/private/tmp/cache' },
    { HOME: '/Users/example', PATH: '/bin', GEMINI_API_KEY: 'do-not-pass', AWS_SECRET_ACCESS_KEY: 'do-not-pass', GITHUB_TOKEN: 'do-not-pass', GOOSE_PROVIDER: 'wrong' });
  assert.equal(env.HOME, '/Users/example');
  assert.equal(env.GOOSE_PATH_ROOT, '/private/tmp/bench/profile');
  assert.equal(env.GOOSE_MODE, 'approve');
  assert.equal(env.ORQALY_LOCAL_TEST_TOKEN, 'local-only');
  assert.equal(env.UV_OFFLINE, '1');
  assert.equal(env.GEMINI_API_KEY, undefined);
  assert.equal(env.GITHUB_TOKEN, undefined);
  assert.equal(env.AWS_SECRET_ACCESS_KEY, undefined);
});

test('redaction drops provider thought/signature/token fields and token echoes', () => {
  const value = redact({ thoughts: 'private', thought_signature: 'private', authorization: 'private', nested: { apiKey: 'private', text: 'secret is abc123' }, text: 'Bearer example.value' }, ['abc123']);
  assert.deepEqual(value, { nested: { text: 'secret is [REDACTED]' }, text: 'Bearer [REDACTED]' });
});

test('approval allows local fixture reads but not mutations, traversal, arbitrary code or installs', () => {
  const workspace = '/private/tmp/fixture';
  const call = (title, rawInput) => ({ title, rawInput });
  assert.equal(permissionAllowed(call('developer: shell · cat README.md', { command: 'cat README.md' }), workspace), true);
  assert.equal(permissionAllowed(call('developer: text editor · src/pricing.js', { command: 'view', path: 'src/pricing.js' }), workspace), true);
  assert.equal(permissionAllowed(call('desktop-utilities: search web · Kaunas', { query: 'Kaunas news' }), workspace), true);
  assert.equal(permissionAllowed(call('desktop-utilities: get weather', { location: 'Kaunas' }), workspace), true);
  for (const command of ['git push', 'npm install', 'uvx --from requests python -c evil', 'cat ~/.ssh/id_rsa', 'cat README.md; env', 'cat $(env)', 'rg --pre=evil word .', 'rm -rf .', 'python3 -c "print(1)"']) assert.equal(permissionAllowed(call('developer__shell', { command }), workspace), false, command);
  assert.equal(permissionAllowed(call('developer__text_editor', { command: 'view', path: '../secret' }), workspace), false);
  assert.equal(permissionAllowed(call('developer__text_editor', { command: 'write', path: 'README.md' }), workspace), false);
});

test('prewarmed offline DDGS search grammar accepts only bounded reads', () => {
  assert.equal(safeSearchCommand('uvx ddgs text -q "Kaunas techno parties this week" -m 5'), true);
  assert.equal(safeSearchCommand("uvx ddgs news -q 'Kaunas' -m 3 -t w"), true);
  assert.equal(safeSearchCommand('curl -sSL --max-time 15 https://example.com/news'), true);
  assert.equal(safeSearchCommand('curl -sSL --max-time 15 "https://example.com/news?a=1&b=2" | uvx html2text --ignore-links | head -c 15000'), true);
  assert.equal(safeSearchCommand('uvx ddgs extract -u https://example.com/news'), true);
  for (const command of ['uvx --no-offline ddgs text -q "Kaunas" -m 5', 'uvx ddgs text -q "Kaunas" -m 500', 'uvx ddgs text -q "Kaunas"', 'curl -k --max-time 15 https://example.com', 'curl --max-time 15 http://example.com', 'curl --max-time 15 https://127.0.0.1', 'curl --max-time 15 https://localhost', 'curl -H "Authorization: Bearer token" --max-time 15 https://example.com', 'curl -X POST --max-time 15 https://example.com', 'curl -o secret --max-time 15 https://example.com', 'curl --max-time 15 https://example.com; env']) assert.equal(safeSearchCommand(command), false, command);
  assert.deepEqual(shellWords("uvx ddgs text -q 'Kaunas events' -m 5"), ['uvx', 'ddgs', 'text', '-q', 'Kaunas events', '-m', '5']);
  assert.equal(shellWords('echo "unterminated'), null);
  assert.equal(safeSearchCommand('curl -sSL --max-time 15 https://example.com/news | python3 -c "evil"'), false);
  assert.equal(safeSearchCommand('curl -sSL --max-time 15 https://example.com/news | head -c 999999'), false);
});

test('recorder separates first text from first post-tool answer and includes failures', () => {
  let time = 0;
  const record = new TurnRecorder(() => time);
  const update = (data) => record.update({ params: { update: data } });
  time = 20; update({ sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'not captured' } });
  time = 30; update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Checking.\n' } });
  time = 40; update({ sessionUpdate: 'tool_call', toolCallId: 'a', title: 'Search', status: 'in_progress', _meta: { toolName: 'desktop-utilities__search_web' } });
  time = 80; update({ sessionUpdate: 'tool_call_update', toolCallId: 'a', status: 'completed' });
  time = 90; update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Headline [source](https://example.com/news)' } });
  update({ sessionUpdate: 'message_usage', usage: { inputTokens: 30, outputTokens: 5, cacheReadTokens: 20 } });
  time = 100;
  const result = record.finish({ stopReason: 'end_turn', usage: { totalTokens: 35 } });
  assert.equal(result.firstAssistantTextMs, 30);
  assert.equal(result.firstCompletedToolMs, 80);
  assert.equal(result.firstAnswerTextAfterLastToolMs, 90);
  assert.equal(result.firstUsefulAnswerMs, null);
  assert.equal(result.endToEndMs, 100);
  assert.equal(result.toolCount, 1);
  assert.equal(result.tools[0].name, 'desktop-utilities__search_web');
  assert.deepEqual(result.sourceUrls, ['https://example.com/news']);
  assert.equal(result.accuracy, 'not_assessed');
  assert.doesNotMatch(result.markdown, /not captured/);
  assert.equal(record.finish(null, new Error('upstream timeout')).status, 'failed');
  assert.equal(record.finish(null, new Error('MANUAL_APPROVAL_REQUIRED: shell')).status, 'needs_operator_review');
});

function fakeProcess(onMessage) {
  const child = new EventEmitter();
  child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.exitCode = null; child.signalCode = null;
  let buffer = '';
  child.stdin.on('data', (chunk) => {
    buffer += chunk;
    for (;;) {
      const end = buffer.indexOf('\n'); if (end < 0) break;
      const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
      onMessage(JSON.parse(line), child);
    }
  });
  return child;
}

test('ACP transport handles notifications, permissions and result without recording thoughts', async () => {
  const received = [];
  const child = fakeProcess((message, process) => {
    received.push(message);
    if (message.method === 'initialize') process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { protocolVersion: 1 } }) + '\n');
    if (message.method === 'session/prompt') {
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', method: 'session/update', params: { update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Answer' } } } }) + '\n');
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { stopReason: 'end_turn' } }) + '\n');
    }
  });
  const client = new AcpClient('unused', [], { env: {}, cwd: '/private/tmp/fixture', spawnImpl: () => child });
  client.recorder = new TurnRecorder();
  assert.deepEqual(await client.request('initialize', {}, 1000), { protocolVersion: 1 });
  assert.equal((await client.request('session/prompt', {}, 1000)).stopReason, 'end_turn');
  assert.equal(client.recorder.text, 'Answer');
  await client.onRequest({ jsonrpc: '2.0', id: 33, method: 'session/request_permission', params: { toolCall: { title: 'developer: shell · pwd', rawInput: { command: 'pwd' } }, options: [{ kind: 'allow_once', optionId: 'once' }] } });
  assert.deepEqual(received.at(-1).result, { outcome: { outcome: 'selected', optionId: 'once' } });
  child.exitCode = 0;
  await client.stop(); await client.stop();
});

test('ACP timeouts fail rather than being silently omitted', async () => {
  const child = fakeProcess(() => {});
  const client = new AcpClient('unused', [], { env: {}, cwd: '/private/tmp/fixture', spawnImpl: () => child });
  await assert.rejects(client.request('session/prompt', {}, 5), /deadline exceeded/);
  child.exitCode = 0;
  await client.stop();
});

test('interactive review requires a fresh exact decision and redacts displayed permission input', async () => {
  const input = new PassThrough(); const events = [];
  const reviewer = new InteractiveReviewer({ input, emit: (event) => events.push(event), secrets: ['test-secret'], timeoutMs: 100 });
  input.write('allow once\n'); // Cannot preapprove a future call.
  let settled = false;
  const decision = reviewer.review({ title: 'shell', rawInput: { command: 'test-secret command', authorization: 'hidden' } }).then((value) => { settled = true; return value; });
  input.write('yes\n');
  await new Promise((done) => setTimeout(done, 5));
  assert.equal(settled, false);
  assert.equal(events[0].permission.rawInput.command, '[REDACTED] command');
  assert.equal(events[0].permission.rawInput.authorization, undefined);
  assert.equal(events[1].event, 'operator_review_input_required');
  assert.equal(await reviewer.review({ title: 'another' }), 'concurrent_review_rejected');
  input.write('allow once\n');
  assert.equal(await decision, 'allow_once');
  const denied = reviewer.review({ title: 'second call' }); input.write('deny\n');
  assert.equal(await denied, 'deny');
  reviewer.close();
  assert.equal(await reviewer.review({}), 'input_closed');
});

test('interactive review times out or closes without approving', async () => {
  const input = new PassThrough();
  const reviewer = new InteractiveReviewer({ input, emit: () => {}, timeoutMs: 5 });
  assert.equal(await reviewer.review({ title: 'unknown' }), 'timeout');
  const pending = reviewer.review({ title: 'unknown again' }); reviewer.close();
  assert.equal(await pending, 'cancelled');
  assert.throws(() => new InteractiveReviewer({ timeoutMs: 60_001 }), /Review deadline/);
});

test('ACP interactive review defers execution and pauses only active prompt deadline', async () => {
  const input = new PassThrough(); const received = []; let promptId;
  const reviewer = new InteractiveReviewer({ input, emit: () => {}, timeoutMs: 1000 });
  const child = fakeProcess((message, process) => {
    received.push(message);
    if (message.method === 'session/prompt') {
      promptId = message.id;
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: 'permission-1', method: 'session/request_permission', params: {
        toolCall: { title: 'shell', rawInput: { command: 'command requiring manual inspection' } },
        options: [{ kind: 'allow_once', optionId: 'once' }, { kind: 'reject_once', optionId: 'reject' }],
      } }) + '\n');
    }
    if (message.id === 'permission-1') process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: promptId, result: { stopReason: 'end_turn' } }) + '\n');
  });
  const client = new AcpClient('unused', [], { env: {}, cwd: '/private/tmp/fixture', spawnImpl: () => child, reviewer });
  client.recorder = new TurnRecorder();
  const prompt = client.request('session/prompt', {}, 20);
  await new Promise((done) => setTimeout(done, 40));
  assert.equal(received.some((message) => message.id === 'permission-1'), false);
  input.write('allow once\n');
  const response = await prompt;
  assert.equal(response.stopReason, 'end_turn');
  assert.deepEqual(received.at(-1).result.outcome, { outcome: 'selected', optionId: 'once' });
  const row = client.recorder.finish(response);
  assert.ok(row.reviewMs >= 30);
  assert.ok(row.activeEndToEndMs < row.wallEndToEndMs);
  assert.equal(row.endToEndMs, row.wallEndToEndMs);
  assert.equal(row.permissionReviews[0].outcome, 'allow_once');
  assert.equal(row.permissionDenials.length, 0);
  child.exitCode = 0; await client.stop();
});

test('default ACP permission mode still rejects and stops unknown commands immediately', async () => {
  const received = []; const child = fakeProcess((message) => received.push(message));
  const client = new AcpClient('unused', [], { env: {}, cwd: '/private/tmp/fixture', spawnImpl: () => child });
  client.recorder = new TurnRecorder();
  const prompt = client.request('session/prompt', {}, 100);
  const rejection = assert.rejects(prompt, /MANUAL_APPROVAL_REQUIRED/);
  await client.onRequest({ jsonrpc: '2.0', id: 17, method: 'session/request_permission', params: {
    toolCall: { title: 'shell', rawInput: { command: 'unknown' } }, options: [{ kind: 'allow_once', optionId: 'once' }, { kind: 'reject_once', optionId: 'reject' }],
  } });
  await rejection;
  assert.deepEqual(received.at(-1).result.outcome, { outcome: 'selected', optionId: 'reject' });
  assert.equal(client.recorder.reviews.length, 0);
  child.exitCode = 0; await client.stop();
});

test('CodeMode validator fails closed without an available parser', () => {
  assert.equal(validateCodeModeScript('async function run() { await Developer.shell({command: "pwd"}); }', '/private/tmp/fixture', null).allowed, false);
  assert.throws(() => loadTypescriptParser('relative'));
});

test('session inventory records actual native defaults without serializing MCP credentials', () => {
  const native = { extensions: [{ extensionKey: 'developer', extension: { type: 'builtin', name: 'developer' } }, { extensionKey: 'skills', extension: { type: 'builtin', name: 'skills' } }] };
  const toolList = { tools: [{ name: 'load_skill', inputSchema: { type: 'object' }, permission: 'approve' }] };
  const vanilla = sessionInventory(native, toolList);
  assert.deepEqual(vanilla.skillToolNames, ['load_skill']);
  const reset = sessionInventory({ extensions: [...native.extensions, { extensionKey: 'desktop-utilities', extension: { type: 'mcp', server: { name: 'desktop-utilities', env: [{ name: 'SECRET', value: 'not-for-report' }] } } }] },
    { tools: [...toolList.tools, { name: 'desktop-utilities__search_web', inputSchema: {} }] });
  assert.doesNotMatch(JSON.stringify(reset), /not-for-report|SECRET/);
  assert.equal(compareInventories(vanilla, reset).sameCommonInventory, true);
  reset.tools.push({ name: 'new_native_tool' });
  const mismatch = compareInventories(vanilla, reset);
  assert.equal(mismatch.sameCommonInventory, false);
  assert.deepEqual(mismatch.tools.onlyReset, ['new_native_tool']);
  assert.throws(() => sessionInventory({}, toolList), /incomplete/);
});

test('CodeMode permits documented wrapper and literal approved nested calls only', () => {
  loadTypescriptParser();
  const code = `async function run() {
    const initial = await Developer.shell({command: "pwd"});
    console.log(initial);
    const result = await Developer.shell({command: 'uvx ddgs text -q "Kaunas events" -m 5'});
    console.log(JSON.stringify(result, null, 2));
    return result;
  }`;
  const decision = validateCodeModeScript(code, '/private/tmp/fixture');
  assert.equal(decision.allowed, true, decision.reason);
  assert.equal(decision.calls.length, 2);
  assert.equal(decision.calls[1].tool, 'developer__shell');
  assert.equal(permissionAllowed({ title: 'code execution: execute typescript', rawInput: { code } }, '/private/tmp/fixture'), true);
  assert.equal(permissionAllowed({ title: 'execute_typescript', rawInput: { code } }, '/private/tmp/fixture'), true);
  for (const body of [
    'return await DesktopUtilities.getWeather({location: "Kaunas", unit: "C"});',
    'console.log(await DesktopUtilities.searchWeb({query: "Kaunas parties", location: "Kaunas", radiusKm: 150}));',
    'await Developer.textEditor({command: "view", path: "README.md"}); return "Read finished";',
    'await Developer.shell({command: `pwd`});',
    'const command = "pwd"; const result = await Developer.shell({command: command}); return { result: result };',
    'const city = "Kaunas"; const radius = 150; const result = await DesktopUtilities.searchWeb({query: "techno", location: city, radiusKm: radius}); return { result: result, note: "Unverified" };',
  ]) assert.equal(validateCodeModeScript(`async function run() { ${body} }`, '/private/tmp/fixture').allowed, true, body);
});

test('CodeMode accepts observed vanilla weather plan without granting file writes', () => {
  loadTypescriptParser();
  const code = 'async function run() {\n'
    + 'const todoContent = `# Tasks\n- [ ] Fetch current Kaunas weather\n- [ ] Summarize with source link\n`;\n'
    + 'await Todo.todoWrite({content: todoContent});\n'
    + 'const weatherResult = await Developer.shell({command: \'curl -s --max-time 10 "https://wttr.in/Kaunas?format=j1"\'});\n'
    + 'return {weather: weatherResult};\n}';
  const decision = validateCodeModeScript(code, '/private/tmp/fixture');
  assert.equal(decision.allowed, true, decision.reason);
  assert.equal(decision.calls.length, 2);
  assert.equal(decision.calls[0].tool, 'todo__todo_write');
  assert.equal(decision.calls[0].args.content, '# Tasks\n- [ ] Fetch current Kaunas weather\n- [ ] Summarize with source link\n');
  const todo = (rawInput) => permissionAllowed({ _meta: { toolName: 'todo__todo_write' }, rawInput }, '/private/tmp/fixture');
  assert.equal(todo({content: ''}), true);
  assert.equal(todo({content: 'x'.repeat(8_000)}), true);
  for (const input of [{content: 'x'.repeat(8_001)}, {content: 1}, {}, {content: 'plan', path: '../secret'}, {content: 'plan', sessionId: 'other'}]) assert.equal(todo(input), false);
});

test('CodeMode rejects dynamic/nested calls, shell mutation, operators and code execution tricks', () => {
  loadTypescriptParser();
  const bodies = [
    'await Developer.shell({command: "git push"});',
    'await Developer.shell({command: "curl -k --max-time 15 https://example.com"});',
    'await Developer.shell({command: "p" + "wd"});',
    'const command = "pwd"; await Developer.shell({command});',
    'await Developer["shell"]({command: "pwd"});',
    'await Developer.shell.call(null, {command: "pwd"});',
    'await Developer.shell({command: String("pwd")});',
    'await Developer.shell({command: `${"pwd"}`});',
    'const command = "p" + "wd"; await Developer.shell({command: command});',
    'const command = `${"pwd"}`; await Developer.shell({command: command});',
    'const command = String("pwd"); await Developer.shell({command: command});',
    'let command = "pwd"; await Developer.shell({command: command});',
    'const command = "pwd"; command = "git push"; await Developer.shell({command: command});',
    'const command = "pwd"; const alias = command; await Developer.shell({command: alias});',
    'const command = "git push"; await Developer.shell({command: command});',
    'const command = {content: "pwd"}; await Developer.shell({command: command.content});',
    'const Todo = "x"; await Todo.todoWrite({content: "plan"});',
    'await Todo.todoWrite({content: "plan", path: "README.md"});',
    'await Todo.todoWrite({content: Developer.shell({command: "git push"})});',
    'const r = await Developer.shell({command: "pwd"}); await Developer.shell({command: r});',
    'const r = await Developer.shell({command: "pwd"}); return {result: r.content};',
    'const r = await Developer.shell({command: "pwd"}); return {result: JSON.stringify(r)};',
    'const r = await Developer.shell({command: "pwd"}); return {result: await Developer.shell({command: "pwd"})};',
    'const r = await Developer.shell({command: "pwd"}); return {...r};',
    'const r = await Developer.shell({command: "pwd"}); return {["result"]: r};',
    'const r = await Developer.shell({command: "pwd"}); return {r};',
    'const r = await Developer.shell({command: "pwd"}); return {__proto__: r};',
    'const r = await Developer.shell({command: "pwd"}); return {result: r, result: r};',
    'await Developer.shell({...{command: "pwd"}});',
    'await Developer.shell({["command"]: "pwd"});',
    'await Developer.shell({get command() { return "pwd"; }});',
    'await Developer.shell({__proto__: {command: "pwd"}});',
    'await Developer.shell({command: "pwd", command: "git push"});',
    'while (true) { await Developer.shell({command: "pwd"}); }',
    'for (const n of [1,2]) { await Developer.shell({command: "pwd"}); }',
    'function evil() {} await Developer.shell({command: "pwd"});',
    'const Developer = await Developer.shell({command: "pwd"});',
    'const r = await Developer.shell({command: "pwd"}); r.command = "git push";',
    'const r = await Developer.shell({command: "pwd"}); console.log(eval(r));',
    'const r = await Developer.shell({command: "pwd"}); console.log(JSON.stringify(r, evil));',
    'const r = await Developer.shell({command: "pwd"}); console.log(r.constructor("evil"));',
    'await import("child_process");',
    'await fetch("https://example.com");',
    'await DesktopUtilities.generateImage({prompt: "not allowed"});',
    'await Developer.textEditor({command: "view", path: "../private"});',
    'await Developer.textEditor({command: "write", path: "README.md", file_text: "new"});',
    'await Developer.shell?.({command: "pwd"});',
    'await Developer.shell({command: "pwd"} as any);',
  ];
  for (const body of bodies) assert.equal(validateCodeModeScript(`async function run() { ${body} }`, '/private/tmp/fixture').allowed, false, body);
  for (const code of [
    'await Developer.shell({command: "pwd"});',
    'async function run(x) { return await Developer.shell({command: "pwd"}); }',
    'async function run() { return await Developer.shell({command: "pwd"}); } run();',
    'export async function run() { return await Developer.shell({command: "pwd"}); }',
    'async function run() { return await Developer.shell({command: "pwd"}); } const evil = 1;',
    'async function run() { return "no tools"; }',
    `async function run() { ${'await Developer.shell({command: "pwd"});'.repeat(7)} }`,
  ]) assert.equal(validateCodeModeScript(code, '/private/tmp/fixture').allowed, false, code);
});
