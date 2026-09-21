import { useCallback, useEffect } from 'react';
import { Box, ThemeProvider } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import SimpleTopBar from './simple/SimpleTopBar';
import SimpleHero from './simple/SimpleHero';
import SimpleHowItWorks from './simple/SimpleHowItWorks';
import SimpleExamples from './simple/SimpleExamples';
import SimpleFinalCta from './simple/SimpleFinalCta';
import SimpleFooter from './simple/SimpleFooter';
import { LANDING_PAGE_ROOT_SX } from '../../utils/mobileTouchScroll';
import { landingTheme } from './simple/landingTheme';

export default function LandingPageSimple() {
  const navigate = useNavigate();

  const goPreview = useCallback(() => navigate('/goals'), [navigate]);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Orqanix — Cloud reasoning. Local action.';
    return () => {
      document.title = previousTitle;
    };
  }, []);

  return (
    <ThemeProvider theme={landingTheme}>
      <Box
        data-landing-root
        data-landing-variant="simple"
        sx={{
          bgcolor: 'background.default',
          color: 'text.primary',
          backgroundImage: 'radial-gradient(ellipse at 95% 0%, #ebebeb 0%, transparent 36%)',
          position: 'relative',
          ...LANDING_PAGE_ROOT_SX,
        }}
      >
        <SimpleTopBar />
        <Box component="main" id="main-content">
          <SimpleHero onPrimaryCta={goPreview} />
          <SimpleHowItWorks />
          <SimpleExamples />
          <SimpleFinalCta onPrimaryCta={goPreview} />
        </Box>
        <SimpleFooter />
      </Box>
    </ThemeProvider>
  );
}
