import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { captureWorkspace, runVerification } from '../src/evidence.mjs';

test('real Git workspace captures initial dirty state and bounded untracked changes', async (t) => {
  const workspace = await mkdtemp(join(tmpdir(), 'orqanix-evidence-'));
  t.after(() => rm(workspace, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q', workspace]);
  await writeFile(join(workspace, 'feature.mjs'), 'export const value = 1;\n');
  const before = await captureWorkspace(workspace);
  await writeFile(join(workspace, 'feature.mjs'), 'export const value = 2;\n');
  const after = await captureWorkspace(workspace);
  assert.equal(before.status, 'captured');
  assert.match(before.text, /value = 1/);
  assert.match(after.text, /value = 2/);
  await writeFile(join(workspace, '.env'), 'TOKEN=fixture');
  assert.equal((await captureWorkspace(workspace)).status, 'unavailable');
});

test('verification records the actual local process outcome and never invents a test run', async (t) => {
  const workspace = await mkdtemp(join(tmpdir(), 'orqanix-tests-'));
  t.after(() => rm(workspace, { recursive: true, force: true }));
  const config = { workspace, node: process.execPath };
  await writeFile(join(workspace, 'feature.test.mjs'), "import assert from 'node:assert/strict'; import test from 'node:test'; test('fixture', () => assert.equal(2+2, 4));\n");
  const passed = await runVerification({ config, command: ['node', '--test', 'feature.test.mjs'], timeoutMs: 5000 });
  assert.equal(passed.status, 'passed');
  assert.equal(passed.exitCode, 0);
  assert.match(passed.output, /pass 1/);
  assert.equal((await runVerification({ config })).status, 'not_run');
});
