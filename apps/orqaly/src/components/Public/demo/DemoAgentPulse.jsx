import { Box, Chip, Stack, Typography, alpha, useTheme } from '@mui/material';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';

import AppIcon from '../../icons/AppIcon';

const SCHEDULES = [
  { name: 'Clinic Triage Squad', cadence: 'Every 4h', next: '8:00 AM', on: true },
  { name: 'Sales Follow-up', cadence: 'Daily 6:00', next: 'Tomorrow', on: true },
  { name: 'Refund Reviewer', cadence: 'On demand', next: '—', on: false },
];

export default function DemoAgentPulse() {
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
          Pulse schedules
        </Typography>
        <Chip
          size="small"
          icon={<AppIcon
            name='PlayCircleOutline'
            fallback={PlayCircleOutlineIcon}
            sx={{ fontSize: '14px !important' }} />}
          label="Run now"
          sx={{ fontWeight: 700, fontSize: '0.68rem', bgcolor: alpha(primary, 0.12), color: 'primary.main' }}
        />
      </Stack>
      <Stack spacing={1.25}>
        {SCHEDULES.map((s) => (
          <Stack
            key={s.name}
            direction="row"
            alignItems="center"
            spacing={1.5}
            sx={{
              p: 1.5,
              borderRadius: 2,
              border: `1px solid ${theme.palette.divider}`,
              bgcolor: isDark ? alpha('#fff', 0.02) : alpha(theme.palette.text.primary, 0.015),
            }}
          >
            <AppIcon
              name='FiberManualRecord'
              fallback={FiberManualRecordIcon}
              sx={{ fontSize: 10, color: s.on ? primary : 'text.disabled' }} />
            <Stack sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontWeight: 700, fontSize: '0.85rem' }}>{s.name}</Typography>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ color: 'text.secondary' }}>
                <AppIcon
                  name='ScheduleOutlined'
                  fallback={ScheduleOutlinedIcon}
                  sx={{ fontSize: 14 }} />
                <Typography sx={{ fontSize: '0.72rem' }}>{s.cadence}</Typography>
              </Stack>
            </Stack>
            <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', whiteSpace: 'nowrap' }}>
              Next {s.next}
            </Typography>
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}
