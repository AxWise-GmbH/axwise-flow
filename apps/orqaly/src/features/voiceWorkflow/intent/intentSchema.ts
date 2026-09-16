import { z } from 'zod';

export const BuilderModeSchema = z.enum(['workflow', 'playground']);

export const IntentActionSchema = z.enum([
  'create_block',
  'add_block',
  'connect_blocks',
  'edit_block',
  'delete_block',
  'move_block',
  'list_blocks',
  'switch_mode',
  'create_custom_block',
  'edit_connection',
  'disconnect_ports',
]);

export const IntentCommandSchema = z.object({
  mode: BuilderModeSchema,
  action: IntentActionSchema,
  blockType: z.string().optional(),
  blockId: z.string().optional(),
  sourceBlockId: z.string().optional(),
  targetBlockId: z.string().optional(),
  connectionId: z.string().optional(),
  properties: z.record(z.any()).optional(),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
});

export type IntentCommandParsed = z.infer<typeof IntentCommandSchema>;
