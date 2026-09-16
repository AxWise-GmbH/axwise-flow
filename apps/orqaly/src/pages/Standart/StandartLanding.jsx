/**
 * [module: frontend]
 *
 * /standart - the Standart landing page.
 *
 * Public and bare, like the review-surface routes: no auth, no MainLayout, and
 * no data fetching. That last one matters more than it looks - vite.config.js
 * proxies /api to PRODUCTION in development, so a marketing page that made a
 * request would be reading live customer data just to be looked at. This one
 * makes none.
 *
 * It deliberately does NOT use `components/Public/PublicShell`. That shell
 * carries the site's StickyNav and Footer, which are drawn on the site's green
 * theme; this page's chrome carries the GCP launch routes in mono. The tree
 * lives in `standartCopy.js`, alongside every other public claim on the page.
 *
 * NOT PART OF THE STANDART SWEEP. `pages/standartPages.sweep.test.js` and its
 * siblings cover APP pages rendered in Standart - their toolbars, filters, tab
 * strips and table cells. This is a marketing page that happens to be drawn in
 * the same language, and it consumes none of the `standard*Sx` helpers those
 * tests check for. Do not add it to the sweep; it has its own tests.
 *
 * `data-landing-root` is deliberately absent: theme/marketingCta.js keys a
 * pulsing accent halo off `[data-landing-root] [data-marketing-cta]`, and a
 * green pulse on a monochrome page would be the only colour on it.
 */
import { useEffect } from 'react';
import { Box } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import { LANDING_PAGE_ROOT_SX } from '../../utils/mobileTouchScroll';
import { standartTheme } from './standartTheme';
import StandartGlobalStyles, { STANDART_ROOT_ID } from './StandartGlobalStyles';
import { INK } from './standartTokens';
import { META, SECTION_IDS } from './standartCopy';
import useAnchorNav from './useAnchorNav';

import StandartNav from './sections/StandartNav';
import StandartScrollOrb from './sections/StandartScrollOrb';
import StandartHero from './sections/StandartHero';
import TeamBuildDemo from './sections/TeamBuildDemo';
import ProductBento from './sections/ProductBento';
import HowItWorks from './sections/HowItWorks';
import ProofStrip from './sections/ProofStrip';
import FeatureBento from './sections/FeatureBento';
import AgentJobs from './sections/AgentJobs';
import ManyAgents from './sections/ManyAgents';
import StandartMode from './sections/StandartMode';
import SuiteRow from './sections/SuiteRow';
import SecurityBlock from './sections/SecurityBlock';
import Principles from './sections/Principles';
import MissionBlock from './sections/MissionBlock';
import NewsSection from './sections/NewsSection';
import FinalCta from './sections/FinalCta';
import StandartFooter from './sections/StandartFooter';

export default function StandartLanding() {
  const { go } = useAnchorNav(SECTION_IDS);

  // The house pattern for a page title: an effect that sets it and restores the
  // previous value on unmount, as About.jsx and SearchResults.jsx do. There is
  // no react-helmet in this project and none is being added.
  //
  // The description is set here for browsers and search crawlers. It is ALSO in
  // standart.html, and that copy is the one that matters for link previews:
  // Slack, LinkedIn and the rest do not run JavaScript, so a tag written by
  // React is invisible to them.
  useEffect(() => {
    const previousTitle = document.title;
    document.title = META.title;

    const meta = document.querySelector('meta[name="description"]');
    const previousDescription = meta?.getAttribute('content') ?? null;
    if (meta) meta.setAttribute('content', META.description);

    return () => {
      document.title = previousTitle;
      if (meta && previousDescription !== null) {
        meta.setAttribute('content', previousDescription);
      }
    };
  }, []);

  return (
    <ThemeProvider theme={standartTheme}>
      <StandartGlobalStyles />
      <Box
        id={STANDART_ROOT_ID}
        sx={{
          position: 'relative',
          bgcolor: INK.ground,
          color: INK.bright,
          // The iOS one-finger-scroll and horizontal-clip set the other
          // marketing pages already use. Reused rather than re-derived: the
          // traps behind it are documented in mobileTouchScroll.js.
          ...LANDING_PAGE_ROOT_SX,
        }}
      >
        <StandartScrollOrb />
        {/* The bar navigates the site, so it takes neither the scrolled-to
            section nor the in-page scroller. `go` is still wired to the hero
            pill, SuiteRow and MissionBlock, which are this page's own
            navigation now. */}
        <StandartNav />

        <Box component="main" id="main-content" sx={{ position: 'relative', zIndex: 1 }}>
          <StandartHero onGo={go} />
          <TeamBuildDemo />
          <ProductBento />
          <HowItWorks />
          <ProofStrip />
          <FeatureBento />
          <AgentJobs />
          <ManyAgents />
          <StandartMode />
          <SuiteRow onGo={go} />
          <SecurityBlock />
          <Principles />
          <MissionBlock onGo={go} />
          <NewsSection onGo={go} />
          <FinalCta />
        </Box>

        {/* The footer takes the year as a prop rather than reading the clock
            itself, so a test can pin it. Reading it here is no purer - it is the
            same call - but it keeps the one impure line in the composition root
            where it is easy to find, instead of in a leaf that renders on every
            scroll. */}
        <StandartFooter year={new Date().getFullYear()} />
      </Box>
    </ThemeProvider>
  );
}
