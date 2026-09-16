import { useCallback } from 'react';
import { Box, Paper, Stack, Typography, useTheme, alpha } from '@mui/material';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';

import AppIcon from '../icons/AppIcon';

/**
 * Marketplace-style tile — production-ready, identical-width block for grids.
 *
 * Reused across Marketplace, SimpleOrganizations and SimpleDashboard so
 * every "category"/"action" surface in simple mode shares one visual language:
 * gradient bg tinted by an accent color, breathing inset shadow, icon disk with
 * subtle tilt, cursor-tracked radial glow on hover, hidden arrow that slides
 * in on hover, optional pulsing "live" dot, staggered entry animation.
 *
 * Variants:
 *   - 'solid'  (default) — gradient accent bg
 *   - 'dashed'           — dashed border, transparent fill (for "Add" tiles)
 *
 * All animations honor `prefers-reduced-motion`.
 */
export default function MktTile({
  icon,
  accent,
  kicker,
  title,
  subtitle,
  metrics, // optional [{label, value, color?}]
  children, // optional body slot rendered above the CTA footer
  illustration, // optional decorative right-side SVG (rendered behind text)
  ctaLabel = 'Open',
  onClick,
  delay = 0,
  variant = 'solid',
  liveDot = false,
  minHeight = 220,
  ariaLabel,
}) {
  const theme = useTheme();
  const tint = accent || theme.palette.primary.main;
  const isDashed = variant === 'dashed';

  // Cursor-tracked radial glow (CSS custom properties)
  const handleMove = useCallback((e) => {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--mkt-mx', `${e.clientX - rect.left}px`);
    el.style.setProperty('--mkt-my', `${e.clientY - rect.top}px`);
  }, []);

  return (
    <Paper
      elevation={0}
      role="button"
      tabIndex={0}
      aria-label={ariaLabel || title}
      onClick={onClick}
      onMouseMove={handleMove}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      }}
      sx={{
        position: 'relative',
        overflow: 'hidden',
        p: { xs: 2.25, sm: 2.75 },
        minHeight,
        borderRadius: '18px',
        cursor: 'pointer',
        // Defensive: ensure the Paper itself receives pointer events even if a
        // theme override or ancestor sets pointer-events: none. Children that
        // could absorb the click (icon disk, typography) get `pointer-events:
        // none` via CSS below.
        pointerEvents: 'auto',
        userSelect: 'none',
        '& > *': { pointerEvents: 'none' },
        display: 'flex',
        flexDirection: 'column',
        gap: 1.25,
        background: isDashed
          ? alpha(tint, 0.03)
          : `linear-gradient(160deg, ${alpha(tint, 0.1)} 0%, ${alpha(theme.palette.background.paper, 0.98)} 65%)`,
        border: isDashed ? '1.5px dashed' : '1px solid',
        borderColor: alpha(tint, isDashed ? 0.4 : 0.22),
        // Breathing inset shadow — subtle alive feel
        boxShadow: `inset 0 0 0 1px ${alpha(tint, 0)}`,
        animation: `mktTileIn 700ms ${delay}ms both cubic-bezier(.22,1,.36,1), mktTileBreath 4s ${600 + delay}ms ease-in-out infinite`,
        transition: 'transform .28s cubic-bezier(.22,1,.36,1), border-color .22s, box-shadow .25s',

        '@keyframes mktTileIn': {
          from: { opacity: 0, transform: 'translateY(16px)' },
          to: { opacity: 1, transform: 'translateY(0)' },
        },
        '@keyframes mktTileBreath': {
          '0%, 100%': { boxShadow: `inset 0 0 0 1px ${alpha(tint, 0)}` },
          '50%': { boxShadow: `inset 0 0 24px ${alpha(tint, 0.06)}` },
        },

        // Cursor-tracked radial glow layer
        '&::before': {
          content: '""',
          position: 'absolute',
          inset: 0,
          borderRadius: 'inherit',
          background: `radial-gradient(380px circle at var(--mkt-mx, 50%) var(--mkt-my, 50%), ${alpha(tint, 0.14)} 0%, transparent 55%)`,
          opacity: 0,
          transition: 'opacity .25s',
          pointerEvents: 'none',
        },

        '&:hover, &:focus-visible': {
          transform: 'translateY(-4px)',
          borderColor: alpha(tint, isDashed ? 0.7 : 0.55),
          boxShadow: `0 10px 32px ${alpha(tint, 0.18)}, 0 24px 60px ${alpha(tint, 0.1)}`,
          outline: 'none',
          '&::before': { opacity: 1 },
          '& .mkt-icon': { transform: 'rotate(0deg) scale(1.04)' },
          '& .mkt-arrow': { transform: 'translateX(6px)', opacity: 1 },
        },

        '@media (prefers-reduced-motion: reduce)': {
          animation: 'none',
          transition: 'border-color .2s, box-shadow .2s',
          '&:hover, &:focus-visible': { transform: 'none' },
          '& .mkt-icon': { animation: 'none' },
        },
      }}
    >
      {/* Optional decorative right-side illustration — rendered behind text. */}
      {illustration && (
        <Box
          aria-hidden="true"
          sx={{
            position: 'absolute',
            right: 0,
            top: '50%',
            transform: 'translateY(-50%)',
            width: '55%',
            maxWidth: 280,
            height: '120%',
            pointerEvents: 'none',
            color: tint,
            opacity: 0.15,
            filter: 'brightness(0.55) saturate(0.8)',
            WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 65%, black 100%)',
            maskImage: 'linear-gradient(to right, transparent 0%, black 65%, black 100%)',
            '& > svg, & > *': {
              width: '100%',
              height: '100%',
              maxHeight: 240,
              display: 'block',
            },
          }}
        >
          {illustration}
        </Box>
      )}
      {/* Optional live dot, top-right */}
      {liveDot && (
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            top: 16,
            right: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            zIndex: 2,
          }}
        >
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              bgcolor: tint,
              boxShadow: `0 0 0 0 ${alpha(tint, 0.6)}`,
              animation: 'mktLivePulse 1.6s ease-in-out infinite',
              '@keyframes mktLivePulse': {
                '0%, 100%': { boxShadow: `0 0 0 0 ${alpha(tint, 0.5)}` },
                '50%': { boxShadow: `0 0 0 6px ${alpha(tint, 0)}` },
              },
              '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
            }}
          />
        </Box>
      )}
      {/* Icon disk */}
      {icon && (
        <Box
          className="mkt-icon"
          sx={{
            width: 52,
            height: 52,
            borderRadius: 2.5,
            bgcolor: alpha(tint, 0.15),
            color: tint,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transform: 'rotate(-2deg) scale(1)',
            transition: 'transform .35s cubic-bezier(.22,1,.36,1)',
            animation: 'mktIconTilt 6s ease-in-out infinite',
            '@keyframes mktIconTilt': {
              '0%, 100%': { transform: 'rotate(-3deg)' },
              '50%': { transform: 'rotate(3deg)' },
            },
            zIndex: 1,
          }}
        >
          {icon}
        </Box>
      )}
      {/* Kicker (uppercase label, e.g. org type) */}
      {kicker && (
        <Typography
          variant="caption"
          sx={{
            fontWeight: 800,
            letterSpacing: '0.10em',
            color: tint,
            textTransform: 'uppercase',
            fontSize: '0.66rem',
            zIndex: 1,
            mt: icon ? -0.25 : 0,
          }}
        >
          {kicker}
        </Typography>
      )}
      {/* Title */}
      <Typography
        variant="h6"
        sx={{
          fontWeight: 700,
          lineHeight: 1.2,
          mt: kicker ? -0.5 : 0.25,
          zIndex: 1,
        }}
      >
        {title}
      </Typography>
      {/* Subtitle */}
      {subtitle && (
        <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.45, zIndex: 1 }}>
          {subtitle}
        </Typography>
      )}
      {/* Optional metrics list */}
      {Array.isArray(metrics) && metrics.length > 0 && (
        <Stack spacing={0.5} sx={{ mt: 0.5, zIndex: 1 }}>
          {metrics.map((m, i) => (
            <Box key={i} sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 700,
                  color: m.color || tint,
                  minWidth: 28,
                }}
              >
                {m.value}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
                {m.label}
              </Typography>
            </Box>
          ))}
        </Stack>
      )}
      {/* Optional body slot — list of goals, custom content, etc. */}
      {children && (
        <Box sx={{ mt: 0.5, zIndex: 1, minHeight: 0, flex: '0 1 auto', overflow: 'hidden' }}>
          {children}
        </Box>
      )}
      {/* Footer CTA (hidden arrow that slides in on hover) */}
      <Box
        sx={{
          mt: 'auto',
          pt: 1.25,
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          color: tint,
          fontWeight: 700,
          fontSize: '0.875rem',
          zIndex: 1,
        }}
      >
        {ctaLabel}
        <AppIcon
          name="ArrowForwardRounded"
          fallback={ArrowForwardRoundedIcon}
          className="mkt-arrow"
          sx={{
            fontSize: 18,
            transform: 'translateX(0)',
            opacity: 0.55,
            transition: 'transform .28s cubic-bezier(.22,1,.36,1), opacity .2s',
          }}
        />
      </Box>
    </Paper>
  );
}
