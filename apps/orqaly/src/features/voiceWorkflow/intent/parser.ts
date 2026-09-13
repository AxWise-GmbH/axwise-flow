import type { BlockRegistry } from '../registry/blockRegistry';
import type { ParseResult, ParserContext } from '../types';
import { IntentCommandSchema } from './intentSchema';

function norm(s: string) {
  return String(s || '').trim();
}

function low(s: string) {
  return norm(s).toLowerCase();
}

function stripQuotes(s: string) {
  const v = norm(s);
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
    return v.slice(1, -1);
  return v;
}

export interface ParserInputs {
  transcript: string;
  ctx: ParserContext;
  registry: BlockRegistry;
  // Current blocks, for resolving labels ("connect landing to campaign")
  blocks: Array<{ id: string; label: string; type?: string }>;
  connections: Array<{ id: string; connectionId?: string }>;
  // Workflow/Playground custom block definitions (sidebar items), for "add custom X".
  customBlockDefs?: Array<{ id: string; label: string; description?: string; iconId?: string }>;
}

export function parseTranscriptDeterministic(input: ParserInputs): ParseResult {
  const t0 = low(input.transcript);
  const ctx = input.ctx;

  const errors: string[] = [];
  if (!t0) return { ok: false, errors: ['Empty transcript'], nextContext: ctx };

  // Mode switching
  if (
    t0.includes('switch to playground') ||
    t0 === 'playground mode' ||
    t0.includes('open playground')
  ) {
    return validated(
      {
        mode: 'playground',
        action: 'switch_mode',
        properties: { to: 'playground' },
      },
      { ...ctx, mode: 'playground' }
    );
  }
  if (t0.includes('switch to workflow') || t0 === 'workflow mode' || t0.includes('open workflow')) {
    return validated(
      {
        mode: 'workflow',
        action: 'switch_mode',
        properties: { to: 'workflow' },
      },
      { ...ctx, mode: 'workflow' }
    );
  }

  const mode = ctx.mode;

  // List blocks
  if (t0 === 'list blocks' || t0.includes('list blocks') || t0.includes('show blocks')) {
    return validated({ mode, action: 'list_blocks' }, ctx);
  }

  // Create custom block
  // examples: "create custom block called greeting", "new custom block greeting"
  {
    const m =
      t0.match(/^(create|new)\s+custom\s+block\s+(called\s+)?(.+)$/) ||
      t0.match(/^create\s+block\s+called\s+(.+)$/);
    if (m) {
      const name = stripQuotes(m[m.length - 1]);
      if (!name) return { ok: false, errors: ['Custom block name is required'], nextContext: ctx };
      return validated(
        { mode, action: 'create_custom_block', blockType: 'custom', properties: { name } },
        ctx
      );
    }
  }

  // Add block (predefined or custom)
  // examples: "add webhook", "add llm", "add custom greeting"
  {
    const m = t0.match(/^add\s+(a\s+)?(.+)$/);
    if (m) {
      const raw = stripQuotes(m[2] || '');
      const maybeCustom = raw.match(/^custom\s+(.+)$/);
      if (maybeCustom) {
        const name = stripQuotes(maybeCustom[1] || '');
        const resolved =
          resolveBlockByLabel(name, input.customBlockDefs || []) ||
          resolveBlockByLabel(name, input.blocks);
        if (!resolved) {
          return {
            ok: false,
            errors: [
              `Unknown custom block "${name}". Create it first (say: "create custom block called ${name}").`,
            ],
            nextContext: ctx,
          };
        }
        return validated(
          {
            mode,
            action: 'add_block',
            blockType: 'custom',
            blockId: resolved.id,
            properties: {
              label: resolved.label,
              description: (resolved as any)?.description || '',
              iconId: (resolved as any)?.iconId || 'extension',
            },
          },
          { ...ctx, lastReferencedBlockId: resolved.id }
        );
      }

      const resolvedType = input.registry.resolveType(raw);
      if (!resolvedType) {
        return {
          ok: false,
          errors: [
            `Unknown block type "${raw}". Try one of: ${input.registry
              .list()
              .map((b) => b.displayName)
              .join(', ')}`,
          ],
          nextContext: ctx,
        };
      }
      return validated({ mode, action: 'add_block', blockType: resolvedType }, ctx);
    }
  }

  // Connect blocks
  // examples: "connect landing page to campaign", "connect A to B"
  {
    const m = t0.match(/^connect\s+(.+)\s+to\s+(.+)$/);
    if (m) {
      const a = stripQuotes(m[1]);
      const b = stripQuotes(m[2]);
      const source =
        resolveBlockByLabel(a, input.blocks) ||
        resolveBlockByIdOrLast(a, input.blocks, ctx.lastReferencedBlockId);
      const target =
        resolveBlockByLabel(b, input.blocks) ||
        resolveBlockByIdOrLast(b, input.blocks, ctx.lastReferencedBlockId);
      if (!source) errors.push(`Can't find source block "${a}"`);
      if (!target) errors.push(`Can't find target block "${b}"`);
      if (errors.length) return { ok: false, errors, nextContext: ctx };
      return validated(
        { mode, action: 'connect_blocks', sourceBlockId: source!.id, targetBlockId: target!.id },
        { ...ctx, lastReferencedBlockId: target!.id }
      );
    }
  }

  // Disconnect incoming/outgoing for a block
  {
    const m = t0.match(/^disconnect\s+(incoming|outgoing)\s+(from|of)\s+(.+)$/);
    if (m) {
      const dir = m[1] as 'incoming' | 'outgoing';
      const name = stripQuotes(m[3] || '');
      const target =
        resolveBlockByLabel(name, input.blocks) ||
        resolveBlockByIdOrLast(name, input.blocks, ctx.lastReferencedBlockId);
      if (!target) return { ok: false, errors: [`Can't find block "${name}"`], nextContext: ctx };
      return validated(
        { mode, action: 'disconnect_ports', blockId: target.id, properties: { direction: dir } },
        { ...ctx, lastReferencedBlockId: target.id }
      );
    }
  }

  // Edit connection metadata by id
  // examples: "set connection id abc to incoming", "set connection abc type outgoing"
  {
    const m =
      t0.match(/^set\s+connection\s+(.+)\s+type\s+(incoming|outgoing)$/) ||
      t0.match(/^set\s+connection\s+(.+)\s+to\s+(incoming|outgoing)$/);
    if (m) {
      const ref = stripQuotes(m[1] || '');
      const typ = m[2] as 'incoming' | 'outgoing';
      const conn = resolveConnection(ref, input.connections, ctx.lastReferencedConnectionId);
      if (!conn) return { ok: false, errors: [`Can't find connection "${ref}"`], nextContext: ctx };
      return validated(
        {
          mode,
          action: 'edit_connection',
          connectionId: conn.id,
          properties: { connectionType: typ },
        },
        { ...ctx, lastReferencedConnectionId: conn.id }
      );
    }
  }

  // Move block: "move campaign to 200 100"
  {
    const m = t0.match(/^move\s+(.+)\s+to\s+(-?\d+)\s+(-?\d+)$/);
    if (m) {
      const name = stripQuotes(m[1] || '');
      const x = Number(m[2]);
      const y = Number(m[3]);
      const target =
        resolveBlockByLabel(name, input.blocks) ||
        resolveBlockByIdOrLast(name, input.blocks, ctx.lastReferencedBlockId);
      if (!target) return { ok: false, errors: [`Can't find block "${name}"`], nextContext: ctx };
      return validated(
        { mode, action: 'move_block', blockId: target.id, position: { x, y } },
        { ...ctx, lastReferencedBlockId: target.id }
      );
    }
  }

  // Delete block: "delete block landing page"
  {
    const m = t0.match(/^(delete|remove)\s+(block\s+)?(.+)$/);
    if (m) {
      const name = stripQuotes(m[m.length - 1] || '');
      const target =
        resolveBlockByLabel(name, input.blocks) ||
        resolveBlockByIdOrLast(name, input.blocks, ctx.lastReferencedBlockId);
      if (!target) return { ok: false, errors: [`Can't find block "${name}"`], nextContext: ctx };
      return validated(
        {
          mode,
          action: 'delete_block',
          blockId: target.id,
          properties: { requiresConfirmation: true },
        },
        { ...ctx, lastReferencedBlockId: target.id }
      );
    }
  }

  // Edit block property: "set landing page url of landing to https://..."
  {
    const m = t0.match(/^set\s+(.+?)\s+of\s+(.+?)\s+to\s+(.+)$/);
    if (m) {
      const key = stripQuotes(m[1] || '');
      const name = stripQuotes(m[2] || '');
      const value = stripQuotes(m[3] || '');
      const target =
        resolveBlockByLabel(name, input.blocks) ||
        resolveBlockByIdOrLast(name, input.blocks, ctx.lastReferencedBlockId);
      if (!target) return { ok: false, errors: [`Can't find block "${name}"`], nextContext: ctx };
      return validated(
        {
          mode,
          action: 'edit_block',
          blockId: target.id,
          properties: { [normalizePropKey(key)]: value },
        },
        { ...ctx, lastReferencedBlockId: target.id }
      );
    }
  }

  return {
    ok: false,
    errors: ['No matching command. Try: "add webhook", "connect A to B", "delete block X".'],
    nextContext: ctx,
  };
}

function validated(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cmd: any,
  nextCtx: ParserContext
): ParseResult {
  const parsed = IntentCommandSchema.safeParse(cmd);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((i) => i.message), nextContext: nextCtx };
  }
  return { ok: true, command: parsed.data, nextContext: nextCtx };
}

function resolveBlockByLabel(query: string, blocks: Array<{ id: string; label: string }>) {
  const q = low(query);
  if (!q) return null;
  // exact match first
  const exact = blocks.find((b) => low(b.label) === q);
  if (exact) return exact;
  // contains match
  const candidates = blocks.filter((b) => low(b.label).includes(q));
  if (candidates.length === 1) return candidates[0];
  return null;
}

function resolveBlockByIdOrLast(
  query: string,
  blocks: Array<{ id: string; label: string }>,
  lastId?: string
) {
  const q = norm(query);
  if (!q && lastId) return blocks.find((b) => b.id === lastId) || null;
  const byId = blocks.find((b) => b.id === q);
  if (byId) return byId;
  if ((q === 'it' || q === 'that' || q === 'this') && lastId)
    return blocks.find((b) => b.id === lastId) || null;
  return null;
}

function resolveConnection(
  query: string,
  connections: Array<{ id: string; connectionId?: string }>,
  lastId?: string
) {
  const q = low(query);
  if (!q && lastId) return connections.find((c) => c.id === lastId) || null;
  const byEdgeId = connections.find((c) => low(c.id) === q);
  if (byEdgeId) return byEdgeId;
  const byConnectionId = connections.find((c) => low(c.connectionId || '') === q);
  if (byConnectionId) return byConnectionId;
  if ((q === 'it' || q === 'that' || q === 'this') && lastId)
    return connections.find((c) => c.id === lastId) || null;
  return null;
}

function normalizePropKey(s: string) {
  return low(s).replace(/[^\w]+/g, '_');
}
