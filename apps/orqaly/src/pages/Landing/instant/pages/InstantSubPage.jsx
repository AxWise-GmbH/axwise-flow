import { Component, Suspense, lazy, useEffect } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import InstantLayout from '../InstantLayout';
import DownloadBlock from '../DownloadBlock';
import PageHero from './PageHero';
import { INSTANT_HOME, INSTANT_PAGES, pageTitleKey } from './instantPages';
import { useT } from '../i18n/useT';
import './pages.css';

// A glob only lists files that exist, so a page whose body is not written yet falls
// back to a holding screen instead of breaking the whole route with a failed import.
const loaders = import.meta.glob([
  './HowItWorksPage.jsx',
  './FeaturesPage.jsx',
  './SpeedPage.jsx',
  './NewsPage.jsx',
]);
const FILES = {
  'how-it-works': './HowItWorksPage.jsx',
  features: './FeaturesPage.jsx',
  speed: './SpeedPage.jsx',
  news: './NewsPage.jsx',
};
// About, Contact, Privacy and Terms share one body, which picks its copy by slug.
const InfoPage = lazy(() => import('./InfoPage.jsx'));
const BODIES = Object.fromEntries([
  ...Object.entries(FILES)
    .filter(([, file]) => loaders[file])
    .map(([slug, file]) => [slug, lazy(loaders[file])]),
  ...INSTANT_PAGES.filter((page) => page.info).map((page) => [page.slug, InfoPage]),
]);

// A page body that fails to load or render (a stale chunk after a deploy, a network drop)
// must not take the header, the download block and the footer down with it.
class BodyBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidUpdate(previous) {
    if (previous.slug !== this.props.slug && this.state.failed) this.setState({ failed: false });
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export default function InstantSubPage() {
  const { page } = useParams();
  const entry = INSTANT_PAGES.find((item) => item.slug === page);
  const { t } = useT('pg');

  // A new page starts at its top; the router keeps the old scroll position otherwise.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [page]);

  if (!entry) return <Navigate to={INSTANT_HOME} replace />;
  if (entry.redirect) return <Navigate to={entry.redirect} replace />;
  const Body = BODIES[entry.slug];
  const label = t(`pages.${entry.slug}.label`, entry.label);
  const holding = (
    <PageHero
      id="instant-page-heading"
      tag={label}
      title={label}
      line={t('pg.holding.line', 'This page is on its way. Please try again in a moment.')}
    />
  );

  // Every body is translated now (News by its own words, loaded by its page).
  return (
    <InstantLayout title={t(pageTitleKey(entry.slug), entry.title)} translated>
      {Body ? (
        <BodyBoundary slug={entry.slug} fallback={holding}>
          <Suspense fallback={<div className="oip-loading" aria-hidden="true" />}>
            <Body slug={entry.slug} />
          </Suspense>
        </BodyBoundary>
      ) : (
        holding
      )}
      {/* How it works ends on the button alone: no More under it (owner, 2026-09-21). */}
      <DownloadBlock details={entry.slug !== 'how-it-works'} />
    </InstantLayout>
  );
}
