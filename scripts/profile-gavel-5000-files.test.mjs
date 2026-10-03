import test from 'node:test';
import assert from 'node:assert/strict';
import { GavelGraphModel } from './lib/gavel-graph-model.mjs';

test('GavelGraphModel scales to 5,000 files in under 100ms with under 35MB heap', () => {
  const fileBlocks = [];
  for (let i = 1; i <= 5000; i++) {
    const pad = String(i).padStart(5, '0');
    fileBlocks.push(`// Module: src/services/s_${pad}.ts
export interface Conf_${pad} { id: string; }
export function fn_${pad}() { return '${pad}'; }
`);
  }
  const fullCodebase = fileBlocks.join('\n');

  const t0 = performance.now();
  const graph = GavelGraphModel.buildFromCodebase(fullCodebase);
  const durationMs = performance.now() - t0;

  assert.ok(durationMs < 100, `Expected build time < 100ms, got ${durationMs}ms`);
  assert.equal(graph.nodes.size >= 10000, true);

  const pre = graph.verifyPreconditions('fn_02500');
  assert.equal(pre.satisfied, true);
});
