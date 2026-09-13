/**
 * Tests for dashboard HTML renderer.
 */
import { describe, it, expect } from 'vitest';
import { renderDashboardHtml } from './dashboard-html-render';

describe('renderDashboardHtml', () => {
  it('renders a minimal HTML document', () => {
    const html = renderDashboardHtml({
      dashboard: {
        title: 'My dashboard',
        description: 'A test',
        config: { blocks: [] },
      },
      resultsById: {},
    });
    expect(html).toMatch(/<!doctype html>/i);
    expect(html).toContain('My dashboard');
    expect(html).toContain('A test');
  });

  it('escapes HTML in the title', () => {
    const html = renderDashboardHtml({
      dashboard: {
        title: '<script>alert(1)</script>',
        config: { blocks: [] },
      },
      resultsById: {},
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('renders KPI block with formatted value', () => {
    const html = renderDashboardHtml({
      dashboard: {
        title: 'D',
        config: {
          blocks: [
            { id: 'k1', type: 'kpi', title: 'Total spend', data: { measure: { agg: 'sum', field: 'cost_usd' } } },
          ],
        },
      },
      resultsById: { k1: { total: 1234.56, rows: [], sample_count: 10 } },
    });
    expect(html).toContain('Total spend');
    expect(html).toMatch(/\$1\.2k|\$1,234/);
  });

  it('renders breakdown block as CSS bars', () => {
    const html = renderDashboardHtml({
      dashboard: {
        title: 'D',
        config: {
          blocks: [
            { id: 'b1', type: 'breakdown', title: 'Status', data: { group_by: { field: 'status' } } },
          ],
        },
      },
      resultsById: {
        b1: {
          rows: [
            { group: 'active', value: 10, count: 10 },
            { group: 'done', value: 5, count: 5 },
          ],
          total: 15,
          sample_count: 15,
        },
      },
    });
    expect(html).toContain('Status');
    expect(html).toContain('active');
    expect(html).toContain('done');
    // bar widths derived from max
    expect(html).toMatch(/width:100%/);
    expect(html).toMatch(/width:50%/);
  });

  it('renders error gracefully', () => {
    const html = renderDashboardHtml({
      dashboard: {
        title: 'D',
        config: { blocks: [{ id: 'x', type: 'kpi', title: 'Broken' }] },
      },
      resultsById: { x: { error: 'unknown dataset' } },
    });
    expect(html).toContain('Broken');
    expect(html).toContain('unknown dataset');
  });

  it('includes viewer URL when provided', () => {
    const html = renderDashboardHtml({
      dashboard: { title: 'D', config: { blocks: [] } },
      resultsById: {},
      viewerUrl: 'https://example.com/d/abc',
    });
    expect(html).toContain('https://example.com/d/abc');
    expect(html).toContain('Open in browser');
  });
});
