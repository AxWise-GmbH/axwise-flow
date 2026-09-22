/*
 * The six products, in the owner's order. This small list is all the top bar needs, so the
 * header never pulls a product page or its animated scene into the first download.
 * Only Personalised Models carries a "Coming soon" label (owner, 2026-09-21).
 * Items marked nav: false keep their page but stay out of the header and the footer
 * (Personalised Models, owner, 2026-09-21).
 */

export const PRODUCTS_BASE = '/instant/products';

export const PRODUCTS_MENU = [
  { slug: 'desktop', label: 'Desktop App', line: 'AI agents that do the work on your Mac' },
  { slug: 'mobile', label: 'Mobile App', line: 'Check and re-run your work from your phone' },
  { slug: 'api', label: 'API', line: 'Our reasoning layer, inside your product' },
  { slug: 'assistant-bot', label: 'Assistant Bot', line: 'A business assistant with its own role' },
  {
    slug: 'personalised-models',
    label: 'Personalised Models',
    line: 'A model that learns your business',
    soon: true,
    nav: false,
  },
  { slug: 'enterprise', label: 'Enterprise', line: 'Our agents and experts build it for you' },
];

export const PRODUCT_SLUGS = PRODUCTS_MENU.map((item) => item.slug);
// The products the header menus and the footer list.
export const NAV_PRODUCTS = PRODUCTS_MENU.filter((item) => item.nav !== false);
export const SOON_LABEL = 'Coming soon';

export function productPath(slug) {
  return `${PRODUCTS_BASE}/${slug}`;
}

export function findProduct(slug) {
  return PRODUCTS_MENU.find((item) => item.slug === slug) ?? null;
}

/** The product whose page is open (a trailing slash too), or null on any other page. */
export function productFromPath(pathname) {
  const prefix = `${PRODUCTS_BASE}/`;
  return pathname.startsWith(prefix)
    ? findProduct(pathname.slice(prefix.length).replace(/\/+$/, ''))
    : null;
}
