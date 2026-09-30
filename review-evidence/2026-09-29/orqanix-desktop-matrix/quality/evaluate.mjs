import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { evaluateQuality, PROTOCOL_SHA256, RUNNER_SHA256 } from '/Users/admin/axwise-opensource/axwise-flow-oss/scripts/lib/orqanix-benchmark-quality.mjs';

const input = '/private/tmp/orqanix-matrix-autonomous-20260929/report.json';
const output = '/private/tmp/orqanix-quality-audit-20260929/supplemental-code-quality.json';
const nodePath = '/private/tmp/orqanix-native-desktop-benchmark-20260929/Orqanix Benchmark-darwin-arm64/Orqanix Benchmark.app/Contents/Resources/orqaly-runtime/node/bin/node';
const raw = await readFile(input, 'utf8');
const report = JSON.parse(raw);
if (report.rows.length !== 48 || new Set(report.rows.map(row => row.key)).size !== 48) throw Error('WAIT_FOR_ALL_48_ROWS');
if (PROTOCOL_SHA256 !== 'bc6a8bd56f8098f796b557e79feea13c29014b9fe1af57b68335f88d2bce8996') throw Error('QUALITY_PROTOCOL_CHANGED');
if (RUNNER_SHA256 !== '67691c14feb0bbfb2d29241ecbedd76a853aba59f152328e6c480c1a5eb36c93') throw Error('QUALITY_RUNNER_CHANGED');
const rows = [];
const allowed = {
  simple: new Set(['README.md', 'package.json', 'tests/public.test.mjs', 'src/pricing.mjs', 'report.json']),
  medium: new Set(['README.md', 'package.json', 'tests/public.test.mjs', 'evidence/interviews.json', 'src/triage.mjs', 'requirements.json']),
  complex: new Set(['README.md', 'package.json', 'tests/public.test.mjs', 'evidence/interviews.json', 'src/inventory.mjs', 'src/orders.mjs', 'acceptance-plan.json']),
};
async function unexpectedFiles(workspace, difficulty, relative = '') {
  const unexpected = [];
  for (const entry of await readdir(join(workspace, relative), { withFileTypes: true })) {
    if (!relative && entry.name === '.git') continue;
    const path = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) unexpected.push(...await unexpectedFiles(workspace, difficulty, path));
    else if (entry.isSymbolicLink() || !entry.isFile() || !allowed[difficulty].has(path)) unexpected.push(path);
  }
  return unexpected.sort();
}
for (const row of report.rows) {
  const quality = await evaluateQuality(row.workspace, row.difficulty, nodePath);
  const unexpected = await unexpectedFiles(row.workspace, row.difficulty);
  rows.push({ key: row.key, difficulty: row.difficulty, repeat: row.repeat, flags: row.flags, originalStatus: row.status, originalPassed: row.passed, quality, workspaceScope: { passed: unexpected.length === 0, unexpectedFiles: unexpected, limitation: 'Checks final non-Git workspace files only; not a complete audit of every process action or external access.' } });
  console.log(JSON.stringify({ key: row.key, passed: quality.passed, failures: quality.checks.filter(check => !check.passed).map(check => ({ id: check.id, group: check.group, failure: check.failure })), executionError: quality.executionError }));
}
const result = {
  schema: 'orqanix.supplemental-code-audit.v1',
  completedAt: new Date().toISOString(),
  sourceReportSha256: createHash('sha256').update(raw).digest('hex'),
  nodeSha256: createHash('sha256').update(await readFile(nodePath)).digest('hex'),
  designation: 'Supplemental/post-hoc protocol, frozen from the fixed task contract before generated implementations were inspected. Original oracle outcomes are preserved separately. Cases are correlated checks, not independent reliability trials.',
  rows,
};
await writeFile(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify({ output, solutions: rows.length, passed: rows.filter(row => row.quality.passed).length }));
