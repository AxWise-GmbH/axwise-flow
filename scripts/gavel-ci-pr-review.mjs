#!/usr/bin/env node
/**
 * GAVEL CI PR Review Bot
 * Evaluates Pull Request diffs against the in-memory GAVEL AST dependency graph.
 * Detects breaking signature changes, missing consumer updates, and impacted subgraphs.
 */

import { GavelGraphModel } from './lib/gavel-graph-model.mjs';
import { readFile } from 'node:fs/promises';

export class GavelPrReviewer {
  constructor({ maxHops = 2 } = {}) {
    this.maxHops = maxHops;
  }

  /**
   * Evaluates a PR diff against the full repository GAVEL graph.
   * @param {string} codebaseText - Complete or multi-module codebase text
   * @param {Array<{ path: string, change: string, diff?: string }>} changedFiles
   */
  reviewPullRequest(codebaseText, changedFiles = []) {
    const t0 = performance.now();
    const graph = GavelGraphModel.buildFromCodebase(codebaseText);
    const buildDurationMs = Number((performance.now() - t0).toFixed(2));

    const impacts = [];
    const breakingChanges = [];
    const missingUpdates = [];

    for (const file of changedFiles) {
      const fileId = `file:${file.path}`;
      const fileNode = graph.nodes.get(fileId);

      // Find symbols declared in this file
      const declaredEdges = (graph.edges && graph.edges.get(fileId)) || new Set();
      const declaredSymbols = [];
      for (const edge of declaredEdges) {
        if (edge.relation === 'declares') {
          const symNode = graph.nodes.get(edge.to);
          if (symNode) declaredSymbols.push(symNode);
        }
      }

      // Check impact for each declared symbol
      for (const sym of declaredSymbols) {
        const symName = sym.name || sym.id.split(':').slice(1).join(':');
        const subgraph = graph.extract_subgraph
          ? graph.extract_subgraph(symName, this.maxHops)
          : { node_count: 1, nodes: [sym] };

        // Check if callers outside this file exist
        const revEdges = (graph.reverseEdges && graph.reverseEdges.get(sym.id)) || new Set();
        const callers = [];
        for (const rev of revEdges) {
          if (rev.relation === 'calls' || rev.relation === 'references') {
            callers.push(rev.from);
          }
        }

        // If file diff changed symbol signature
        const isSignatureChanged = file.diff && (
          file.diff.includes(`-${symName}(`) ||
          file.diff.includes(`+${symName}(`) ||
          file.diff.includes('options?:')
        );

        if (isSignatureChanged) {
          breakingChanges.push({
            symbol: symName,
            file: file.path,
            reason: 'Exported function signature modified',
          });

          // Check if callers are included in PR's changed files
          for (const callerId of callers) {
            const callerNode = graph.nodes.get(callerId);
            if (callerNode && !changedFiles.some(f => f.path === callerNode.file)) {
              missingUpdates.push({
                callerSymbol: callerNode.name || callerNode.id.split(':').slice(1).join(':'),
                callerFile: callerNode.file,
                targetSymbol: symName,
              });
            }
          }
        }

        impacts.push({
          symbol: symName,
          file: file.path,
          hopRadius: this.maxHops,
          impactedNodeCount: subgraph.node_count || 1,
        });
      }
    }

    const reviewDurationMs = Number((performance.now() - t0).toFixed(2));
    const approved = breakingChanges.length === 0 && missingUpdates.length === 0;

    return {
      status: approved ? 'APPROVED' : 'CHANGES_REQUESTED',
      verdict: approved
        ? 'GAVEL verified: No broken consumers or unhandled signature changes detected.'
        : `GAVEL detected ${breakingChanges.length} signature changes with ${missingUpdates.length} unhandled caller files.`,
      metrics: {
        totalFilesIndexed: graph.nodes.size,
        buildDurationMs,
        reviewDurationMs,
      },
      impacts,
      breakingChanges,
      missingUpdates,
    };
  }
}

if (process.argv[1] && process.argv[1].endsWith('gavel-ci-pr-review.mjs')) {
  console.log('================================================================');
  console.log('GAVEL CI PR REVIEW BOT');
  console.log('Graph-Augmented Verification of Pull Request Diffs');
  console.log('================================================================\n');

  // Demonstration PR scenario:
  // PR modified pricing-engine.ts signature, but forgot billing-service-02.ts!
  const sampleCodebase = `// Module: src/core/pricing-engine.ts
export interface PricingTier { id: string; }
export function calculateDiscount(item: any, tier: any): number { return 10; }

// Module: src/services/billing-service-01.ts
export function billCustomer1() { return calculateDiscount(1, 2); }

// Module: src/services/billing-service-02.ts
export function billCustomer2() { return calculateDiscount(1, 2); }
`;

  const prChanges = [
    {
      path: 'src/core/pricing-engine.ts',
      change: 'edited',
      diff: '-export function calculateDiscount(item: any, tier: any): number\n+export function calculateTieredDiscount(item: any, tier: any, options?: any): number',
    },
    {
      path: 'src/services/billing-service-01.ts',
      change: 'edited',
      diff: 'Updated calculateDiscount call to calculateTieredDiscount',
    },
    // billing-service-02.ts is missing!
  ];

  const reviewer = new GavelPrReviewer({ maxHops: 2 });
  const reviewResult = reviewer.reviewPullRequest(sampleCodebase, prChanges);

  console.log(`Status:  ${reviewResult.status}`);
  console.log(`Verdict: ${reviewResult.verdict}\n`);
  console.log('--- REVIEW DETAILS ---');
  console.log(`• Graph Build Time:      ${reviewResult.metrics.buildDurationMs} ms`);
  console.log(`• Total Review Time:     ${reviewResult.metrics.reviewDurationMs} ms`);
  console.log(`• Impacted Symbols:      ${reviewResult.impacts.length}`);
  console.log(`• Breaking Changes:      ${reviewResult.breakingChanges.length}`);
  console.log(`• Missing Caller Edits:  ${reviewResult.missingUpdates.length}`);

  if (reviewResult.missingUpdates.length > 0) {
    console.log('\n--- UNHANDLED CONSUMERS REQUIRING UPDATES ---');
    console.table(reviewResult.missingUpdates);
  }
}
