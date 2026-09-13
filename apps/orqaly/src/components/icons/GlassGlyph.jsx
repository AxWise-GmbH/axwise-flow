import { createElement } from 'react';
import { Box, useTheme, alpha } from '@mui/material';
import { lookupGlassIcon } from './glassIconMap';

/**
 * GlassGlyph - the pure Liquid Glass renderer (no mode logic). Renders the glass
 * SVG for `name` when one is mapped, otherwise the tinted MUI `fallback`. AppIcon
 * calls this for the simple-mode glass branch; callers decide when to use it.
 *
 * Props mirror the historical GlassIcon API:
 *   name     - MUI icon module name; lookup key into glassIconMap.
 *   fallback - MUI icon used when no glass glyph is mapped for `name`.
 *   size     - icon size in px (default 24).
 *   tile     - wrap in a frosted rounded tile (default false).
 *   tone     - "brand" (primary) | "neutral" (text) | "error" (red).
 *   ...rest  - passed to the underlying SVG / MUI icon.
 */
export default function GlassGlyph({
  name,
  fallback: Fallback,
  size = 24,
  tile = false,
  tone = 'brand',
  sx,
  ...rest
}) {
  const theme = useTheme();

  // Two-tone system palette: gray ("neutral") or green ("brand"/anything else).
  // "error" gets its own red tint so destructive actions stand out.
  const tintColor =
    tone === 'neutral'
      ? theme.palette.text.primary
      : tone === 'error'
        ? theme.palette.error.main
        : theme.palette.primary.main;

  const GlassComp = lookupGlassIcon(name);
  const inner = GlassComp
    ? createElement(GlassComp, {
        width: size,
        height: size,
        style: { color: tintColor, display: 'block' },
        ...(tile ? {} : rest),
      })
    : Fallback
      ? createElement(Fallback, {
          sx: { fontSize: size, color: tintColor, display: 'block', ...(tile ? null : sx) },
          ...(tile ? {} : rest),
        })
      : null;

  // Glass SVGs use gradient fills at 30-60% stopOpacity. On dark backgrounds that
  // makes colours like red nearly invisible. Boost error-toned icons so destructive
  // actions stand out while keeping the glass aesthetic.
  const boosted =
    tone === 'error' && inner
      ? createElement(
          'span',
          {
            style: { display: 'inline-flex', filter: 'brightness(2.2) saturate(4) contrast(1.3)' },
          },
          inner
        )
      : inner;

  if (!tile) return boosted;

  const tileSize = Math.round(size * 1.55);
  const radius = Math.round(size * 0.32);
  const isDark = theme.palette.mode === 'dark';

  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: tileSize,
        height: tileSize,
        borderRadius: `${radius}px`,
        flexShrink: 0,
        background: isDark
          ? `linear-gradient(180deg, ${alpha('#ffffff', 0.08)} 0%, ${alpha('#ffffff', 0.03)} 100%)`
          : `linear-gradient(180deg, #ffffff 0%, ${alpha('#eef3ff', 0.85)} 100%)`,
        border: '1px solid',
        borderColor: isDark ? alpha('#ffffff', 0.1) : alpha(theme.palette.primary.main, 0.12),
        boxShadow: isDark
          ? `0 6px 16px ${alpha('#000', 0.35)}, inset 0 1px 0 ${alpha('#fff', 0.06)}`
          : `0 6px 16px ${alpha(theme.palette.primary.main, 0.1)}, inset 0 1px 0 ${alpha('#fff', 0.9)}`,
        backdropFilter: 'saturate(160%) blur(10px)',
        WebkitBackdropFilter: 'saturate(160%) blur(10px)',
        ...sx,
      }}
      {...rest}
    >
      {inner}
    </Box>
  );
}
