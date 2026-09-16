import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.dirname(fileURLToPath(import.meta.url));
const distRoot = path.join(packageRoot, 'dist');
const assetsRoot = path.join(distRoot, 'assets');
const index = await readFile(path.join(distRoot, 'index.html'), 'utf8');
const assetNames = await readdir(assetsRoot);
const scripts = assetNames.filter((name) => name.endsWith('.js'));
const styles = assetNames.filter((name) => name.endsWith('.css'));

assert.match(index, /<title>Orqaly × AxWise<\/title>/);
assert.ok(scripts.length >= 1, 'expected the isolated WorkflowV2 application bundle');
assert.equal(styles.length, 1, 'expected one application stylesheet');
assert.ok(!assetNames.some((name) => name.endsWith('.map')), 'source maps must not ship');

let rawJavaScriptBytes = 0;
let gzipJavaScriptBytes = 0;
let applicationFound = false;
for (const name of scripts) {
  const file = path.join(assetsRoot, name);
  const source = await readFile(file);
  rawJavaScriptBytes += (await stat(file)).size;
  gzipJavaScriptBytes += gzipSync(source).byteLength;
  if (source.includes(Buffer.from('One durable workflow.'))) applicationFound = true;
}

assert.ok(applicationFound, 'the WorkflowV2 surface is missing from the bundle');
assert.ok(rawJavaScriptBytes < 1_500_000, `raw JavaScript budget exceeded: ${rawJavaScriptBytes}`);
assert.ok(
  gzipJavaScriptBytes < 500_000,
  `gzip JavaScript budget exceeded: ${gzipJavaScriptBytes}`
);

console.log(
  JSON.stringify(
    {
      scripts: scripts.length,
      rawJavaScriptBytes,
      gzipJavaScriptBytes,
    },
    null,
    2
  )
);
