import { afterEach, describe, expect, it, vi } from 'vitest';
import { COMPANY } from '../info/company';
import { editionOf, fillCompany, formatLegalDate, legalDocUrl, visibleBlocks } from './legal.docs';
import {
  DEFAULT_REGION,
  FOOTER_LEGAL,
  FOOTER_LEGAL_MORE,
  LEGAL_BASE,
  LEGAL_DOCS,
  LEGAL_GROUPS,
  LEGAL_PRODUCTS,
  PUBLISHED_DOCS,
  REGION_IDS,
  findLegalDoc,
  legalPath,
} from './legal.links';

// The tests read the texts directly; the site fetches them (see legal.docs.js).
const TEXTS = import.meta.glob('./docs/*.json', { eager: true, import: 'default' });
const textOf = (slug) => TEXTS[`./docs/${slug}.json`];
// Language editions: ./docs/<code>/<slug>.json, each a translation of the English text.
const EDITIONS = import.meta.glob('./docs/*/*.json', { eager: true, import: 'default' });

const TYPES = new Set(['p', 'h2', 'h3', 'list', 'table', 'note']);
const ALWAYS_FILLED = new Set(['name', 'email', 'privacyEmail', 'securityEmail']);
// The landing's word rules, plus the names and addresses the site never prints. A company
// name may only arrive through {company.legalName}, which company.js fills.
const BANNED =
  /Orqaly|OrQonics|AxWise|api\.axwise|orqaly-axwise|x-axwise|\b(planned|beta|soon|coming|shield|soc ?2|verified|production|slack|telegram|whatsapp|pin|yubikey)\b|zero hallucination|Built on Goose|Powered by Gemini|undefined|password vault|lorem|TODO|TBD/i;

function blockText(block) {
  if (block.type === 'list') return block.items.join(' ');
  if (block.type === 'table') return [...block.head, ...block.rows.flat()].join(' ');
  return block.text;
}

describe('Legal Center index', () => {
  it('gives every document its own slug, title and path, in a known group and region', () => {
    const slugs = LEGAL_DOCS.map((doc) => doc.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(new Set(LEGAL_DOCS.map((doc) => doc.title)).size).toBe(LEGAL_DOCS.length);
    const groups = LEGAL_GROUPS.map((group) => group.id);
    const products = LEGAL_PRODUCTS.map((product) => product.id);
    for (const doc of LEGAL_DOCS) {
      expect(groups).toContain(doc.group);
      expect(doc.regions.length).toBeGreaterThan(0);
      doc.regions.forEach((region) => expect(REGION_IDS).toContain(region));
      doc.products.forEach((product) => expect(products).toContain(product));
      expect(COMPANY[doc.contact]).toMatch(/@/);
      expect(legalPath(doc.slug, 'eu')).toBe(`${LEGAL_BASE}/eu/${doc.slug}`);
    }
    expect(REGION_IDS).toContain(DEFAULT_REGION);
  });

  it('covers all five products, each with its own terms', () => {
    for (const { id } of LEGAL_PRODUCTS) {
      const docs = LEGAL_DOCS.filter((doc) => doc.products.includes(id));
      expect(docs.map((doc) => doc.slug)).toEqual(
        expect.arrayContaining(['terms', 'privacy', 'acceptable-use'])
      );
      expect(docs.some((doc) => doc.slug.endsWith('-terms') && doc.products.length === 1)).toBe(
        true
      );
    }
  });

  it('keeps the Legal Notice unpublished until the company is filled in', () => {
    const notice = LEGAL_DOCS.find((doc) => doc.slug === 'legal-notice');
    const ready = notice.needs.every((key) => COMPANY[key]);
    expect(Boolean(findLegalDoc('legal-notice'))).toBe(ready);
    expect(FOOTER_LEGAL.some((link) => link.label === 'Legal Notice')).toBe(ready);
  });

  it('links only published documents from the footer, each once', () => {
    const hrefs = [...FOOTER_LEGAL, ...FOOTER_LEGAL_MORE].map((link) => link.to);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(hrefs).toEqual(expect.arrayContaining(PUBLISHED_DOCS.map((doc) => legalPath(doc.slug))));
    expect(hrefs).toHaveLength(PUBLISHED_DOCS.length + 1);
  });
});

describe.each(LEGAL_DOCS.map((doc) => [doc.slug, doc]))('the %s text', (slug, entry) => {
  const text = textOf(slug);

  it('exists, is its own, and carries a date and a version', () => {
    expect(text).toBeDefined();
    expect(text.meta.slug).toBe(slug);
    expect(text.meta.title).toBe(entry.title);
    expect(text.meta.summary.length).toBeGreaterThan(20);
    expect(text.meta.effective).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(text.meta.history[0].version).toBe(text.meta.version);
  });

  it('uses known blocks, unnumbered headings and ids that are unique per version', () => {
    for (const region of entry.regions) {
      const ids = text.blocks
        .filter((block) => (!block.only || block.only === region) && block.id)
        .map((block) => block.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
    for (const block of text.blocks) {
      expect(TYPES.has(block.type)).toBe(true);
      if (block.only) expect(entry.regions).toContain(block.only);
      if (block.type === 'h2' || block.type === 'h3') {
        expect(block.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
        expect(block.text).not.toMatch(/^\s*\d+[.)]\s/);
      }
    }
  });

  it('prints a company fact only in a block that is hidden while the fact is empty', () => {
    for (const block of text.blocks) {
      for (const [, key] of blockText(block).matchAll(/\{company\.([a-zA-Z]+)\}/g)) {
        expect(Object.keys(COMPANY)).toContain(key);
        if (!ALWAYS_FILLED.has(key)) expect(block.needs ?? []).toContain(key);
      }
      (block.needs ?? []).forEach((key) => expect(Object.keys(COMPANY)).toContain(key));
    }
  });

  it('links only to documents and sections that exist', () => {
    const ids = new Set(text.blocks.map((block) => block.id).filter(Boolean));
    for (const block of text.blocks) {
      for (const [, , href] of blockText(block).matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)) {
        const legal = href.match(/^\/instant\/legal\/([a-z-]+)(?:#([a-z0-9-]+))?$/);
        if (legal) {
          expect(LEGAL_DOCS.map((doc) => doc.slug)).toContain(legal[1]);
          if (legal[2]) expect(textOf(legal[1]).blocks.map((b) => b.id)).toContain(legal[2]);
        } else if (href.startsWith('#')) {
          expect(ids.has(href.slice(1))).toBe(true);
        } else {
          expect(href).toMatch(/^(mailto:|https:\/\/)/);
        }
      }
    }
  });

  it('keeps to the site’s word rules', () => {
    const words = [text.meta.title, text.meta.summary, ...text.blocks.map(blockText)].join('\n');
    expect(words).not.toMatch(BANNED);
  });

  it('reads as a whole document in every version it has', () => {
    for (const region of entry.regions) {
      const shown = visibleBlocks(text.blocks, region);
      expect(shown.filter((block) => block.type === 'h2').length).toBeGreaterThan(1);
      // Nothing shown ever prints an empty company fact.
      const printed = [
        ...shown
          .map(blockText)
          .join(' ')
          .matchAll(/\{company\.([a-zA-Z]+)\}/g),
      ];
      printed.forEach(([, key]) => expect(COMPANY[key]).toBeTruthy());
    }
  });
});

describe('visibleBlocks', () => {
  const blocks = [
    { type: 'h2', id: 'who', text: 'Who we are' },
    { type: 'p', text: '{company.legalName} runs Orqanix.', needs: ['legalName'] },
    { type: 'h2', id: 'rights', text: 'Your rights' },
    { type: 'p', text: 'EU rights.', only: 'eu' },
    { type: 'p', text: 'US rights.', only: 'us' },
    { type: 'h2', id: 'eu-only', text: 'Complaints', only: 'eu' },
    { type: 'p', text: 'Your authority.', only: 'eu' },
    { type: 'h2', id: 'sub', text: 'Parent' },
    { type: 'h3', id: 'child', text: 'Child' },
    { type: 'p', text: 'Hidden.', needs: ['vatId'] },
  ];

  it('drops the other version, empty facts, and any heading left with nothing under it', () => {
    const eu = visibleBlocks(blocks, 'eu').map((block) => block.id ?? block.text);
    expect(eu).toEqual(['rights', 'EU rights.', 'eu-only', 'Your authority.']);
    const us = visibleBlocks(blocks, 'us').map((block) => block.id ?? block.text);
    expect(us).toEqual(['rights', 'US rights.']);
  });

  it('fills a company fact, or leaves nothing where it is empty', () => {
    expect(fillCompany('Write to {company.email}.')).toBe(`Write to ${COMPANY.email}.`);
    expect(fillCompany('[{company.vatId}]')).toBe(`[${COMPANY.vatId}]`);
  });
});

describe('loadLegalDoc', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  const reply = (slug) => ({ ok: true, json: async () => ({ meta: { slug }, blocks: [] }) });

  it('fetches a document once, from its own file', async () => {
    const fetch = vi.fn(async () => reply('terms'));
    vi.stubGlobal('fetch', fetch);
    const { loadLegalDoc, legalDocUrl } = await import('./legal.docs');
    expect((await loadLegalDoc('terms')).meta.slug).toBe('terms');
    await loadLegalDoc('terms');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(legalDocUrl('terms'));
    expect(legalDocUrl('terms')).not.toMatch(/^data:/);
  });

  it('fails loudly on a bad or foreign response, and tries again next time', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce(reply('privacy'))
      .mockResolvedValueOnce(reply('terms'));
    vi.stubGlobal('fetch', fetch);
    const { loadLegalDoc } = await import('./legal.docs');
    await expect(loadLegalDoc('terms')).rejects.toThrow(/did not load/);
    await expect(loadLegalDoc('terms')).rejects.toThrow(/not its own/);
    expect((await loadLegalDoc('terms')).meta.slug).toBe('terms');
    await expect(loadLegalDoc('no-such-document')).rejects.toThrow(/No legal text/);
  });

  it('reads the English text, once, for a language without its own edition', async () => {
    const fetch = vi.fn(async () => reply('terms'));
    vi.stubGlobal('fetch', fetch);
    const { loadLegalDoc, legalDocUrl } = await import('./legal.docs');
    expect((await loadLegalDoc('terms', 'xx')).meta.slug).toBe('terms');
    await loadLegalDoc('terms');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(legalDocUrl('terms'));
  });
});

describe('language editions', () => {
  const links = (text) =>
    [text.meta.summary, ...text.blocks.map(blockText)]
      .join('\n')
      .match(/\]\([^)]+\)|\{company\.[a-zA-Z]+\}/g) ?? [];

  // A loop, not it.each: there may be no editions yet.
  it('each translates its English text, shape and all', () => {
    for (const [path, text] of Object.entries(EDITIONS)) {
      const [, code, slug] = path.match(/^\.\/docs\/([^/]+)\/([a-z-]+)\.json$/);
      const english = textOf(slug);
      expect(english, `${path} has no English text`).toBeDefined();
      expect(code).not.toBe('en');
      expect(text.meta.slug).toBe(slug);
      expect(text.meta.effective).toBe(english.meta.effective);
      expect(text.meta.version).toBe(english.meta.version);
      // Same blocks, same ids, same regions and facts; links and company facts kept as written.
      const skeleton = (doc) =>
        doc.blocks.map(({ type, id, only, needs }) => ({ type, id, only, needs }));
      expect(skeleton(text)).toEqual(skeleton(english));
      expect(links(text).sort(), path).toEqual(links(english).sort());
    }
  });

  it('falls back to the English text where a language has no edition', () => {
    expect(editionOf('terms', 'xx')).toBe('en');
    expect(editionOf('terms')).toBe('en');
    expect(legalDocUrl('terms', 'xx')).toBe(legalDocUrl('terms'));
    for (const path of Object.keys(EDITIONS)) {
      const [, code, slug] = path.match(/^\.\/docs\/([^/]+)\/([a-z-]+)\.json$/);
      expect(editionOf(slug, code)).toBe(code);
      expect(legalDocUrl(slug, code)).not.toBe(legalDocUrl(slug));
    }
  });

  it('writes the date in the reader’s language', () => {
    expect(formatLegalDate('2026-09-22')).toBe('22 September 2026');
    expect(formatLegalDate('2026-09-22', 'de')).toBe('22. September 2026');
    expect(formatLegalDate('2026-01-01', 'fr')).toBe('1 janvier 2026');
  });
});
