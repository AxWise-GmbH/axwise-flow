import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const root = new URL('../database/workflow-v2/', import.meta.url);
const checksumRecords = readFileSync(new URL('SCHEMA_SHA256', root), 'utf8')
  .trim()
  .split('\n')
  .filter(Boolean);
const verified = checksumRecords.map((record) => {
  const [expected, relativePath] = record.trim().split(/\s+/, 2);
  const migration = readFileSync(new URL(relativePath, root));
  const actual = createHash('sha256').update(migration).digest('hex');
  if (actual !== expected) {
    throw new Error(
      `workflow v2 schema checksum mismatch for ${relativePath}: expected ${expected}, received ${actual}`
    );
  }
  return `${actual}  ${relativePath}`;
});
process.stdout.write(`${verified.join('\n')}\n`);
