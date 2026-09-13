import { formatTokens, formatTokensOrZero, formatTokenSpend } from './formatTokens';

describe('formatTokens', () => {
  it('returns null for zero or missing', () => {
    expect(formatTokens(0)).toBeNull();
    expect(formatTokens(null)).toBeNull();
  });

  it('formats thousands and millions', () => {
    expect(formatTokens(1500)).toBe('1.5k');
    expect(formatTokens(2_500_000)).toBe('2.5M');
    expect(formatTokens(42)).toBe('42');
  });
});

describe('formatTokensOrZero', () => {
  it('returns zero string for missing values', () => {
    expect(formatTokensOrZero(0)).toBe('0');
    expect(formatTokensOrZero(null)).toBe('0');
  });
});

describe('formatTokenSpend', () => {
  it('combines tokens and cost', () => {
    expect(formatTokenSpend(1500, 0.0012)).toBe('1.5k · $0.0012');
  });

  it('returns tokens label when cost absent', () => {
    expect(formatTokenSpend(0, 0)).toBe('0 tokens');
  });
});
