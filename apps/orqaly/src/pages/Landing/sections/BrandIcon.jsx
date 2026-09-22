import { Box, alpha, useTheme } from '@mui/material';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import { siAnthropic, siGooglegemini, siFigma, siGithub, siCloudflare } from 'simple-icons';

// Registry of brand records. Each value comes straight from the simple-icons
// package (CC0-1.0). `slug` is the lookup key. Missing slugs fall back to a
// generic AI sparkle icon - used here for `openai` which simple-icons does
// not currently ship.
const REGISTRY = {
  anthropic: siAnthropic,
  googlegemini: siGooglegemini,
  figma: siFigma,
  github: siGithub,
  cloudflare: siCloudflare,
};

// Fallback brand metadata for slugs not in simple-icons. Used for hover tints.
const FALLBACK_META = {
  openai: { title: 'OpenAI', hex: '10A37F' },
};

export function getBrandMeta(slug) {
  const rec = REGISTRY[slug];
  if (rec) return { title: rec.title, hex: rec.hex };
  return FALLBACK_META[slug] || { title: slug, hex: '64748B' };
}

export default function BrandIcon({
  slug,
  size = 22,
  tone = '#FFFFFF',
  tile = true,
  tileSize,
  radius,
  sx,
}) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const record = REGISTRY[slug];

  const inner = record ? (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-label={record.title}
      style={{ display: 'block' }}
    >
      <path d={record.path} fill={tone} />
    </svg>
  ) : (
    <AutoAwesomeOutlinedIcon
      sx={{ fontSize: size, color: tone, display: 'block' }}
      aria-label={FALLBACK_META[slug]?.title || slug}
    />
  );

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
