import { describe, it, expect } from 'vitest';
import { formatPercent, formatCurrency, formatDate, formatDateTime } from './formatters.js';

describe('formatters', () => {
  it('formatPercent formats numbers', () => {
    expect(formatPercent(12.34)).toBe('12.3%');
    expect(formatPercent(1)).toBe('1.0%');
  });

  it('formatCurrency formats numbers', () => {
    expect(formatCurrency(1234.5)).toContain('1,234.50');
  });

  it('formatDate returns dash for empty', () => {
    expect(formatDate(null)).toBe('—');
  });

  it('formatDateTime formats as dd/mm/yy - hh:mm:ss (zero-padded)', () => {
    // Local time; build a fixed local date to avoid TZ flakiness.
    const d = new Date(2026, 5, 6, 9, 4, 3); // 6 Jun 2026 09:04:03 local
    expect(formatDateTime(d)).toBe('06/06/26 - 09:04:03');
  });

  it('formatDateTime returns dash for missing/invalid', () => {
    expect(formatDateTime(null)).toBe('-');
    expect(formatDateTime('not-a-date')).toBe('-');
  });
});
