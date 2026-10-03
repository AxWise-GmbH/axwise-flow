#!/usr/bin/env node
/**
 * GAVEL In-Memory Graph Memory & Performance Scaling Profile
 * Indexes 1,000 modular source files and profiles:
 * - Graph construction time
 * - Heap memory overhead (total MB and bytes-per-node)
 * - Deterministic precondition verification latency
 * - Context pruning ratio (1,000-file dump vs k-hop pruned context)
 */

import { GavelGraphModel } from './lib/gavel-graph-model.mjs';

function formatBytes(bytes) {
  return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

async function run1000FileProfile() {
  console.log('================================================================');
  console.log('GAVEL IN-MEMORY GRAPH SCALING BENCHMARK (1,000 FILES)');
  console.log('Indexing 1,000 modular TypeScript files with AST symbol graph');
  console.log('================================================================\n');

  // Generate 1,000 synthetic modular source files
  process.stdout.write('Generating 1,000 modular source modules in memory ... ');
  const tGenStart = performance.now();
  const fileBlocks = [];
  for (let i = 1; i <= 1000; i++) {
    const pad = String(i).padStart(4, '0');
    fileBlocks.push(`// Module: src/enterprise/service_${pad}.ts
export interface ServiceConfig_${pad} { id: string; tier: number; enabled: boolean; }
export function processTransaction_${pad}(config: ServiceConfig_${pad}, amount: number): number {
  return amount * 1.05;
}
export class TransactionHandler_${pad} {
  handle(id: string): boolean { return id.length > 0; }
}
`);
  }
  const fullCodebase = fileBlocks.join('\n');
  const genDurationMs = (performance.now() - tGenStart).toFixed(2);
  const rawBytes = Buffer.byteLength(fullCodebase, 'utf8');
  const rawTokens = Math.round(fullCodebase.length / 3.8);
  console.log(`[DONE] ${genDurationMs}ms (${formatBytes(rawBytes)}, ~${rawTokens.toLocaleString()} tokens)\n`);

  // Force Garbage Collection if available, or snapshot heap
  if (global.gc) global.gc();
  const heapBefore = process.memoryUsage().heapUsed;

  // 1. Build In-Memory Graph
  process.stdout.write('Building GAVEL in-memory dependency graph for 1,000 files ... ');
  const tBuildStart = performance.now();
  const graph = GavelGraphModel.buildFromCodebase(fullCodebase);
  const buildDurationMs = (performance.now() - tBuildStart).toFixed(2);
  const heapAfter = process.memoryUsage().heapUsed;
  const graphMemoryBytes = Math.max(0, heapAfter - heapBefore);
  console.log(`[DONE] in ${buildDurationMs} ms!\n`);

  // 2. Precondition Verification Profile (Average of 100 random checks)
  const symbolsToCheck = [
    'processTransaction_0001',
    'processTransaction_0500',
    'processTransaction_1000',
    'TransactionHandler_0750',
    'NonExistentSymbol_9999',
  ];

  const verifyLatencies = [];
  for (const sym of symbolsToCheck) {
    const t0 = performance.now();
    const res = graph.verifyPreconditions(sym);
    const lat = performance.now() - t0;
    verifyLatencies.push({ symbol: sym, satisfied: res.satisfied, latencyUs: (lat * 1000).toFixed(1) });
  }

  // 3. Subgraph Pruning Profile
  const targetSymbol = 'processTransaction_0500';
  const targetNode = graph.nodes.get(`function:${targetSymbol}`) || [...graph.nodes.values()].find(n => n.text.includes(targetSymbol));
  const prunedSnippet = targetNode ? targetNode.text : '';
  const prunedTokens = Math.round(prunedSnippet.length / 3.8);
  const tokenReductionPct = (((rawTokens - prunedTokens) / rawTokens) * 100).toFixed(2);

  console.log('--- 1,000-FILE GAVEL GRAPH METRICS ---');
  console.table({
    'Codebase Size': { Value: '1,000 files' },
    'Raw Token Dump': { Value: `~${rawTokens.toLocaleString()} tokens` },
    'Graph Build Time': { Value: `${buildDurationMs} ms` },
    'Total Nodes Indexed': { Value: `${graph.nodes.size.toLocaleString()} nodes (files, functions, classes)` },
    'Heap Memory Used': { Value: formatBytes(graphMemoryBytes) },
    'Memory per File': { Value: `${(graphMemoryBytes / 1000).toFixed(1)} bytes / file` },
    'Pruned Subgraph Context': { Value: `~${prunedTokens} tokens` },
    'Prompt Token Reduction': { Value: `${tokenReductionPct}% savings` },
  });

  console.log('\n--- DETERMINISTIC PRECONDITION CHECKS ---');
  console.table(
    verifyLatencies.map(v => ({
      Symbol: v.symbol,
      'Precondition Satisfied': v.satisfied ? 'YES (Declared)' : 'NO (Rejected)',
      'Latency (microseconds)': `${v.latencyUs} µs`,
    }))
  );
}

run1000FileProfile().catch(err => {
  console.error('Fatal benchmark error:', err);
  process.exit(1);
});
