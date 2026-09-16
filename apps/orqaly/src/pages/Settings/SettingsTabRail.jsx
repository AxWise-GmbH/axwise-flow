import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Box, Paper, Portal, Typography, alpha, useMediaQuery, useTheme } from '@mui/material';
import AppIcon from '../../components/icons/AppIcon';
import { magneticPillSx, railIndicatorSx } from '../../theme/settingsMotion';

/**
 * The Settings rail: one pill per tab, with a single indicator that slides
 * between them.
 *
 * Replaces the MUI `Tabs` strip this page used to carry. Two things that strip
 * could not do are the whole reason for a hand-rolled one: an indicator that
 * travels (MUI's is a bar under a tab, and the design wants the filled pill to
 * move), and pills that lean toward the cursor. What it did give us for free -
 * roles, keyboard, scroll buttons - is reimplemented here rather than lost:
 * `role="tablist"` with roving tabindex, Left/Right/Home/End, and the active
 * pill scrolled into view instead of arrow buttons.
 *
 * The sticky/Portal split is carried over unchanged from `SettingsSectionNav`:
 * below md the document scrolls but the app shell is `overflow: hidden` and
 * PageLayout keeps a `transform`, which breaks both `sticky` and `fixed` inside
 * it - so the bar is portalled to <body> and an in-flow spacer holds its place.
 */

/** How far a pill leans toward the pointer, in px. */
const MAGNET_PX = 3;

export default function SettingsTabRail({
  sections,
  activeId,
  onSelect,
  sticky = false,
  viewOptionsButton = null,
  searchSlot = null,
}) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const scrollerRef = useRef(null);
  const pillRefs = useRef(new Map());
  const [indicator, setIndicator] = useState({ x: 0, w: 0, ready: false });

  const activeIndex = Math.max(
    0,
    sections.findIndex((section) => section.id === activeId)
  );

  const measure = useCallback(() => {
    const pill = pillRefs.current.get(activeId);
    if (!pill) return;
    setIndicator({ x: pill.offsetLeft, w: pill.offsetWidth, ready: true });
  }, [activeId]);

  // Layout effect, not effect: the indicator must be under the right pill in
  // the same frame the tab changes, or it visibly slides in from the left.
  useLayoutEffect(() => {
    measure();
  }, [measure, sections.length]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => measure());
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [measure]);

  // Keep the selected tab reachable when the rail overflows - the replacement
  // for the scroll buttons.
  useEffect(() => {
    const pill = pillRefs.current.get(activeId);
    pill?.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }, [activeId]);

  const handleKeyDown = (event) => {
    const last = sections.length - 1;
    let next = null;
    if (event.key === 'ArrowRight') next = activeIndex >= last ? 0 : activeIndex + 1;
    else if (event.key === 'ArrowLeft') next = activeIndex <= 0 ? last : activeIndex - 1;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = last;
    if (next === null) return;
    event.preventDefault();
    const target = sections[next];
    if (target) {
      onSelect(target.id);
      pillRefs.current.get(target.id)?.focus();
    }
  };

  const lean = (event) => {
    const el = event.currentTarget;
    const rect = el.getBoundingClientRect();
    const dx = (event.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
    const dy = (event.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
    el.style.setProperty('--mx', (dx * MAGNET_PX).toFixed(2));
    el.style.setProperty('--my', (dy * MAGNET_PX).toFixed(2));
  };

  const unlean = (event) => {
    event.currentTarget.style.setProperty('--mx', '0');
    event.currentTarget.style.setProperty('--my', '0');
  };

  const edgeFade =
    'linear-gradient(90deg, transparent 0, #000 16px, #000 calc(100% - 16px), transparent 100%)';

  const nav = (
    <Paper
      elevation={0}
      sx={{
        position: 'relative',
        borderRadius: 3,
        border: '1px solid',
        borderColor: alpha(theme.palette.primary.main, isDark ? 0.22 : 0.14),
        bgcolor: isDark
          ? alpha(theme.palette.background.paper, 0.92)
          : alpha(theme.palette.background.paper, 0.98),
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        p: 0.5,
        backdropFilter: sticky ? 'blur(12px)' : undefined,
        WebkitBackdropFilter: sticky ? 'blur(12px)' : undefined,
        boxShadow: sticky
          ? `0 6px 20px ${alpha(isDark ? '#000000' : theme.palette.primary.main, isDark ? 0.35 : 0.1)}`
          : 'none',
      }}
    >
      <Box
        ref={scrollerRef}
        role="tablist"
        aria-label="Settings sections"
        onKeyDown={handleKeyDown}
        sx={{
          position: 'relative',
          flex: 1,
          minWidth: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          overflowX: 'auto',
          overflowY: 'hidden',
          scrollbarWidth: 'none',
          '&::-webkit-scrollbar': { display: 'none' },
          maskImage: edgeFade,
          WebkitMaskImage: edgeFade,
        }}
      >
        <Box aria-hidden sx={railIndicatorSx(theme, indicator)} />
        {sections.map((section) => {
          const selected = section.id === activeId;
          return (
            <Box
              key={section.id}
              ref={(node) => {
                if (node) pillRefs.current.set(section.id, node);
                else pillRefs.current.delete(section.id);
              }}
              role="tab"
              aria-selected={selected}
              aria-controls={`settings-panel-${section.id}`}
              id={`settings-tab-${section.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onSelect(section.id)}
              onPointerMove={lean}
              onPointerLeave={unlean}
              sx={{
                position: 'relative',
                zIndex: 1,
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                gap: 0.75,
                px: { xs: 1.5, sm: 2 },
                py: 0.9,
                borderRadius: 2,
                cursor: 'pointer',
                userSelect: 'none',
                color: selected ? 'primary.main' : 'text.secondary',
                fontWeight: selected ? 700 : 600,
                ...magneticPillSx(),
                '&:hover': { color: selected ? 'primary.main' : 'text.primary' },
                '&:focus-visible': {
                  outline: `2px solid ${theme.palette.primary.main}`,
                  outlineOffset: 2,
                },
              }}
            >
              <AppIcon
                name={section.iconName}
                fallback={section.icon}
                size={18}
                glassInSimple
                sx={{ flexShrink: 0 }}
              />
              <Typography
                variant="caption"
                sx={{ fontWeight: 'inherit', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
              >
                {section.label}
              </Typography>
            </Box>
          );
        })}
      </Box>
      {searchSlot && <Box sx={{ flexShrink: 0, display: 'flex' }}>{searchSlot}</Box>}
      {viewOptionsButton && (
        <Box sx={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>{viewOptionsButton}</Box>
      )}
    </Paper>
  );

  if (!sticky) return <Box sx={{ mb: 2 }}>{nav}</Box>;

  if (isMobile) {
    return (
      <>
        <Portal>
          <Box
            sx={{
              position: 'fixed',
              top: { xs: 56, sm: 64 },
              left: 0,
              right: 0,
              px: 1.5,
              zIndex: (t) => t.zIndex.appBar - 2,
            }}
          >
            {nav}
          </Box>
        </Portal>
        <Box aria-hidden sx={{ height: 64 }} />
      </>
    );
  }

  return (
    <Box sx={{ position: 'sticky', top: 0, zIndex: (t) => t.zIndex.appBar - 2, mb: 2 }}>{nav}</Box>
  );
}
