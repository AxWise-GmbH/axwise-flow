import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { LANG_KEY } from './langStore';
import { AREAS, resetLangForTests, setLang, useT } from './useT';

function Page({ area }) {
  const { lang, t } = useT(area);
  return (
    <main lang={lang}>
      <p>{t('core.title', 'English core')}</p>
      <p>{t(`${area}.title`, 'English page')}</p>
      <p>{t(`${area}.missing`, 'English fallback')}</p>
    </main>
  );
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function words(value) {
  return { ok: true, json: () => Promise.resolve(value) };
}

let pending;

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
  vi.stubGlobal('navigator', { languages: ['en'], language: 'en' });
  resetLangForTests();
  pending = new Map();
  vi.stubGlobal(
    'fetch',
    vi.fn((url) => {
      const part = String(url).split('/locales/')[1].split('?')[0];
      const response = deferred();
      pending.set(part, response);
      return response.promise;
    })
  );
});

afterEach(() => {
  cleanup();
  resetLangForTests();
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

async function deliver(part, value) {
  await waitFor(() => expect(pending.has(part)).toBe(true));
  await act(async () => {
    pending.get(part).resolve(words(value));
  });
}

describe('lazy page translations', () => {
  it.each(AREAS)(
    'loads %s on direct entry with a saved language while core is pending',
    async (area) => {
      window.localStorage.setItem(LANG_KEY, 'de');
      render(<Page area={area} />);
      expect(screen.getByText('English page')).toBeInTheDocument();
      expect([...pending.keys()]).toEqual(['de.json']);

      await deliver('de.json', { 'core.title': 'Deutscher Kern' });
      await deliver(`${area}/de.json`, { [`${area}.title`]: 'Deutsche Seite' });

      expect(screen.getByText('Deutsche Seite')).toBeInTheDocument();
      expect(screen.getByText('Deutscher Kern')).toBeInTheDocument();
      expect(screen.getByText('English fallback')).toBeInTheDocument();
      expect(document.documentElement.lang).toBe('de');
      expect(fetch).toHaveBeenCalledTimes(2);
    }
  );

  it('also loads the initial page for a browser-selected language', async () => {
    vi.stubGlobal('navigator', { languages: ['de-DE'], language: 'de-DE' });
    render(<Page area="pp" />);
    await deliver('de.json', {});
    await deliver('pp/de.json', { 'pp.title': 'Deutsche Seite' });
    expect(screen.getByText('Deutsche Seite')).toBeInTheDocument();
    expect(window.localStorage.getItem(LANG_KEY)).toBeNull();
  });

  it('includes a page opened while a language change is still loading', async () => {
    const view = render(<Page area="pp" />);
    let selected;
    act(() => {
      selected = setLang('de');
    });
    await deliver('de.json', {});
    view.rerender(<Page area="nw" />);
    await deliver('pp/de.json', { 'pp.title': 'Produkt' });
    expect(screen.getByRole('main')).toHaveAttribute('lang', 'en');
    await deliver('nw/de.json', { 'nw.title': 'Nachrichten' });
    await act(async () => {
      await selected;
    });
    expect(screen.getByText('Nachrichten')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('does not let a slower earlier selection replace the latest language', async () => {
    render(<Page area="pp" />);
    let german;
    let french;
    act(() => {
      german = setLang('de', { remember: true });
      french = setLang('fr', { remember: true });
    });
    await deliver('fr.json', {});
    await deliver('pp/fr.json', { 'pp.title': 'Page française' });
    await act(async () => {
      await french;
    });
    await deliver('de.json', {});
    await deliver('pp/de.json', { 'pp.title': 'Deutsche Seite' });
    await act(async () => {
      await german;
    });
    expect(screen.getByText('Page française')).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('fr');
    expect(window.localStorage.getItem(LANG_KEY)).toBe('fr');
  });

  it('keeps a later English choice when a non-English request finishes', async () => {
    window.localStorage.setItem(LANG_KEY, 'de');
    render(<Page area="pp" />);
    await act(async () => {
      await setLang('en', { remember: true });
    });
    await deliver('de.json', {});
    await deliver('pp/de.json', { 'pp.title': 'Deutsche Seite' });
    expect(screen.getByText('English page')).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en');
    expect(window.localStorage.getItem(LANG_KEY)).toBe('en');
  });

  it('keeps English on a failed page fetch and retries on the next language pick', async () => {
    window.localStorage.setItem(LANG_KEY, 'de');
    render(<Page area="pp" />);
    await deliver('de.json', {});
    await waitFor(() => expect(pending.has('pp/de.json')).toBe(true));
    await act(async () => {
      pending.get('pp/de.json').resolve({ ok: false, status: 503 });
    });
    expect(screen.getByText('English page')).toBeInTheDocument();

    let retry;
    act(() => {
      retry = setLang('de');
    });
    await deliver('pp/de.json', { 'pp.title': 'Deutsche Seite' });
    await act(async () => {
      await retry;
    });
    expect(screen.getByText('Deutsche Seite')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
