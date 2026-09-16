import { Box, Chip, Stack, Typography, alpha, useTheme } from '@mui/material';
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';
import TrackChangesOutlinedIcon from '@mui/icons-material/TrackChangesOutlined';

import AppIcon from '../../icons/AppIcon';

const EVENTS = [
  { goal: 'Landing page for AaaS', event: 'Agent · design mock v1 posted', time: '2m' },
  { goal: 'Voice triage rollout', event: 'Live · inbound call answered', time: '5m' },
  { goal: 'Q1 wholesale launch', event: 'Team · estimate approved', time: '12m' },
];

export default function DemoCommWorkspace() {
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
      }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2.5, py: 1.75, borderBottom: `1px solid ${theme.palette.divider}` }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <AppIcon
            name='BoltOutlined'
            fallback={BoltOutlinedIcon}
            sx={{ fontSize: 18, color: 'warning.main' }} />
          <Typography sx={{ fontWeight: 800, fontSize: '0.72rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary' }}>
            Live activity
          </Typography>
        </Stack>
        <Chip size="small" label="All goals" variant="outlined" sx={{ height: 22, fontSize: '0.62rem', fontWeight: 700 }} />
      </Stack>
      <Stack spacing={0} sx={{ p: 0 }}>
        {EVENTS.map((e, i) => (
          <Stack
            key={e.goal}
            direction="row"
            alignItems="flex-start"
            spacing={1.25}
            sx={{
              px: 2.5,
              py: 1.5,
              borderBottom: i < EVENTS.length - 1 ? `1px solid ${theme.palette.divider}` : 'none',
            }}
          >
            <AppIcon
              name='TrackChangesOutlined'
              fallback={TrackChangesOutlinedIcon}
              sx={{ fontSize: 16, color: 'primary.main', mt: 0.25 }} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontWeight: 700, fontSize: '0.82rem' }} noWrap>{e.goal}</Typography>
              <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>{e.event}</Typography>
            </Box>
            <Typography sx={{ fontSize: '0.68rem', color: 'text.disabled', fontWeight: 700 }}>{e.time}</Typography>
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}
