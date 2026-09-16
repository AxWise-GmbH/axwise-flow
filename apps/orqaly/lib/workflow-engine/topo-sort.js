/**
 * Topological sort for workflow graphs.
 * Takes a WorkflowGraph-shaped object and returns an ordered array of nodeIds.
 * Supports condition nodes that have multiple outputs (true/false branches).
 */

/**
 * @param {Record<string, { id: string, type: string }>} blocks
 * @param {{ sourceBlockId: string, targetBlockId: string, sourcePortId?: string }[]} connections
 * @returns {string[]} nodeIds in topological order
 */
export function topoSort(blocks, connections) {
  const nodeIds = Object.keys(blocks);
  if (nodeIds.length === 0) return [];

  // Build adjacency list and in-degree map
  const adj = new Map();
  const inDegree = new Map();

  for (const id of nodeIds) {
    adj.set(id, []);
    inDegree.set(id, 0);
  }

  for (const conn of connections) {
    const { sourceBlockId, targetBlockId } = conn;
    if (!adj.has(sourceBlockId) || !inDegree.has(targetBlockId)) continue;
    adj.get(sourceBlockId).push(targetBlockId);
    inDegree.set(targetBlockId, (inDegree.get(targetBlockId) || 0) + 1);
  }

  // Kahn's algorithm
  const queue = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const sorted = [];
  while (queue.length > 0) {
    const node = queue.shift();
    sorted.push(node);
    for (const neighbor of adj.get(node) || []) {
      const newDeg = (inDegree.get(neighbor) || 1) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }

  // If not all nodes are in sorted (cycle detected), add remaining
  if (sorted.length < nodeIds.length) {
    for (const id of nodeIds) {
      if (!sorted.includes(id)) sorted.push(id);
    }
  }

  return sorted;
}

/**
 * Get the next node(s) to execute after a given node completes.
 * For condition nodes, returns only the branch matching the output port.
 *
 * @param {string} nodeId - The completed node
 * @param {string|null} outputPort - The output port (e.g. 'true', 'false', 'out')
 * @param {{ sourceBlockId: string, targetBlockId: string, sourcePortId?: string }[]} connections
 * @returns {string[]} next nodeIds to execute
 */
export function getNextNodes(nodeId, outputPort, connections) {
  return connections
    .filter((c) => {
      if (c.sourceBlockId !== nodeId) return false;
      // If outputPort specified and connection has a sourcePortId, match them
      if (outputPort && c.sourcePortId && c.sourcePortId !== outputPort) return false;
      return true;
    })
    .map((c) => c.targetBlockId);
}
