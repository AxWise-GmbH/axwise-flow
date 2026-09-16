import { describe, it, expect } from 'vitest';
import { stripRouteKey } from './route-key.js';

describe('stripRouteKey', () => {
  it('removes the `path` router key but keeps every other query param', () => {
    const req = { query: { path: 'github-agents-import', url: 'https://github.com/o/r', offset: '0' } };
    stripRouteKey(req);
    expect('path' in req.query).toBe(false);
    expect(req.query.url).toBe('https://github.com/o/r');
    expect(req.query.offset).toBe('0');
  });

  it('is a no-op when there is no `path` key', () => {
    const req = { query: { url: 'x' } };
    stripRouteKey(req);
    expect(req.query).toEqual({ url: 'x' });
  });

  it('replaces a getter-only req.query (Express 5) without throwing', () => {
    const req = {};
    Object.defineProperty(req, 'query', {
      get() {
        return { path: 'concilium', a: '1' };
      },
      configurable: true,
    });
    stripRouteKey(req);
    expect('path' in req.query).toBe(false);
    expect(req.query.a).toBe('1');
  });

  it('tolerates missing / non-object query', () => {
    expect(() => stripRouteKey({})).not.toThrow();
    expect(() => stripRouteKey({ query: null })).not.toThrow();
    expect(() => stripRouteKey(null)).not.toThrow();
  });
});
