import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import InstantFooter from './InstantFooter';
import InfoPage from './pages/InfoPage';
import { INSTANT_PAGES } from './pages/instantPages';
import { INFO_PAGES } from './pages/info/info.data';
import { SOLUTIONS_MENU, solutionPath } from './pages/solutions/solutionsMenu';
import { NAV_PRODUCTS, PRODUCT_SLUGS, productPath } from './pages/products/productsMenu';
import {
  FOOTER_LEGAL,
  FOOTER_LEGAL_MORE,
  LEGAL_BASE,
  PUBLISHED_DOCS,
  legalPath,
} from './pages/legal/legal.links';

const INFO_SLUGS = INSTANT_PAGES.filter((page) => page.info).map((page) => page.slug);
// Personalised Models keeps its page but stays out of the footer (nav: false).
const NAV_HREFS = NAV_PRODUCTS.map((item) => productPath(item.slug));

function renderFooter() {
  render(
    <MemoryRouter>
      <InstantFooter />
    </MemoryRouter>
  );
}

// Each long column (Solutions, Legal) keeps its tail under its own More.
const columnOf = (name) => screen.getByRole('list', { name }).parentElement;
const openAllMore = (nav) =>
  within(nav)
    .getAllByRole('button', { name: 'More' })
    .forEach((button) => fireEvent.click(button));

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
    fireEvent.click(within(columnOf('Solutions')).getByRole('button', { name: 'More' }));
    expect(shown()).toEqual(SOLUTIONS_MENU.map((item) => item.label));
  });

  it('links every shown product, every solution and every text page, and only pages that exist', () => {
    renderFooter();
    const nav = screen.getByRole('navigation', { name: 'Footer' });
    openAllMore(nav);
    const hrefs = within(nav)
      .getAllByRole('link')
      .map((link) => link.getAttribute('href'));

    const expected = [
      ...NAV_HREFS,
      '/instant/how-it-works',
      '/instant/features',
      ...SOLUTIONS_MENU.map((item) => solutionPath(item.slug)),
      ...INFO_SLUGS.map((slug) => `/instant/${slug}`),
      // Owner: News lives in the footer only (Company column), not in the header.
      '/instant/news',
      // The Legal Center and every document it shows.
      LEGAL_BASE,
      ...PUBLISHED_DOCS.map((doc) => legalPath(doc.slug)),
    ];
    expect([...hrefs].sort()).toEqual([...expected].sort());

    const known = new Set([
      ...INSTANT_PAGES.map((page) => page.path),
      ...PRODUCT_SLUGS.map(productPath),
      ...SOLUTIONS_MENU.map((item) => solutionPath(item.slug)),
      LEGAL_BASE,
      ...PUBLISHED_DOCS.map((doc) => legalPath(doc.slug)),
    ]);
    expect(hrefs.filter((href) => !known.has(href))).toEqual([]);
  });

  it('opens the Product column with the shown products, then the two app pages, no pill', () => {
    renderFooter();
    const column = screen.getByRole('list', { name: 'Product' });
    const hrefs = within(column)
      .getAllByRole('link')
      .map((link) => link.getAttribute('href'));
    expect(hrefs).toEqual([...NAV_HREFS, '/instant/how-it-works', '/instant/features']);
    expect(hrefs).not.toContain(productPath('personalised-models'));
    expect(column.textContent).not.toMatch(/soon|Personalised/i);
  });

  it('opens the Legal column on the Legal Center and the main documents, the rest under More', () => {
    renderFooter();
    const column = columnOf('Legal');
    const labels = () =>
      within(screen.getByRole('list', { name: 'Legal' }))
        .getAllByRole('link')
        .map((link) => link.textContent);
    // The Legal Notice joins them once the company facts are filled in (company.js).
    expect(labels()).toEqual(FOOTER_LEGAL.map((link) => link.label));
    expect(labels().slice(0, 4)).toEqual([
      'Legal Center',
      'Terms of Service',
      'Privacy Policy',
      'Cookies & Storage',
    ]);
    // Washington's health-data law wants this link easy to find: in view, not under More.
    expect(labels()).toContain('Health Data Privacy (US)');
    fireEvent.click(within(column).getByRole('button', { name: 'More' }));
    const more = within(column)
      .getAllByRole('link')
      .map((link) => link.textContent);
    expect(more).toEqual([...FOOTER_LEGAL, ...FOOTER_LEGAL_MORE].map((link) => link.label));
    expect(more).toEqual(
      expect.arrayContaining(['Desktop App Terms', 'API Terms', 'Enterprise Terms'])
    );
  });

  it('keeps the makers line and drops the two lines the owner removed', () => {
    renderFooter();
    const footer = screen.getByRole('contentinfo');
    expect(footer).toHaveTextContent('Made by a group of AI product engineers and consultants');
    expect(footer).not.toHaveTextContent(/pronounced|Built on Goose|Powered by Gemini/);
  });

  it('puts one light/dark switch beside the language button, by the logo (owner, 2026-09-22)', () => {
    renderFooter();
    const footer = screen.getByRole('contentinfo');
    const switches = within(footer).getAllByRole('button', { name: /Switch to (light|dark) mode/ });
    expect(switches).toHaveLength(1);
    const brandRow = footer.querySelector('.oi-footer-brand-row');
    expect(brandRow).toContainElement(switches[0]);
    expect(brandRow.lastElementChild).toBe(switches[0]);
    // The bottom row is the © and the makers line again, nothing else.
    expect(footer.querySelector('.oi-footer-base')).not.toContainElement(switches[0]);
  });

  it('keeps the mail pill in the panel bottom-left corner, after the link columns (owner, 2026-09-22)', () => {
    renderFooter();
    const footer = screen.getByRole('contentinfo');
    const mail = within(footer).getByRole('link', { name: /hello@orqanix\.com/ });
    expect(mail).toHaveAttribute('href', 'mailto:hello@orqanix.com');
    const panel = footer.querySelector('.oi-footer-panel');
    expect(panel.lastElementChild).toBe(mail);
    expect(footer.querySelector('.oi-footer-brand')).not.toContainElement(mail);
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

  it('makes every contact card a mail link', () => {
    render(<InfoPage slug="contact" />);
    const hrefs = screen.getAllByRole('link').map((link) => link.getAttribute('href'));
    expect(hrefs).toEqual(INFO_PAGES.contact.channels.map(({ email }) => `mailto:${email}`));
  });

  it('never prints an empty company fact', () => {
    expect(JSON.stringify(INFO_PAGES)).not.toMatch(/undefined|run by \.|law of \./);
  });
});
