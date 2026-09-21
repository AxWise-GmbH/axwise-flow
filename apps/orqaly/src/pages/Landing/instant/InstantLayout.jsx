import { useEffect, useState } from 'react';
import { Box, ThemeProvider } from '@mui/material';
import { LANDING_PAGE_ROOT_SX } from '../../../utils/mobileTouchScroll';
import { instantTheme } from './instantTheme';
import Ambient from './ui/Ambient';
import InstantTopBar from './InstantTopBar';
import InstantFooter from './InstantFooter';
import './instant.css';
import './chrome.css';
import './perf.css';

const FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600&family=Geist+Mono:wght@400;500&display=swap';

// The faces the first screen sets its words in; the entrance waits for these.
const FIRST_SCREEN_FACES = [
  '300 1em Geist',
  '400 1em Geist',
  '500 1em Geist',
  '400 1em "Geist Mono"',
];

// A slow network never keeps the first screen dark for longer than this.
const FONT_WAIT_MS = 1500;

/**
 * The black stage every "Instant" page stands on: theme, light, bar, footer, head tags.
 *
 * With `entrance`, the root carries data-entrance: "wait" until the first screen's fonts are
 * in (or FONT_WAIT_MS has passed), then "go". The CSS holds the opening entrances on their
 * first frame while it waits, so the words rise once, already in their own face. Without
 * a font API (tests, old browsers) there is nothing to wait for.
 */
export default function InstantLayout({ title, entrance = false, children }) {
  const [entering, setEntering] = useState(() => {
    if (!entrance) return undefined;
    return typeof document !== 'undefined' && document.fonts ? 'wait' : 'go';
  });

  useEffect(() => {
    const previousTitle = document.title;
    document.title = title;
    // Only these pages use Geist, so only they pay for it.
    const fonts = document.createElement('link');
    fonts.rel = 'stylesheet';
    fonts.href = FONTS_HREF;

    // Once it is "go", a re-run only sets "go" again, which React ignores.
    let waiting = entrance && Boolean(document.fonts);
    const go = () => {
      if (!waiting) return;
      waiting = false;
      setEntering('go');
    };
    const cap = waiting ? setTimeout(go, FONT_WAIT_MS) : undefined;
    if (waiting) {
      // The stylesheet only declares the faces; asking for them is what fetches them.
      fonts.addEventListener('load', () => {
        Promise.all(FIRST_SCREEN_FACES.map((face) => document.fonts.load(face))).then(go, go);
      });
      fonts.addEventListener('error', go);
    }
    document.head.append(fonts);

    return () => {
      waiting = false;
      clearTimeout(cap);
      document.title = previousTitle;
      fonts.remove();
    };
  }, [title, entrance]);

  return (
    <ThemeProvider theme={instantTheme}>
      <Box
        data-landing-root
        data-landing-variant="instant"
        data-entrance={entering}
        sx={{
          bgcolor: 'background.default',
          color: 'text.primary',
          position: 'relative',
          ...LANDING_PAGE_ROOT_SX,
        }}
      >
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
