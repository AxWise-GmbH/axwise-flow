import { useCallback, useEffect } from 'react';
import { Box } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import SimpleTopBar from './simple/SimpleTopBar';
import SimpleHero from './simple/SimpleHero';
import SimpleHowItWorks from './simple/SimpleHowItWorks';
import SimpleExamples from './simple/SimpleExamples';
import SimpleFinalCta from './simple/SimpleFinalCta';
import SimpleFooter from './simple/SimpleFooter';
import { LANDING_PAGE_ROOT_SX } from '../../utils/mobileTouchScroll';

export default function LandingPageSimple() {
  const navigate = useNavigate();

  const goPreview = useCallback(() => navigate('/goals'), [navigate]);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Orqaly × AxWise — Cloud reasoning. Local action.';
    return () => {
      document.title = previousTitle;
    };
  }, []);

  return (
    <Box
      data-landing-root
      data-landing-variant="simple"
      sx={{
        bgcolor: 'background.default',
        position: 'relative',
        ...LANDING_PAGE_ROOT_SX,
      }}
    >
      <SimpleTopBar />
      <Box component="main" id="main-content">
        <SimpleHero onPrimaryCta={goPreview} />
        <SimpleExamples />
        <SimpleHowItWorks />
        <SimpleFinalCta onPrimaryCta={goPreview} />
      </Box>
      <SimpleFooter />
    </Box>
  );
}
