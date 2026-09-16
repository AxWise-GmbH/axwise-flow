/**
 * ToolIcon — renders a tool's real brand logo on a theme-matched glass tile,
 * falling back to a monochrome MUI category icon when no logo resolves or the
 * remote logo fails to load.
 *
 * Logos are full-color and fetched from a logo CDN (see toolLogoUrl). The tile
 * styling mirrors BrandIcon so tools match the rest of the product.
 */
import { createElement, useMemo, useState } from 'react';
import { Box, alpha, useTheme } from '@mui/material';
import {
  resolveToolDomain,
  toolLogoUrls,
  brandGlyphFor,
  fallbackIconFor,
  PREFER_GLYPH_DOMAINS,
} from '../../config/toolIconDomains';

export default function ToolIcon({ tool, tileSize = 32, size, subColor = '#6366F1', radius, sx }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  // Index into the ordered logo sources; advances on each load error so we fall
  // through Brandfetch -> DuckDuckGo -> MUI fallback icon.
  const [srcIdx, setSrcIdx] = useState(0);

  const domain = resolveToolDomain(tool);
  const sources = useMemo(() => toolLogoUrls(domain), [domain]);
  const glyph = useMemo(() => brandGlyphFor(tool), [tool]);
  const logoUrl = srcIdx < sources.length ? sources[srcIdx] : null;

  const glyphSize = size ?? Math.round(tileSize * 0.55);
  const logoSize = Math.round(tileSize * 0.62);
  const finalRadius = radius ?? Math.round(tileSize * 0.28);

  let inner;
  if (logoUrl) {
    // Colored brand logo / favicon; advance to the next source on load error.
    inner = (
      <Box
        component="img"
        key={logoUrl}
        src={logoUrl}
        alt={tool?.name || 'tool'}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setSrcIdx((i) => i + 1)}
        sx={{ width: logoSize, height: logoSize, objectFit: 'contain', display: 'block' }}
      />
    );
  } else if (glyph) {
    // Brand glyph (simple-icons). Shared-mark domains (Google Workspace) render
    // in the real brand color so each product is distinct; the rest stay themed.
    const glyphFill = PREFER_GLYPH_DOMAINS.has(domain) ? `#${glyph.hex}` : subColor;
    inner = (
      <Box
        component="svg"
        viewBox="0 0 24 24"
        role="img"
        aria-label={glyph.title}
        sx={{ width: logoSize, height: logoSize, display: 'block' }}
      >
        <path d={glyph.path} fill={glyphFill} />
      </Box>
    );
  } else {
    inner = createElement(fallbackIconFor(tool), {
      sx: { fontSize: glyphSize, color: subColor, display: 'block' },
    });
  }

  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: tileSize,
        height: tileSize,
        borderRadius: `${finalRadius}px`,
        flexShrink: 0,
        background: isDark
          ? `linear-gradient(160deg, ${alpha('#ffffff', 0.1)} 0%, ${alpha('#ffffff', 0.03)} 100%)`
          : `linear-gradient(160deg, #ffffff 0%, ${alpha('#eef3ff', 0.85)} 100%)`,
        border: '1px solid',
        borderColor: isDark ? alpha('#ffffff', 0.12) : alpha(theme.palette.primary.main, 0.14),
        boxShadow: isDark
          ? `inset 0 1px 0 ${alpha('#fff', 0.06)}`
          : `inset 0 1px 0 ${alpha('#fff', 0.9)}`,
        position: 'relative',
        overflow: 'hidden',
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
