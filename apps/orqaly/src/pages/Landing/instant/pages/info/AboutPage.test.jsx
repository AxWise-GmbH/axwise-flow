import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import AboutPage from './AboutPage';
import { loadAboutCopy } from './about.copy';
import { INFO_PAGES } from './info.data';
import { LANGUAGES } from '../../i18n/languages';

const here = dirname(fileURLToPath(import.meta.url));
const read = (code) => JSON.parse(readFileSync(join(here, 'about', `${code}.json`), 'utf8'));
const english = read('en');

// The page fetches ./about/<lang>.json; answer from the files on disk.
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url) => {
      const code = String(url).match(/about\/([\w-]+)\.json/)?.[1];
      return { ok: Boolean(code), status: code ? 200 : 404, json: async () => read(code) };
    })
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('About page', () => {
  it('shows the hero, then the four chapters in order', async () => {
    render(<AboutPage page={INFO_PAGES.about} />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Two paths. One platform.');
    const nav = await screen.findByRole('navigation', { name: 'On this page' });
    expect(within(nav).getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([
      '#about-story',
      '#about-goal',
      '#about-mission',
      '#about-founders',
    ]);
    for (const id of ['story', 'goal', 'mission', 'founders']) {
      expect(document.getElementById(`about-${id}`)).not.toBeNull();
    }
    expect(screen.getByRole('heading', { name: 'Two paths that met.' })).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toContain('The call');
  });

  it('links each founder to their LinkedIn profile in a new, safe tab', async () => {
    render(<AboutPage page={INFO_PAGES.about} />);
    const links = await screen.findAllByRole('link', { name: /LinkedIn/ });
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      'https://www.linkedin.com/in/vitalijs-visnevskis',
      'https://www.linkedin.com/in/viktors-ivanovs',
    ]);
    links.forEach((link) => expect(link.getAttribute('rel')).toContain('noopener'));
  });

  it('makes no "soon" or "planned" promises', async () => {
    const { container } = render(<AboutPage page={INFO_PAGES.about} />);
    await screen.findByRole('navigation', { name: 'On this page' });
    expect(container.textContent).not.toMatch(/\b(soon|planned|coming)\b/i);
  });

  it('reads English when a language has no text of its own', async () => {
    expect(await loadAboutCopy('xx')).toEqual(english);
  });
});

// A translation keeps the English shape: same keys, same list lengths, same links and names.
function skeleton(value) {
  if (typeof value === 'string') return value === '' ? '' : 'text';
  if (Array.isArray(value)) return value.map(skeleton);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, key === 'href' ? item : skeleton(item)]));
}

describe('translated About texts', () => {
  for (const { code } of LANGUAGES.filter((language) => language.code !== 'en')) {
    it(`${code} keeps the English shape and the founders' names`, () => {
      const translated = read(code);
      expect(skeleton(translated)).toEqual(skeleton(english));
      expect(translated.founders.people.map((person) => person.name)).toEqual(
        english.founders.people.map((person) => person.name)
      );
    });
  }
});
