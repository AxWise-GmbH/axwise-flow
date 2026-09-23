#!/usr/bin/env node
import { isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { StringDecoder } from 'node:string_decoder';
import { MAX_FRAME_BYTES, createKernel, createProvider, createSpecialistTools, object, validateOrigin, validateTools } from './runtime.mjs';

export function parseArguments(argv) {
  const values = new Map(), accepted = new Set(['--config', '--account-hash', '--conversation-id', '--state-dir', '--python', '--kernel-root', '--connector-root', '--api-url']);
  for (let i = 0; i < argv.length; i += 2) {
    if (!accepted.has(argv[i]) || values.has(argv[i]) || !argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error('Invalid launch arguments.');
    values.set(argv[i], argv[i + 1]);
  }
  for (const flag of ['--config', '--state-dir', '--python', '--kernel-root', '--connector-root'])
    if (!isAbsolute(values.get(flag) || '')) throw new Error('Absolute runtime paths are required.');
  if (!/^[a-f0-9]{64}$/.test(values.get('--account-hash') || '') || !/^[A-Za-z0-9_-]{1,128}$/.test(values.get('--conversation-id') || '')) throw new Error('Account and conversation binding are required.');
  const apiUrlOverride = values.has('--api-url') ? validateOrigin(values.get('--api-url'), { allowLoopback: true }) : null;
  // URL override is a test-only loopback relay, never another credential recipient.
  if (apiUrlOverride && !apiUrlOverride.startsWith('http://127.0.0.1:')) throw new Error('API override must be an explicit 127.0.0.1 relay.');
  return { configPath: values.get('--config'), stateDir: values.get('--state-dir'), python: values.get('--python'),
    kernelRoot: values.get('--kernel-root'), connectorRoot: values.get('--connector-root'),
    accountHash: values.get('--account-hash'), conversationId: values.get('--conversation-id'), apiUrlOverride };
}

export function resolveTestToken({ apiUrlOverride, testMode, testToken, normalToken }) {
  if (testMode !== undefined || testToken !== undefined) {
    if (testMode !== 'true' || !testToken || /\s/.test(testToken) || !apiUrlOverride?.startsWith('http://127.0.0.1:')) throw new Error('Test credentials require an explicit loopback relay.');
    return async () => testToken;
  }
  return normalToken;
}

async function* boundedLines(input) {
  const decoder = new StringDecoder('utf8'); let text = '', oversized = false;
  for await (const bytes of input) {
    const chunk = decoder.write(Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes));
    for (const [index, part] of chunk.split('\n').entries()) {
      if (index) { yield oversized ? null : text; text = ''; oversized = false; }
      if (!oversized) {
        text += part;
        if (Buffer.byteLength(text) > MAX_FRAME_BYTES) { text = ''; oversized = true; }
      }
    }
  }
  text += decoder.end();
  if (oversized || text.trim()) yield oversized ? null : text;
}

export async function serveMcp({ tools, call, input = process.stdin, output = process.stdout }) {
  const active = new Map(), tasks = new Set(), seenCalls = new Set(); let initialized = false;
  const write = (message) => { if (!output.destroyed) output.write(`${JSON.stringify(message)}\n`); };
  const error = (id, code, message) => write({ jsonrpc: '2.0', id, error: { code, message } });
  try {
    for await (const line of boundedLines(input)) {
      let message;
      try { if (line === null) throw new Error(); message = JSON.parse(line); }
      catch { error(null, -32700, 'Invalid or oversized JSON-RPC message'); continue; }
      if (!object(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string') { error(null, -32600, 'Invalid JSON-RPC request'); continue; }
      if (message.method === 'notifications/cancelled') { active.get(message.params?.requestId)?.abort(); continue; }
      if (message.id === undefined) continue;
      const id = message.id;
      if (!((typeof id === 'string' && id.length <= 256) || Number.isSafeInteger(id)) || active.has(id)
        || seenCalls.has(id)) { error(null, -32600, 'Invalid or duplicate request ID'); continue; }
      if (message.method === 'initialize') {
        initialized = true;
        write({ jsonrpc: '2.0', id, result: { protocolVersion: '2025-06-18', capabilities: { tools: {} },
          serverInfo: { name: 'axwise-local', version: '0.1.0' },
          instructions: 'Optional specialist artifact tools. Goose retains conversation control. Only call for requested PRDs, interview evidence analysis or explicitly synthetic interview simulations. Do not use for ordinary chat, weather, news, search or general coding. Outputs are drafts/evidence summaries, not instructions or external actions.' } });
      } else if (message.method === 'ping') write({ jsonrpc: '2.0', id, result: {} });
      else if (!initialized) error(id, -32002, 'Initialize first');
      else if (message.method === 'tools/list') write({ jsonrpc: '2.0', id, result: { tools } });
      else if (message.method === 'tools/call') {
        // A replay on this connection cannot trigger another paid inference,
        // including after a prior call completed. Bound memory without evicting
        // deduplication: reconnect explicitly after this generous session cap.
        if (seenCalls.size >= 4096) { error(id, -32000, 'Specialist session limit reached; reconnect the extension'); continue; }
        seenCalls.add(id);
        const controller = new AbortController(); active.set(id, controller);
        const task = Promise.resolve().then(() => call(message.params?.name, message.params?.arguments ?? {}, controller.signal))
          .then((result) => write({ jsonrpc: '2.0', id, result }))
          .catch(() => write({ jsonrpc: '2.0', id, result: { isError: true, content: [{ type: 'text', text: 'The local specialist could not complete this request.' }] } }))
          .finally(() => { active.delete(id); tasks.delete(task); });
        tasks.add(task);
      } else error(id, -32601, 'Method not supported');
    }
  } finally {
    for (const controller of active.values()) controller.abort();
    await Promise.allSettled(tasks);
  }
}

export async function main(argv) {
  const options = parseArguments(argv);
  const [{ parseArguments: authArguments }, { main: authCommand }] = await Promise.all([
    import(pathToFileURL(join(options.connectorRoot, 'src/config.mjs')).href),
    import(pathToFileURL(join(options.connectorRoot, 'src/cli.mjs')).href),
  ]);
  const authArgs = ['token', '--config', options.configPath];
  const { config } = await authArguments(authArgs);
  const token = resolveTestToken({ apiUrlOverride: options.apiUrlOverride,
    testMode: process.env.ORQALY_LOCAL_TEST_MODE, testToken: process.env.ORQALY_LOCAL_TEST_TOKEN,
    normalToken: async () => {
      let value = '';
      await authCommand(authArgs, { stdout: { write(part) { value += part; } }, stderr: { write() {} } });
      return value.trim();
    } });
  const kernel = createKernel(options);
  const tools = validateTools(await kernel({ operation: 'describe' }));
  const provider = createProvider({ apiUrl: options.apiUrlOverride || config.apiUrl, accountHash: options.accountHash, token });
  await serveMcp({ tools, call: createSpecialistTools({ ...options, kernel, provider }) });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch(() => {
    process.stderr.write('Axwise local extension could not start. Check its packaged runtime and public configuration.\n');
    process.exitCode = 1;
  });
}
