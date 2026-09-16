import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { loadVercelRewrites, parseVercelRewrites } from './vercel-rewrites.js';

const CWD = process.cwd();
const VERCEL_JSON = path.join(CWD, 'vercel.json');

const bySource = (rewrites, source) => rewrites.find((r) => r.source === source);

describe('parseVercelRewrites', () => {
  it('skips the SPA catch-all', () => {
    const parsed = parseVercelRewrites({
      rewrites: [{ source: '/((?!api/).*)', destination: '/index.html' }],
    });
    expect(parsed).toEqual([]);
  });

  it('skips non-api sources and regex sources', () => {
    const parsed = parseVercelRewrites({
      rewrites: [
        { source: '/about', destination: '/index.html' },
        { source: '/api/(.*)', destination: '/api/app' },
      ],
    });
    expect(parsed).toEqual([]);
  });

  it('parses a plain rewrite into base + staticQuery', () => {
    const [rewrite] = parseVercelRewrites({
      rewrites: [{ source: '/api/invite-user', destination: '/api/app?path=invite-user' }],
    });
    expect(rewrite).toEqual({
      source: '/api/invite-user',
      base: '/api/app',
      staticQuery: { path: 'invite-user' },
      paramQuery: {},
    });
  });

  it('handles a destination with no query string', () => {
    const [rewrite] = parseVercelRewrites({
      rewrites: [{ source: '/api/foo', destination: '/api/app' }],
    });
    expect(rewrite).toMatchObject({ base: '/api/app', staticQuery: {}, paramQuery: {} });
  });

  it('splits static and param query values for the webhook route', () => {
    const [rewrite] = parseVercelRewrites({
      rewrites: [
        {
          source: '/api/communicator/webhook/:platform',
          destination: '/api/communicator?path=webhook-receiver&platform=:platform',
        },
      ],
    });
    expect(rewrite).toEqual({
      source: '/api/communicator/webhook/:platform',
      base: '/api/communicator',
      staticQuery: { path: 'webhook-receiver' },
      paramQuery: { platform: 'platform' },
    });
  });

  it('splits static and param query values for the pipeline route', () => {
    const [rewrite] = parseVercelRewrites({
      rewrites: [
        { source: '/api/pipeline/:action', destination: '/api/app?path=pipeline&action=:action' },
      ],
    });
    expect(rewrite).toMatchObject({
      staticQuery: { path: 'pipeline' },
      paramQuery: { action: 'action' },
    });
  });

  it('sorts param routes after static routes', () => {
    const parsed = parseVercelRewrites({
      rewrites: [
        { source: '/api/pipeline/:action', destination: '/api/app?path=pipeline&action=:action' },
        { source: '/api/health', destination: '/api/app?path=health' },
      ],
    });
    expect(parsed.map((r) => r.source)).toEqual(['/api/health', '/api/pipeline/:action']);
  });

  it('tolerates a missing or malformed rewrites array', () => {
    expect(parseVercelRewrites({})).toEqual([]);
    expect(parseVercelRewrites({ rewrites: [{ source: '/api/x' }] })).toEqual([]);
  });
});

describe('vercel.json (drift guard)', () => {
  const rewrites = loadVercelRewrites(VERCEL_JSON);

  it('parses the real vercel.json', () => {
    expect(rewrites.length).toBeGreaterThan(0);
  });

  // The regression itself: /api/invite-user was live in vercel.json but absent
  // from the dev server's hand-copied table, so creating a user 404'd locally.
  it('includes /api/invite-user', () => {
    expect(bySource(rewrites, '/api/invite-user')).toMatchObject({
      base: '/api/app',
      staticQuery: { path: 'invite-user' },
    });
  });

  it('points every rewrite at a dispatcher that exists on disk', () => {
    for (const { source, base } of rewrites) {
      expect(base, `${source} -> ${base}`).toMatch(/^\/api\/[a-z-]+$/);
      expect(existsSync(path.join(CWD, `${base.slice(1)}.js`)), `${source} -> ${base}.js`).toBe(
        true
      );
    }
  });
});
