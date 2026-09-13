import { describe, it, expect } from 'vitest';
import { sameMembers, sameSequence, templateMatches, groupBlockRows } from './blockTemplates';

describe('sameMembers', () => {
  it('is order-independent', () => {
    expect(sameMembers(['a', 'b'], ['b', 'a'])).toBe(true);
    expect(sameMembers(['a'], ['a', 'b'])).toBe(false);
    expect(sameMembers([], [])).toBe(true);
  });
});

describe('sameSequence', () => {
  it('is order-sensitive', () => {
    expect(sameSequence(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(sameSequence(['a', 'b'], ['b', 'a'])).toBe(false);
  });
});

describe('templateMatches', () => {
  const tpl = { hidden: ['b'], order: ['a', 'b', 'c'], widths: ['a'] };

  it('matches identical layout (hidden order ignored)', () => {
    expect(templateMatches(tpl, new Set(['b']), ['a', 'b', 'c'], new Set(['a']))).toBe(true);
  });

  it('fails when hidden set differs', () => {
    expect(templateMatches(tpl, new Set([]), ['a', 'b', 'c'], new Set(['a']))).toBe(false);
  });

  it('fails when widths differ', () => {
    expect(templateMatches(tpl, new Set(['b']), ['a', 'b', 'c'], new Set())).toBe(false);
  });

  it('fails when order sequence differs', () => {
    expect(templateMatches(tpl, new Set(['b']), ['b', 'a', 'c'], new Set(['a']))).toBe(false);
  });

  it('ignores ids the template does not know about', () => {
    const t = { hidden: [], order: ['a', 'b'], widths: [] };
    expect(templateMatches(t, new Set(), ['a', 'b', 'zzz'], new Set())).toBe(true);
  });

  it('returns false for a null template', () => {
    expect(templateMatches(null, new Set(), [], new Set())).toBe(false);
  });
});

describe('groupBlockRows', () => {
  const defs = (ids) => ids.map((id) => ({ id }));

  it('pairs two consecutive half-width blocks', () => {
    const rows = groupBlockRows(defs(['a', 'b', 'c']), new Set(['a', 'b']));
    expect(rows).toEqual([[{ id: 'a' }, { id: 'b' }], [{ id: 'c' }]]);
  });

  it('renders a lone half-width block on its own row', () => {
    const rows = groupBlockRows(defs(['a', 'c']), new Set(['a']));
    expect(rows).toEqual([[{ id: 'a' }], [{ id: 'c' }]]);
  });

  it('keeps full-width blocks one per row', () => {
    const rows = groupBlockRows(defs(['a', 'b']), new Set());
    expect(rows).toEqual([[{ id: 'a' }], [{ id: 'b' }]]);
  });
});
