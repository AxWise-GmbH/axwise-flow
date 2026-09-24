/*
 * The Legal Center's index: which documents exist, where they sit and who they are for.
 * The footer imports this small file only; the texts themselves live in ./docs/<slug>.json
 * and load when a document opens, so they never count toward the JavaScript we ship.
 *
 * Regions: 'eu' is the EEA, the UK and Switzerland; 'us' is the United States and every
 * other country. A document for one region only lists just that one. The switch never
 * changes region on its own (EU Geo-blocking Regulation, Art. 3(2)): the URL says which
 * version is shown, a visitor's own click is remembered, and otherwise DEFAULT_REGION.
 */
import { COMPANY } from '../info/company';

export const LEGAL_BASE = '/instant/legal';

export const REGIONS = [
  { id: 'us', label: 'US', name: 'United States & other countries' },
  { id: 'eu', label: 'EU', name: 'EEA, UK & Switzerland' },
];
export const REGION_IDS = REGIONS.map((region) => region.id);
// The company is not chosen yet (owner, 2026-09-21), so the EU version comes first.
export const DEFAULT_REGION = 'eu';

export const LEGAL_GROUPS = [
  { id: 'terms', label: 'Terms' },
  { id: 'policies', label: 'Policies' },
  { id: 'trust', label: 'Trust' },
  { id: 'company', label: 'Company' },
];

// The product chips on the hub, in the Products menu's order (Personalised Models is hidden).
export const LEGAL_PRODUCTS = [
  { id: 'desktop', label: 'Desktop App' },
  { id: 'mobile', label: 'Mobile App' },
  { id: 'assistant-bot', label: 'Assistant Bot' },
  { id: 'api', label: 'API' },
  { id: 'enterprise', label: 'Enterprise' },
];

const ALL = LEGAL_PRODUCTS.map((product) => product.id);
const BOTH = ['us', 'eu'];

/*
 * One entry per document. `products` decides which product chip keeps it (an empty list:
 * the website itself, shown under "All" only). `contact` is the COMPANY email printed at its
 * end. `needs` hides the whole document while those company facts are empty.
 */
export const LEGAL_DOCS = [
  {
    slug: 'terms',
    title: 'Terms of Service',
    group: 'terms',
    products: ALL,
    regions: BOTH,
    contact: 'email',
  },
  {
    slug: 'desktop-app-terms',
    title: 'Desktop App Terms',
    group: 'terms',
    products: ['desktop'],
    regions: BOTH,
    contact: 'email',
  },
  {
    slug: 'mobile-app-terms',
    title: 'Mobile App Terms',
    group: 'terms',
    products: ['mobile'],
    regions: BOTH,
    contact: 'email',
  },
  {
    slug: 'assistant-bot-terms',
    title: 'Assistant Bot Terms',
    group: 'terms',
    products: ['assistant-bot'],
    regions: BOTH,
    contact: 'email',
  },
  {
    slug: 'api-terms',
    title: 'API Terms',
    group: 'terms',
    products: ['api'],
    regions: BOTH,
    contact: 'email',
  },
  {
    slug: 'enterprise-terms',
    title: 'Enterprise Terms',
    group: 'terms',
    products: ['enterprise'],
    regions: BOTH,
    contact: 'email',
  },
  {
    slug: 'dpa',
    title: 'Data Processing Addendum',
    group: 'terms',
    products: ['api', 'enterprise'],
    regions: BOTH,
    contact: 'privacyEmail',
  },
  {
    slug: 'privacy',
    title: 'Privacy Policy',
    group: 'policies',
    products: ALL,
    regions: BOTH,
    contact: 'privacyEmail',
  },
  {
    slug: 'cookies',
    title: 'Cookies & Storage',
    group: 'policies',
    products: [],
    regions: BOTH,
    contact: 'privacyEmail',
  },
  {
    slug: 'acceptable-use',
    title: 'Acceptable Use Policy',
    group: 'policies',
    products: ALL,
    regions: BOTH,
    contact: 'email',
  },
  {
    slug: 'health-data',
    title: 'Consumer Health Data Privacy Policy',
    group: 'policies',
    products: ['desktop', 'mobile', 'assistant-bot'],
    regions: ['us'],
    contact: 'privacyEmail',
  },
  {
    slug: 'ai',
    title: 'How Our AI Works',
    group: 'trust',
    products: ALL,
    regions: BOTH,
    contact: 'email',
  },
  {
    slug: 'subprocessors',
    title: 'Sub-processors',
    group: 'trust',
    products: ALL,
    regions: BOTH,
    contact: 'privacyEmail',
  },
  {
    slug: 'security',
    title: 'Security & Vulnerability Disclosure',
    group: 'trust',
    products: ALL,
    regions: BOTH,
    contact: 'securityEmail',
  },
  {
    slug: 'accessibility',
    title: 'Accessibility Statement',
    group: 'trust',
    products: [],
    regions: BOTH,
    contact: 'email',
  },
  {
    slug: 'open-source',
    title: 'Open-Source Notices',
    group: 'company',
    products: ['desktop'],
    regions: BOTH,
    contact: 'email',
  },
  {
    slug: 'legal-notice',
    title: 'Legal Notice',
    group: 'company',
    products: [],
    regions: BOTH,
    contact: 'email',
    needs: ['legalName', 'address'],
  },
];

const isFilled = (key) => Boolean(COMPANY[key]);

/** The documents that can be shown: those whose company facts are filled in. */
export const PUBLISHED_DOCS = LEGAL_DOCS.filter((doc) => (doc.needs ?? []).every(isFilled));

export function findLegalDoc(slug) {
  return PUBLISHED_DOCS.find((doc) => doc.slug === slug) ?? null;
}

export function isRegion(value) {
  return REGION_IDS.includes(value);
}

/** The Legal Center (in a region, if given), or one document (in a region, if given). */
export function legalPath(slug, region) {
  return [LEGAL_BASE, region, slug].filter(Boolean).join('/');
}

// The footer's Legal column: a few documents in view, the rest under its More.
const FOOTER_SHOWN = [
  ['terms', 'Terms of Service'],
  ['privacy', 'Privacy Policy'],
  ['cookies', 'Cookies & Storage'],
  // Washington's health-data law wants this one easy to find from the home page.
  ['health-data', 'Health Data Privacy (US)'],
  // The German imprint must be easy to find too; it appears once the company is filled in.
  ['legal-notice', 'Legal Notice'],
];
const FOOTER_MORE = [
  ['desktop-app-terms', 'Desktop App Terms'],
  ['mobile-app-terms', 'Mobile App Terms'],
  ['assistant-bot-terms', 'Assistant Bot Terms'],
  ['api-terms', 'API Terms'],
  ['enterprise-terms', 'Enterprise Terms'],
  ['dpa', 'Data Processing Addendum'],
  ['acceptable-use', 'Acceptable Use'],
  ['ai', 'How Our AI Works'],
  ['subprocessors', 'Sub-processors'],
  ['security', 'Security'],
  ['accessibility', 'Accessibility'],
  ['open-source', 'Open Source'],
];

const footerLinks = (list) =>
  list
    .filter(([slug]) => findLegalDoc(slug))
    .map(([slug, label]) => ({ slug, label, to: legalPath(slug) }));

export const FOOTER_LEGAL = [
  { slug: 'center', label: 'Legal Center', to: LEGAL_BASE },
  ...footerLinks(FOOTER_SHOWN),
];
export const FOOTER_LEGAL_MORE = footerLinks(FOOTER_MORE);

// Every footer label with its key (legal.<slug>), for the translators' word list.
export const FOOTER_LEGAL_LABELS = [['center', 'Legal Center'], ...FOOTER_SHOWN, ...FOOTER_MORE];

/*
 * The index's names in the reader's language. The English above stays the source (tests and
 * the footer read it); `t` is useT's. Keys: lg.region.<id>.label / .name, lg.group.<id>,
 * lg.product.<id>, lg.doc.<slug>.
 */
const regionOf = (id) => REGIONS.find((region) => region.id === id);
const NAME_KEYS = {
  regionLabel: (id) => [`lg.region.${id}.label`, regionOf(id).label],
  regionName: (id) => [`lg.region.${id}.name`, regionOf(id).name],
  group: (id) => [`lg.group.${id}`, LEGAL_GROUPS.find((group) => group.id === id).label],
  product: (id) => [`lg.product.${id}`, LEGAL_PRODUCTS.find((product) => product.id === id).label],
  doc: (slug) => [`lg.doc.${slug}`, LEGAL_DOCS.find((doc) => doc.slug === slug).title],
};

export function legalNames(t) {
  return Object.fromEntries(
    Object.entries(NAME_KEYS).map(([name, key]) => [name, (id) => t(...key(id))])
  );
}

/** Every name legalNames can say, as { key: English }, for the translators' word list. */
export function legalWords() {
  return Object.fromEntries([
    ...REGION_IDS.flatMap((id) => [NAME_KEYS.regionLabel(id), NAME_KEYS.regionName(id)]),
    ...LEGAL_GROUPS.map(({ id }) => NAME_KEYS.group(id)),
    ...LEGAL_PRODUCTS.map(({ id }) => NAME_KEYS.product(id)),
    ...LEGAL_DOCS.map(({ slug }) => NAME_KEYS.doc(slug)),
  ]);
}
