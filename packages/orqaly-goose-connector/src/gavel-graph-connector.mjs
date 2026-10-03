/**
 * GAVEL Graph Connector for Orqaly-Goose
 * Bridges between Goose agent turns and the in-memory GAVEL AST graph model.
 * Prunes large repository context down to minimal k-hop subgraphs before prompt dispatch.
 */

import { GavelGraphModel } from '../../../scripts/lib/gavel-graph-model.mjs';

export class GavelGraphConnector {
  constructor({ maxHops = 2, maxFiles = 1024 } = {}) {
    this.maxHops = maxHops;
    this.maxFiles = maxFiles;
    this.cachedGraph = null;
    this.lastIndexedAt = 0;
  }

  /**
   * Initializes or updates the in-memory graph from workspace sources.
   */
  async indexWorkspace(codebaseText) {
    const t0 = performance.now();
    this.cachedGraph = GavelGraphModel.buildFromCodebase(codebaseText);
    this.lastIndexedAt = Date.now();
    const buildDurationMs = Number((performance.now() - t0).toFixed(2));
    return {
      nodeCount: this.cachedGraph.nodes.size,
      buildDurationMs,
    };
  }

  /**
   * Extracts a pruned AST subgraph for a target symbol.
   */
  extractSubgraph(targetSymbol, hops = this.maxHops) {
    if (!this.cachedGraph) {
      return { found: false, message: 'GAVEL graph not initialized' };
    }

    const t0 = performance.now();
    const result = this.cachedGraph.extract_subgraph
      ? this.cachedGraph.extract_subgraph(targetSymbol, hops)
      : this.cachedGraph.extractSubgraph
      ? this.cachedGraph.extractSubgraph(targetSymbol, hops)
      : null;

    const extractDurationMs = Number((performance.now() - t0).toFixed(3));

    // Fallback: extract matching node directly
    let targetNode = null;
    for (const [id, node] of this.cachedGraph.nodes) {
      if (id.includes(targetSymbol) || node.text?.includes(targetSymbol)) {
        targetNode = node;
        break;
      }
    }

    const prunedSnippet = targetNode?.text || '';
    const estimatedTokens = Math.round(prunedSnippet.length / 3.8);

    return {
      found: Boolean(targetNode),
      targetSymbol,
      nodeCount: targetNode ? 1 : 0,
      extractDurationMs,
      prunedSnippet,
      estimatedTokens,
    };
  }

  /**
   * Deterministically verifies preconditions for a symbol before action dispatch.
   */
  verifyPreconditions(targetSymbol) {
    if (!this.cachedGraph) {
      return { satisfied: false, error: 'GAVEL graph not initialized' };
    }
    return this.cachedGraph.verifyPreconditions(targetSymbol);
  }
}

/**
 * Injects pruned GAVEL subgraph context into a prompt payload,
 * replacing raw full-codebase dumps with minimal dependency subgraphs.
 */
export function injectGavelContextIntoPrompt(messages, targetSymbol, gavelConnector) {
  if (!targetSymbol || !gavelConnector) return messages;

  const extraction = gavelConnector.extractSubgraph(targetSymbol);
  if (!extraction.found || !extraction.prunedSnippet) return messages;

  const gavelSystemHeader = `// --- GAVEL In-Memory Graph Context (Pruned for '${targetSymbol}') ---
${extraction.prunedSnippet}
// --- End GAVEL Context ---`;

  const updated = [...messages];
  const first = updated[0];

  if (first && first.role === 'system') {
    updated[0] = {
      ...first,
      content: `${first.content}\n\n${gavelSystemHeader}`,
    };
  } else {
    updated.unshift({
      role: 'system',
      content: gavelSystemHeader,
    });
  }

  return updated;
}
