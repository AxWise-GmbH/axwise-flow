import { describe, it, expect } from 'vitest';
import { cardGridColumns } from './cardGridColumns';

const ADVANCED = { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' };

describe('cardGridColumns', () => {
  it('caps at 2 columns in simple mode', () => {
    expect(cardGridColumns(true, ADVANCED)).toEqual({ xs: '1fr', sm: 'repeat(2, 1fr)' });
  });

  it('returns the advanced template unchanged in advanced mode', () => {
    expect(cardGridColumns(false, ADVANCED)).toBe(ADVANCED);
  });
});
