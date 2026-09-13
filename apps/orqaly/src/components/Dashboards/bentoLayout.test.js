import { describe, it, expect } from 'vitest';
import { computeBentoLayout, bentoSizeFor } from './bentoLayout';

const b = (id, type) => ({ id, type });

// Helper: assert every row sums to exactly 12 columns (no horizontal gaps).
function assertRowsSumTo12(layout) {
  // Group by y, sum widths
  const rows = new Map();
  for (const item of layout) {
    if (!rows.has(item.y)) rows.set(item.y, 0);
    rows.set(item.y, rows.get(item.y) + item.w);
  }
  for (const [y, sum] of rows) {
    expect(sum, `row at y=${y} should sum to 12`).toBe(12);
  }
}

describe('computeBentoLayout', () => {
  it('returns empty array for empty input', () => {
    expect(computeBentoLayout([])).toEqual([]);
    expect(computeBentoLayout(null)).toEqual([]);
    expect(computeBentoLayout(undefined)).toEqual([]);
  });

  it('packs 4 KPIs into one row at x=0,3,6,9', () => {
    const layout = computeBentoLayout([
      b('k1', 'kpi'),
      b('k2', 'kpi'),
      b('k3', 'kpi'),
      b('k4', 'kpi'),
    ]);
    expect(layout).toHaveLength(4);
    expect(layout.map((it) => it.x)).toEqual([0, 3, 6, 9]);
    expect(layout.every((it) => it.y === 0)).toBe(true);
    expect(layout.every((it) => it.w === 3)).toBe(true);
    expect(layout.every((it) => it.h === 2)).toBe(true);
    assertRowsSumTo12(layout);
  });

  it('expands KPIs to fill 12 when there are fewer than 4', () => {
    const layout = computeBentoLayout([b('k1', 'kpi'), b('k2', 'kpi'), b('k3', 'kpi')]);
    // 12 / 3 = 4 each
    expect(layout.every((it) => it.w === 4)).toBe(true);
    assertRowsSumTo12(layout);
  });

  it('puts markdown row first as full-width', () => {
    const layout = computeBentoLayout([
      b('m1', 'markdown'),
      b('k1', 'kpi'),
      b('k2', 'kpi'),
      b('k3', 'kpi'),
      b('k4', 'kpi'),
    ]);
    const md = layout.find((it) => it.i === 'm1');
    expect(md.x).toBe(0);
    expect(md.y).toBe(0);
    expect(md.w).toBe(12);
    // KPIs start below the markdown
    const k1 = layout.find((it) => it.i === 'k1');
    expect(k1.y).toBeGreaterThan(0);
    assertRowsSumTo12(layout);
  });

  it('pairs trend + pie as 8+4', () => {
    const layout = computeBentoLayout([b('t', 'trend'), b('p', 'pie')]);
    const t = layout.find((it) => it.i === 't');
    const p = layout.find((it) => it.i === 'p');
    expect(t.w).toBe(8);
    expect(p.w).toBe(4);
    expect(t.x + t.w).toBe(p.x); // no gap
    assertRowsSumTo12(layout);
  });

  it('lays out 3 media blocks as 4+4+4', () => {
    const layout = computeBentoLayout([b('a', 'pie'), b('b', 'breakdown'), b('c', 'alerts')]);
    expect(layout.every((it) => it.w === 4)).toBe(true);
    expect(layout.map((it) => it.x).sort((a, b) => a - b)).toEqual([0, 4, 8]);
    assertRowsSumTo12(layout);
  });

  it('lays out 4 media as 2×2 grid (6+6 / 6+6)', () => {
    const layout = computeBentoLayout([
      b('a', 'pie'),
      b('b', 'breakdown'),
      b('c', 'alerts'),
      b('d', 'trend'),
    ]);
    expect(layout).toHaveLength(4);
    expect(layout.every((it) => it.w === 6)).toBe(true);
    assertRowsSumTo12(layout);
  });

  it('full mixed bento — markdown + 4 kpis + trend + pie + table — every row sums to 12', () => {
    const layout = computeBentoLayout([
      b('md', 'markdown'),
      b('k1', 'kpi'),
      b('k2', 'kpi'),
      b('k3', 'kpi'),
      b('k4', 'kpi'),
      b('tr', 'trend'),
      b('pi', 'pie'),
      b('tb', 'table'),
    ]);
    expect(layout).toHaveLength(8);
    assertRowsSumTo12(layout);
    // Markdown at y=0
    expect(layout.find((it) => it.i === 'md').y).toBe(0);
    // KPIs all at the same y
    const kpiYs = ['k1', 'k2', 'k3', 'k4'].map((id) => layout.find((it) => it.i === id).y);
    expect(new Set(kpiYs).size).toBe(1);
    // Table full-width
    const tb = layout.find((it) => it.i === 'tb');
    expect(tb.w).toBe(12);
  });

  it('5 KPIs → 4 in row 1, 5th in row 2 expanded to 12', () => {
    const layout = computeBentoLayout([
      b('k1', 'kpi'),
      b('k2', 'kpi'),
      b('k3', 'kpi'),
      b('k4', 'kpi'),
      b('k5', 'kpi'),
    ]);
    expect(layout).toHaveLength(5);
    const k5 = layout.find((it) => it.i === 'k5');
    expect(k5.w).toBe(12);
    assertRowsSumTo12(layout);
  });

  it('every block gets a layout entry', () => {
    const blocks = [
      b('a', 'kpi'),
      b('b', 'kpi'),
      b('c', 'kpi'),
      b('d', 'kpi'),
      b('e', 'trend'),
      b('f', 'pie'),
      b('g', 'breakdown'),
      b('h', 'alerts'),
      b('i', 'table'),
      b('j', 'markdown'),
    ];
    const layout = computeBentoLayout(blocks);
    expect(layout).toHaveLength(blocks.length);
    const ids = new Set(layout.map((it) => it.i));
    blocks.forEach((b) => expect(ids.has(b.id)).toBe(true));
  });

  it('bentoSizeFor returns sensible defaults', () => {
    expect(bentoSizeFor('kpi')).toEqual({ w: 3, h: 2 });
    expect(bentoSizeFor('trend')).toEqual({ w: 8, h: 5 });
    expect(bentoSizeFor('table')).toEqual({ w: 12, h: 6 });
    expect(bentoSizeFor('unknown')).toEqual({ w: 6, h: 5 });
  });
});
