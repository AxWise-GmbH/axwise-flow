import { describe, it, expect } from 'vitest';
import {
  formatValue,
  formatCell,
  humanizeKey,
  formatDate,
  formatDateShort,
  safeFileName,
  truncate,
} from './format';

describe('formatValue', () => {
  it('returns dash for null and NaN', () => {
    expect(formatValue(null)).toBe('-');
    expect(formatValue(undefined)).toBe('-');
    expect(formatValue('not-a-number')).toBe('not-a-number');
  });

  it('formats currency with abbreviations', () => {
    expect(formatValue(1500, 'currency')).toBe('$1.5k');
    expect(formatValue(2_500_000, 'currency')).toBe('$2.5M');
    expect(formatValue(750, 'currency')).toBe('$750');
  });

  it('formats percent to one decimal', () => {
    expect(formatValue(12.345, 'percent')).toBe('12.3%');
    expect(formatValue(100, 'percent')).toBe('100.0%');
  });

  it('abbreviates large plain numbers', () => {
    expect(formatValue(1500)).toBe('1.5k');
    expect(formatValue(3_400_000)).toBe('3.4M');
  });

  it('keeps small integers as-is', () => {
    expect(formatValue(42)).toBe('42');
  });
});

describe('formatCell', () => {
  it('handles booleans, objects, and progress shapes', () => {
    expect(formatCell(true)).toBe('Yes');
    expect(formatCell(false)).toBe('No');
    expect(formatCell({ value: 5, max: 10 })).toBe('5');
    expect(formatCell(null)).toBe('-');
  });
});

describe('humanizeKey', () => {
  it('splits camelCase and snake_case into readable phrases', () => {
    expect(humanizeKey('totalRevenue')).toBe('Total Revenue');
    expect(humanizeKey('first_name')).toBe('First name');
    expect(humanizeKey('roi')).toBe('Roi');
  });
});

describe('formatDate / formatDateShort', () => {
  it('returns empty string for falsy input', () => {
    expect(formatDate(null)).toBe('');
    expect(formatDateShort(undefined)).toBe('');
  });

  it('formats ISO strings without throwing', () => {
    const iso = '2026-01-15T10:30:00.000Z';
    expect(formatDate(iso)).toMatch(/2026/);
    expect(formatDateShort(iso)).toMatch(/2026/);
  });
});

describe('safeFileName', () => {
  it('keeps alphanumerics and replaces other chars with underscore', () => {
    expect(safeFileName('Finance & Growth Report')).toBe('Finance_Growth_Report');
    expect(safeFileName('')).toBe('report');
  });
});

describe('truncate', () => {
  it('shortens long strings with an ellipsis', () => {
    expect(truncate('abcdefghij', 5)).toBe('abcd…');
  });

  it('returns short strings unchanged', () => {
    expect(truncate('hi', 10)).toBe('hi');
  });
});
