import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import InstantFooter from './InstantFooter';
import InfoPage from './pages/InfoPage';
import { INSTANT_PAGES } from './pages/instantPages';
import { INFO_PAGES } from './pages/info/info.data';
import { SOLUTIONS_MENU, solutionPath } from './pages/solutions/solutionsMenu';

const INFO_SLUGS = INSTANT_PAGES.filter((page) => page.info).map((page) => page.slug);

function renderFooter() {
  render(
    <MemoryRouter>
      <InstantFooter />
    </MemoryRouter>
  );
}

describe('InstantFooter', () => {
  it('shows five solutions in one column and keeps the other five under More', () => {
    renderFooter();
    const nav = screen.getByRole('navigation', { name: 'Footer' });
    const shown = () =>
      within(nav)
        .getAllByRole('link')
        .map((link) => link.textContent)
        .filter((label) => SOLUTIONS_MENU.some((item) => item.label === label));

    expect(shown()).toEqual(SOLUTIONS_MENU.slice(0, 5).map((item) => item.label));
    fireEvent.click(within(nav).getByRole('button', { name: 'More' }));
    expect(shown()).toEqual(SOLUTIONS_MENU.map((item) => item.label));
  });

  it('links the product, every solution and every text page, and only pages that exist', () => {
    renderFooter();
    const nav = screen.getByRole('navigation', { name: 'Footer' });
    fireEvent.click(within(nav).getByRole('button', { name: 'More' }));
    const hrefs = within(nav)
      .getAllByRole('link')
      .map((link) => link.getAttribute('href'));

    const expected = [
      '/instant/how-it-works',
      '/instant/features',
      ...SOLUTIONS_MENU.map((item) => solutionPath(item.slug)),
      ...INFO_SLUGS.map((slug) => `/instant/${slug}`),
    ];
    expect([...hrefs].sort()).toEqual([...expected].sort());

    const known = new Set([
      ...INSTANT_PAGES.map((page) => page.path),
      ...SOLUTIONS_MENU.map((item) => solutionPath(item.slug)),
    ]);
    expect(hrefs.filter((href) => !known.has(href))).toEqual([]);
  });

  it('keeps the makers line and drops the two lines the owner removed', () => {
    renderFooter();
    const footer = screen.getByRole('contentinfo');
    expect(footer).toHaveTextContent('Made by a group of AI product engineers and consultants');
    expect(footer).not.toHaveTextContent(/pronounced|Built on Goose|Powered by Gemini/);
  });
});

describe('InfoPage', () => {
  it('has copy for every text page in the site map, and nothing else', () => {
    expect(Object.keys(INFO_PAGES).sort()).toEqual([...INFO_SLUGS].sort());
  });

  it.each(INFO_SLUGS)('renders %s with one h1 that is its title', (slug) => {
    render(<InfoPage slug={slug} />);
    const [h1, ...rest] = screen.getAllByRole('heading', { level: 1 });
    expect(rest).toHaveLength(0);
    expect(h1).toHaveTextContent(INFO_PAGES[slug].title);
  });

  it.each(['privacy', 'terms'])('gives every section of %s its own heading', (slug) => {
    render(<InfoPage slug={slug} />);
    for (const { title } of INFO_PAGES[slug].sections) {
      expect(screen.getByRole('heading', { level: 2, name: title })).toBeInTheDocument();
    }
  });

  it('points every entry of the privacy index at a section on the page', () => {
    const { container } = render(<InfoPage slug="privacy" />);
    const index = screen.getByRole('navigation', { name: 'On this page' });
    for (const link of within(index).getAllByRole('link')) {
      expect(container.querySelector(link.getAttribute('href'))).not.toBeNull();
    }
  });

  it('makes every contact card a mail link', () => {
    render(<InfoPage slug="contact" />);
    const hrefs = screen.getAllByRole('link').map((link) => link.getAttribute('href'));
    expect(hrefs).toEqual(INFO_PAGES.contact.channels.map(({ email }) => `mailto:${email}`));
  });

  it('never prints an empty company fact', () => {
    expect(JSON.stringify(INFO_PAGES)).not.toMatch(/undefined|run by \.|law of \./);
  });
});
