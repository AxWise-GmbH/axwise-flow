import { describe, it, expect } from 'vitest';
import { formatValue } from './KpiGrid';

describe('KpiGrid formatValue', () => {
  it('formats plain numbers with grouping', () => {
    expect(formatValue(45678)).toBe('45,678');
    expect(formatValue(12)).toBe('12');
  });

  it('formats currency', () => {
    expect(formatValue(1234, 'currency')).toBe('$1,234');
  });

  it('formats compact magnitudes', () => {
    expect(formatValue(24800000, 'currencyCompact')).toBe('$24.8M');
    expect(formatValue(12400000, 'compact')).toBe('12.4M');
    expect(formatValue(45678, 'compact')).toBe('45.7k');
    expect(formatValue(820, 'compact')).toBe('820');
  });

  it('formats percentages', () => {
    expect(formatValue(0.38, 'percent')).toBe('0.4%');
    expect(formatValue(68.5, 'percent')).toBe('68.5%');
  });

  it('returns a dash for nullish values', () => {
    expect(formatValue(null)).toBe('-');
    expect(formatValue(undefined)).toBe('-');
  });
});
