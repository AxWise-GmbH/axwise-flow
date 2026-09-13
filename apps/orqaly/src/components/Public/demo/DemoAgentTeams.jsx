import { Box, Chip, Stack, Typography, alpha, useTheme } from '@mui/material';
import Diversity3OutlinedIcon from '@mui/icons-material/Diversity3Outlined';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';

import AppIcon from '../../icons/AppIcon';

const TEAMS = [
  { name: 'Clinic Triage Squad', members: ['Triage Voice', 'Refund Reviewer'], status: 'active' },
  { name: 'Sales Pod', members: ['Sales Follow-up', 'Research Scout'], status: 'active' },
];

export default function DemoAgentTeams() {
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
          Teams
        </Typography>
        <Chip
          size="small"
          icon={<AppIcon
            name='LightbulbOutlined'
            fallback={LightbulbOutlinedIcon}
            sx={{ fontSize: '14px !important' }} />}
          label="Suggestions"
          sx={{ fontWeight: 700, fontSize: '0.68rem', bgcolor: alpha(theme.palette.warning.main, 0.12), color: 'warning.main' }}
        />
      </Stack>
      <Stack spacing={1.5}>
        {TEAMS.map((team) => (
          <Stack
            key={team.name}
            spacing={1.25}
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
                  bgcolor: alpha(theme.palette.success.main, 0.12),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <AppIcon
                  name='Diversity3Outlined'
                  fallback={Diversity3OutlinedIcon}
                  sx={{ fontSize: 20, color: 'success.main' }} />
              </Box>
              <Stack sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontWeight: 700, fontSize: '0.9rem' }}>{team.name}</Typography>
                <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>{team.members.length} agents</Typography>
              </Stack>
              <Chip label={team.status} size="small" sx={{ height: 22, fontSize: '0.65rem', fontWeight: 600, textTransform: 'capitalize' }} />
            </Stack>
            <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
              {team.members.map((m) => (
                <Chip key={m} label={m} size="small" variant="outlined" sx={{ fontSize: '0.68rem', height: 24 }} />
              ))}
            </Stack>
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}
