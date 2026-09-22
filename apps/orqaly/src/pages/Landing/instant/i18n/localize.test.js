import { describe, expect, it } from 'vitest';
import { localeWords, localize } from './localize';

const DATA = { slug: 'x', title: 'Hi', list: ['a', { text: 'b', href: '/b' }], n: 3 };

describe('localize', () => {
  it('lists every string leaf with its path, skipping ids and links', () => {
    expect(localeWords(DATA, 'sp.x')).toEqual({
      'sp.x.title': 'Hi',
      'sp.x.list.0': 'a',
      'sp.x.list.1.text': 'b',
    });
  });

  it('puts the words of the current language in place, keeping the shape', () => {
    const t = (key, english) => (key === 'sp.x.title' ? 'Hallo' : english);
    expect(localize(DATA, 'sp.x', t)).toEqual({ ...DATA, title: 'Hallo' });
  });
});
