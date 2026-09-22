import { useId } from 'react';
import { flushSync } from 'react-dom';
import { getTheme, setTheme } from '../themeMode';
import { useInstantTheme } from '../useInstantTheme';
import { useT } from '../i18n/useT';
import './ThemeSwitch.css';

// The sun's eight rays, radius 8 to 10 around the centre. The ends are written out: a CSS
// transform replaces an SVG transform attribute, and the rays animate by CSS transform.
const RAYS = [
  [12, 4, 12, 2],
  [17.66, 6.34, 19.07, 4.93],
  [20, 12, 22, 12],
  [17.66, 17.66, 19.07, 19.07],
  [12, 20, 12, 22],
  [6.34, 17.66, 4.93, 19.07],
  [4, 12, 2, 12],
  [6.34, 6.34, 4.93, 4.93],
];

const SWAP_CLASS = 'oi-theme-swap';
const REVEAL_MS = 700;
const REVEAL_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

// The view transition in flight, if any. One swap at a time: a click during it is ignored.
let running = null;

function prefersReducedMotion() {
  return globalThis.window?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
}

function pick(next) {
  flushSync(() => setTheme(next, { remember: true }));
}

// No circle: the colours change in one frame, other transitions held (theme.css) so nothing
// fades at its own speed. Two frames later they are let go; nothing is left to animate.
function swapAtOnce(next) {
  const root = document.documentElement;
  root.classList.add(SWAP_CLASS);
  pick(next);
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove(SWAP_CLASS)));
}

// The new look spreads over the page as a circle growing from the switch.
function swapWithReveal(next, button) {
  const root = document.documentElement;
  const box = button.getBoundingClientRect();
  const x = box.left + box.width / 2;
  const y = box.top + box.height / 2;
  const radius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y)
  );

  root.classList.add(SWAP_CLASS);
  const transition = document.startViewTransition(() => pick(next));
  running = transition;

  transition.ready
    .then(() => {
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: REVEAL_MS, easing: REVEAL_EASE, pseudoElement: '::view-transition-new(root)' }
      );
    })
    .catch(() => {});
  transition.updateCallbackDone?.catch(() => {});
  const done = () => {
    if (running !== transition) return;
    running = null;
    root.classList.remove(SWAP_CLASS);
  };
  transition.finished.then(done, done);
}

/**
 * Light / dark, as one round icon. The dark page shows a sun (press it for light); the light
 * page shows a moon (press it for dark). The glyph morphs between the two in CSS.
 */
export default function ThemeSwitch() {
  const theme = useInstantTheme();
  const { t } = useT();
  const mask = `oi-moon-${useId().replace(/[^\w-]/g, '')}`;
  const label =
    theme === 'dark'
      ? t('footer.theme.toLight', 'Switch to light mode')
      : t('footer.theme.toDark', 'Switch to dark mode');

  const onClick = (event) => {
    if (running) return;
    const next = getTheme() === 'dark' ? 'light' : 'dark';
    if (typeof document.startViewTransition === 'function' && !prefersReducedMotion()) {
      try {
        swapWithReveal(next, event.currentTarget);
        return;
      } catch {
        running = null;
        document.documentElement.classList.remove(SWAP_CLASS);
      }
    }
    swapAtOnce(next);
  };

  return (
    <button
      type="button"
      className="oi-theme-switch"
      data-mode={theme}
      aria-label={label}
      onClick={onClick}
    >
      <svg className="oi-theme-glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <mask id={mask} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
          <rect width="24" height="24" fill="#fff" />
          <circle className="oi-theme-bite" cx="14.8" cy="9.2" r="3.9" fill="#000" />
        </mask>
        <circle
          className="oi-theme-core"
          cx="12"
          cy="12"
          r="5"
          fill="currentColor"
          mask={`url(#${mask})`}
        />
        <g className="oi-theme-rays" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
          {RAYS.map(([x1, y1, x2, y2], i) => (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} style={{ '--i': i }} />
          ))}
        </g>
      </svg>
    </button>
  );
}
