import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { INSTANT_PAGES } from '../src/pages/Landing/instant/pages/instantPages';
import { PUBLIC_LEGAL_LINKS } from '../src/pages/Landing/instant/pages/publicLegalLinks';

const read = (path) => readFileSync(resolve(process.cwd(), path), 'utf8');
const draftRoot = 'src/pages/Landing/instant/pages/legal';

describe('unpublished Legal Center boundary', () => {
  it('preserves the drafts without importing them into either website route tree', () => {
    expect(existsSync(resolve(process.cwd(), draftRoot, 'LegalCenter.jsx'))).toBe(true);
    expect(
      readdirSync(resolve(process.cwd(), draftRoot, 'docs')).filter((name) =>
        name.endsWith('.json')
      )
    ).toHaveLength(17);
    for (const path of ['src/account-routes.jsx', 'src/gcp-routes.jsx', 'src/routes.jsx']) {
      expect(read(path)).not.toMatch(/import\(['"][^'"]*\/legal\//);
      expect(read(path)).not.toContain('<LegalCenter');
    }
    expect(read('src/gcp-routes.jsx')).not.toContain("path: '/instant/legal");
    expect(read('src/account-routes.jsx')).not.toContain("path: '/instant/legal");
  });

  it('keeps footer links and compatibility aliases on the existing notices', () => {
    expect(PUBLIC_LEGAL_LINKS.map(({ to }) => to)).toEqual(['/privacy', '/terms', '/cookies']);
    for (const slug of ['privacy', 'terms']) {
      expect(INSTANT_PAGES.find((page) => page.slug === slug)?.redirect).toBe(`/${slug}`);
    }
    expect(read('src/pages/Landing/instant/InstantFooter.jsx')).not.toContain('/legal/');
  });

  it('does not publish the draft security contact or draft policy files as static assets', () => {
    expect(existsSync(resolve(process.cwd(), draftRoot, 'security.txt.draft'))).toBe(true);
    for (const publicDir of ['public-gcp', 'public']) {
      const files = readdirSync(resolve(process.cwd(), publicDir), { recursive: true });
      expect(files).not.toContain('.well-known/security.txt');
      expect(files.filter((file) => /(?:^|\/)legal\/|\.draft$/.test(file))).toEqual([]);
    }
  });
});
