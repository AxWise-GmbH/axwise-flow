/**
 * Tests for dashboardSchema — Zod validation contracts.
 */
import { describe, it, expect } from 'vitest';
import {
  DashboardConfigSchema,
  SavedDashboardSchema,
  validateDashboardConfig,
  emptyConfig,
} from './dashboardSchema';

describe('dashboardSchema', () => {
  it('emptyConfig() round-trips through DashboardConfigSchema', () => {
    const cfg = emptyConfig();
    const parsed = DashboardConfigSchema.safeParse(cfg);
    expect(parsed.success).toBe(true);
    expect(parsed.data.version).toBe(1);
    expect(parsed.data.blocks).toEqual([]);
    expect(parsed.data.layout).toEqual([]);
  });

  it('accepts a minimal valid block (kpi)', () => {
    const v = validateDashboardConfig({
      version: 1,
      layout: [{ i: 'b1', x: 0, y: 0, w: 4, h: 3 }],
      blocks: [
        {
          id: 'b1',
          type: 'kpi',
          title: 'Total goals',
          data: {
            dataset: 'goals',
            measure: { agg: 'count' },
          },
        },
      ],
    });
    expect(v.ok).toBe(true);
    expect(v.value.blocks.length).toBe(1);
  });

  it('rejects an unknown block type', () => {
    const v = validateDashboardConfig({
      version: 1,
      blocks: [{ id: 'b1', type: 'bogus', title: 'x' }],
    });
    expect(v.ok).toBe(false);
    expect(v.errors.some((e) => e.path.includes('type'))).toBe(true);
  });

  it('rejects layout items with invalid coordinates', () => {
    const v = validateDashboardConfig({
      blocks: [],
      layout: [{ i: 'b1', x: -1, y: 0, w: 20, h: 1 }],
    });
    expect(v.ok).toBe(false);
  });

  it('SavedDashboardSchema requires a title', () => {
    const parsed = SavedDashboardSchema.safeParse({
      config: emptyConfig(),
    });
    expect(parsed.success).toBe(false);
  });

  it('SavedDashboardSchema accepts a complete payload', () => {
    const parsed = SavedDashboardSchema.safeParse({
      title: 'My dashboard',
      description: 'Some text',
      visibility: 'private',
      config: emptyConfig(),
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a markdown block with body > 5000 chars', () => {
    const longBody = 'x'.repeat(5001);
    const v = validateDashboardConfig({
      version: 1,
      blocks: [{ id: 'm', type: 'markdown', title: 'Note', body: longBody }],
    });
    expect(v.ok).toBe(false);
  });

  it('accepts a trend block with time_bucket', () => {
    const v = validateDashboardConfig({
      version: 1,
      blocks: [
        {
          id: 't',
          type: 'trend',
          title: 'Cost over time',
          data: {
            dataset: 'agent_jobs',
            measure: { agg: 'sum', field: 'cost_usd' },
            group_by: { field: 'created_at', time_bucket: 'day' },
          },
        },
      ],
    });
    expect(v.ok).toBe(true);
  });

  it('accepts a custom_query block with template_id', () => {
    const v = validateDashboardConfig({
      version: 1,
      blocks: [
        {
          id: 'cq',
          type: 'custom_query',
          title: 'Custom',
          custom_query: { template_id: 'top_failed_jobs', params: { window_days: 7 } },
        },
      ],
    });
    expect(v.ok).toBe(true);
  });
});
