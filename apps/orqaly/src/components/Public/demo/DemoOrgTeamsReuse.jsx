import { Box, Chip, Stack, Typography, alpha, useTheme } from '@mui/material';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import ReplayOutlinedIcon from '@mui/icons-material/ReplayOutlined';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';

import AppIcon from '../../icons/AppIcon';

const TEAMS = [
  { name: 'Clinic Triage Squad', usedOn: 'Voice triage rollout, Q1 launch' },
  { name: 'Ops & Refunds', usedOn: 'Refund policy update' },
];

export default function DemoOrgTeamsReuse() {
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
          Teams · Roastedco
        </Typography>
        <Chip
          size="small"
          icon={<AppIcon
            name='AccountTreeOutlined'
            fallback={AccountTreeOutlinedIcon}
            sx={{ fontSize: '14px !important' }} />}
          label="Org chart"
          sx={{ fontWeight: 700, fontSize: '0.68rem' }}
        />
      </Stack>
      <Stack spacing={1.5}>
        {TEAMS.map((team) => (
          <Stack
            key={team.name}
            spacing={1}
            sx={{
              p: 1.75,
              borderRadius: 2.5,
              border: `1px solid ${theme.palette.divider}`,
              bgcolor: isDark ? alpha('#fff', 0.02) : alpha(theme.palette.text.primary, 0.015),
            }}
          >
            <Stack direction="row" alignItems="center" spacing={1.25}>
              <Box
                sx={{
                  width: 36,
                  height: 36,
                  borderRadius: 2,
                  bgcolor: alpha('#059669', 0.12),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <AppIcon
                  name='GroupsOutlined'
                  fallback={GroupsOutlinedIcon}
                  sx={{ fontSize: 20, color: '#059669' }} />
              </Box>
              <Typography sx={{ fontWeight: 700, fontSize: '0.88rem', color: 'text.primary', flex: 1 }}>
                {team.name}
              </Typography>
            </Stack>
            <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', pl: 0.5 }}>
              Used on: {team.usedOn}
            </Typography>
            <Chip
              size="small"
              icon={<AppIcon
                name='ReplayOutlined'
                fallback={ReplayOutlinedIcon}
                sx={{ fontSize: '14px !important' }} />}
              label="Assign to new goal"
              sx={{
                alignSelf: 'flex-start',
                fontWeight: 700,
                fontSize: '0.68rem',
                bgcolor: alpha(primary, 0.1),
                color: 'primary.main',
              }}
            />
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}
