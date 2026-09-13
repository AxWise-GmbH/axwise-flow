export type BuilderMode = 'workflow' | 'playground';

export type IntentAction =
  | 'create_block'
  | 'add_block'
  | 'connect_blocks'
  | 'edit_block'
  | 'delete_block'
  | 'move_block'
  | 'list_blocks'
  | 'switch_mode'
  | 'create_custom_block'
  // Extension actions (kept explicit, still same JSON shape)
  | 'edit_connection'
  | 'disconnect_ports';

export type PortDirection = 'input' | 'output';
export type PortType = 'trigger' | 'data' | 'audio' | 'text' | 'any';

export interface Port {
  id: string;
  direction: PortDirection;
  portType: PortType;
  displayName: string;
  maxConnections?: number; // undefined = unlimited
}

export type PropertyValueType = 'string' | 'number' | 'boolean' | 'json';

export interface PropertySchema {
  key: string;
  label: string;
  type: PropertyValueType;
  required?: boolean;
  description?: string;
  enum?: string[];
}

export interface BlockDefinition {
  type: string; // deterministic identifier; must exist in registry
  displayName: string;
  category: string;
  inputs: Port[];
  outputs: Port[];
  configurableProperties: PropertySchema[];
  // Keep runtimeBehavior opaque and injectable (UI shouldn't depend on it).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  runtimeBehavior?: (...args: any[]) => any;
  allowCircularDependencies?: boolean;
}

export interface BlockInstance {
  id: string; // unique instance id (maps to ReactFlow node id)
  type: string; // BlockDefinition.type
  displayName: string; // instance label
  properties: Record<string, unknown>;
  position: { x: number; y: number };
}

export interface Connection {
  id: string; // edge id
  connectionId?: string; // human-readable id
  connectionType?: 'incoming' | 'outgoing';
  sourceBlockId: string;
  targetBlockId: string;
  sourcePortId?: string;
  targetPortId?: string;
}

export interface WorkflowGraph {
  blocks: Record<string, BlockInstance>;
  connections: Connection[];
}

export interface IntentCommand {
  mode: BuilderMode;
  action: IntentAction;
  blockType?: string;
  blockId?: string;
  sourceBlockId?: string;
  targetBlockId?: string;
  connectionId?: string;
  properties?: Record<string, unknown>;
  position?: { x: number; y: number };
}

export interface ParserContext {
  mode: BuilderMode;
  lastReferencedBlockId?: string;
  lastReferencedConnectionId?: string;
}

export interface ParseResult {
  ok: boolean;
  command?: IntentCommand;
  errors?: string[];
  nextContext?: ParserContext;
}
