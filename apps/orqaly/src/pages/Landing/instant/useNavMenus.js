import { useEffect, useRef, useState } from 'react';
import { productFromPath } from './pages/products/productsMenu';
import { loadScenes, peekScenes } from './pages/products/scenes/loadScenes';

// Pointing at a button opens its panel only if the pointer stays; leaving closes it only if
// the pointer does not come back. Long enough to cross the gap, short enough to feel live.
const HOVER_OPEN_MS = 120;
const HOVER_CLOSE_MS = 240;
// A pointer that leaves along the bar (toward the other menu) gets longer before the panel
// closes: at a slow pace, crossing the links between Products and Solutions takes ~1s.
const HOVER_ALONG_MS = 1000;
// A menu that a leaving pointer closed this recently still counts as open: the next button
// the pointer reaches opens at once, with no HOVER_OPEN_MS wait.
const HOVER_SWITCH_MS = 300;
// People often click the button they have just pointed at. That click means "open", but only
// for a moment; after it, a click on an open panel closes it again.
const HOVER_CLICK_GRACE_MS = 600;

/**
 * The bar's dropdowns share one open state, so only one panel is ever open, and one timer, so
 * moving from one button to the next never leaves a close pending. The state remembers the
 * path it was opened on, so any navigation closes the panel by itself.
 *
 * menu(id, warm) returns { open, hide, root, button }: root and button are props for the
 * menu's wrapper and its button (the wrapper's first child). warm runs when a mouse points
 * at the menu or focus enters it.
 */
export default function useNavMenus(pathname) {
  const [state, setState] = useState(null);
  const openId = state?.on === pathname ? state.id : null;
  const roots = useRef({});
  const timer = useRef(0);
  const hoverOpenedAt = useRef(-Infinity);
  const leftClosedAt = useRef(-Infinity);

  const hide = () => setState(null);
  const cancelTimer = () => window.clearTimeout(timer.current);

  useEffect(() => cancelTimer, []);

  useEffect(() => {
    if (!openId) return undefined;
    const root = roots.current[openId];
    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      setState(null);
      // Focus goes back to the button only from inside the menu: a panel that a hover opened
      // leaves focus where it was.
      if (root?.contains(document.activeElement)) root.firstChild.focus();
    };
    const onPointerDown = (event) => {
      if (!root?.contains(event.target)) setState(null);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [openId]);

  return (id, warm) => {
    const open = openId === id;
    const show = () => setState({ id, on: pathname });
    // A timer or a blur closes this menu only, never one opened since.
    const close = () => setState((now) => (now?.id === id ? null : now));
    const hoverOpen = () => {
      hoverOpenedAt.current = performance.now();
      show();
    };

    return {
      open,
      hide,
      root: {
        ref: (node) => {
          roots.current[id] = node;
        },
        onPointerEnter(event) {
          if (event.pointerType !== 'mouse') return;
          warm?.();
          cancelTimer();
          if (open) return;
          // With another panel open, or one just closed on the way here, the move is already a
          // choice: switch at once.
          if (openId || performance.now() - leftClosedAt.current < HOVER_SWITCH_MS) hoverOpen();
          else timer.current = window.setTimeout(hoverOpen, HOVER_OPEN_MS);
        },
        onPointerLeave(event) {
          if (event.pointerType !== 'mouse') return;
          cancelTimer();
          const along = event.currentTarget.parentNode.contains(event.relatedTarget);
          timer.current = window.setTimeout(
            () => {
              if (open) leftClosedAt.current = performance.now();
              close();
            },
            along ? HOVER_ALONG_MS : HOVER_CLOSE_MS
          );
        },
        onFocus: warm,
        onBlur(event) {
          if (event.relatedTarget && !roots.current[id]?.contains(event.relatedTarget)) close();
        },
      },
      button: {
        'aria-expanded': open,
        onClick() {
          cancelTimer();
          const justHoverOpened = performance.now() - hoverOpenedAt.current < HOVER_CLICK_GRACE_MS;
          if (open && !justHoverOpened) hide();
          else show();
          hoverOpenedAt.current = -Infinity;
        },
      },
    };
  };
}

/**
 * True when the pointer, moving from `from` to `to` (anything with clientX and clientY, such
 * as two pointer events), heads right into the stage's left edge within its height: it is on
 * its way to the preview, not choosing the row it crosses.
 */
export function aimsAt(from, to, { left, top, bottom }) {
  const dx = to.clientX - from?.clientX;
  if (!(dx > 0) || to.clientX >= left) return false;
  const y = to.clientY + ((to.clientY - from.clientY) * (left - to.clientX)) / dx;
  return y >= top && y <= bottom;
}

/** Starts the scenes chunk on its way. A failed load only leaves the preview card empty. */
export function warmScenes() {
  loadScenes().catch(() => {});
}

/**
 * The product a Products menu shows: the one picked, else the product page you are on, else
 * Desktop App. The pick is forgotten while the menu is shut. Returns [active, pick, scenes,
 * current]: scenes is the scenes module while the menu is on (loaded on demand), else falsy.
 */
export function useProductPick(on, pathname) {
  // A product kept out of the menus (nav: false) has no row or tab to light.
  const here = productFromPath(pathname);
  const current = here && here.nav !== false ? here.slug : undefined;
  const [picked, pick] = useState(null);
  const [scenes, setScenes] = useState(peekScenes);
  if (!on && picked) pick(null);
  useEffect(() => {
    if (on && !scenes) loadScenes().then(setScenes, () => {});
  }, [on, scenes]);
  return [picked ?? current ?? 'desktop', pick, on && scenes, current];
}

/**
 * The arrow keys `back` and `next` move focus through a list's links or tabs, and wrap;
 * Home and End jump to the ends.
 */
export function rove(event, back, next) {
  const items = [...event.currentTarget.querySelectorAll('a,button')];
  const at = items.indexOf(event.target);
  const to = { [back]: at - 1, [next]: at + 1, Home: 0, End: -1 }[event.key];
  if (to === undefined) return;
  event.preventDefault();
  items.at(to % items.length).focus();
}
