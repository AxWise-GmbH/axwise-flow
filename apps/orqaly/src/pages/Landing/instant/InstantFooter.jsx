import { Link as RouterLink } from 'react-router-dom';
import { OrqanixMark } from './ui/Glyphs';
import More from './ui/More';
import { INSTANT_HOME, instantPagePath } from './pages/instantPages';
import { SOLUTIONS_MENU, solutionPath } from './pages/solutions/solutionsMenu';
import { COMPANY } from './pages/info/company';

const page = (slug, label) => ({ label, to: instantPagePath(slug) });

// The column shows this many solutions; the rest wait under "More", so it stays one column.
const SOLUTIONS_SHOWN = 5;
const SOLUTIONS = SOLUTIONS_MENU.map(({ slug, label }) => ({ label, to: solutionPath(slug) }));

const COLUMNS = [
  {
    title: 'Product',
    links: [page('how-it-works', 'How it works'), page('features', 'Features')],
  },
  {
    title: 'Solutions',
    long: true,
    links: SOLUTIONS.slice(0, SOLUTIONS_SHOWN),
    more: SOLUTIONS.slice(SOLUTIONS_SHOWN),
  },
  {
    title: 'Company',
    links: [page('about', 'About'), page('contact', 'Contact')],
  },
  {
    title: 'Legal',
    links: [page('privacy', 'Privacy'), page('terms', 'Terms')],
  },
];

function LinkList({ links, labelledBy }) {
  return (
    <ul aria-labelledby={labelledBy}>
      {links.map(({ label, to }) => (
        <li key={to}>
          <RouterLink to={to} className="oi-footer-link">
            {label}
          </RouterLink>
        </li>
      ))}
    </ul>
  );
}

export default function InstantFooter() {
  return (
    <footer className="oi-footer oi-above">
      <div className="oi-container">
        <div className="oi-footer-panel">
          <div className="oi-footer-brand">
            <RouterLink to={INSTANT_HOME} className="oi-brand">
              <OrqanixMark className="oi-brand-mark" />
              {COMPANY.name}
            </RouterLink>
            <p className="oi-footer-line">
              Instant Intelligence.
              <br />
              On your Apple computers.
            </p>
            <a className="oi-footer-mail" href={`mailto:${COMPANY.email}`}>
              {COMPANY.email}
              <span aria-hidden="true">→</span>
            </a>
          </div>
          <nav aria-label="Footer" className="oi-footer-cols">
            {COLUMNS.map(({ title, long, links, more }) => (
              <div
                key={title}
                className={long ? 'oi-footer-col oi-footer-col-long' : 'oi-footer-col'}
              >
                <p id={`oi-footer-${title}`} className="oi-footer-topic">
                  {title}
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
        </div>
        <div className="oi-footer-base">
          <p className="oi-small">
            © {new Date().getFullYear()} {COMPANY.name}
          </p>
          <p className="oi-small">Made by a group of AI product engineers and consultants</p>
        </div>
      </div>
      <span className="oi-wordmark" aria-hidden="true">
        Orqanix
      </span>
    </footer>
  );
}
