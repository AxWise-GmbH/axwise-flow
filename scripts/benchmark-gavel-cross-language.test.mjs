import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPolyglotCodebaseGraph, benchmarkPolyglotTraversal } from './benchmark-gavel-cross-language.mjs';

test('GAVEL polyglot graph traverses 4 distinct languages (TS, Rust, Go, Python) in < 1ms', () => {
  const graph = buildPolyglotCodebaseGraph();
  assert.equal(graph.nodes.size, 16);

  const results = benchmarkPolyglotTraversal(graph, 'initiatePayment');
  assert.equal(results.length, 4);

  // 1-hop covers TypeScript and Rust
  assert.equal(results[0].hops, 1);
  assert.ok(results[0].languagesCovered.includes('TypeScript'));
  assert.ok(results[0].languagesCovered.includes('Rust'));

  // 4-hop covers all 4 languages in full loop
  assert.equal(results[3].hops, 4);
  assert.ok(results[3].languagesCovered.includes('Python'));
  assert.ok(results[3].durationUs < 1000);
});
