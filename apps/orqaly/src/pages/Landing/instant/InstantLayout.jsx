import { useEffect, useLayoutEffect, useState } from 'react';
import { Box, ThemeProvider } from '@mui/material';
import { LANDING_PAGE_ROOT_SX } from '../../../utils/mobileTouchScroll';
import { instantThemeFor } from './instantTheme';
import { PAGE_BACKGROUND_LIGHT } from './palette';
import { useInstantTheme } from './useInstantTheme';
import Ambient from './ui/Ambient';
import InstantTopBar from './InstantTopBar';
import InstantFooter from './InstantFooter';
// Geist is served from our own server, not Google Fonts: no visitor data goes to Google.
// Only these pages import it, so only they pay for it.
import '@fontsource/geist/300.css';
import '@fontsource/geist/400.css';
import '@fontsource/geist/500.css';
import '@fontsource/geist/600.css';
import '@fontsource/geist-mono/400.css';
import '@fontsource/geist-mono/500.css';
import './instant.css';
import './theme.css';
import './chrome.css';
import './perf.css';

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
 * The stage every "Instant" page stands on: theme, light, bar, footer, head tags. Black by
 * default; light when the visitor picks it with the footer switch (themeMode.js). The root
 * then carries data-oi-theme="light" and theme.css swaps every colour token.
 *
 * With `entrance`, the root carries data-entrance: "wait" until the first screen's fonts are
 * in (or FONT_WAIT_MS has passed), then "go". The CSS holds the opening entrances on their
 * first frame while it waits, so the words rise once, already in their own face. Without
 * a font API (tests, old browsers) there is nothing to wait for.
 *
 * The bar and the footer speak every language. A page's own words do only when it says
 * `translated`; until then its main block is marked English, left to right, so a reader
 * of Arabic gets an English page laid out the English way.
 */
export default function InstantLayout({ title, entrance = false, translated = false, children }) {
  const theme = useInstantTheme();
  const [entering, setEntering] = useState(() => {
    if (!entrance) return undefined;
    return typeof document !== 'undefined' && document.fonts ? 'wait' : 'go';
  });

  useEffect(() => {
    const previousTitle = document.title;
    document.title = title;

    // Once it is "go", a re-run only sets "go" again, which React ignores.
    let waiting = entrance && Boolean(document.fonts);
    const go = () => {
      if (!waiting) return;
      waiting = false;
      setEntering('go');
    };
    const cap = waiting ? setTimeout(go, FONT_WAIT_MS) : undefined;
    if (waiting) {
      // The bundled stylesheets only declare the faces; asking for them is what fetches them.
      Promise.all(FIRST_SCREEN_FACES.map((face) => document.fonts.load(face))).then(go, go);
    }

    return () => {
      waiting = false;
      clearTimeout(cap);
      document.title = previousTitle;
    };
  }, [title, entrance]);

  // The look reaches past the root before the first paint: the ground behind the page
  // (overscroll; the web app's body is near-black) and, while light, the phone's bar colour.
  // Both go back when the visitor leaves the landing.
  useLayoutEffect(() => {
    const html = document.documentElement;
    html.dataset.oiTheme = theme;
    const meta = theme === 'light' ? document.querySelector('meta[name="theme-color"]') : null;
    const previousColour = meta?.getAttribute('content');
    meta?.setAttribute('content', PAGE_BACKGROUND_LIGHT);
    return () => {
      delete html.dataset.oiTheme;
      if (meta && previousColour != null) meta.setAttribute('content', previousColour);
    };
  }, [theme]);

  return (
    <ThemeProvider theme={instantThemeFor(theme)}>
      <Box
        data-landing-root
        data-landing-variant="instant"
        data-oi-theme={theme}
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
        <Box
          component="main"
          id="main-content"
          className="oi-above"
          lang={translated ? undefined : 'en'}
          dir={translated ? undefined : 'ltr'}
        >
          {children}
        </Box>
        <InstantFooter />
      </Box>
    </ThemeProvider>
  );
}
