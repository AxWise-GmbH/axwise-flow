/**
 * Dashboard config schema (Zod) — shared between manual editor & auto-mode LLM.
 *
 * A DashboardConfig is portable JSON. It is validated:
 *   - client-side before save
 *   - server-side before persist
 *   - server-side after the auto-mode LLM produces JSON
 *
 * Adding a new block type? Extend BLOCK_TYPES and (if needed) BlockDataSchema.
 * Adding a new dataset/measure/dimension? Update metricCatalog.js — this schema
 * accepts any string at the schema level and metricCatalog is the canonical
 * allow-list enforced by the server.
 */
import { z } from 'zod';

export const BLOCK_TYPES = [
  'kpi',
  'trend',
  'breakdown',
  'pie',
  'table',
  'alerts',
  'markdown',
  'custom_query',
];

export const AGGREGATIONS = ['count', 'sum', 'avg', 'min', 'max', 'p95'];

export const TIME_BUCKETS = ['day', 'week', 'month'];

const MeasureSchema = z.object({
  agg: z.enum(AGGREGATIONS),
  field: z.string().min(1).max(120).optional(),
});

const GroupBySchema = z.object({
  field: z.string().min(1).max(120),
  time_bucket: z.enum(TIME_BUCKETS).optional(),
});

const BlockDataSchema = z.object({
  dataset: z.string().min(1).max(80),
  measure: MeasureSchema,
  group_by: GroupBySchema.optional(),
  limit: z.number().int().positive().max(500).optional(),
});

const FiltersSchema = z.record(z.string(), z.union([z.string(), z.array(z.string()), z.null()]));

const TimeRangeSchema = z.object({
  kind: z.enum(['last_n_days', 'absolute']),
  value: z.union([z.number().int().positive(), z.tuple([z.string(), z.string()])]),
});

const GlobalFiltersSchema = z
  .object({
    time_range: TimeRangeSchema.optional(),
  })
  .catchall(z.union([z.string(), z.array(z.string()), z.null()]));

const ChartOptionsSchema = z
  .object({
    stacked: z.boolean().optional(),
    show_legend: z.boolean().optional(),
    color_scheme: z.string().optional(),
  })
  .partial();

const ClickThroughSchema = z.object({
  entity: z.enum(['goal', 'partner', 'job', 'business', 'lead']),
  id_field: z.string().min(1).max(120),
});

const CustomQuerySchema = z.object({
  template_id: z.string().min(1).max(80),
  params: z.record(z.string(), z.unknown()).default({}),
});

const LayoutItemSchema = z.object({
  i: z.string().min(1),
  x: z.number().int().min(0).max(12),
  y: z.number().int().min(0),
  w: z.number().int().min(1).max(12),
  h: z.number().int().min(1).max(24),
});

export const BlockSchema = z.object({
  id: z.string().min(1).max(80),
  type: z.enum(BLOCK_TYPES),
  title: z.string().min(0).max(200).default(''),
  data: BlockDataSchema.optional(), // markdown blocks have no data
  body: z.string().max(5000).optional(), // markdown body
  filters: FiltersSchema.optional(),
  chart_options: ChartOptionsSchema.optional(),
  click_through: ClickThroughSchema.optional(),
  custom_query: CustomQuerySchema.optional(),
});

export const DashboardConfigSchema = z.object({
  version: z.literal(1).default(1),
  layout: z.array(LayoutItemSchema).default([]),
  blocks: z.array(BlockSchema).default([]),
  global_filters: GlobalFiltersSchema.default({}),
});

export const SavedDashboardSchema = z.object({
  id: z.string().uuid().optional(),
  owner_user_id: z.string().uuid().optional(),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  config: DashboardConfigSchema,
  visibility: z.enum(['private', 'group', 'public']).default('private'),
  is_template: z.boolean().default(false),
});

/**
 * Validate a dashboard config and return either { ok: true, value } or
 * { ok: false, errors }. Use this in handlers to convert Zod issues into a
 * stable, serializable response shape.
 */
export function validateDashboardConfig(input) {
  const parsed = DashboardConfigSchema.safeParse(input);
  if (parsed.success) return { ok: true, value: parsed.data };
  return {
    ok: false,
    errors: parsed.error.issues.map((i) => ({
      path: i.path.join('.'),
      message: i.message,
    })),
  };
}

export function validateSavedDashboard(input) {
  const parsed = SavedDashboardSchema.safeParse(input);
  if (parsed.success) return { ok: true, value: parsed.data };
  return {
    ok: false,
    errors: parsed.error.issues.map((i) => ({
      path: i.path.join('.'),
      message: i.message,
    })),
  };
}

export function emptyConfig() {
  return DashboardConfigSchema.parse({});
}
