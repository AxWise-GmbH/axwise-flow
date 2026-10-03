import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMultiPackageMonorepoGraph, benchmarkMultiHopTraversal } from './benchmark-gavel-multihop-crossrepo.mjs';

test('GAVEL multi-hop traversal reaches 4 hops without cycles and completes in < 5ms', () => {
  const graph = buildMultiPackageMonorepoGraph();
  assert.equal(graph.nodes.size, 11);

  const results = benchmarkMultiHopTraversal(graph, 'calculateBaseDiscount');
  assert.equal(results.length, 4);

  // 1-hop
  assert.equal(results[0].hops, 1);
  assert.equal(results[0].cycleProtected, true);

  // 4-hop covers all 5 packages
  assert.equal(results[3].hops, 4);
  assert.equal(results[3].reachablePackages, 5);
  assert.ok(results[3].durationUs < 5000);
});
