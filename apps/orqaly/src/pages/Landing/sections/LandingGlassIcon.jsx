import { createElement } from 'react';
import { Box, alpha, useTheme } from '@mui/material';
import { lookupGlassIcon } from '../../../components/icons/glassIconMap';
import { lookupMuiFallback, DEFAULT_FALLBACK } from '../../../components/icons/muiFallbackMap';

/**
 * LandingGlassIcon - always renders a frosted-glass tile around the icon,
 * regardless of the user's simple-mode preference. Used exclusively on the
 * V2 landing page so the visual treatment is consistent for first-time
 * visitors.
 *
 * Props:
 *   name      - MUI icon module name (e.g. "PsychologyOutlined"). Looked up
 *               in the shared glassIconMap. If unmapped, the fallback MUI
 *               icon is rendered inside the same glass tile.
 *   fallback  - MUI icon component to use when no glass icon is mapped.
 *   size      - icon size in px (default 28).
 *   tone      - "brand" (primary) | "neutral" (text color) | any CSS color.
 *   tile      - render the frosted tile (default true). Set false for inline.
 *   tileSize  - explicit tile size in px (overrides auto-calc).
 *   radius    - tile corner radius in px (overrides auto-calc).
 *   solid     - bypass the vendored Lg* glass illustration and render the MUI
 *               Fallback icon inside the tile. Use when the gradient-opacity
 *               Lg* art reads as dim/off-color on a dark background and a
 *               crisp single-tone line icon is preferred (e.g. TechTrust).
 */
export default function LandingGlassIcon({
  name,
  fallback: Fallback,
  size = 28,
  tone = 'brand',
  tile = true,
  tileSize,
  radius,
  solid = true,
  sx,
}) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const tintColor =
    tone === 'neutral'
      ? theme.palette.text.primary
      : tone === 'brand' || tone == null
        ? theme.palette.primary.main
        : tone;

  const GlassComp = solid ? null : lookupGlassIcon(name);
  // Lookup chain: 1) custom glass illustration, 2) explicit Fallback prop,
  // 3) name-keyed MUI fallback map, 4) generic AutoAwesome icon.
  // The chain guarantees the glass tile never renders as an empty cube.
  const MuiFromMap = !GlassComp && !Fallback ? lookupMuiFallback(name) : null;
  const FinalFallback = MuiFromMap || (!GlassComp && !Fallback ? DEFAULT_FALLBACK : null);

  const inner = GlassComp
    ? createElement(GlassComp, {
        width: size,
        height: size,
        style: { color: tintColor, display: 'block' },
      })
    : Fallback
      ? createElement(Fallback, {
          sx: { fontSize: size, color: tintColor, display: 'block' },
        })
      : FinalFallback
        ? createElement(FinalFallback, {
            sx: { fontSize: size, color: tintColor, display: 'block' },
          })
        : null;

  if (!tile) return inner;

  const finalTileSize = tileSize ?? Math.round(size * 1.7);
  const finalRadius = radius ?? Math.round(size * 0.42);

  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: finalTileSize,
        height: finalTileSize,
        borderRadius: `${finalRadius}px`,
        flexShrink: 0,
        background: isDark
          ? `linear-gradient(160deg, ${alpha('#ffffff', 0.1)} 0%, ${alpha('#ffffff', 0.03)} 100%)`
          : `linear-gradient(160deg, #ffffff 0%, ${alpha('#f3f3f3', 0.85)} 100%)`,
        border: '1px solid',
        borderColor: isDark ? alpha('#ffffff', 0.12) : alpha(theme.palette.primary.main, 0.14),
        boxShadow: isDark
          ? `0 8px 22px ${alpha('#000', 0.42)}, inset 0 1px 0 ${alpha('#fff', 0.08)}`
          : `0 8px 22px ${alpha(theme.palette.primary.main, 0.12)}, inset 0 1px 0 ${alpha('#fff', 0.9)}`,
        backdropFilter: 'saturate(180%) blur(14px)',
        WebkitBackdropFilter: 'saturate(180%) blur(14px)',
        position: 'relative',
        overflow: 'hidden',
        willChange: 'transform',
        '&::before': {
          content: '""',
          position: 'absolute',
          inset: 0,
          background: isDark
            ? `radial-gradient(circle at 30% 0%, ${alpha('#fff', 0.1)} 0%, transparent 60%)`
            : `radial-gradient(circle at 30% 0%, ${alpha('#fff', 0.6)} 0%, transparent 60%)`,
          pointerEvents: 'none',
        },
        ...sx,
      }}
    >
      {inner}
    </Box>
  );
}
