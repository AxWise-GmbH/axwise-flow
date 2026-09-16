import type { WorkflowGraph } from '../types';

export function wouldCreateCycle(
  graph: WorkflowGraph,
  sourceId: string,
  targetId: string
): boolean {
  // Adding edge source -> target creates a cycle if there's already a path target -> source.
  if (sourceId === targetId) return true;

  const adj = new Map<string, string[]>();
  Object.keys(graph.blocks).forEach((id) => adj.set(id, []));
  graph.connections.forEach((c) => {
    if (!adj.has(c.sourceBlockId)) adj.set(c.sourceBlockId, []);
    adj.get(c.sourceBlockId)!.push(c.targetBlockId);
  });

  const seen = new Set<string>();
  const stack = [targetId];
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === sourceId) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    const next = adj.get(cur) || [];
    next.forEach((n) => {
      if (!seen.has(n)) stack.push(n);
    });
  }
  return false;
}
