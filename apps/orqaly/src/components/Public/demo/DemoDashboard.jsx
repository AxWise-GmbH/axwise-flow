import { Box, Stack, Typography, alpha, useTheme } from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';

import AppIcon from '../../icons/AppIcon';

const KPIS = [
  { label: 'Active agents', value: '24', delta: '+3', up: true },
  { label: 'Runs today', value: '1.2k', delta: '+18%', up: true },
  { label: 'Refund rate', value: '2.1%', delta: '-0.3%', up: true },
  { label: 'CSAT', value: '4.7', delta: '+0.1', up: true },
];

function MiniChart({ tint }) {
  const points = [22, 28, 24, 32, 30, 38, 36, 44, 42, 50, 48, 56];
  const max = Math.max(...points);
  const w = 240;
  const h = 60;
  const stepX = w / (points.length - 1);
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${i * stepX},${h - (p / max) * h * 0.85}`).join(' ');
  const area = `${path} L ${w},${h} L 0,${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h}>
      <defs>
        <linearGradient id="dash-grad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={tint} stopOpacity="0.35" />
          <stop offset="100%" stopColor={tint} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#dash-grad)" />
      <path d={path} fill="none" stroke={tint} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function DemoDashboard() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const isDark = theme.palette.mode === 'dark';
  return (
    <Box
      sx={{
        position: 'relative',
        borderRadius: 4,
        overflow: 'hidden',
        bgcolor: isDark ? alpha('#fff', 0.025) : '#fff',
        border: `1px solid ${theme.palette.divider}`,
        boxShadow: `0 20px 50px ${alpha(primary, 0.18)}`,
      }}
    >
      <Box sx={{ p: 2.5, borderBottom: `1px solid ${theme.palette.divider}`, bgcolor: isDark ? alpha('#fff', 0.02) : alpha(theme.palette.text.primary, 0.02) }}>
        <Typography sx={{ fontWeight: 800, fontSize: '0.92rem', color: 'text.primary' }}>Agent operations</Typography>
        <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>Last 7 days · auto-refresh on</Typography>
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 0 }}>
        {KPIS.map((k, i) => (
          <Stack
            key={k.label}
            spacing={0.5}
            sx={{
              p: 2,
              borderRight: { md: i < 3 ? `1px solid ${theme.palette.divider}` : 'none' },
              borderBottom: { xs: i < 2 ? `1px solid ${theme.palette.divider}` : 'none', md: 'none' },
            }}
          >
            <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', fontWeight: 600 }}>{k.label}</Typography>
            <Typography sx={{ fontWeight: 800, fontSize: '1.5rem', color: 'text.primary', letterSpacing: '-0.01em' }}>{k.value}</Typography>
            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ color: 'primary.main' }}>
              {k.up ? <AppIcon name='TrendingUp' fallback={TrendingUpIcon} sx={{ fontSize: 14 }} /> : <AppIcon name='TrendingDown' fallback={TrendingDownIcon} sx={{ fontSize: 14 }} />}
              <Typography sx={{ fontSize: '0.72rem', fontWeight: 700 }}>{k.delta}</Typography>
            </Stack>
          </Stack>
        ))}
      </Box>
      <Box sx={{ p: 2.5, borderTop: `1px solid ${theme.palette.divider}` }}>
        <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 1.5 }}>
          <Typography sx={{ fontWeight: 700, fontSize: '0.82rem', color: 'text.primary' }}>Runs over time</Typography>
          <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>12 hours</Typography>
        </Stack>
        <MiniChart tint={primary} />
      </Box>
    </Box>
  );
}
