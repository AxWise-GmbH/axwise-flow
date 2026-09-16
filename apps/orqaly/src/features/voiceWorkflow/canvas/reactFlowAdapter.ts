import type { Connection, WorkflowGraph } from '../types';

type RFNode = {
  id: string;
  type?: string;
  position?: { x: number; y: number };
  data?: Record<string, unknown>;
};

type RFEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  data?: Record<string, unknown>;
};

export function graphFromReactFlow(nodes: RFNode[], edges: RFEdge[]): WorkflowGraph {
  const blocks: WorkflowGraph['blocks'] = {};
  (nodes || []).forEach((n) => {
    const data = (n.data || {}) as Record<string, unknown>;
    const type = String(data.blockType || data.blockId || n.type || 'unknown');
    const displayName = String(data.label || 'Block');
    blocks[n.id] = {
      id: n.id,
      type,
      displayName,
      properties: (data.config || {}) as Record<string, unknown>,
      position: { x: n.position?.x ?? 0, y: n.position?.y ?? 0 },
    };
  });

  const connections: Connection[] = (edges || []).map((e) => {
    const d = (e.data || {}) as Record<string, unknown>;
    return {
      id: e.id,
      sourceBlockId: e.source,
      targetBlockId: e.target,
      sourcePortId: e.sourceHandle,
      targetPortId: e.targetHandle,
      connectionId: typeof d.connectionId === 'string' ? d.connectionId : undefined,
      connectionType:
        d.connectionType === 'incoming' || d.connectionType === 'outgoing'
          ? d.connectionType
          : undefined,
    };
  });

  return { blocks, connections };
}
