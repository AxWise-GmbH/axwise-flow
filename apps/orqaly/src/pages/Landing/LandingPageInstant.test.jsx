import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import LandingPageInstant from './LandingPageInstant';
import { DESKTOP_RELEASE } from './simple/desktop-release';
import { PLANNED_PATTERN } from './instant/capabilities.data';
import { PAGE_BACKGROUND } from './instant/palette';

async function renderPage() {
  const view = render(
    <ThemeProvider theme={createTheme({ palette: { mode: 'dark' } })}>
      <MemoryRouter initialEntries={['/instant']}>
        <Routes>
          <Route path="/instant" element={<LandingPageInstant />} />
          <Route path="/instant/:page" element={<div>Sub-page destination</div>} />
          <Route path="/goals" element={<div>Web version destination</div>} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>
  );
  // The blocks under the hero are lazy-loaded; wait so every assertion sees the whole page.
  await screen.findByRole('heading', { name: 'Watch it work' }, { timeout: 8000 });
  await screen.findByRole('heading', { name: 'One app. Many jobs.' }, { timeout: 8000 });
  await screen.findByRole('heading', { name: /Chat from anywhere/i }, { timeout: 8000 });
  return view;
}

const RELEASE_FACTS = new RegExp(
  `Apple Silicon.*${Math.round(DESKTOP_RELEASE.bytes / 1_000_000)} MB.*Preview \\(not notarized\\).*Sign in`
);

describe('LandingPageInstant', () => {
  it('leads with the new headline on its own near-black green stage', async () => {
    const { container } = await renderPage();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Instant Intelligence.'
    );
    const root = container.querySelector('[data-landing-root]');
    expect(root).toHaveAttribute('data-landing-variant', 'instant');
    expect(root).toHaveStyle({ backgroundColor: PAGE_BACKGROUND });
    expect(screen.getByRole('link', { name: 'Orqanix - home' })).toBeInTheDocument();
  });

  it('sets its own title while mounted and lets search engines index it', async () => {
    const before = document.title;
    const page = await renderPage();
    expect(document.title).toBe('Orqanix — Instant Intelligence on your Mac');
    // This is the site's front page now, so nothing may hold it back from search.
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull();
    page.unmount();
    expect(document.title).toBe(before);
  });

  it('keeps the hero to a headline, More, two short lines and one download button', async () => {
    await renderPage();
    const hero = screen.getByRole('heading', { level: 1 }).closest('section');
    expect(within(hero).getAllByRole('link', { name: 'Download for macOS' })).toHaveLength(1);
    expect(
      within(hero).getByText(/thinks in the cloud and does the work on your Mac/)
    ).not.toBeVisible();
    expect(within(hero).getByText('For founders and small teams.')).toBeVisible();
    expect(within(hero).getByText('Free during the early version.')).toBeVisible();
    expect(hero.textContent).not.toMatch(/web version|web preview|Watch it build/i);
  });

  it('links the two pages and the download block ("Try For Free") from the top bar', async () => {
    const { container } = await renderPage();
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    const targets = {
      'How it works': '/instant/how-it-works',
      Features: '/instant/features',
      'Try For Free': '#download',
    };
    for (const [name, href] of Object.entries(targets)) {
      expect(within(nav).getByRole('link', { name })).toHaveAttribute('href', href);
    }
    expect(within(nav).getAllByRole('link')).toHaveLength(3);
    // The five shown products and the ten Solutions pages wait behind one button each, so the closed
    // bar stays three links long.
    const products = within(nav).getByRole('button', { name: 'Products' });
    expect(products).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(products);
    expect(within(nav).getAllByRole('link')).toHaveLength(8);
    expect(within(nav).getByRole('link', { name: /^API/ })).toHaveAttribute(
      'href',
      '/instant/products/api'
    );
    const solutions = within(nav).getByRole('button', { name: 'Solutions' });
    expect(solutions).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(solutions);
    expect(within(nav).getAllByRole('link')).toHaveLength(13);
    expect(within(nav).getByRole('link', { name: /Healthcare/ })).toHaveAttribute(
      'href',
      '/instant/solutions/healthcare'
    );
    expect(screen.getByRole('link', { name: 'Orqanix - home' })).toHaveAttribute('href', '/');
    expect(container.querySelector('#download')).not.toBeNull();
    expect(container.querySelector('#watch')).not.toBeNull();
  });

  it('gives phones the same destinations behind one menu button, as a bento', async () => {
    await renderPage();
    const toggle = screen.getByRole('button', { name: 'Open menu' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    const menu = screen.getByRole('navigation', { name: 'Menu' });
    const hrefs = within(menu)
      .getAllByRole('link')
      .map((link) => link.getAttribute('href'));
    // The picked product's Open link, the two page tiles, the ten solutions laid out in the
    // wide tile, then Try For Free.
    expect(hrefs.slice(0, 3)).toEqual([
      '/instant/products/desktop',
      '/instant/how-it-works',
      '/instant/features',
    ]);
    expect(hrefs.slice(3, -1)).toHaveLength(10);
    expect(hrefs.at(-1)).toBe('#download');
    fireEvent.click(within(menu).getByRole('tab', { name: 'API' }));
    expect(within(menu).getByRole('link', { name: 'Open API' })).toHaveAttribute(
      'href',
      '/instant/products/api'
    );
    expect(within(menu).getByRole('link', { name: 'Try For Free' })).toHaveAttribute(
      'href',
      '#download'
    );
    expect(within(menu).getByRole('list', { name: 'Solutions' })).toBeInTheDocument();
    fireEvent.click(within(menu).getByRole('link', { name: 'Features' }));
    expect(screen.getByText('Sub-page destination')).toBeInTheDocument();
  });

  it('keeps the release facts on the closing download button, and off the hero one', async () => {
    await renderPage();
    const downloads = screen.getAllByRole('link', { name: 'Download for macOS' });
    expect(downloads).toHaveLength(2);
    for (const download of downloads) {
      expect(download).toHaveAttribute('href', DESKTOP_RELEASE.url);
      expect(download).toHaveAttribute('download', DESKTOP_RELEASE.filename);
    }
    expect(downloads[0]).not.toHaveAttribute('aria-describedby');
    expect(downloads[1]).toHaveAccessibleDescription(RELEASE_FACTS);
  });

  it('draws everything in markup, with canvas reserved for the decorative orb', async () => {
    await renderPage();
    const main = screen.getByRole('main');
    expect(main.querySelector('img, iframe, video')).toBeNull();
    for (const canvas of main.querySelectorAll('canvas')) {
      expect(canvas.closest('[data-orb]')).toHaveAttribute('aria-hidden', 'true');
    }
  });

  it('keeps the capability area to one moving strip, with no card grid above it', async () => {
    const { container } = await renderPage();
    expect(container.querySelectorAll('.oi-card')).toHaveLength(0);
    expect(screen.getByRole('group', { name: 'More capabilities' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'You stay in control' })).not.toBeInTheDocument();
  });

  it('runs the blocks in the agreed order, without speed numbers, examples window or integrations', async () => {
    const { container } = await renderPage();
    const headings = [...container.querySelectorAll('main h1, main h2')].map((node) =>
      node.textContent.replace(/\s+/g, ' ').trim()
    );
    const order = [
      /^Instant Intelligence\./,
      /^Watch it work$/,
      /^One app\. Many jobs\.$/,
      /^Chat from anywhere/i,
      /^Questions/i,
      /^Start with the work in front of you/i,
    ];
    const found = order.map((pattern) => headings.findIndex((text) => pattern.test(text)));
    expect(found).not.toContain(-1);
    expect(found).toEqual([...found].sort((a, b) => a - b));

    // The capability strip has no heading of its own: it sits between the channels and the
    // questions. The owner took the integrations block ("Plug in any LLM & Tool") off.
    const strip = screen.getByRole('group', { name: 'More capabilities' });
    const before = screen.getByRole('heading', { name: /Chat from anywhere/i });
    const after = screen.getByRole('heading', { name: /^Questions/i });
    expect(before.compareDocumentPosition(strip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(strip.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    expect(container.querySelector('#speed-heading')).toBeNull();
    expect(container.querySelector('#integrations')).toBeNull();
    expect(
      screen.queryByRole('heading', { name: 'Plug in any LLM & Tool' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'One chat. A connected workspace.' })
    ).not.toBeInTheDocument();
  });

  it('has no developers block', async () => {
    await renderPage();
    expect(screen.queryByRole('button', { name: 'More for developers' })).not.toBeInTheDocument();
    expect(screen.getByRole('main').textContent).not.toMatch(/Early, needs setup/i);
  });

  it('never words a claim the app cannot back, and names planned features only in the Planned band', async () => {
    const { container } = await renderPage();
    const root = container.querySelector('[data-landing-root]');
    expect(root.textContent).not.toMatch(/Orqaly|OrQonics|AxWise/i);
    expect(root.textContent).not.toMatch(
      /shield|data leaks|Nothing runs without|checks itself|IDE replacement|sub-2|SOC2|zero hallucination/i
    );
    expect(root.textContent).not.toMatch(/\bverified\b|\bproduction\b|sources checked/i);

    const band = container.querySelector('.oi-planned');
    expect(band.textContent).toMatch(PLANNED_PATTERN);
    const withoutBand = root.cloneNode(true);
    withoutBand.querySelectorAll('.oi-planned').forEach((node) => node.remove());
    expect(withoutBand.textContent).not.toMatch(PLANNED_PATTERN);
  });

  it('uses each id once, so anchors and descriptions resolve to one element', async () => {
    const { container } = await renderPage();
    const ids = [...container.querySelectorAll('[id]')].map((node) => node.id);
    const repeated = ids.filter((id, index) => ids.indexOf(id) !== index);
    expect(repeated).toEqual([]);
  });
});
