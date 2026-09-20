import { Suspense, lazy } from 'react';
import InstantLayout from './instant/InstantLayout';
import OrbitHero from './instant/OrbitHero';
import Capabilities from './instant/Capabilities';
import InstantFaq from './instant/InstantFaq';
import DownloadBlock from './instant/DownloadBlock';

// Everything below the first screen that is heavy loads after it, so the hero paints first.
const WatchItWork = lazy(() => import('./instant/WatchItWork.jsx'));
const Anywhere = lazy(() => import('./instant/Anywhere.jsx'));
const IntegrationsHub = lazy(() => import('./instant/IntegrationsHub.jsx'));
const UseCases = lazy(() => import('./instant/UseCases.jsx'));

const PAGE_TITLE = 'Orqanix — Instant Intelligence on your Mac';

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

// The owner's order: hero, demo, use cases, channels, the capability strip, integrations,
// questions, download. Speed has its own page; the examples window repeated the demo.
export default function LandingPageInstant() {
  return (
    <InstantLayout title={PAGE_TITLE} loader>
      <OrbitHero />
      <Late height={1250} phoneHeight={1760}>
        <WatchItWork />
      </Late>
      <Late height={1148} phoneHeight={1062}>
        <UseCases />
      </Late>
      <Late height={956} phoneHeight={1171}>
        <Anywhere />
      </Late>
      <Capabilities />
      <Late height={967} phoneHeight={1321}>
        <IntegrationsHub />
      </Late>
      <InstantFaq />
      <DownloadBlock />
    </InstantLayout>
  );
}
