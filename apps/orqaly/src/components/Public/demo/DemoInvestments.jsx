import { Box, Stack, Typography, alpha, useTheme } from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';

import AppIcon from '../../icons/AppIcon';

const DEALS = [
  { stage: 'Sourcing', count: 14, color: 'idle' },
  { stage: 'Diligence', count: 6, color: 'warm' },
  { stage: 'Committed', count: 3, color: 'hot' },
  { stage: 'Closed', count: 2, color: 'done' },
];

const COMMITS = [
  { name: 'Sofia P.', amount: '$120k', deal: 'Nimbus AI', tone: 'ok' },
  { name: 'Andrei R.', amount: '$50k', deal: 'Helix Health', tone: 'ok' },
  { name: 'Maya L.', amount: '$200k', deal: 'Nimbus AI', tone: 'pending' },
];

export default function DemoInvestments() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const warn = theme.palette.warning.main;
  const isDark = theme.palette.mode === 'dark';

  const colorFor = (c) => ({
    idle: alpha(theme.palette.text.primary, 0.4),
    warm: warn,
    hot: primary,
    done: primary,
  }[c]);

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
      <Box sx={{ p: { xs: 2, md: 2.5 } }}>
        <Typography sx={{ fontWeight: 800, fontSize: '0.72rem', color: 'text.secondary', letterSpacing: '0.08em', textTransform: 'uppercase', mb: 2 }}>
          Pipeline · Q2 2026
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1 }}>
          {DEALS.map((d) => (
            <Stack
              key={d.stage}
              spacing={0.5}
              sx={{
                p: 1.5,
                borderRadius: 2,
                bgcolor: alpha(colorFor(d.color), 0.08),
                border: `1px solid ${alpha(colorFor(d.color), 0.3)}`,
              }}
            >
              <Typography sx={{ fontWeight: 800, fontSize: '1.4rem', color: 'text.primary', lineHeight: 1 }}>{d.count}</Typography>
              <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{d.stage}</Typography>
            </Stack>
          ))}
        </Box>
      </Box>
      <Box sx={{ borderTop: `1px solid ${theme.palette.divider}`, p: { xs: 2, md: 2.5 } }}>
        <Stack direction="row" justifyContent="space-between" sx={{ mb: 1.5 }}>
          <Typography sx={{ fontWeight: 800, fontSize: '0.72rem', color: 'text.secondary', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Recent commitments
          </Typography>
          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ color: 'primary.main' }}>
            <AppIcon name='TrendingUp' fallback={TrendingUpIcon} sx={{ fontSize: 14 }} />
            <Typography sx={{ fontSize: '0.7rem', fontWeight: 700 }}>+18% MoM</Typography>
          </Stack>
        </Stack>
        <Stack spacing={1}>
          {COMMITS.map((c, i) => (
            <Stack
              key={i}
              direction="row"
              alignItems="center"
              spacing={1.5}
              sx={{
                p: 1.25,
                borderRadius: 2,
                border: `1px solid ${theme.palette.divider}`,
                bgcolor: isDark ? alpha('#fff', 0.02) : alpha(theme.palette.text.primary, 0.015),
              }}
            >
              <Box
                sx={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  bgcolor: alpha(primary, 0.15),
                  color: 'primary.main',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: '0.72rem',
                }}
              >
                {c.name.split(' ').map((w) => w[0]).join('')}
              </Box>
              <Stack sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontWeight: 700, fontSize: '0.82rem', color: 'text.primary' }}>{c.name}</Typography>
                <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>{c.deal}</Typography>
              </Stack>
              <Stack alignItems="flex-end">
                <Typography sx={{ fontWeight: 800, fontSize: '0.92rem', color: 'text.primary' }}>{c.amount}</Typography>
                <Typography sx={{ fontSize: '0.65rem', color: c.tone === 'pending' ? 'warning.main' : 'primary.main', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  {c.tone === 'pending' ? 'Pending' : 'Wired'}
                </Typography>
              </Stack>
            </Stack>
          ))}
        </Stack>
      </Box>
    </Box>
  );
}
