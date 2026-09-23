#!/usr/bin/env node
/** Opt-in live packaged-MCP smoke. Uses only committed synthetic test fixtures. */
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { createInterface } from 'node:readline';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const execute = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DESKTOP = '/private/tmp/orqaly-goose-ux-233/ui/desktop';

export class SmokeMcpClient {
  constructor(command, args, { env = process.env, spawnImpl = spawn } = {}) {
    this.pending = new Map(); this.nextId = 1;
    this.child = spawnImpl(command, args, { stdio: ['pipe', 'pipe', 'pipe'], env });
    this.lines = createInterface({ input: this.child.stdout });
    this.child.stderr.resume(); // Never forward potentially sensitive subprocess errors.
    this.child.stdin.on('error', () => {});
    this.lines.on('line', (line) => {
      let message;
      try { message = JSON.parse(line); } catch { this.fail(new Error('MCP_INVALID_JSON')); return; }
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id); clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(`MCP_ERROR_${message.error.code}`));
      else pending.resolve(message.result);
    });
    this.child.on('error', () => this.fail(new Error('MCP_START_FAILED')));
    this.child.on('close', () => this.fail(new Error('MCP_CLOSED')));
  }
  fail(error) { for (const task of this.pending.values()) { clearTimeout(task.timer); task.reject(error); } this.pending.clear(); }
  request(method, params, timeoutMs = 135_000) {
    const id = this.nextId++;
    return new Promise((resolveRequest, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        this.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: id } })}\n`);
        reject(new Error('MCP_SMOKE_TIMEOUT'));
      }, timeoutMs);
      this.pending.set(id, { resolve: resolveRequest, reject, timer });
      this.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
  }
  close() { this.child.stdin.end(); this.lines.close(); this.child.kill('SIGTERM'); this.fail(new Error('MCP_SMOKE_FINISHED')); }
}

export async function main(argv) {
  if (!argv.includes('--live')) throw new Error('Explicit --live is required: this smoke performs three specialist requests with paid Gemini generation/review/repair calls.');
  const option = (name, fallback) => { const index = argv.indexOf(name); return index < 0 ? fallback : argv[index + 1]; };
  const desktop = resolve(option('--desktop', DESKTOP));
  const resources = resolve(option('--resources', join(desktop, 'src')));
  const root = resolve(option('--root', ROOT));
  const outputDir = await mkdtemp(join(tmpdir(), 'axwise-live-mcp-'));
  const runtime = join(resources, 'orqaly-runtime');
  const specialist = join(resources, 'axwise-runtime');
  const node = join(runtime, 'node/bin/node');
  const connectorRoot = join(runtime, 'connector');
  const configPath = join(connectorRoot, 'preview.config.example.json');
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  const tokenResult = await execute(node, [join(connectorRoot, 'src/cli.mjs'), 'token', '--config', configPath],
    { timeout: 45_000, maxBuffer: 64_000 });
  const token = tokenResult.stdout.trim();
  if (!token || /\s/.test(token)) throw new Error('OAUTH_TOKEN_INVALID');
  const session = await fetch(`${config.apiUrl}/desktop/v1/session`, { headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(35_000) });
  if (!session.ok) throw new Error(`SESSION_HTTP_${session.status}`);
  const identity = await session.json();
  if (identity.accountScoped !== true || typeof identity.userId !== 'string' || !identity.userId) throw new Error('SESSION_NOT_ACCOUNT_SCOPED');
  const accountHash = createHash('sha256').update(identity.userId).digest('hex');
  const python = join(specialist, 'python/bin/python3');
  const fixtureResult = await execute(python, ['-B', '-c', 'import json; from backend.tests.local_axwise.fixtures import inputs; print(json.dumps(inputs()))'],
    { cwd: root, timeout: 10_000, maxBuffer: 160_000,
      env: { PATH: process.env.PATH, PYTHONPATH: root, PYTHONNOUSERSITE: '1', PYTHONDONTWRITEBYTECODE: '1' } });
  const fixtures = JSON.parse(fixtureResult.stdout);
  const childEnv = { ...process.env };
  delete childEnv.ORQALY_LOCAL_TEST_MODE;
  delete childEnv.ORQALY_LOCAL_TEST_TOKEN;
  const client = new SmokeMcpClient(node, [join(specialist, 'adapter/src/mcp.mjs'), '--config', configPath,
    '--connector-root', connectorRoot, '--python', python, '--kernel-root', join(specialist, 'kernel'),
    '--state-dir', join(outputDir, 'artifacts'), '--account-hash', accountHash, '--conversation-id', 'live-synthetic-specialist-smoke'], { env: childEnv });
  const report = { version: 1, liveInference: true, inputs: 'committed synthetic test fixtures', startedAt: new Date().toISOString(), cases: [] };
  try {
    const initStarted = performance.now();
    await client.request('initialize', { protocolVersion: '2025-06-18', clientInfo: { name: 'axwise-local-smoke', version: '1.0.0' }, capabilities: {} }, 20_000);
    const listed = await client.request('tools/list', {}, 20_000);
    report.initializeMs = Math.round(performance.now() - initStarted);
    report.toolNames = listed.tools.map((tool) => tool.name);
    if (JSON.stringify([...report.toolNames].sort()) !== JSON.stringify(Object.keys(fixtures).sort())) throw new Error('UNEXPECTED_SPECIALIST_TOOLS');
    for (const [name, input] of Object.entries(fixtures)) {
      const started = performance.now();
      const result = await client.request('tools/call', { name, arguments: input });
      const elapsedMs = Math.round(performance.now() - started);
      const row = { name, elapsedMs, isError: result.isError === true, timings: result.structuredContent?.timings,
        errorCode: result.structuredContent?.error?.code ?? null, usage: result.structuredContent?.usage,
        validation: result.structuredContent?.validation, result };
      report.cases.push(row);
      process.stdout.write(`${JSON.stringify({ name, elapsedMs, isError: row.isError, errorCode: row.errorCode, timings: row.timings, usage: row.usage })}\n`);
    }
  } finally {
    client.close();
    report.completedAt = new Date().toISOString();
    await writeFile(join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
    process.stdout.write(`Report: ${join(outputDir, 'report.json')}\n`);
  }
  if (report.cases.some((row) => row.isError)) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    // Child-process failures can embed captured OAuth stdout: never print them.
    process.stderr.write(`Live Axwise smoke failed: ${/^[A-Z0-9_]+$/.test(error.message) ? error.message : 'CHECK_AUTH_RUNTIME_OR_NETWORK'}\n`);
    process.exitCode = 1;
  });
}
