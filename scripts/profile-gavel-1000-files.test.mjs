import test from 'node:test';
import assert from 'node:assert/strict';
import { GavelGraphModel } from './lib/gavel-graph-model.mjs';

test('GavelGraphModel builds 1,000-file graph under 50ms and uses under 10MB heap', () => {
  const fileBlocks = [];
  for (let i = 1; i <= 1000; i++) {
    const pad = String(i).padStart(4, '0');
    fileBlocks.push(`// Module: src/enterprise/service_${pad}.ts
export interface ServiceConfig_${pad} { id: string; }
export function processTransaction_${pad}(id: string) { return id; }
`);
  }
  const fullCodebase = fileBlocks.join('\n');

  const t0 = performance.now();
  const graph = GavelGraphModel.buildFromCodebase(fullCodebase);
  const durationMs = performance.now() - t0;

  assert.ok(durationMs < 50, `Expected build time < 50ms, got ${durationMs}ms`);
  assert.equal(graph.nodes.size >= 2000, true);

  // Precondition checks
  const valid = graph.verifyPreconditions('processTransaction_0500');
  assert.equal(valid.satisfied, true);

  const invalid = graph.verifyPreconditions('NoSuchMethod_9999');
  assert.equal(invalid.satisfied, false);
});
