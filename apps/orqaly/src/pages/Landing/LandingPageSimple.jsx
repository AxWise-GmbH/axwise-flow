import { useCallback } from 'react';
import { Box } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import SimpleTopBar from './simple/SimpleTopBar';
import SimpleHero from './simple/SimpleHero';
import SimpleProblemSolution from './simple/SimpleProblemSolution';
import SimpleHowItWorks from './simple/SimpleHowItWorks';
import SimpleExamples from './simple/SimpleExamples';
import SimpleFinalCta from './simple/SimpleFinalCta';
import SimpleFooter from './simple/SimpleFooter';
import MarketingCtaGlobalStyles from '../../components/Public/primitives/MarketingCtaGlobalStyles';
import { LANDING_PAGE_ROOT_SX } from '../../utils/mobileTouchScroll';

// No longer reachable from the `/` route, which always renders the full
// landing page - see LandingRoot.jsx. Kept for direct/standalone rendering.
export default function LandingPageSimple() {
  const navigate = useNavigate();

  const goSignup = useCallback(() => navigate('/signup'), [navigate]);
  const goContact = useCallback(() => navigate('/contact'), [navigate]);

  return (
    <Box
      data-landing-root
      data-landing-variant="simple"
      sx={{
        bgcolor: 'background.default',
        scrollBehavior: 'smooth',
        position: 'relative',
        ...LANDING_PAGE_ROOT_SX,
      }}
    >
      <MarketingCtaGlobalStyles />
      <SimpleTopBar />
      <Box component="main">
        <SimpleHero onPrimaryCta={goSignup} />
        <SimpleProblemSolution />
        <SimpleHowItWorks />
        <SimpleExamples />
        <SimpleFinalCta onPrimaryCta={goSignup} onSecondaryCta={goContact} />
      </Box>
      <SimpleFooter />
    </Box>
  );
}
