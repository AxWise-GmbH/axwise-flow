/*
 * The word list. English lives in the code (t('key', 'English')); this test gathers it into
 * the English files (locales/en.json and locales/<area>/en.json) translators work from, and
 * checks every other language against them.
 *
 *   I18N_WRITE=1 npx vitest run src/pages/Landing/instant/i18n/i18n.test.js   (rewrites en.json)
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LANGUAGES } from './languages';
import { AREAS } from './useT';

const here = dirname(fileURLToPath(import.meta.url));
const instantDir = join(here, '..');
const landingDir = join(instantDir, '..');
const localesDir = join(here, 'locales');

// Names that stay as they are in every language.
const KEEP = ['Orqanix', 'macOS', 'Gemini', 'OpenAI', 'Anthropic'];

function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : sourceFiles(path);
    return /\.(jsx?|mjs)$/.test(entry.name) && !/\.test\.jsx?$/.test(entry.name) ? [path] : [];
  });
}

const LITERAL = String.raw`('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|\x60(?:\\.|[^\x60\\$])*\x60)`;
const CALL = new RegExp(String.raw`\bt\(\s*` + LITERAL + String.raw`\s*,\s*` + LITERAL, 'g');
// Our own source, so evaluating a string literal is safe.
const unquote = (literal) => new Function(`return ${literal}`)();

function scanned() {
  const words = {};
  const clashes = [];
  const files = [
    ...sourceFiles(instantDir),
    join(landingDir, 'simple', 'DesktopDownload.jsx'),
    join(landingDir, 'LandingPageInstant.jsx'),
  ];
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const [, key, english] of text.matchAll(CALL)) {
      const k = unquote(key);
      const e = unquote(english);
      if (k in words && words[k] !== e) clashes.push(`${k} (${relative(instantDir, file)})`);
      words[k] = e;
    }
  }
  return { words, clashes };
}

async function dataWords() {
  const modules = import.meta.glob('./words/*.js', { eager: true });
  return Object.assign({}, ...Object.values(modules).map((module) => module.default()));
}

async function english() {
  const { words, clashes } = scanned();
  const all = { ...words, ...(await dataWords()) };
  return { words: Object.fromEntries(Object.entries(all).sort(([a], [b]) => a.localeCompare(b))), clashes };
}

// '' is the core file (home, bar, menus, footer); the rest are the parts in useT.js.
const PARTS = ['', ...AREAS];
const fileOf = (part, code) => join(localesDir, part, `${code}.json`);
const partOf = (key) => (AREAS.includes(key.split('.')[0]) ? key.split('.')[0] : '');
const partWords = (words, part) =>
  Object.fromEntries(Object.entries(words).filter(([key]) => partOf(key) === part));

const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map(([, name]) => name).sort();

describe('landing words', () => {
  it('each key has one English text', async () => {
    const { clashes } = await english();
    expect(clashes).toEqual([]);
  });

  it('the English files are the lists the code uses, one per part of the site', async () => {
    const { words } = await english();
    for (const part of PARTS) {
      const mine = partWords(words, part);
      const path = fileOf(part, 'en');
      if (process.env.I18N_WRITE) {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, `${JSON.stringify(mine, null, 2)}\n`);
      }
      expect(JSON.parse(readFileSync(path, 'utf8')), path).toEqual(mine);
    }
  });

  const source = (part) => JSON.parse(readFileSync(fileOf(part, 'en'), 'utf8'));

  const pairs = LANGUAGES.filter((language) => language.code !== 'en').flatMap(({ code }) =>
    PARTS.map((part) => [code, part])
  );
  for (const [code, part] of pairs) {
    it(`${code} says every English line of ${part || 'core'}, keeps names and blanks`, () => {
      const path = fileOf(part, code);
      expect(existsSync(path), path).toBe(true);
      const en = source(part);
      const words = JSON.parse(readFileSync(path, 'utf8'));
      expect(Object.keys(words).sort()).toEqual(Object.keys(en).sort());
      for (const [key, text] of Object.entries(en)) {
        const said = words[key];
        expect(typeof said === 'string' && said.trim().length > 0, `${code} ${key} is empty`).toBe(true);
        expect(placeholders(said), `${code} ${key} blanks`).toEqual(placeholders(text));
        for (const name of KEEP) {
          if (text.includes(name)) expect(said, `${code} ${key} keeps ${name}`).toContain(name);
        }
      }
    });
  }
});
