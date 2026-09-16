import { Box, Chip, Stack, Typography, alpha, useTheme } from '@mui/material';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';

import AppIcon from '../../icons/AppIcon';

const STAGES = [
  { key: 'feasibility', label: 'Analysis', done: true },
  { key: 'analyzing', label: 'PO Tech Doc', done: true },
  { key: 'planning', label: 'PM Planning', done: true },
  { key: 'forming_team', label: 'Team Formation', done: true },
  { key: 'provisioning_tools', label: 'Tool Setup', done: false, current: true },
  { key: 'estimating', label: 'Estimates', done: false },
  { key: 'active', label: 'Executing', done: false },
];

export default function DemoGoalPipeline() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const isDark = theme.palette.mode === 'dark';

  return (
    <Box
      sx={{
        borderRadius: 4,
        overflow: 'hidden',
        bgcolor: isDark ? alpha('#fff', 0.025) : '#fff',
        border: `1px solid ${theme.palette.divider}`,
        boxShadow: `0 16px 40px ${alpha(primary, 0.14)}`,
        p: { xs: 2, md: 2.5 },
      }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Typography sx={{ fontWeight: 800, fontSize: '0.72rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary' }}>
          Pipeline · Work Log
        </Typography>
        <Chip
          size="small"
          icon={<AppIcon
            name='SmartToyOutlined'
            fallback={SmartToyOutlinedIcon}
            sx={{ fontSize: '14px !important' }} />}
          label="Sales Follow-up running"
          sx={{ fontWeight: 700, fontSize: '0.65rem', bgcolor: alpha(primary, 0.1), color: 'primary.main' }}
        />
      </Stack>
      <Stack spacing={1}>
        {STAGES.map((s) => (
          <Stack
            key={s.key}
            direction="row"
            alignItems="center"
            spacing={1.25}
            sx={{
              p: 1.25,
              borderRadius: 2,
              border: `1px solid ${s.current ? alpha(primary, 0.4) : theme.palette.divider}`,
              bgcolor: s.current ? alpha(primary, 0.06) : isDark ? alpha('#fff', 0.02) : alpha(theme.palette.text.primary, 0.015),
            }}
          >
            <Box
              sx={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                bgcolor: s.done ? theme.palette.success.main : s.current ? primary : alpha(theme.palette.text.primary, 0.2),
              }}
            />
            <Typography sx={{ flex: 1, fontWeight: s.current ? 800 : 600, fontSize: '0.82rem', color: s.done || s.current ? 'text.primary' : 'text.secondary' }}>
              {s.label}
            </Typography>
            {s.current && (
              <Chip size="small" icon={<AppIcon
                name='HourglassEmpty'
                fallback={HourglassEmptyIcon}
                sx={{ fontSize: '12px !important' }} />} label="Now" sx={{ height: 20, fontSize: '0.6rem', fontWeight: 700 }} />
            )}
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}
