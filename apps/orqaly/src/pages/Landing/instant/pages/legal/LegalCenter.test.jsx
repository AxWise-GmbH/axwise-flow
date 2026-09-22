import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { transferableAbortController } from 'node:util';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { COMPANY } from '../info/company';
import LegalCenter from './LegalCenter';
import { REGION_KEY } from './legalRegion';
import { legalDocUrl } from './legal.docs';
import { LEGAL_DOCS, PUBLISHED_DOCS } from './legal.links';

// A stand-in text for every document, so these tests do not depend on the real wording.
function fixture(slug) {
  const { title } = LEGAL_DOCS.find((doc) => doc.slug === slug);
  return {
    meta: {
      slug,
      title,
      summary: `What the ${title} is for.`,
      effective: '2026-09-22',
      version: '1.0',
      history: [{ version: '1.0', effective: '2026-09-22', change: 'First version.' }],
      review: {},
    },
    blocks: [
      { type: 'h2', id: 'who-we-are', text: 'Who we are' },
      { type: 'p', text: 'Orqanix is run by {company.legalName}.', needs: ['legalName'] },
      {
        type: 'p',
        text: 'Write to {company.email} or read the [Privacy Policy](/instant/legal/privacy).',
      },
      { type: 'h2', id: 'your-rights', text: 'Your rights' },
      { type: 'p', text: 'EU rights text.', only: 'eu' },
      { type: 'p', text: 'US rights text.', only: 'us' },
      { type: 'table', head: ['What', 'Why'], rows: [['Email', 'To sign you in']] },
      { type: 'h2', id: 'complaints', text: 'Complaints', only: 'eu' },
      { type: 'p', text: 'Complain to your data protection authority.', only: 'eu' },
    ],
  };
}

const SLUG_OF = new Map(LEGAL_DOCS.map((doc) => [legalDocUrl(doc.slug), doc.slug]));
let fetchMock;

function setZone(timeZone) {
  vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => ({
    resolvedOptions: () => ({ timeZone }),
  }));
}

function renderAt(path) {
  const router = createMemoryRouter([{ path: '/instant/legal/*', element: <LegalCenter /> }], {
    initialEntries: [path],
  });
  const view = render(<RouterProvider router={router} />);
  return { router, ...view };
}

const where = (router) => `${router.state.location.pathname}${router.state.location.hash}`;
const rowHrefs = () =>
  screen
    .getAllByRole('link')
    .map((link) => link.getAttribute('href'))
    .filter((href) => /^\/instant\/legal\/(us|eu)\/[a-z-]+$/.test(href ?? ''));

// React Router's data router builds a real Node Request; its signal must come from the same
// realm as that Request (the same fix as AssistantWorkflowNavigationGuard.test.jsx).
function stubNodeAbortController() {
  vi.stubGlobal(
    'AbortController',
    class {
      constructor() {
        return transferableAbortController();
      }
    }
  );
}

beforeEach(() => {
  stubNodeAbortController();
  window.localStorage.clear();
  window.scrollTo = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
  setZone('Europe/Berlin');
  fetchMock = vi.fn(async (url) => ({ ok: true, json: async () => fixture(SLUG_OF.get(url)) }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Legal Center hub', () => {
  it('opens on one "Legal" heading, the EU version, and a row for every EU document', () => {
    const { container } = renderAt('/instant/legal');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Legal');
    expect(document.title).toBe('Orqanix — Legal (EU)');
    expect(screen.getByRole('radio', { name: /^EU/ })).toBeChecked();
    const eu = PUBLISHED_DOCS.filter((doc) => doc.regions.includes('eu'));
    expect(rowHrefs().sort()).toEqual(eu.map((doc) => `/instant/legal/eu/${doc.slug}`).sort());
    expect(rowHrefs()).not.toContain('/instant/legal/eu/health-data');
    for (const group of ['Terms', 'Policies', 'Trust', 'Company']) {
      expect(screen.getByRole('heading', { level: 2, name: group })).toBeInTheDocument();
    }
    // Text pages: no download block, no media.
    expect(container.querySelector('#download')).toBeNull();
    expect(container.querySelector('img, iframe, video')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('switches to the US version on a click, remembers it, and shows the US-only policy', () => {
    const { router } = renderAt('/instant/legal');
    expect(window.localStorage.getItem(REGION_KEY)).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: /^US/ }));
    expect(where(router)).toBe('/instant/legal/us');
    expect(window.localStorage.getItem(REGION_KEY)).toBe('us');
    expect(screen.getByRole('radio', { name: /^US/ })).toBeChecked();
    const health = screen.getByRole('link', { name: /Consumer Health Data Privacy Policy/ });
    expect(health).toHaveAttribute('href', '/instant/legal/us/health-data');
    expect(health).toHaveTextContent('US only');
  });

  it('moves between the two versions with the arrow keys', () => {
    const { router } = renderAt('/instant/legal/eu');
    fireEvent.keyDown(screen.getByRole('radio', { name: /^EU/ }), { key: 'ArrowRight' });
    expect(where(router)).toBe('/instant/legal/us');
  });

  it('keeps only a product’s documents when its chip is pressed', () => {
    renderAt('/instant/legal/eu');
    const chips = screen.getByRole('group', { name: 'Show documents for' });
    fireEvent.click(within(chips).getByRole('button', { name: 'API' }));
    expect(within(chips).getByRole('button', { name: 'API' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    const api = PUBLISHED_DOCS.filter(
      (doc) => doc.regions.includes('eu') && doc.products.includes('api')
    );
    expect(rowHrefs().sort()).toEqual(api.map((doc) => `/instant/legal/eu/${doc.slug}`).sort());
    expect(rowHrefs()).toContain('/instant/legal/eu/api-terms');
    expect(rowHrefs()).not.toContain('/instant/legal/eu/desktop-app-terms');
    expect(rowHrefs()).not.toContain('/instant/legal/eu/cookies');
  });

  it('only suggests the other version, and never switches or stores by itself', () => {
    setZone('America/New_York');
    renderAt('/instant/legal');
    expect(screen.getByRole('status')).toHaveTextContent('You seem to be outside Europe.');
    expect(screen.getByRole('radio', { name: /^EU/ })).toBeChecked();
    expect(window.localStorage.getItem(REGION_KEY)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Keep EU' }));
    expect(window.localStorage.getItem(REGION_KEY)).toBe('eu');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('says nothing when the visitor already sees their own version', () => {
    renderAt('/instant/legal');
    expect(screen.queryByText(/You seem to be/)).toBeNull();
  });
});

describe('Legal Center document', () => {
  it('shows one version: its own blocks, numbered sections, a matching contents list', async () => {
    const { container } = renderAt('/instant/legal/eu/privacy');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Privacy Policy');
    expect(await screen.findByText('What the Privacy Policy is for.')).toBeInTheDocument();
    expect(document.title).toBe('Orqanix — Privacy Policy (EU)');
    expect(screen.getByText('EU rights text.')).toBeInTheDocument();
    expect(screen.queryByText('US rights text.')).toBeNull();
    expect(container.querySelector('.olg-doc-meta')).toHaveTextContent(
      'Effective 22 September 2026 · Version 1.0'
    );

    const contents = screen.getByRole('navigation', { name: 'On this page' });
    const targets = within(contents)
      .getAllByRole('link')
      .map((link) => link.getAttribute('href'));
    expect(targets).toEqual(['#who-we-are', '#your-rights', '#complaints']);
    targets.forEach((href) => expect(container.querySelector(href)).not.toBeNull());
    expect(container.querySelector('#your-rights')).toHaveTextContent('2.Your rights');

    // Company facts that are still empty print nothing; emails and document links are live.
    expect(container.textContent).not.toMatch(/run by \.|\{company/);
    expect(screen.getAllByRole('link', { name: COMPANY.email })[0]).toHaveAttribute(
      'href',
      `mailto:${COMPANY.email}`
    );
    expect(screen.getAllByRole('link', { name: 'Privacy Policy' })[0]).toHaveAttribute(
      'href',
      '/instant/legal/eu/privacy'
    );
    expect(screen.getByRole('table')).toHaveTextContent('To sign you in');
    expect(screen.getByRole('button', { name: 'Print or save as PDF' })).toBeInTheDocument();
  });

  it('keeps the reader’s section when the other version has it, else starts at the top', async () => {
    const first = renderAt('/instant/legal/eu/privacy#your-rights');
    await screen.findByText('EU rights text.');
    fireEvent.click(screen.getByRole('radio', { name: /^US/ }));
    expect(where(first.router)).toBe('/instant/legal/us/privacy#your-rights');
    expect(await screen.findByText('US rights text.')).toBeInTheDocument();
    cleanup();

    const second = renderAt('/instant/legal/eu/privacy#complaints');
    await screen.findByText('EU rights text.');
    fireEvent.click(screen.getByRole('radio', { name: /^US/ }));
    expect(where(second.router)).toBe('/instant/legal/us/privacy');
  });

  it('sends an address without a version to the chosen one, else to the default', () => {
    const first = renderAt('/instant/legal/terms#who-we-are');
    expect(where(first.router)).toBe('/instant/legal/eu/terms#who-we-are');
    cleanup();
    window.localStorage.setItem(REGION_KEY, 'us');
    const second = renderAt('/instant/legal/terms');
    expect(where(second.router)).toBe('/instant/legal/us/terms');
  });

  it.each([
    '/instant/legal/eu/no-such-document',
    '/instant/legal/eu/privacy/extra',
    '/instant/legal/xx/privacy',
    '/instant/legal/eu/legal-notice',
  ])('sends %s back to the Legal Center', (path) => {
    const { router } = renderAt(path);
    // The Legal Notice only opens once the company is filled in (company.js).
    if (path.endsWith('legal-notice') && COMPANY.legalName && COMPANY.address) return;
    expect(where(router)).toBe('/instant/legal');
  });

  it('points a one-version document to its home when opened in the other version', () => {
    const { router } = renderAt('/instant/legal/eu/health-data');
    expect(screen.getByText(/only part of the US version/)).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'On this page' })).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /Show it/ }));
    expect(where(router)).toBe('/instant/legal/us/health-data');
  });

  it('says so when a text does not load, and tries again on request', async () => {
    fetchMock.mockImplementationOnce(async () => ({ ok: false, status: 503 }));
    renderAt('/instant/legal/eu/cookies');
    expect(await screen.findByText(/did not load/)).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    });
    expect(await screen.findByText('What the Cookies & Storage is for.')).toBeInTheDocument();
  });
});
