import { useCallback, useEffect } from 'react';
import { Box } from '@mui/material';
import { useNavigate, useLocation } from 'react-router-dom';
import StickyNav from '../../pages/Landing/sections/StickyNav';
import Footer from '../../pages/Landing/sections/Footer';
import MarketingCtaGlobalStyles from './primitives/MarketingCtaGlobalStyles';
import {
  LANDING_PAGE_ROOT_SX,
  PUBLIC_MAIN_SX,
  releaseBodyScrollLock,
} from '../../utils/mobileTouchScroll';

// Shared chrome for marketing/public pages so they live under the same
// header + footer as the landing.
export default function PublicShell({ children }) {
  const navigate = useNavigate();
  const location = useLocation();

  const goSignup = useCallback(() => navigate('/signup'), [navigate]);

  // When a marketing page is opened with a hash (e.g. /pricing#faq),
  // scroll the target into view once the page has mounted.
  // Mobile nav drawer locks body; ensure every route change clears it (iOS Safari).
  useEffect(() => {
    releaseBodyScrollLock({ scrollToTop: !location.hash });
  }, [location.pathname, location.hash]);

  useEffect(() => {
    if (!location.hash) return;
    const id = location.hash.slice(1);
    const el = document.getElementById(id);
    if (el) {
      requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  }, [location.hash]);

  return (
    <Box data-landing-root sx={{ bgcolor: 'background.default', ...LANDING_PAGE_ROOT_SX }}>
      <MarketingCtaGlobalStyles />
      <StickyNav onPrimaryCta={goSignup} />
      <Box id="main-content" component="main" sx={PUBLIC_MAIN_SX}>
        {children}
      </Box>
      <Footer />
    </Box>
  );
}
