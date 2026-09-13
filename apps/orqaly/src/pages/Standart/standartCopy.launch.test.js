import { describe, expect, it } from 'vitest';
import * as copy from './standartCopy';

const text = JSON.stringify(copy).toLowerCase();

describe('Standart launch copy', () => {
  it('names the available launch product', () => {
    expect(text).toContain('personal');
    expect(text).toContain('assistant');
    expect(text).toContain('durable goal');
    expect(text).toContain('agents');
    expect(text).toContain('knowledge');
    expect(text).toContain('gcp');
  });

  it.each([
    ['included launch credits', '$50'],
    ['marketplace', 'marketplace'],
    ['provider failover', 'failover'],
    ['provider catalog', 'providers'],
    ['legacy tool-count promise', '80 business tools'],
    ['team billing', 'team billing'],
    ['Supabase accounts', 'supabase'],
    ['Vercel hosting', 'vercel'],
  ])('does not advertise %s', (_claim, phrase) => {
    expect(text).not.toContain(phrase.toLowerCase());
  });
});
