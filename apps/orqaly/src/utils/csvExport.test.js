/**
 * Tests for CSV export utilities.
 */
import { describe, it, expect } from 'vitest';
import { rowsToCsv } from './csvExport';

describe('rowsToCsv', () => {
  it('handles empty rows', () => {
    const csv = rowsToCsv([]);
    expect(csv).toBe('group,value,count\n');
  });

  it('writes basic rows', () => {
    const csv = rowsToCsv([
      { group: 'active', value: 12, count: 5 },
      { group: 'done', value: 8, count: 3 },
    ]);
    expect(csv).toBe('group,value,count\nactive,12,5\ndone,8,3\n');
  });

  it('escapes commas and quotes', () => {
    const csv = rowsToCsv([{ group: 'with, comma', value: 'has "quote"', count: 1 }]);
    expect(csv).toContain('"with, comma"');
    expect(csv).toContain('"has ""quote"""');
  });

  it('uses custom headers', () => {
    const csv = rowsToCsv([{ group: 'g1', value: 1, count: 1 }], {
      groupHeader: 'status',
      valueHeader: 'sum_cost_usd',
    });
    expect(csv.startsWith('status,sum_cost_usd,count\n')).toBe(true);
  });
});
