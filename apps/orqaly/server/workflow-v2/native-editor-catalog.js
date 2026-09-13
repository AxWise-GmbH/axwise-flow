import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getNativeNodeDefinition } from './native-workflow-knowledge.js';

const artifact = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'native-editor-nodes-2.37.10.json'),
    'utf8'
  )
);
if (
  artifact.n8nVersion !== '2.37.10' ||
  artifact.packageName !== 'n8n-nodes-base' ||
  createHash('sha256').update(JSON.stringify(artifact.nodes)).digest('hex') !== artifact.dataHash
)
  throw new Error('native_editor_catalog_integrity_failed');

// Actual pinned native frontend descriptions, not an Orqaly canvas renderer.
// Authoring visibility deliberately grants no installation/execution authority.
export function mergeNativeEditorNodes(upstream) {
  if (!Array.isArray(upstream)) throw new Error('native_editor_catalog_shape_invalid');
  const result = structuredClone(upstream);
  for (const description of artifact.nodes) {
    const name = `${artifact.packageName}.${description.name}`;
    const versions = Array.isArray(description.version)
      ? description.version
      : [description.version];
    const existing = result.filter((item) => item.name === name);
    const known = new Set(
      existing.flatMap((item) => (Array.isArray(item.version) ? item.version : [item.version]))
    );
    if (versions.every((version) => known.has(version))) continue;
    result.push({ ...structuredClone(description), name });
  }
  if (!result.some((description) => description.name === 'CUSTOM.boundedHttp')) {
    const description = JSON.parse(
      readFileSync(
        join(
          dirname(fileURLToPath(import.meta.url)),
          '../../infra/n8n/nodes-orqaly-bounded-http/description.json'
        ),
        'utf8'
      )
    );
    result.push({ ...description, name: 'CUSTOM.boundedHttp' });
  }
  if (!result.some((description) => description.name === 'n8n-nodes-base.errorTrigger')) {
    // The separately integrity-pinned native description is visible for owned
    // child inspection. A catalog entry grants no execution or edit authority.
    const entry = getNativeNodeDefinition('n8n-nodes-base.errorTrigger', 1);
    result.push({ ...entry.definition, name: entry.type });
  }
  return result;
}
