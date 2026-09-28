#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const vendorPath = fileURLToPath(new URL('../vendor/', import.meta.url));
const wheelFile = readdirSync(vendorPath).find((f) => f.endsWith('.whl')) || 'axwise_extension-0.4.0-py3-none-any.whl';
const wheel = fileURLToPath(new URL(`../vendor/${wheelFile}`, import.meta.url));
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
