/**
 * [module: design-system]
 *
 * The two rules the theme island cannot reach: `<body>`, and form-control fonts.
 *
 * `<CssBaseline />` is mounted at the app root (App.jsx) and paints `body` from
 * the OUTER theme. So on an account whose app theme is light, the page itself is
 * black but the overscroll gutter - the rubber-band area above and below the
 * document on macOS and iOS - is #F8FAFC. It reads as a white flash on every
 * bounce, which is the one visual bug a dark-only page cannot ship with.
 *
 * `body:has(#standart-root)` rather than a class on body, for two reasons:
 *
 *  1. Specificity. `:has()` takes the specificity of its most specific argument,
 *     so this is (0,1,1) against CssBaseline's bare `body` at (0,0,1). It wins
 *     regardless of Emotion's insertion order, which is not something we control
 *     from inside a lazily-loaded route.
 *  2. It self-scopes. There is nothing to clean up: the moment #standart-root
 *     leaves the DOM the selector stops matching, so no other route can be
 *     stained by a page that unmounted badly.
 *
 * `colorScheme: 'dark'` is here rather than in the theme because it darkens the
 * native scrollbar and form controls, which are painted by the UA on the document
 * and never see a React theme.
 *
 * The page root also paints itself (`bgcolor: INK.ground` in StandartLanding), so
 * if `:has()` were ever unsupported the only regression is the gutter, not the
 * page.
 *
 * THE ARIAL BUG, and why the second rule exists.
 *
 * `<button>` does not inherit `font-family`. The UA gives it one of its own, and
 * in Chrome that is Arial - so every raw `component="button"` on this page (the
 * three nav triggers, the drawer rows, the ChipTabs strip in AgentJobs) was
 * setting size, weight and colour from TYPE and then drawing them in Arial while
 * everything around them was Inter. It is invisible until a button sits beside a
 * link with the same styling, which is exactly what happened when Pricing became
 * a routed link between two mega-menu triggers - the crop showed one word in a
 * different typeface and nothing in the computed styles explained it, because
 * `fontFamily` was the one property nobody was reading.
 *
 * A page-wide rule rather than `fontFamily: 'inherit'` at each call site: there
 * are four today and the fifth would be written the same wrong way. MUI's own
 * `Button` sets the family from the theme and is unaffected either way.
 */
import GlobalStyles from '@mui/material/GlobalStyles';
import { INK } from './standartTokens';

/** The id StandartLanding puts on its root. Exported so the test cannot drift. */
export const STANDART_ROOT_ID = 'standart-root';

export default function StandartGlobalStyles() {
  return (
    <GlobalStyles
      styles={{
        [`body:has(#${STANDART_ROOT_ID})`]: {
          backgroundColor: INK.ground,
          colorScheme: 'dark',
        },
        // See THE ARIAL BUG above. Scoped to the page root, so no other route
        // inherits an opinion about its form controls.
        [`#${STANDART_ROOT_ID} button, #${STANDART_ROOT_ID} input, #${STANDART_ROOT_ID} select, #${STANDART_ROOT_ID} textarea`]:
          {
            fontFamily: 'inherit',
          },
      }}
    />
  );
}
