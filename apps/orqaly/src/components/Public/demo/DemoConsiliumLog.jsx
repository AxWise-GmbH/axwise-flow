import { Box, Chip, Stack, Typography, alpha, useTheme } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import GavelOutlinedIcon from '@mui/icons-material/GavelOutlined';

import AppIcon from '../../icons/AppIcon';

const EVALS = [
  { title: 'Approve Q1 pricing change', level: 'HIGH', approved: true, score: 8.4 },
  { title: 'Refund policy v2 rollout', level: 'CRITICAL', approved: false, score: 4.2 },
];

export default function DemoConsiliumLog() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const isDark = theme.palette.mode === 'dark';

  const levelColor = (level) => {
    if (level === 'CRITICAL') return theme.palette.error.main;
    if (level === 'HIGH') return theme.palette.warning.main;
    return theme.palette.info.main;
  };

  return (
    <Box
      sx={{
        borderRadius: 4,
        overflow: 'hidden',
        bgcolor: isDark ? alpha('#fff', 0.025) : '#fff',
        border: `1px solid ${theme.palette.divider}`,
        boxShadow: `0 16px 40px ${alpha(primary, 0.14)}`,
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 2.5, py: 1.75, borderBottom: `1px solid ${theme.palette.divider}` }}>
        <AppIcon
          name='GavelOutlined'
          fallback={GavelOutlinedIcon}
          sx={{ fontSize: 18, color: 'primary.main' }} />
        <Typography sx={{ fontWeight: 800, fontSize: '0.72rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary', flex: 1 }}>
          Consilium log · Communicator
        </Typography>
      </Stack>
      <Stack spacing={1} sx={{ p: 2.5 }}>
        {EVALS.map((e) => (
          <Stack
            key={e.title}
            direction="row"
            alignItems="flex-start"
            spacing={1.25}
            sx={{
              p: 1.5,
              borderRadius: 2.5,
              border: `1px solid ${alpha(e.approved ? theme.palette.success.main : theme.palette.error.main, 0.25)}`,
              bgcolor: isDark ? alpha('#fff', 0.02) : alpha(theme.palette.text.primary, 0.015),
            }}
          >
            {e.approved ? (
              <AppIcon
                name='CheckCircle'
                fallback={CheckCircleIcon}
                sx={{ color: 'success.main', fontSize: 20 }} />
            ) : (
              <AppIcon
                name='Cancel'
                fallback={CancelIcon}
                sx={{ color: 'error.main', fontSize: 20 }} />
            )}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontWeight: 700, fontSize: '0.85rem' }} noWrap>{e.title}</Typography>
              <Stack direction="row" spacing={0.75} sx={{ mt: 0.5 }}>
                <Chip label={e.level} size="small" sx={{ height: 18, fontSize: '0.6rem', fontWeight: 700, color: levelColor(e.level), borderColor: alpha(levelColor(e.level), 0.4) }} variant="outlined" />
                <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>Score {e.score}</Typography>
              </Stack>
            </Box>
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}
