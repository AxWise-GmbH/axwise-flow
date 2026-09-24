/*
 * Translated editions of long texts (news articles, legal documents) keep the English
 * shape: the same blocks in the same order, the same ids and region tags, the same
 * {company.x} blanks and the same link addresses. Only the words change.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LANGUAGES } from './languages';

const here = dirname(fileURLToPath(import.meta.url));
const newsDir = join(here, '..', 'pages', 'news');
const legalDir = join(here, '..', 'pages', 'legal', 'docs');
const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const codes = LANGUAGES.map((language) => language.code).filter((code) => code !== 'en');

const blanks = (text) => [...String(text).matchAll(/\{[\w.]+\}/g)].map(([whole]) => whole).sort();
const links = (text) => [...String(text).matchAll(/\]\(([^)]+)\)/g)].map(([, url]) => url);

// Every string with its path; ids, tags and such compared as they are.
function strings(value, path = '', out = []) {
  if (typeof value === 'string') out.push([path, value]);
  else if (Array.isArray(value)) value.forEach((item, i) => strings(item, `${path}.${i}`, out));
  else if (value && typeof value === 'object')
    Object.entries(value).forEach(([key, item]) => strings(item, `${path}.${key}`, out));
  return out;
}

const SAME = new Set(['type', 'id', 'only', 'slug', 'effective', 'version']);

function skeleton(value) {
  if (typeof value === 'string') return 'text';
  if (Array.isArray(value)) return value.map(skeleton);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, SAME.has(key) ? item : skeleton(item)])
    );
  return value;
}

function expectSameShape(english, translated, label) {
  expect(skeleton(translated), `${label} shape`).toEqual(skeleton(english));
  const theirs = new Map(strings(translated));
  for (const [path, text] of strings(english)) {
    const said = theirs.get(path);
    expect(said?.trim().length > 0, `${label}${path} is empty`).toBe(true);
    expect(blanks(said), `${label}${path} blanks`).toEqual(blanks(text));
    expect(links(said), `${label}${path} links`).toEqual(links(text));
    if (text.includes('Orqanix')) expect(said, `${label}${path} keeps Orqanix`).toContain('Orqanix');
  }
}

describe('translated news articles', () => {
  const english = read(join(newsDir, 'news.bodies.json'));
  for (const code of codes) {
    const path = join(newsDir, 'bodies', `${code}.json`);
    it(`${code} has every article, in the English shape`, () => {
      expect(existsSync(path), path).toBe(true);
      expectSameShape(english, read(path), `news ${code}`);
    });
  }
});

describe('translated legal documents', () => {
  const slugs = readdirSync(legalDir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => name.slice(0, -5));
  for (const code of codes) {
    it(`${code} has every document, in the English shape, with the English review notes`, () => {
      for (const slug of slugs) {
        const path = join(legalDir, code, `${slug}.json`);
        expect(existsSync(path), path).toBe(true);
        const english = read(join(legalDir, `${slug}.json`));
        const translated = read(path);
        // The review notes are for us, not the reader: copied as they are.
        expect(translated.meta.review, `${code}/${slug} review`).toEqual(english.meta.review);
        const { review: _a, ...enMeta } = english.meta;
        const { review: _b, ...trMeta } = translated.meta;
        expectSameShape({ ...english, meta: enMeta }, { ...translated, meta: trMeta }, `${code}/${slug}`);
      }
    });
  }
});
