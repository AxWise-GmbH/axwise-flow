import { Link as RouterLink } from 'react-router-dom';
import { OrqanixMark } from './ui/Glyphs';
import More from './ui/More';
import ThemeSwitch from './ui/ThemeSwitch';
import { INSTANT_HOME, instantPagePath } from './pages/instantPages';
import { SOLUTIONS_MENU, solutionPath } from './pages/solutions/solutionsMenu';
import { NAV_PRODUCTS, productPath } from './pages/products/productsMenu';
import { COMPANY } from './pages/info/company';
import { PUBLIC_LEGAL_LINKS } from './pages/publicLegalLinks';
import LanguagePicker from './LanguagePicker';
import { useT } from './i18n/useT';
import DirArrow from './ui/DirArrow';

const page = (slug, label) => ({ label, key: `pages.${slug}.label`, to: instantPagePath(slug) });

// The column shows this many solutions; the rest wait under "More", so it stays one column.
const SOLUTIONS_SHOWN = 5;
const SOLUTIONS = SOLUTIONS_MENU.map(({ slug, label }) => ({
  label,
  key: `solutions.${slug}.label`,
  to: solutionPath(slug),
}));

const legalLink = ({ slug, label, to }) => ({ label, key: `legal.${slug}`, to });

// Column titles in the translators' list: footer.col.<id>.
const COLUMNS = [
  {
    // The listed products (no Coming soon pill here), then the two pages about the app.
    title: 'Product',
    links: [
      ...NAV_PRODUCTS.map(({ slug, label }) => ({
        label,
        key: `products.${slug}.label`,
        to: productPath(slug),
      })),
      page('how-it-works', 'How it works'),
      page('features', 'Features'),
    ],
  },
  {
    title: 'Solutions',
    long: true,
    links: SOLUTIONS.slice(0, SOLUTIONS_SHOWN),
    more: SOLUTIONS.slice(SOLUTIONS_SHOWN),
  },
  {
    title: 'Company',
    links: [page('about', 'About'), page('news', 'News'), page('contact', 'Contact')],
  },
  {
    title: 'Legal',
    links: PUBLIC_LEGAL_LINKS.map(legalLink),
  },
];

function LinkList({ links, labelledBy }) {
  const { t } = useT();
  return (
    <ul aria-labelledby={labelledBy}>
      {links.map(({ label, key, to }) => (
        <li key={to}>
          <RouterLink to={to} className="oi-footer-link">
            {t(key, label)}
          </RouterLink>
        </li>
      ))}
    </ul>
  );
}

const columnTitle = (t, title) =>
  ({
    Product: t('footer.col.product', 'Product'),
    Solutions: t('footer.col.solutions', 'Solutions'),
    Company: t('footer.col.company', 'Company'),
    Legal: t('footer.col.legal', 'Legal'),
  })[title];

export default function InstantFooter() {
  const { t } = useT();
  return (
    <footer className="oi-footer oi-above">
      <div className="oi-container">
        <div className="oi-footer-panel">
          <div className="oi-footer-brand">
            {/* The logo with the language button and the light/dark switch beside it. */}
            <div className="oi-footer-brand-row">
              <RouterLink to={INSTANT_HOME} className="oi-brand">
                <OrqanixMark className="oi-brand-mark" />
                {COMPANY.name}
              </RouterLink>
              <LanguagePicker />
              <ThemeSwitch />
            </div>
            <p className="oi-footer-line">
              <span dir="auto">{t('footer.tagline', 'Instant Intelligence.')}</span>
            </p>
          </div>
          <nav aria-label={t('footer.nav', 'Footer')} className="oi-footer-cols">
            {COLUMNS.map(({ title, long, links, more }) => (
              <div
                key={title}
                className={long ? 'oi-footer-col oi-footer-col-long' : 'oi-footer-col'}
              >
                <p id={`oi-footer-${title}`} className="oi-footer-topic">
                  {columnTitle(t, title)}
                </p>
                <LinkList links={links} labelledBy={`oi-footer-${title}`} />
                {more && (
                  <More>
                    <LinkList links={more} labelledBy={`oi-footer-${title}`} />
                  </More>
                )}
              </div>
            ))}
          </nav>
          {/* The mail sits in the panel's bottom-left corner (owner, 2026-09-22). */}
          <a className="oi-footer-mail" href={`mailto:${COMPANY.email}`}>
            {COMPANY.email}
            <DirArrow />
          </a>
        </div>
        <div className="oi-footer-base">
          <p className="oi-small">
            © {new Date().getFullYear()} {COMPANY.name}
          </p>
          <p className="oi-small">
            {t('footer.credit', 'Made by a group of AI product engineers and consultants')}
          </p>
        </div>
      </div>
      <span className="oi-wordmark" aria-hidden="true">
        Orqanix
      </span>
    </footer>
  );
}
