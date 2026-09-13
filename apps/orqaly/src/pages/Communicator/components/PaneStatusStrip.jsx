/**
 * [module: design-system + connection-hub]
 * PaneStatusStrip - pinned 3-number context row at the top of every detail
 * pane in the Communicator/Agent Workspace layout.
 *
 * Each stat: big number + small label + optional trend chip (↑ +12% / ↓ -3% / -).
 * Color accent driven by the optional `color` per stat. Mobile-first: stacks
 * vertically under 480px.
 *
 * Usage:
 *   <PaneStatusStrip stats={[
 *     { value: '$0.42', label: 'Today cost',    trend: '↓ 18%', color: 'primary' },
 *     { value: 147,     label: 'Messages',      trend: '↑ 12',  color: 'info' },
 *     { value: '$4.58', label: 'Cap remaining', color: 'success' },
 *   ]} />
 */
import { isValidElement } from 'react';
import { Box, Paper, Typography, useTheme, alpha } from '@mui/material';

const COLOR_MAP = {
  primary: 'primary.main',
  info: 'info.main',
  success: 'success.main',
  warning: 'warning.main',
  danger: 'error.main',
  violet: '#8b5cf6',
  pink: '#ec4899',
  neutral: 'text.secondary',
};

function resolveColor(theme, c) {
  if (!c) return theme.palette.text.secondary;
  const path = COLOR_MAP[c] || c;
  if (typeof path !== 'string') return path;
  if (path.startsWith('#')) return path;
  const [k1, k2] = path.split('.');
  return theme.palette[k1]?.[k2] || theme.palette.text.secondary;
}

export default function PaneStatusStrip({ stats = [], compact = false }) {
  const theme = useTheme();
  if (!stats || stats.length === 0) return null;

  return (
    <Paper
      variant="outlined"
      sx={{
        mb: { xs: 1.25, sm: 1.75 },
        borderRadius: 2.5,
        overflow: 'hidden',
        background: `linear-gradient(180deg, ${alpha(theme.palette.primary.main, 0.04)} 0%, transparent 100%)`,
      }}
    >
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            sm: `repeat(${Math.min(stats.length, 4)}, minmax(0, 1fr))`,
          },
          gap: 0,
        }}
      >
        {stats.map((s, i) => {
          const c = resolveColor(theme, s.color || 'primary');
          return (
            <Box
              key={i}
              sx={{
                px: { xs: 1.25, sm: 1.5 },
                py: { xs: 1, sm: compact ? 0.9 : 1.25 },
                borderRight: {
                  xs: 'none',
                  sm: i < stats.length - 1 ? '1px solid' : 'none',
                },
                borderBottom: {
                  xs: i < stats.length - 1 ? '1px solid' : 'none',
                  sm: 'none',
                },
                borderColor: 'divider',
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                minWidth: 0,
              }}
            >
              {/* Optional leading icon - accepts:
                  - a string (rendered as-is)
                  - a rendered JSX element (e.g. <SomeIcon />)
                  - a component reference, including React.memo-wrapped MUI icons
                    (most @mui/icons-material exports are memoized objects,
                    NOT plain functions, so `typeof === 'function'` fails). */}
              {s.icon && (
                <Box
                  sx={{
                    width: 28,
                    height: 28,
                    borderRadius: 1.5,
                    flexShrink: 0,
                    bgcolor: alpha(c, 0.14),
                    color: c,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.95rem',
                  }}
                >
                  {renderIcon(s.icon)}
                </Box>
              )}

              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, flexWrap: 'wrap' }}>
                  <Typography
                    component="span"
                    sx={{
                      fontWeight: 800,
                      fontSize: compact ? '1rem' : '1.15rem',
                      lineHeight: 1.1,
                      color: 'text.primary',
                      letterSpacing: '-0.01em',
                    }}
                  >
                    {s.value}
                  </Typography>
                  {s.trend && (
                    <Typography
                      component="span"
                      sx={{
                        fontSize: '0.66rem',
                        fontWeight: 700,
                        color: trendColor(s.trend, theme),
                        bgcolor: alpha(trendColor(s.trend, theme), 0.12),
                        px: 0.6,
                        py: 0.1,
                        borderRadius: 0.75,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {s.trend}
                    </Typography>
                  )}
                </Box>
                <Typography
                  sx={{
                    fontSize: '0.66rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'text.secondary',
                    mt: 0.25,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {s.label}
                </Typography>
              </Box>
            </Box>
          );
        })}
      </Box>
    </Paper>
  );
}

function renderIcon(icon) {
  if (icon == null) return null;
  // Already a JSX element (e.g. <Icon sx={{ ... }} />)
  if (isValidElement(icon)) return icon;
  // Plain string emoji or character
  if (typeof icon === 'string') return icon;
  // Component reference - works for plain functions AND React.memo / forwardRef
  // objects (which is what most MUI icons are). Wrap in JSX to instantiate.
  const Icon = icon;
  return <Icon sx={{ fontSize: 16 }} />;
}

function trendColor(trend, theme) {
  const s = String(trend || '').trim();
  if (s.startsWith('↑') || s.startsWith('+')) return theme.palette.success.main;
  if (s.startsWith('↓') || s.startsWith('-')) return theme.palette.error.main;
  return theme.palette.text.secondary;
}
