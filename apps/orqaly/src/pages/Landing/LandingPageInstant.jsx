import { Suspense, lazy } from 'react';
import InstantLayout from './instant/InstantLayout';
import OrbitHero from './instant/OrbitHero';
import Capabilities from './instant/Capabilities';
import InstantFaq from './instant/InstantFaq';
import DownloadBlock from './instant/DownloadBlock';
import { useT } from './instant/i18n/useT';

// Everything below the first screen that is heavy loads after it, so the hero paints first.
const WatchItWork = lazy(() => import('./instant/WatchItWork.jsx'));
const Anywhere = lazy(() => import('./instant/Anywhere.jsx'));
const UseCases = lazy(() => import('./instant/UseCases.jsx'));

/**
 * A late block behind a placeholder of its own height (desktop, phone), so the page does
 * not jump when the block lands.
 */
function Late({ height, phoneHeight, children }) {
  const slot = (
    <div
      className="oi-watch-placeholder oi-lazy-slot"
      aria-hidden="true"
      style={{ '--oi-slot': `${height}px`, '--oi-slot-phone': `${phoneHeight}px` }}
    />
  );
  return <Suspense fallback={slot}>{children}</Suspense>;
}

// The owner's order: hero, demo, use cases, channels, the capability strip, questions,
// download. Speed has its own page; the examples window repeated the demo; the owner took
// the integrations block off (IntegrationsHub.jsx stays, unused).
export default function LandingPageInstant() {
  const { t } = useT();
  return (
    <InstantLayout
      title={t('home.title', 'Orqanix — Instant Intelligence on your Mac')}
      entrance
      translated
    >
      <OrbitHero />
      <Late height={1241} phoneHeight={1996}>
        <WatchItWork />
      </Late>
      <Late height={1108} phoneHeight={1021}>
        <UseCases />
      </Late>
      <Late height={956} phoneHeight={1273}>
        <Anywhere />
      </Late>
      <Capabilities />
      <InstantFaq />
      <DownloadBlock />
    </InstantLayout>
  );
}
