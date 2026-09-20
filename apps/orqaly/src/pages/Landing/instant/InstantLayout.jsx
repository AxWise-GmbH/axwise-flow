import { useEffect } from 'react';
import { Box, ThemeProvider } from '@mui/material';
import { LANDING_PAGE_ROOT_SX } from '../../../utils/mobileTouchScroll';
import { instantTheme } from './instantTheme';
import Ambient from './ui/Ambient';
import Loader from './ui/Loader';
import InstantTopBar from './InstantTopBar';
import InstantFooter from './InstantFooter';
import './instant.css';
import './chrome.css';
import './perf.css';

const FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600&family=Geist+Mono:wght@400;500&display=swap';

/** The black stage every "Instant" page stands on: theme, light, bar, footer, head tags. */
export default function InstantLayout({ title, loader = false, children }) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title;
    // Only these pages use Geist, so only they pay for it.
    const fonts = document.createElement('link');
    fonts.rel = 'stylesheet';
    fonts.href = FONTS_HREF;
    document.head.append(fonts);
    return () => {
      document.title = previousTitle;
      fonts.remove();
    };
  }, [title]);

  return (
    <ThemeProvider theme={instantTheme}>
      <Box
        data-landing-root
        data-landing-variant="instant"
        sx={{
          bgcolor: 'background.default',
          color: 'text.primary',
          position: 'relative',
          ...LANDING_PAGE_ROOT_SX,
        }}
      >
        {loader && <Loader />}
        <Ambient />
        <InstantTopBar />
        <Box component="main" id="main-content" className="oi-above">
          {children}
        </Box>
        <InstantFooter />
      </Box>
    </ThemeProvider>
  );
}
