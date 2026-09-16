/**
 * [module: design-system]
 *
 * The chip selector: a real tablist, not a row of buttons that look like one.
 *
 * The WAI-ARIA tabs pattern in full, because half of it is worse than none. A
 * `role="tablist"` whose tabs are all in the tab order makes a keyboard user
 * press Tab eight times to get past a control they did not want; a roving
 * tabindex makes it one press, with the arrows moving between options. That is
 * the whole reason the pattern exists.
 *
 *   - the selected chip is the only one in the tab order
 *   - Left/Right (and Up/Down) move the selection and wrap around
 *   - Home and End jump to the ends
 *   - the panel is labelled by its tab, and the tab controls the panel
 *
 * On a narrow screen the row scrolls sideways. `LANDING_HORIZONTAL_CAROUSEL_SX`
 * carries the `pan-x` / `overscroll-behavior-x: contain` pair that stops a
 * vertical swipe over the chips from being swallowed instead of scrolling the
 * page, and the selected chip is scrolled back into the middle so a keyboard
 * user is never selecting something off-screen.
 */
import { useCallback, useEffect, useRef } from 'react';
import { Box } from '@mui/material';
import { LANDING_HORIZONTAL_CAROUSEL_SX } from '../../../utils/mobileTouchScroll';
import { INK, RADII, TYPE } from '../standartTokens';
import { HOVER_MS, REDUCED_MOTION, STANDARD_EASE } from '../standartMotion';

/**
 * @param {object} props
 * @param {Array<{ id: string, label: string }>} props.items
 * @param {string} props.value the selected id
 * @param {(id: string) => void} props.onChange
 * @param {string} props.idPrefix namespaces the tab and panel ids, so two of
 *   these on one page cannot generate the same aria-controls
 * @param {string} [props.label] the tablist's accessible name
 */
export default function ChipTabs({ items = [], value, onChange, idPrefix, label = 'Options' }) {
  const refs = useRef({});
  const activeIndex = Math.max(
    0,
    items.findIndex((item) => item.id === value)
  );

  const select = useCallback(
    (index) => {
      const next = items[(index + items.length) % items.length];
      if (!next) return;
      onChange(next.id);
      // Move focus with the selection: in this pattern the arrow keys ARE the
      // selection, so leaving focus behind would read as nothing having changed.
      refs.current[next.id]?.focus();
    },
    [items, onChange]
  );

  const onKeyDown = useCallback(
    (event) => {
      const { key } = event;
      if (key === 'ArrowRight' || key === 'ArrowDown') {
        event.preventDefault();
        select(activeIndex + 1);
      } else if (key === 'ArrowLeft' || key === 'ArrowUp') {
        event.preventDefault();
        select(activeIndex - 1);
      } else if (key === 'Home') {
        event.preventDefault();
        select(0);
      } else if (key === 'End') {
        event.preventDefault();
        select(items.length - 1);
      }
    },
    [activeIndex, items.length, select]
  );

  /**
   * Keep the selected chip visible when the row is scrolled sideways.
   *
   * Two guards, and both were paid for by a screenshot that came back showing
   * the middle of the page:
   *
   *  1. NOT ON MOUNT. `scrollIntoView` on the initially selected chip scrolls
   *     the PAGE to the chip, so simply loading the page jumped the reader two
   *     thirds of the way down it.
   *  2. ONLY WHEN THE ROW ACTUALLY SCROLLS. Above `md` the chips wrap instead of
   *     scrolling, so there is nothing to bring into view - and asking anyway
   *     makes the browser scroll the nearest ancestor that can move, which is
   *     the document.
   */
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const node = refs.current[value];
    const row = node?.parentElement;
    if (!node || !row) return;
    if (row.scrollWidth <= row.clientWidth + 1) return;
    node.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [value]);

  return (
    <Box
      role="tablist"
      aria-label={label}
      aria-orientation="horizontal"
      onKeyDown={onKeyDown}
      sx={{
        display: 'flex',
        flexWrap: { xs: 'nowrap', md: 'wrap' },
        gap: 1,
        overflowX: { xs: 'auto', md: 'visible' },
        scrollbarWidth: 'none',
        '&::-webkit-scrollbar': { display: 'none' },
        ...LANDING_HORIZONTAL_CAROUSEL_SX,
      }}
    >
      {items.map((item) => {
        const selected = item.id === value;
        return (
          <Box
            key={item.id}
            component="button"
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${item.id}`}
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel-${item.id}`}
            // The roving tabindex. Exactly one chip is reachable by Tab.
            tabIndex={selected ? 0 : -1}
            ref={(node) => {
              refs.current[item.id] = node;
            }}
            onClick={() => onChange(item.id)}
            sx={{
              flexShrink: 0,
              cursor: 'pointer',
              px: 1.75,
              py: 0.9,
              borderRadius: RADII.pill,
              border: `1px solid ${selected ? INK.bright : INK.line}`,
              bgcolor: selected ? INK.bright : 'transparent',
              color: selected ? INK.ground : INK.dim,
              ...TYPE.body,
              fontWeight: selected ? 600 : 400,
              whiteSpace: 'nowrap',
              transition: `background-color ${HOVER_MS}ms ${STANDARD_EASE}, border-color ${HOVER_MS}ms ${STANDARD_EASE}, color ${HOVER_MS}ms ${STANDARD_EASE}`,
              '@media (hover: hover)': {
                '&:hover': selected ? null : { color: INK.bright, borderColor: '#2A2A2A' },
              },
              '&:focus-visible': { outline: `2px solid ${INK.bright}`, outlineOffset: 3 },
              [REDUCED_MOTION]: { transition: 'none' },
            }}
          >
            {item.label}
          </Box>
        );
      })}
    </Box>
  );
}

/**
 * The panel a ChipTabs controls.
 *
 * Kept beside the tablist so the id convention lives in one file. `tabIndex={0}`
 * because the panel is the next thing after the tabs in the tab order and its
 * content is not otherwise focusable - without it a keyboard user tabs straight
 * past everything the tabs were selecting.
 */
export function ChipTabPanel({ idPrefix, value, children, sx }) {
  return (
    <Box
      role="tabpanel"
      id={`${idPrefix}-panel-${value}`}
      aria-labelledby={`${idPrefix}-tab-${value}`}
      tabIndex={0}
      sx={{
        outline: 'none',
        '&:focus-visible': { outline: `2px solid ${INK.bright}`, outlineOffset: 4 },
        ...sx,
      }}
    >
      {children}
    </Box>
  );
}
