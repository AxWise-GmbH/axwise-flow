import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import InstantFooter from './InstantFooter';
import { LANGUAGES } from './i18n/languages';
import { LANG_KEY, initialLang } from './i18n/langStore';
import { resetLangForTests } from './i18n/useT';

const WORDS = {
  de: { 'footer.tagline': 'Sofort-Intelligenz.', 'lang.button': 'Sprache: {name}' },
  ar: { 'footer.tagline': 'ذكاء فوري.' },
};

function renderFooter() {
  return render(
    <MemoryRouter>
      <InstantFooter />
    </MemoryRouter>
  );
}

const button = () => screen.getByRole('button', { name: /^(Language|Sprache):/ });
// The card the button controls (closed, it has no accessible name to find it by).
const list = () => document.getElementById(button().getAttribute('aria-controls'));

beforeEach(() => {
  window.localStorage.clear();
  resetLangForTests();
  vi.stubGlobal(
    'fetch',
    vi.fn((url) => {
      const code = Object.keys(WORDS).find((key) => String(url).includes(`/${key}`));
      return Promise.resolve({ ok: true, json: () => Promise.resolve(WORDS[code] ?? {}) });
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetLangForTests();
});

describe('LanguagePicker', () => {
  it('sits beside the footer logo and lists every language in its own words', () => {
    renderFooter();
    const row = button().closest('.oi-footer-brand-row');
    expect(row).not.toBeNull();
    expect(within(row).getByRole('link', { name: /Orqanix/ })).toBeInTheDocument();
    expect(button()).toHaveAttribute('aria-expanded', 'false');
    expect(list()).not.toBeVisible();

    fireEvent.click(button());
    expect(button()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('list', { name: 'Languages' })).toBe(list());
    const options = within(list()).getAllByRole('button');
    expect(options.map((option) => option.textContent)).toEqual(LANGUAGES.map((l) => l.native));
    expect(options[0]).toHaveAttribute('aria-current', 'true');
    expect(options[0]).toHaveFocus();
    expect(LANGUAGES).toHaveLength(15);
  });

  it('moves with the arrow keys and closes on Escape, back on its button', () => {
    renderFooter();
    fireEvent.click(button());
    const options = within(list()).getAllByRole('button');
    fireEvent.keyDown(options[0], { key: 'ArrowDown' });
    expect(options[1]).toHaveFocus();
    fireEvent.keyDown(options[1], { key: 'End' });
    expect(options.at(-1)).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(button()).toHaveAttribute('aria-expanded', 'false');
    expect(button()).toHaveFocus();
  });

  it('a pick changes the words, the page language and is remembered', async () => {
    renderFooter();
    fireEvent.click(button());
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Deutsch' }));
    });
    expect(screen.getByText('Sofort-Intelligenz.')).toBeInTheDocument();
    expect(button()).toHaveAccessibleName('Sprache: Deutsch');
    expect(document.documentElement.lang).toBe('de');
    expect(document.documentElement.dir).toBe('ltr');
    expect(window.localStorage.getItem(LANG_KEY)).toBe('de');
    // A line German lacks shows its English.
    expect(screen.getByRole('navigation', { name: 'Footer' })).toBeInTheDocument();
  });

  it('Arabic turns the page right to left', async () => {
    renderFooter();
    fireEvent.click(button());
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'العربية' }));
    });
    expect(screen.getByText('ذكاء فوري.')).toBeInTheDocument();
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('ar');
  });

  it('starts from ?lang=, then a saved pick, then the browser, else English', () => {
    const at = (search) => window.history.replaceState(null, '', `/${search}`);
    at('?lang=ja');
    window.localStorage.setItem(LANG_KEY, 'fr');
    expect(initialLang()).toBe('ja');
    at('');
    expect(initialLang()).toBe('fr');
    window.localStorage.clear();
    vi.stubGlobal('navigator', { languages: ['pt-BR', 'en'], language: 'pt-BR' });
    expect(initialLang()).toBe('pt');
    vi.stubGlobal('navigator', { languages: ['zh-TW'], language: 'zh-TW' });
    expect(initialLang()).toBe('zh-CN');
    vi.stubGlobal('navigator', { languages: ['sv-SE'], language: 'sv-SE' });
    expect(initialLang()).toBe('en');
  });
});
