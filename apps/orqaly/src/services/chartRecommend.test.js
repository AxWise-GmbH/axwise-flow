/**
 * Tests for chartRecommend rule engine.
 */
import { describe, it, expect } from 'vitest';
import { recommend, classifyShape, classifyChartType } from './chartRecommend';

describe('chartRecommend', () => {
  it('no measure → scalar shape', () => {
    expect(classifyShape({})).toBe('scalar');
  });

  it('no group_by → scalar shape', () => {
    expect(classifyShape({ measure: 'count' })).toBe('scalar');
  });

  it('group_by on a *_at field → timeseries', () => {
    expect(classifyShape({ measure: 'count', group_by: { field: 'created_at' } })).toBe(
      'timeseries'
    );
  });

  it('group_by with time_bucket → timeseries even if field name is bland', () => {
    expect(
      classifyShape({
        measure: 'count',
        group_by: { field: 'day', time_bucket: 'day' },
      })
    ).toBe('timeseries');
  });

  it('categorical small (≤6) vs large (>6)', () => {
    expect(
      classifyShape({
        measure: 'count',
        group_by: { field: 'status' },
        cardinality: 5,
      })
    ).toBe('categorical_small');
    expect(
      classifyShape({
        measure: 'count',
        group_by: { field: 'status' },
        cardinality: 12,
      })
    ).toBe('categorical_large');
  });

  describe('recommend()', () => {
    it('scalar → recommends kpi, blocks pie', () => {
      const r = recommend({});
      expect(r.recommended).toContain('kpi');
      expect(r.blocked).toContain('pie');
    });

    it('timeseries → recommends trend, blocks pie', () => {
      const r = recommend({
        measure: 'sum:cost_usd',
        group_by: { field: 'created_at' },
      });
      expect(r.recommended).toContain('trend');
      expect(r.blocked).toContain('pie');
    });

    it('categorical small → recommends breakdown + pie', () => {
      const r = recommend({
        measure: 'count',
        group_by: { field: 'status' },
        cardinality: 4,
      });
      expect(r.recommended).toContain('breakdown');
      expect(r.recommended).toContain('pie');
    });

    it('categorical large → warns pie', () => {
      const r = recommend({
        measure: 'count',
        group_by: { field: 'status' },
        cardinality: 20,
      });
      expect(r.warned).toContain('pie');
      expect(r.recommended).toContain('breakdown');
    });
  });

  it('classifyChartType returns recommended/warned/blocked', () => {
    expect(classifyChartType('kpi', { measure: undefined, group_by: undefined })).toBe(
      'recommended'
    );
    expect(
      classifyChartType('pie', {
        measure: 'sum:cost_usd',
        group_by: { field: 'created_at' },
      })
    ).toBe('blocked');
  });
});
