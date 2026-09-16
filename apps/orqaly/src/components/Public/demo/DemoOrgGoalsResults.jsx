import { Box, Chip, Stack, Typography, alpha, useTheme } from '@mui/material';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import RocketLaunchOutlinedIcon from '@mui/icons-material/RocketLaunchOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';

import AppIcon from '../../icons/AppIcon';

const GOALS = [
  { title: 'Q1 wholesale launch', status: 'active', spent: null },
  { title: 'Support automation v2', status: 'active', spent: '$42.10' },
  { title: 'Voice triage rollout', status: 'completed', spent: '$128.40', deployed: true },
  { title: 'Refund policy update', status: 'completed', spent: '$18.20', deployed: false },
];

export default function DemoOrgGoalsResults() {
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
            name='RocketLaunchOutlined'
            fallback={RocketLaunchOutlinedIcon}
            sx={{ fontSize: 18, color: 'success.main' }} />
          <Typography sx={{ fontWeight: 800, fontSize: '0.72rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary' }}>
            Results · Roastedco
          </Typography>
        </Stack>
        <Chip
          size="small"
          icon={<AppIcon
            name='OpenInNew'
            fallback={OpenInNewIcon}
            sx={{ fontSize: '14px !important' }} />}
          label="Job Pool"
          sx={{ fontWeight: 700, fontSize: '0.68rem', bgcolor: alpha(primary, 0.1), color: 'primary.main' }}
        />
      </Stack>
      <Stack spacing={1} sx={{ p: 2.5 }}>
        {GOALS.map((g) => (
          <Stack
            key={g.title}
            direction="row"
            alignItems="center"
            spacing={1.25}
            sx={{
              p: 1.5,
              borderRadius: 2.5,
              border: `1px solid ${g.status === 'completed' ? alpha(theme.palette.success.main, 0.2) : theme.palette.divider}`,
              bgcolor: isDark ? alpha('#fff', 0.02) : alpha(theme.palette.text.primary, 0.015),
            }}
          >
            {g.status === 'active' ? (
              <AppIcon
                name='AssignmentOutlined'
                fallback={AssignmentOutlinedIcon}
                sx={{ fontSize: 18, color: '#5B8DEF' }} />
            ) : (
              <AppIcon
                name='RocketLaunchOutlined'
                fallback={RocketLaunchOutlinedIcon}
                sx={{ fontSize: 18, color: 'success.main' }} />
            )}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', color: 'text.primary' }} noWrap>
                {g.title}
              </Typography>
              <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary' }}>
                {g.status === 'active' ? 'Active goal' : 'Completed'}
                {g.spent ? ` · ${g.spent}` : ''}
              </Typography>
            </Box>
            <Chip
              size="small"
              label={g.status === 'active' ? 'Active' : g.deployed ? 'Deployed' : 'Done'}
              color={g.status === 'active' ? 'primary' : 'success'}
              variant={g.status === 'active' ? 'outlined' : 'filled'}
              sx={{ height: 20, fontSize: '0.62rem', fontWeight: 700 }}
            />
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}
