import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { transferableAbortController } from 'node:util';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { resetLangForTests, setLang } from '../../i18n/useT';
import LegalCenter from './LegalCenter';

// No language has its own edition yet, so this test gives German one: the Privacy Policy.
// Every other document falls back to its English text.
vi.mock('./legal.docs', async (importOriginal) => {
  const real = await importOriginal();
  const text = (slug, edition) => ({
    meta: {
      slug,
      title: slug,
      summary: edition === 'de' ? 'Wofür dieses Dokument da ist.' : 'What this document is for.',
      effective: '2026-09-22',
      version: '1.0',
      history: [{ version: '1.0', effective: '2026-09-22', change: 'First version.' }],
    },
    blocks: [
      { type: 'h2', id: 'who-we-are', text: edition === 'de' ? 'Wer wir sind' : 'Who we are' },
      { type: 'p', text: edition === 'de' ? 'Deutscher Text.' : 'English text.' },
      { type: 'h2', id: 'your-rights', text: edition === 'de' ? 'Ihre Rechte' : 'Your rights' },
      { type: 'p', text: edition === 'de' ? 'Ihre Rechte.' : 'Your rights text.' },
    ],
  });
  const editionOf = (slug, lang = 'en') => (lang === 'de' && slug === 'privacy' ? 'de' : 'en');
  return {
    ...real,
    editionOf,
    loadLegalDoc: vi.fn(async (slug, lang) => text(slug, editionOf(slug, lang))),
  };
});

function renderAt(path) {
  const router = createMemoryRouter([{ path: '/instant/legal/*', element: <LegalCenter /> }], {
    initialEntries: [path],
  });
  return render(<RouterProvider router={router} />);
}

const bodyText = (container) => container.querySelector('.olg-text');

beforeEach(() => {
  // React Router's data router needs a signal from Node's own realm (see LegalCenter.test.jsx).
  vi.stubGlobal(
    'AbortController',
    class {
      constructor() {
        return transferableAbortController();
      }
    }
  );
  window.scrollTo = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
  // The site's own word files: none needed, English stands in.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => ({}) }))
  );
});

afterEach(() => {
  cleanup();
  resetLangForTests();
  vi.unstubAllGlobals();
});

async function speak(code) {
  await act(async () => {
    await setLang(code);
  });
}

describe('Legal Center in another language', () => {
  it('shows the translation with a note that English binds, and the English text on request', async () => {
    await speak('de');
    const { container } = renderAt('/instant/legal/eu/privacy');
    expect(await screen.findByText('Deutscher Text.')).toBeInTheDocument();
    expect(
      screen.getByText(
        'This is a translation for your convenience. The English version is the binding one.'
      )
    ).toBeInTheDocument();
    expect(bodyText(container)).not.toHaveAttribute('lang');
    expect(container.querySelector('.olg-doc-meta')).toHaveTextContent('22. September 2026');

    fireEvent.click(screen.getByRole('button', { name: /Read the English version/ }));
    expect(await screen.findByText('English text.')).toBeInTheDocument();
    expect(bodyText(container)).toHaveAttribute('lang', 'en');
    expect(container.querySelector('.olg-doc-summary')).toHaveAttribute('lang', 'en');

    fireEvent.click(screen.getByRole('button', { name: /Back to the translation/ }));
    expect(await screen.findByText('Deutscher Text.')).toBeInTheDocument();
    expect(bodyText(container)).not.toHaveAttribute('lang');
  });

  it('falls back to the English text, marked English, where a language has no edition', async () => {
    await speak('de');
    const { container } = renderAt('/instant/legal/eu/terms');
    expect(await screen.findByText('English text.')).toBeInTheDocument();
    expect(bodyText(container)).toHaveAttribute('lang', 'en');
    expect(screen.queryByText(/The English version is the binding one/)).toBeNull();
  });

  it('changes the text with the language, and shows no note in English', async () => {
    const { container } = renderAt('/instant/legal/eu/privacy');
    expect(await screen.findByText('English text.')).toBeInTheDocument();
    expect(bodyText(container)).not.toHaveAttribute('lang');
    expect(screen.queryByText(/The English version is the binding one/)).toBeNull();

    await speak('de');
    expect(await screen.findByText('Deutscher Text.')).toBeInTheDocument();
    expect(screen.getByText(/The English version is the binding one/)).toBeInTheDocument();
  });
});
