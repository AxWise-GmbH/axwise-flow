import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFile, lstat, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = process.argv[2];
assert(target && target.startsWith('/'), 'Provide the absolute local Goose repository path');
const sourceRoot = join(root, 'packages/orqaly-goose-connector');
const destination = join(resolve(target), 'vendor/orqaly-goose-connector');
assert((await lstat(join(destination, 'SOURCE_PROVENANCE.json'))).isFile(), 'Missing original connector provenance');
const files = [];
for (const path of ['src/utilities-mcp.mjs', 'src/utility-providers.mjs',
  'test/utilities-mcp.test.mjs', 'test/utility-providers.test.mjs']) {
  const source = join(sourceRoot, path);
  assert((await lstat(source)).isFile());
  await copyFile(source, join(destination, path));
  files.push({ path, sha256: createHash('sha256').update(await readFile(source)).digest('hex') });
}
const manifest = {
  schemaVersion: 'orqanix.local-utilities-source.v1',
  sourceKind: 'working-tree-snapshot',
  baseCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  sourcePath: 'packages/orqaly-goose-connector',
  files,
};
await writeFile(join(destination, 'UTILITY_SOURCE_PROVENANCE.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log('Synced local utility modules and tests; original pinned connector provenance unchanged.');
