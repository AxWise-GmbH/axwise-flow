import { matchRoutes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { gcpRoutePaths, gcpRouter } from '../../gcp-routes';
import * as standartCopy from './standartCopy';

function collectInternalLinks(value, trail, links, seen) {
  if (!value || typeof value !== 'object') return;
  if (seen.has(value)) return;
  seen.add(value);

  if (Array.isArray(value)) {
    value.forEach((item, index) => collectInternalLinks(item, `${trail}[${index}]`, links, seen));
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    const childTrail = `${trail}.${key}`;
    if (key === 'to' && typeof child === 'string' && child.startsWith('/')) {
      links.push({ source: childTrail, to: child });
      continue;
    }
    collectInternalLinks(child, childTrail, links, seen);
  }
}

function internalStandartLinks() {
  const links = [];
  const seen = new WeakSet();
  for (const [name, value] of Object.entries(standartCopy)) {
    collectInternalLinks(value, name, links, seen);
  }
  return [...new Map(links.map((link) => [link.to, link])).values()].sort((a, b) =>
    a.to.localeCompare(b.to)
  );
}

describe('Standart landing route contract', () => {
  it('keeps every internal CTA on a deliberate, non-404 GCP route', () => {
    const links = internalStandartLinks();
    expect(links.length).toBeGreaterThan(10);

    for (const link of links) {
      const routeMatches = matchRoutes(gcpRouter.routes, link.to) || [];
      const matchedPath = routeMatches.at(-1)?.route.path;
      expect(
        matchedPath,
        `${link.to} from ${link.source} must resolve to an explicit GCP route`
      ).toBeTruthy();
      expect(
        matchedPath,
        `${link.to} from ${link.source} fell through to the GCP 404 route`
      ).not.toBe('*');
    }
  });

  it('keeps navigation and CTAs inside the explicit launch route manifest', () => {
    const allowed = new Set(gcpRoutePaths.filter((path) => !path.includes(':')));
    const links = internalStandartLinks();

    expect(links.map((link) => link.to)).toEqual(
      expect.arrayContaining(['/assistant', '/goals', '/login', '/signup'])
    );
    expect(links.filter((link) => !allowed.has(link.to))).toEqual([]);
  });
});
