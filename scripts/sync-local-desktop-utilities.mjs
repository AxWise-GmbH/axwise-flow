import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFile, lstat, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = process.argv[2];
const committed = process.argv[3] === '--committed';
assert(process.argv.length <= 4 || (process.argv.length === 5 && committed), 'Unexpected arguments');
assert(target && target.startsWith('/'), 'Provide the absolute local Goose repository path');
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const sourceRoot = join(root, 'packages/orqaly-goose-connector');
const destination = join(resolve(target), 'vendor/orqaly-goose-connector');
assert((await lstat(join(destination, 'SOURCE_PROVENANCE.json'))).isFile(), 'Missing original connector provenance');
const files = [];
for (const path of ['src/utilities-mcp.mjs', 'src/utility-providers.mjs',
  'test/utilities-mcp.test.mjs', 'test/utility-providers.test.mjs']) {
  const source = join(sourceRoot, path);
  assert((await lstat(source)).isFile());
  const bytes = await readFile(source);
  if (committed) {
    const recorded = execFileSync('git', ['show', `${commit}:packages/orqaly-goose-connector/${path}`], { cwd: root });
    assert(bytes.equals(recorded), `Utility source differs from committed source: ${path}`);
  }
  await copyFile(source, join(destination, path));
  files.push({ path, sha256: createHash('sha256').update(bytes).digest('hex') });
}
const manifest = {
  schemaVersion: 'orqanix.local-utilities-source.v1',
  sourceKind: committed ? 'git-commit' : 'working-tree-snapshot',
  baseCommit: commit,
  sourcePath: 'packages/orqaly-goose-connector',
  files,
};
await writeFile(join(destination, 'UTILITY_SOURCE_PROVENANCE.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Synced ${committed ? 'committed' : 'local'} utility modules and tests; original pinned connector provenance unchanged.`);
