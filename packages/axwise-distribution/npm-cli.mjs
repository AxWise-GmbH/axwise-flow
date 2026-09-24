#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

if (Number(process.versions.node.split('.')[0]) < 22) {
  process.stderr.write('AxWise requires Node.js 22 or newer.\n');
  process.exit(1);
}
const wheel = fileURLToPath(new URL('../vendor/axwise_extension-0.3.0-py3-none-any.whl', import.meta.url));
// The exact wheel is bundled: npm never resolves a similarly named PyPI package.
const child = spawn('uvx', ['--from', wheel, 'axwise', ...process.argv.slice(2)], {
  stdio: 'inherit', env: { ...process.env, AXWISE_NODE: process.execPath },
});
child.once('error', () => {
  process.stderr.write('AxWise needs uv (including uvx) on PATH. Install uv and retry.\n');
  process.exitCode = 1;
});
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => child.kill(signal));
child.once('exit', (code, signal) => {
  process.exitCode = code ?? (signal === 'SIGINT' ? 130 : 1);
});
