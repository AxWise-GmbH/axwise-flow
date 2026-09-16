/**
 * [module: design-system]
 *
 * The sticky bar, its mega-menus, and the mobile drawer.
 *
 * THE LAUNCH MENU. Every destination comes from the explicit GCP route manifest:
 * Assistant, Goals, personal account entry points, and launch information.
 *
 * The page's sections keep their anchors and the scroll orb still measures them;
 * what changed is only that the bar no longer points at them. `SuiteRow`,
 * `MissionBlock` and the hero pill are the in-page navigation now.
 *
 * THE UNDERLINE NOW FOLLOWS THE OPEN MENU, not the scrolled-to section - there
 * is no active anchor when every link is a route. It is still the product's own
 * `useSlidingTabIndicator` + `standardTabIndicatorSx` mark rather than a second
 * underline that nearly agrees with it, and it fades out when nothing is open,
 * because the hook holds its last measured position rather than collapsing.
 *
 * The interaction uses no delay on open, a
 * 400ms grace before close, an 180ms fade. The grace period in particular is not
 * a preference - a shorter one drops the menu when the cursor travels diagonally
 * from a trigger to the far side of its own panel, which is the most irritating
 * megamenu bug there is.
 *
 * The gap between the trigger and the panel is bridged by a `::before`
 * pseudo-element rather than a padded wrapper, so the cursor never crosses dead
 * space that would close the menu under it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Collapse, Drawer, Fade, Popper, useMediaQuery, useTheme } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { useSlidingTabIndicator } from '../../../hooks/useSlidingTabIndicator';
import { standardTabIndicatorSx } from '../standartProductTokens';
import { releaseBodyScrollLock } from '../../../utils/mobileTouchScroll';
import { NAV } from '../standartCopy';
import { INK, NAV_H, RADII, SPACE, TYPE } from '../standartTokens';
import {
  EXPO_EASE,
  HOVER_MS,
  MENU_CLOSE_GRACE_MS,
  MENU_FADE_MS,
  REDUCED_MOTION,
  STANDARD_EASE,
} from '../standartMotion';
import BrandOrb from '../primitives/BrandOrb';
import Pill from '../primitives/Pill';

const SCROLLED_AFTER_PX = 24;

/** One routed row inside a mega-menu or the drawer. */
function MenuRow({ link, onNavigate, dense = false }) {
  return (
    <Box
      component={RouterLink}
      role="menuitem"
      to={link.to}
      onClick={onNavigate}
      sx={{
        display: 'grid',
        gap: 0.25,
        p: dense ? 0.75 : 1.25,
        borderRadius: RADII.chip,
        textDecoration: 'none',
        transition: `background-color ${HOVER_MS}ms ${STANDARD_EASE}`,
        '@media (hover: hover)': { '&:hover': { bgcolor: INK.cardLift } },
        '&:focus-visible': { outline: `2px solid ${INK.bright}`, outlineOffset: -2 },
        [REDUCED_MOTION]: { transition: 'none' },
      }}
    >
      <Box sx={{ ...TYPE.body, color: INK.bright, fontWeight: 500 }}>{link.label}</Box>
      {link.desc && <Box sx={{ ...TYPE.proof, color: INK.dimmer }}>{link.desc}</Box>}
    </Box>
  );
}

/** The columns of routed links inside an open menu. */
function MegaPanel({ item, onNavigate }) {
  return (
    <Box
      role="menu"
      aria-label={item.label}
      sx={{
        display: 'grid',
        gridTemplateColumns: `repeat(${item.columns.length}, minmax(240px, 1fr))`,
        gap: 3,
        p: 2,
        mt: 1,
        borderRadius: RADII.cardSm,
        border: `1px solid ${INK.line}`,
        bgcolor: INK.card,
        // A neutral black elevation, which DESIGN_SYSTEM section 9 allows. Not a
        // coloured halo - under mono that would be white, and hoverGlow returns
        // NO_GLOW here anyway.
        boxShadow: '0 30px 60px rgba(0,0,0,0.6)',
        // The hover bridge. Spans the gap the Popper offset opens up, so the
        // cursor never leaves the menu on its way into it.
        '&::before': {
          content: '""',
          position: 'absolute',
          top: -12,
          left: 0,
          right: 0,
          height: 12,
        },
      }}
    >
      {item.columns.map((column, i) => (
        <Box
          key={column.heading || `column-${i}`}
          sx={{ display: 'grid', gap: 1, alignContent: 'start' }}
        >
          {/* The second Solutions column continues the first and has no heading
              of its own. An empty label block there would open a gap the first
              column does not have, so it is not rendered at all. */}
          {column.heading && (
            <Box sx={{ display: 'grid', gap: 0.25, px: 1.25, pb: 0.5 }}>
              <Box sx={{ ...TYPE.eyebrow, color: INK.dim }}>{column.heading}</Box>
              {column.desc && <Box sx={{ ...TYPE.proof, color: INK.dimmer }}>{column.desc}</Box>}
            </Box>
          )}
          <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 0.25 }}>
            {column.links.map((link) => (
              <Box component="li" key={link.to}>
                <MenuRow link={link} onNavigate={onNavigate} />
              </Box>
            ))}
          </Box>
        </Box>
      ))}

      {item.footer && (
        <Box
          component={RouterLink}
          to={item.footer.to}
          onClick={onNavigate}
          sx={{
            gridColumn: '1 / -1',
            mt: 0.5,
            pt: 1.5,
            borderTop: `1px solid ${INK.line}`,
            ...TYPE.body,
            color: INK.dim,
            textDecoration: 'none',
            transition: `color ${HOVER_MS}ms ${STANDARD_EASE}`,
            '@media (hover: hover)': { '&:hover': { color: INK.bright } },
            '&:focus-visible': { outline: `2px solid ${INK.bright}`, outlineOffset: 2 },
            [REDUCED_MOTION]: { transition: 'none' },
          }}
        >
          {item.footer.label} &#8594;
        </Box>
      )}
    </Box>
  );
}

export default function StandartNav() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [menuId, setMenuId] = useState(null);
  // The panel's content is held separately from the open id, and outlives it.
  //
  // Popper with `transition` keeps its child mounted until the Fade has finished
  // exiting, so for those 180ms `menuId` is already null while the panel is
  // still rendering. Deriving the item from `menuId` alone therefore handed
  // MegaPanel `undefined` on every single close, and it threw reading
  // `item.columns`. Clearing this on the transition's onExited instead means the
  // panel keeps its content for exactly as long as it is on screen.
  const [renderedItem, setRenderedItem] = useState(null);
  const [anchorEl, setAnchorEl] = useState(null);
  const [scrolled, setScrolled] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [progress, setProgress] = useState(0);
  const closeTimer = useRef(null);
  const triggerRefs = useRef({});
  /**
   * Ignore the next focus on a trigger.
   *
   * Escape closes the menu and hands focus back to the trigger - which fires the
   * trigger's own onFocus, which opens the menu again. Without this the menu is
   * un-closeable by keyboard: Escape appears to do nothing at all, because the
   * close and the reopen happen in the same tick. Set immediately before the
   * programmatic focus and cleared by the focus it was set for.
   */
  const skipNextFocusOpen = useRef(false);

  // The product's own sliding underline, so the marketing nav and the app's tab
  // strips draw the same 1.5px mark with the same transition rather than two
  // that nearly agree. It tracks the OPEN menu - see the module docblock.
  const { containerRef, registerTab, indicator } = useSlidingTabIndicator(menuId, {
    enabled: !isMobile,
  });

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > SCROLLED_AFTER_PX);
      const height = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(height > 0 ? Math.min(1, window.scrollY / height) : 0);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => () => clearTimeout(closeTimer.current), []);

  const openMenu = useCallback((id, element) => {
    clearTimeout(closeTimer.current);
    setMenuId(id);
    setRenderedItem(NAV.items.find((item) => item.id === id) ?? null);
    setAnchorEl(element);
  }, []);

  const closeMenu = useCallback(() => {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      setMenuId(null);
      setAnchorEl(null);
    }, MENU_CLOSE_GRACE_MS);
  }, []);

  const cancelClose = useCallback(() => clearTimeout(closeTimer.current), []);

  const closeNow = useCallback(() => {
    clearTimeout(closeTimer.current);
    setMenuId(null);
    setAnchorEl(null);
  }, []);

  /** Following a link. The router takes it from here; the menu just gets out. */
  const onNavigate = useCallback(() => {
    closeNow();
    setDrawerOpen(false);
  }, [closeNow]);

  const onTriggerKeyDown = useCallback(
    (event, item) => {
      if (event.key === 'Escape') {
        closeNow();
        skipNextFocusOpen.current = true;
        triggerRefs.current[item.id]?.focus();
      } else if ((event.key === 'ArrowDown' || event.key === 'Enter') && item.columns) {
        event.preventDefault();
        openMenu(item.id, triggerRefs.current[item.id]);
      }
    },
    [closeNow, openMenu]
  );

  useEffect(() => {
    if (!menuId) return undefined;
    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      const id = menuId;
      closeNow();
      skipNextFocusOpen.current = true;
      triggerRefs.current[id]?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuId, closeNow]);

  useEffect(() => {
    if (drawerOpen) return undefined;
    // iOS Safari keeps `position: fixed` on <body> otherwise, and the page
    // silently stops scrolling after the drawer has gone.
    releaseBodyScrollLock();
    return undefined;
  }, [drawerOpen]);

  const triggerSx = (open) => ({
    background: 'none',
    border: 0,
    cursor: 'pointer',
    px: 1.25,
    py: 1,
    ...TYPE.body,
    fontWeight: open ? 600 : 500,
    color: open ? INK.bright : INK.dim,
    whiteSpace: 'nowrap',
    textDecoration: 'none',
    transition: `color ${HOVER_MS}ms ${EXPO_EASE}`,
    '@media (hover: hover)': { '&:hover': { color: INK.bright } },
    '&:focus-visible': { outline: `2px solid ${INK.bright}`, outlineOffset: 2 },
    [REDUCED_MOTION]: { transition: 'none' },
  });

  return (
    <>
      <Box
        component="a"
        href="#main-content"
        sx={{
          position: 'absolute',
          left: -9999,
          top: 0,
          zIndex: 1300,
          p: 1.5,
          bgcolor: INK.bright,
          color: INK.ground,
          borderRadius: RADII.chip,
          '&:focus': { left: 12, top: 12 },
        }}
      >
        {NAV.skipToContent}
      </Box>

      <Box
        component="nav"
        aria-label="Main"
        onMouseLeave={closeMenu}
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 1200,
          height: NAV_H,
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          px: SPACE.gutter,
          bgcolor: scrolled ? 'rgba(10,10,10,0.72)' : 'transparent',
          backdropFilter: scrolled ? 'saturate(180%) blur(18px)' : 'none',
          borderBottom: `1px solid ${scrolled ? INK.line : 'transparent'}`,
          transition: `background-color 220ms ${STANDARD_EASE}, border-color 220ms ${STANDARD_EASE}, backdrop-filter 220ms ${STANDARD_EASE}`,
          [REDUCED_MOTION]: { transition: 'none' },
        }}
      >
        {/* The reading progress, as the same 1px mark the underline uses. */}
        <Box
          aria-hidden="true"
          sx={{
            position: 'absolute',
            left: 0,
            bottom: -1,
            height: '1px',
            width: '100%',
            transformOrigin: 'left center',
            transform: `scaleX(${progress})`,
            bgcolor: INK.dim,
            opacity: scrolled ? 1 : 0,
            transition: `opacity 220ms ${STANDARD_EASE}`,
            [REDUCED_MOTION]: { transition: 'none' },
          }}
        />

        <Box
          component={RouterLink}
          to="/"
          aria-label={NAV.brandHome}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.25,
            textDecoration: 'none',
            flexShrink: 0,
            '&:focus-visible': { outline: `2px solid ${INK.bright}`, outlineOffset: 4 },
          }}
        >
          <BrandOrb />
          <Box component="span" sx={{ ...TYPE.body, fontWeight: 600, color: INK.bright }}>
            {NAV.brand}
          </Box>
        </Box>

        {!isMobile && (
          <Box
            ref={containerRef}
            sx={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 0.5, ml: 2 }}
          >
            {NAV.items.map((item) => {
              const open = menuId === item.id;

              // Pricing is a plain destination, so it is a link rather than a
              // trigger. Rendering it as a button with no menu would announce
              // `aria-haspopup` on something that pops nothing up.
              if (!item.columns) {
                return (
                  <Box
                    key={item.id}
                    component={RouterLink}
                    to={item.to}
                    ref={registerTab(item.id)}
                    onMouseEnter={cancelClose}
                    sx={triggerSx(false)}
                  >
                    {item.label}
                  </Box>
                );
              }

              return (
                <Box
                  key={item.id}
                  component="button"
                  type="button"
                  ref={(node) => {
                    triggerRefs.current[item.id] = node;
                    registerTab(item.id)(node);
                  }}
                  aria-haspopup="menu"
                  aria-expanded={open}
                  onMouseEnter={(event) => openMenu(item.id, event.currentTarget)}
                  onFocus={(event) => {
                    // A focus we caused ourselves, returning from Escape. Opening
                    // here would undo the close in the same tick.
                    if (skipNextFocusOpen.current) {
                      skipNextFocusOpen.current = false;
                      return;
                    }
                    openMenu(item.id, event.currentTarget);
                  }}
                  onKeyDown={(event) => onTriggerKeyDown(event, item)}
                  onClick={(event) => openMenu(item.id, event.currentTarget)}
                  sx={triggerSx(open)}
                >
                  {item.label}
                </Box>
              );
            })}
            <Box
              aria-hidden="true"
              sx={{
                ...standardTabIndicatorSx(theme, indicator),
                // The hook holds its last measured position when nothing is
                // active, so the mark has to be faded out rather than left
                // underlining a menu that has already closed.
                opacity: menuId ? 1 : 0,
                transition: `${standardTabIndicatorSx(theme, indicator).transition ?? ''}, opacity ${MENU_FADE_MS}ms ${STANDARD_EASE}`,
                [REDUCED_MOTION]: { transition: 'none' },
              }}
            />
          </Box>
        )}

        <Box sx={{ flex: 1 }} />

        {!isMobile && (
          <Box
            component={RouterLink}
            to={NAV.signIn.to}
            sx={{
              ...TYPE.body,
              fontWeight: 600,
              color: INK.bright,
              textDecoration: 'none',
              transition: `color ${HOVER_MS}ms ${STANDARD_EASE}`,
              '@media (hover: hover)': { '&:hover': { color: '#FFFFFF' } },
              '&:focus-visible': { outline: `2px solid ${INK.bright}`, outlineOffset: 4 },
              [REDUCED_MOTION]: { transition: 'none' },
            }}
          >
            {NAV.signIn.label}
          </Box>
        )}

        <Pill to={NAV.cta.to} variant="solid" sx={{ py: 0.75, px: 2 }}>
          {NAV.cta.label}
        </Pill>

        {isMobile && (
          <Box
            component="button"
            type="button"
            aria-label={drawerOpen ? NAV.closeMenu : NAV.openMenu}
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen((v) => !v)}
            sx={{
              background: 'none',
              border: `1px solid ${INK.line}`,
              borderRadius: RADII.chip,
              cursor: 'pointer',
              width: 36,
              height: 32,
              display: 'grid',
              placeItems: 'center',
              gap: '3px',
              '&:focus-visible': { outline: `2px solid ${INK.bright}`, outlineOffset: 2 },
            }}
          >
            <Box sx={{ width: 14, height: '1px', bgcolor: INK.bright }} />
            <Box sx={{ width: 14, height: '1px', bgcolor: INK.bright }} />
          </Box>
        )}
      </Box>

      {!isMobile && (
        <Popper
          open={Boolean(menuId && anchorEl)}
          anchorEl={anchorEl}
          placement="bottom-start"
          transition
          modifiers={[{ name: 'offset', options: { offset: [-8, 4] } }]}
          sx={{ zIndex: 1300 }}
        >
          {({ TransitionProps }) => (
            <Fade
              {...TransitionProps}
              timeout={MENU_FADE_MS}
              onExited={() => setRenderedItem(null)}
            >
              <Box
                onMouseEnter={cancelClose}
                onMouseLeave={closeMenu}
                sx={{ position: 'relative' }}
              >
                {renderedItem ? <MegaPanel item={renderedItem} onNavigate={onNavigate} /> : null}
              </Box>
            </Fade>
          )}
        </Popper>
      )}

      <Drawer
        anchor="right"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        ModalProps={{ disableScrollLock: true }}
        slotProps={{ paper: { sx: { bgcolor: INK.ground, width: 300, p: 2 } } }}
      >
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 0.5 }}>
          {NAV.items.map((item) => (
            <Box component="li" key={item.id}>
              {item.columns ? (
                <>
                  <Box
                    component="button"
                    type="button"
                    aria-expanded={expanded === item.id}
                    onClick={() => setExpanded((v) => (v === item.id ? null : item.id))}
                    sx={{
                      width: '100%',
                      textAlign: 'left',
                      background: 'none',
                      border: 0,
                      cursor: 'pointer',
                      py: 1.5,
                      ...TYPE.body,
                      color: INK.bright,
                      fontWeight: 500,
                      '&:focus-visible': { outline: `2px solid ${INK.bright}`, outlineOffset: -2 },
                    }}
                  >
                    {item.label}
                  </Box>
                  <Collapse in={expanded === item.id} timeout={MENU_FADE_MS}>
                    {/* Grouped, not flattened. Product is fifteen rows across
                        two groups, and run together the seam between Control
                        Point and Instruments is invisible - the reader gets one
                        undifferentiated list and has to read all of it. */}
                    <Box sx={{ pl: 1, pb: 1, display: 'grid', gap: 1.5 }}>
                      {item.columns.map((column, i) => (
                        <Box
                          key={column.heading || `column-${i}`}
                          sx={{ display: 'grid', gap: 0.25 }}
                        >
                          {column.heading && (
                            <Box sx={{ ...TYPE.eyebrow, color: INK.dimmer, px: 0.75, pb: 0.5 }}>
                              {column.heading}
                            </Box>
                          )}
                          {column.links.map((link) => (
                            <MenuRow key={link.to} link={link} onNavigate={onNavigate} dense />
                          ))}
                        </Box>
                      ))}
                    </Box>
                  </Collapse>
                </>
              ) : (
                <Box
                  component={RouterLink}
                  to={item.to}
                  onClick={onNavigate}
                  sx={{
                    display: 'block',
                    py: 1.5,
                    ...TYPE.body,
                    color: INK.bright,
                    fontWeight: 500,
                    textDecoration: 'none',
                    '&:focus-visible': { outline: `2px solid ${INK.bright}`, outlineOffset: -2 },
                  }}
                >
                  {item.label}
                </Box>
              )}
            </Box>
          ))}
        </Box>

        <Box sx={{ mt: 'auto', display: 'grid', gap: 1, pt: 2 }}>
          <Pill to={NAV.signIn.to} variant="ghost">
            {NAV.signIn.label}
          </Pill>
          <Pill to={NAV.cta.to} variant="solid">
            {NAV.cta.label}
          </Pill>
        </Box>
      </Drawer>
    </>
  );
}
