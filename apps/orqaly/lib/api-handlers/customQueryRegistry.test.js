/**
 * Tests for customQueryRegistry — param validation + registry integrity.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  validateTemplate,
  listTemplates,
  runTemplate,
  catalogForPrompt,
} from './customQueryRegistry';

describe('customQueryRegistry', () => {
  it('listTemplates returns at least one template with required fields', () => {
    const ts = listTemplates();
    expect(ts.length).toBeGreaterThan(0);
    ts.forEach((t) => {
      expect(t.template_id).toBeTruthy();
      expect(t.label).toBeTruthy();
      expect(Array.isArray(t.params)).toBe(true);
    });
  });

  it('validateTemplate rejects unknown templates', () => {
    const v = validateTemplate('definitely_not_real', {});
    expect(v.ok).toBe(false);
    expect(v.error).toMatch(/unknown/i);
  });

  it('validateTemplate accepts valid params', () => {
    const v = validateTemplate('top_failed_jobs', { window_days: 7, limit: 5 });
    expect(v.ok).toBe(true);
    expect(v.params.window_days).toBe(7);
    expect(v.params.limit).toBe(5);
  });

  it('validateTemplate uses defaults when params omitted', () => {
    const v = validateTemplate('top_failed_jobs', {});
    expect(v.ok).toBe(true);
    expect(v.params.window_days).toBe(7);
    expect(v.params.limit).toBe(10);
  });

  it('validateTemplate rejects out-of-range params', () => {
    const v = validateTemplate('top_failed_jobs', { window_days: 1000 });
    expect(v.ok).toBe(false);
  });

  it('catalogForPrompt is JSON-serializable and contains templates', () => {
    const c = catalogForPrompt();
    expect(JSON.stringify(c).length).toBeGreaterThan(20);
    expect(c.some((t) => t.template_id === 'top_failed_jobs')).toBe(true);
  });

  it('runTemplate executes the handler with parsed params', async () => {
    const admin = {
      from: vi.fn(() => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              gte: () => ({
                order: () => ({
                  limit: async () => ({
                    data: [
                      { id: 'j1', type: 'analysis', cost_usd: 12, status: 'failed' },
                      { id: 'j2', type: 'planning', cost_usd: 5, status: 'failed' },
                    ],
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }),
      })),
    };

    const result = await runTemplate({
      admin,
      userId: 'u-1',
      templateId: 'top_failed_jobs',
      params: { window_days: 7, limit: 5 },
    });
    expect(result.rows.length).toBe(2);
    expect(result.total).toBe(17);
    expect(result.sample_count).toBe(2);
  });

  it('runTemplate throws when params are invalid', async () => {
    await expect(
      runTemplate({
        admin: {},
        userId: 'u-1',
        templateId: 'top_failed_jobs',
        params: { window_days: -1 },
      })
    ).rejects.toThrow(/invalid params/i);
  });
});
