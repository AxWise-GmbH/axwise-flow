import { NavLink, useLocation } from 'react-router-dom';
import { Box, Tooltip, useTheme, useMediaQuery, alpha, darken } from '@mui/material';
import HomeRoundedIcon from '@mui/icons-material/HomeRounded';
import CorporateFareRoundedIcon from '@mui/icons-material/CorporateFareRounded';
import StorefrontRoundedIcon from '@mui/icons-material/StorefrontRounded';
import BarChartRoundedIcon from '@mui/icons-material/BarChartRounded';
import GlassIcon from '../icons/GlassIcon';
import useTextEntryFocused from '../../hooks/useTextEntryFocused';
import { PERSONAL_CATALOG_LABEL } from '../../config/catalogUi';

const ITEMS = [
  {
    to: '/home',
    label: 'Home',
    iconName: 'HomeRounded',
    fallback: HomeRoundedIcon,
    match: (p) => p === '/home' || p === '/dashboard' || p === '/',
  },
  {
    to: '/organizations',
    label: 'Organizations',
    iconName: 'Work',
    fallback: CorporateFareRoundedIcon,
    match: (p) => p.startsWith('/organizations'),
  },
  {
    to: '/hub',
    label: 'Reports',
    iconName: 'BarChartRounded',
    fallback: BarChartRoundedIcon,
    match: (p) => p.startsWith('/hub'),
  },
  {
    to: '/marketplace',
    label: PERSONAL_CATALOG_LABEL,
    iconName: 'StorefrontRounded',
    fallback: StorefrontRoundedIcon,
    match: (p) => p.startsWith('/marketplace'),
  },
];

const PEAK_SCALE = 1.28;

/**
 * How much room a page must leave under its last block so the floating dock
 * never sits on top of it: the dock's own height (icons + padding) plus its
 * offset from the viewport bottom, plus a little air.
 */
export const SIMPLE_DOCK_CLEARANCE_PX = 132;

// Frosted dock surface. Dark mode: a near-black tinted by the accent (replaces the old
// hardcoded green-black #0f1a16) so the dock body follows the Primary colour. Light mode
// keeps the paper-based glass.
export function dockSurfaceBg(theme, { hover = false } = {}) {
  if (theme.palette.mode !== 'dark') {
    return alpha(theme.palette.background.paper, hover ? 0.88 : 0.78);
  }
  return alpha(darken(theme.palette.primary.main, 0.86), hover ? 0.82 : 0.72);
}

export default function SimpleDock() {
  const theme = useTheme();
  const { pathname } = useLocation();
  const isDark = theme.palette.mode === 'dark';
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const autoHide = useMediaQuery(theme.breakpoints.down('md'));
  const typing = useTextEntryFocused();
  const visible = !(autoHide && typing);

  const iconSize = isMobile ? 48 : 56;
  const shiftPx = ((PEAK_SCALE - 1) * iconSize) / 2;

  return (
    <Box
      role="navigation"
      aria-label="Simple mode navigation"
      sx={{
        position: 'fixed',
        left: '50%',
        bottom: { xs: 12, sm: 18 },
        transform: 'translateX(-50%)',
        zIndex: theme.zIndex.appBar + 1,
        display: 'flex',
        alignItems: 'center',
        gap: { xs: '4px', sm: '6px' },
        padding: { xs: '12px 20px', sm: '14px 28px' },
        borderRadius: { xs: '22px', sm: '26px' },
        background: dockSurfaceBg(theme),
        backdropFilter: 'saturate(180%) blur(22px)',
        WebkitBackdropFilter: 'saturate(180%) blur(22px)',
        border: '1px solid',
        borderColor: isDark ? alpha('#ffffff', 0.08) : alpha(theme.palette.divider, 0.5),
        boxShadow: isDark
          ? '0 12px 40px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.08)'
          : '0 12px 40px rgba(0,0,0,0.10), inset 0 1px 0 rgba(255,255,255,0.6)',
        opacity: visible ? 1 : 0,
        visibility: visible ? 'visible' : 'hidden',
        pointerEvents: visible ? 'auto' : 'none',
        ...(autoHide && {
          transform: visible ? 'translateX(-50%)' : 'translateX(-50%) translateY(120%)',
        }),
        transition: autoHide
          ? 'opacity .22s ease, transform .22s cubic-bezier(.22,1,.36,1), visibility .22s, background .25s, border-color .25s, box-shadow .25s'
          : 'background .25s, border-color .25s, box-shadow .25s',
        '&:hover': {
          background: dockSurfaceBg(theme, { hover: true }),
          borderColor: isDark ? alpha('#ffffff', 0.14) : alpha(theme.palette.divider, 0.7),
          boxShadow: isDark
            ? '0 18px 50px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.10)'
            : '0 18px 50px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.7)',
        },
        ...(autoHide
          ? {}
          : {
              animation: 'simpleDockIn 700ms 300ms both cubic-bezier(.34,1.56,.64,1)',
              '@keyframes simpleDockIn': {
                from: { opacity: 0, transform: 'translateX(-50%) translateY(40px)' },
                to: { opacity: 1, transform: 'translateX(-50%) translateY(0)' },
              },
            }),
        '@media (prefers-reduced-motion: reduce)': { animation: 'none', transition: 'none' },
      }}
    >
      {ITEMS.map((item) => {
        const active = item.match(pathname);
        return (
          <Tooltip key={item.to} title={item.label} placement="top" arrow enterDelay={400}>
            <Box
              className="dock-icon"
              component={NavLink}
              to={item.to}
              aria-label={item.label}
              aria-current={active ? 'page' : undefined}
              sx={{
                position: 'relative',
                width: iconSize,
                height: iconSize,
                flex: '0 0 auto',
                borderRadius: { xs: '12px', sm: '14px' },
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                // Every dock icon uses the Primary (brand) colour; the active
                // tile/gradient/dot below still makes the current one read brightest.
                color: theme.palette.primary.main,
                textDecoration: 'none',
                background: active
                  ? `linear-gradient(180deg, ${alpha(theme.palette.primary.main, 0.22)}, ${alpha(theme.palette.primary.main, 0.06)})`
                  : `linear-gradient(180deg, ${alpha('#ffffff', isDark ? 0.06 : 0.5)}, ${alpha('#ffffff', isDark ? 0.02 : 0.2)})`,
                border: '1px solid',
                borderColor: active
                  ? alpha(theme.palette.primary.main, 0.4)
                  : alpha(isDark ? '#ffffff' : theme.palette.divider, isDark ? 0.06 : 0.3),
                transformOrigin: 'center center',
                transition:
                  'transform .25s cubic-bezier(.34,1.56,.64,1), background .2s, border-color .2s, box-shadow .2s',
                willChange: 'transform',
                outline: 'none',
                // Hovered / keyboard-focused: scale up in place
                '&:hover, &:focus-visible': {
                  transform: `scale(${PEAK_SCALE})`,
                  zIndex: 1,
                  borderColor: alpha(theme.palette.primary.main, 0.5),
                },
                '&:focus-visible': {
                  boxShadow: `0 0 0 3px ${alpha(theme.palette.primary.main, 0.25)}`,
                },
                // All icons to the RIGHT of the hovered icon: slide outward by the same amount
                '&:hover ~ .dock-icon, &:focus-visible ~ .dock-icon': {
                  transform: `translateX(${shiftPx}px)`,
                },
                // All icons to the LEFT of the hovered icon: slide outward by the same amount
                '&:has(~ .dock-icon:hover), &:has(~ .dock-icon:focus-visible)': {
                  transform: `translateX(-${shiftPx}px)`,
                },
                '@media (prefers-reduced-motion: reduce)': {
                  '&:hover, &:focus-visible': { transform: 'none' },
                  '&:hover ~ .dock-icon, &:focus-visible ~ .dock-icon': { transform: 'none' },
                  '&:has(~ .dock-icon:hover), &:has(~ .dock-icon:focus-visible)': {
                    transform: 'none',
                  },
                },
              }}
            >
              <GlassIcon name={item.iconName} fallback={item.fallback} size={28} tone="brand" />
              {active && (
                <Box
                  aria-hidden
                  sx={{
                    position: 'absolute',
                    bottom: -7,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: 4,
                    height: 4,
                    borderRadius: '50%',
                    bgcolor: theme.palette.primary.main,
                    boxShadow: `0 0 8px ${alpha(theme.palette.primary.main, 0.8)}`,
                  }}
                />
              )}
            </Box>
          </Tooltip>
        );
      })}
    </Box>
  );
}
