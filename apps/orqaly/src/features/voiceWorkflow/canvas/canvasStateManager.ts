import type { BlockRegistry } from '../registry/blockRegistry';
import type { BuilderMode, IntentCommand, ParserContext } from '../types';
import { graphFromReactFlow } from './reactFlowAdapter';
import { wouldCreateCycle } from './graphValidation';

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
  type?: string;
  style?: Record<string, unknown>;
  data?: Record<string, unknown>;
  sourceHandle?: string;
  targetHandle?: string;
};

export interface ReactFlowStateAccess {
  getNodes: () => RFNode[];
  getEdges: () => RFEdge[];
  setNodes: (updater: (prev: RFNode[]) => RFNode[]) => void;
  setEdges: (updater: (prev: RFEdge[]) => RFEdge[]) => void;
  mode: BuilderMode;
  // Edge defaults differ between Workflow and Playground.
  defaultEdgeFactory: (args: { source: string; target: string }) => Partial<RFEdge>;
  // Optional to create custom blocks in persistent lists.
  createCustomBlock?: (
    name: string,
    description?: string
  ) =>
    | Promise<{ id: string; label: string; description?: string } | null>
    | ({ id: string; label: string; description?: string } | null);
}

let edgeIdCounter = 1;
function newEdgeId() {
  return `e_${Date.now().toString(36)}_${(edgeIdCounter++).toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

let nodeIdCounter = 1;
function newNodeId() {
  return `node_${Date.now().toString(36)}_${(nodeIdCounter++).toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function nextAutoPosition(nodes: RFNode[]) {
  // Place the next node to the right of the "rightmost" node.
  const xs = nodes.map((n) => n.position?.x ?? 0);
  const ys = nodes.map((n) => n.position?.y ?? 0);
  const maxX = xs.length ? Math.max(...xs) : 0;
  const avgY = ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : 0;
  return { x: maxX + 240, y: Math.round(avgY / 20) * 20 };
}

export async function applyIntentToReactFlow(
  registry: BlockRegistry,
  ctx: ParserContext,
  cmd: IntentCommand,
  access: ReactFlowStateAccess
): Promise<{ ok: boolean; errors?: string[]; nextContext?: ParserContext }> {
  const nodes = access.getNodes();
  const edges = access.getEdges();
  const graph = graphFromReactFlow(nodes, edges);

  const errors: string[] = [];

  if (cmd.action === 'switch_mode') {
    return { ok: true, nextContext: { ...ctx, mode: cmd.mode } };
  }

  if (cmd.action === 'list_blocks') {
    return { ok: true, nextContext: ctx };
  }

  if (cmd.action === 'create_custom_block') {
    const name = String(cmd.properties?.name || '').trim();
    if (!name) return { ok: false, errors: ['Custom block name is required'], nextContext: ctx };
    const desc = typeof cmd.properties?.description === 'string' ? cmd.properties?.description : '';
    const created = await access.createCustomBlock?.(name, desc);
    if (!created?.id)
      return { ok: false, errors: ['Failed to create custom block'], nextContext: ctx };
    return { ok: true, nextContext: { ...ctx, lastReferencedBlockId: created.id } };
  }

  if (cmd.action === 'add_block') {
    if (cmd.blockType === 'custom') {
      const blockId = String(cmd.blockId || '').trim();
      if (!blockId) return { ok: false, errors: ['Custom block id is required'], nextContext: ctx };

      const position = cmd.position || nextAutoPosition(nodes);
      access.setNodes((prev) => {
        const id = newNodeId();
        const newNode: RFNode = {
          id,
          type: 'custom',
          position,
          data: {
            nodeId: id,
            blockId,
            label: String(cmd.properties?.label || 'Custom block'),
            description: String(cmd.properties?.description || ''),
            iconId: String(cmd.properties?.iconId || 'extension'),
          },
        };
        return prev.concat(newNode);
      });
      return { ok: true, nextContext: ctx };
    }

    const type = cmd.blockType ? registry.resolveType(cmd.blockType) : null;
    if (!type) return { ok: false, errors: ['Unknown or missing blockType'], nextContext: ctx };
    const def = registry.get(type);
    if (!def)
      return { ok: false, errors: [`Block type not in registry: ${type}`], nextContext: ctx };

    const position = cmd.position || nextAutoPosition(nodes);
    access.setNodes((prev) => {
      const id = newNodeId();
      const newNode: RFNode = {
        id,
        type: access.mode === 'workflow' ? 'workflow' : 'custom', // playground only renders custom nodes today
        position,
        data: {
          nodeId: id,
          blockType: def.type,
          blockId: def.type, // keeps compatibility with existing nodes (unknown types render generic config)
          label: def.displayName,
          config: {},
        },
      };
      return prev.concat(newNode);
    });
    return { ok: true, nextContext: ctx };
  }

  if (cmd.action === 'move_block') {
    const id = String(cmd.blockId || '').trim();
    if (!id) return { ok: false, errors: ['blockId is required'], nextContext: ctx };
    const pos = cmd.position;
    if (!pos) return { ok: false, errors: ['position is required'], nextContext: ctx };
    access.setNodes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, position: { x: pos.x, y: pos.y } } : n))
    );
    return { ok: true, nextContext: { ...ctx, lastReferencedBlockId: id } };
  }

  if (cmd.action === 'edit_block') {
    const id = String(cmd.blockId || '').trim();
    if (!id) return { ok: false, errors: ['blockId is required'], nextContext: ctx };
    const props = cmd.properties || {};
    access.setNodes((prev) =>
      prev.map((n) => {
        if (n.id !== id) return n;
        const data = (n.data || {}) as Record<string, unknown>;
        const prevConfig = (data.config || {}) as Record<string, unknown>;
        return { ...n, data: { ...data, config: { ...prevConfig, ...props } } };
      })
    );
    return { ok: true, nextContext: { ...ctx, lastReferencedBlockId: id } };
  }

  if (cmd.action === 'delete_block') {
    const id = String(cmd.blockId || '').trim();
    if (!id) return { ok: false, errors: ['blockId is required'], nextContext: ctx };
    access.setNodes((prev) => prev.filter((n) => n.id !== id));
    access.setEdges((prev) => prev.filter((e) => e.source !== id && e.target !== id));
    return { ok: true, nextContext: { ...ctx, lastReferencedBlockId: undefined } };
  }

  if (cmd.action === 'connect_blocks') {
    const source = String(cmd.sourceBlockId || '').trim();
    const target = String(cmd.targetBlockId || '').trim();
    if (!source || !target)
      return {
        ok: false,
        errors: ['sourceBlockId and targetBlockId are required'],
        nextContext: ctx,
      };
    if (!graph.blocks[source])
      return { ok: false, errors: [`Unknown sourceBlockId: ${source}`], nextContext: ctx };
    if (!graph.blocks[target])
      return { ok: false, errors: [`Unknown targetBlockId: ${target}`], nextContext: ctx };

    const sourceType = graph.blocks[source]?.type || '';
    const targetType = graph.blocks[target]?.type || '';
    const sourceDef = registry.get(sourceType);
    const targetDef = registry.get(targetType);

    if (sourceDef && (!Array.isArray(sourceDef.outputs) || sourceDef.outputs.length === 0)) {
      return { ok: false, errors: [`"${sourceDef.displayName}" has no outputs`], nextContext: ctx };
    }
    if (targetDef && (!Array.isArray(targetDef.inputs) || targetDef.inputs.length === 0)) {
      return { ok: false, errors: [`"${targetDef.displayName}" has no inputs`], nextContext: ctx };
    }

    // Basic port max-connection rules (uses default out/in ports).
    if (sourceDef?.outputs?.[0]?.maxConnections != null) {
      const outCount = edges.filter((e) => e.source === source).length;
      if (outCount >= sourceDef.outputs[0].maxConnections) {
        return {
          ok: false,
          errors: [`"${sourceDef.displayName}" output is at max connections`],
          nextContext: ctx,
        };
      }
    }
    if (targetDef?.inputs?.[0]?.maxConnections != null) {
      const inCount = edges.filter((e) => e.target === target).length;
      if (inCount >= targetDef.inputs[0].maxConnections) {
        return {
          ok: false,
          errors: [`"${targetDef.displayName}" input is at max connections`],
          nextContext: ctx,
        };
      }
    }

    const allowCycles = Boolean(
      sourceDef?.allowCircularDependencies || targetDef?.allowCircularDependencies
    );
    if (!allowCycles && wouldCreateCycle(graph, source, target)) {
      return {
        ok: false,
        errors: ['Connection would create a circular dependency'],
        nextContext: ctx,
      };
    }

    access.setEdges((prev) => {
      const already = prev.some((e) => e.source === source && e.target === target);
      if (already) return prev;
      const base = access.defaultEdgeFactory({ source, target });
      const edge: RFEdge = {
        id: newEdgeId(),
        source,
        target,
        ...base,
        data: {
          ...(base.data || {}),
          connectionType: 'outgoing',
          connectionId: (cmd.properties?.connectionId as string) || '',
        },
      };
      // If the target node has the classic "left-in" and the source has "right-out", use them.
      edge.sourceHandle = 'right-out';
      edge.targetHandle = 'left-in';
      return prev.concat(edge);
    });
    return { ok: true, nextContext: { ...ctx, lastReferencedBlockId: target } };
  }

  if (cmd.action === 'disconnect_ports') {
    const blockId = String(cmd.blockId || '').trim();
    const dir =
      cmd.properties?.direction === 'incoming' || cmd.properties?.direction === 'outgoing'
        ? cmd.properties.direction
        : null;
    if (!blockId || !dir)
      return { ok: false, errors: ['blockId and direction are required'], nextContext: ctx };
    access.setEdges((prev) =>
      prev.filter((e) => (dir === 'incoming' ? e.target !== blockId : e.source !== blockId))
    );
    return { ok: true, nextContext: { ...ctx, lastReferencedBlockId: blockId } };
  }

  if (cmd.action === 'edit_connection') {
    const edgeId = String(cmd.connectionId || '').trim();
    if (!edgeId)
      return { ok: false, errors: ['connectionId (edge id) is required'], nextContext: ctx };
    access.setEdges((prev) =>
      prev.map((e) => {
        if (e.id !== edgeId) return e;
        const nextData = { ...(e.data || {}) };
        if (
          cmd.properties?.connectionType === 'incoming' ||
          cmd.properties?.connectionType === 'outgoing'
        ) {
          nextData.connectionType = cmd.properties.connectionType;
        }
        if (typeof cmd.properties?.connectionId === 'string')
          nextData.connectionId = cmd.properties.connectionId;
        return { ...e, data: nextData };
      })
    );
    return { ok: true, nextContext: { ...ctx, lastReferencedConnectionId: edgeId } };
  }

  errors.push(`Unsupported action: ${cmd.action}`);
  return { ok: false, errors, nextContext: ctx };
}
