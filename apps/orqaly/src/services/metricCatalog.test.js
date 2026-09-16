/**
 * Tests for metricCatalog — integrity + validateAgainstCatalog.
 */
import { describe, it, expect } from 'vitest';
import {
  CATALOG,
  validateAgainstCatalog,
  dimensionField,
  dimensionBuckets,
  parseMeasure,
  catalogForPrompt,
} from './metricCatalog';

describe('metricCatalog', () => {
  it('every dataset has at least one measure and one dimension', () => {
    for (const [key, def] of Object.entries(CATALOG)) {
      expect(def.measures.length, `${key}.measures`).toBeGreaterThan(0);
      expect(def.dimensions.length, `${key}.dimensions`).toBeGreaterThan(0);
      expect(typeof def.label).toBe('string');
    }
  });

  it('every filter key is a known dimension field', () => {
    for (const [key, def] of Object.entries(CATALOG)) {
      const dimFields = def.dimensions.map(dimensionField);
      for (const f of def.filters) {
        expect(dimFields, `${key} dimensions don't expose filter ${f}`).toContain(f);
      }
    }
  });

  it('dimensionField strips bucket suffix', () => {
    expect(dimensionField('created_at:day|week|month')).toBe('created_at');
    expect(dimensionField('status')).toBe('status');
  });

  it('dimensionBuckets returns allowed buckets', () => {
    expect(dimensionBuckets('created_at:day|week|month')).toEqual(['day', 'week', 'month']);
    expect(dimensionBuckets('status')).toEqual([]);
  });

  it('parseMeasure handles count + agg:field', () => {
    expect(parseMeasure('count')).toEqual({ agg: 'count' });
    expect(parseMeasure('sum:cost_usd')).toEqual({ agg: 'sum', field: 'cost_usd' });
  });

  describe('validateAgainstCatalog', () => {
    it('accepts a valid combo', () => {
      expect(
        validateAgainstCatalog({
          dataset: 'llm_usage',
          measure: { agg: 'sum', field: 'estimated_cost_usd' },
          group_by: { field: 'created_at', time_bucket: 'day' },
          filters: { provider: 'anthropic' },
        }).ok
      ).toBe(true);
    });

    it('normalizes count + bogus field to a clean key', () => {
      // Even when an LLM produces { agg:'count', field:'*' }, validation should succeed
      // because measureKey() strips the field for count.
      expect(
        validateAgainstCatalog({
          dataset: 'llm_usage',
          measure: { agg: 'count', field: '*' },
        }).ok
      ).toBe(true);
    });

    it('rejects unknown dataset', () => {
      const r = validateAgainstCatalog({ dataset: 'unknown' });
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/dataset/i);
    });

    it('rejects unknown measure', () => {
      const r = validateAgainstCatalog({
        dataset: 'llm_usage',
        measure: { agg: 'sum', field: 'mystery' },
      });
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/measure/i);
    });

    it('rejects unknown group_by', () => {
      const r = validateAgainstCatalog({
        dataset: 'llm_usage',
        measure: { agg: 'count' },
        group_by: { field: 'mystery' },
      });
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/group_by/i);
    });

    it('rejects disallowed time_bucket', () => {
      const r = validateAgainstCatalog({
        dataset: 'llm_usage',
        measure: { agg: 'count' },
        group_by: { field: 'created_at', time_bucket: 'year' },
      });
      expect(r.ok).toBe(false);
    });

    it('rejects disallowed filter key', () => {
      const r = validateAgainstCatalog({
        dataset: 'llm_usage',
        measure: { agg: 'count' },
        filters: { naughty: 'val' },
      });
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/filter/i);
    });
  });

  it('catalogForPrompt is JSON-serializable and contains known datasets', () => {
    const c = catalogForPrompt();
    const json = JSON.stringify(c);
    expect(json.length).toBeGreaterThan(50);
    expect(Object.keys(c)).toContain('goals');
    expect(Object.keys(c)).toContain('llm_usage');
  });
});
