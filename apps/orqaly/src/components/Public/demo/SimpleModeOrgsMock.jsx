import { Box, Stack, Typography, alpha, useTheme } from '@mui/material';
import Diversity3RoundedIcon from '@mui/icons-material/Diversity3Rounded';
import SmartToyRoundedIcon from '@mui/icons-material/SmartToyRounded';
import { simpleModeFrameSx, simpleModeLabelSx } from './simpleModeFrame';

import AppIcon from '../../icons/AppIcon';

const ORGS = [
  { name: 'Roastedco', type: 'Operating', teams: 2, agents: 5 },
  { name: 'Flow Studio', type: 'Client', teams: 1, agents: 3 },
];

const ACTIONS = ['Review teams', 'Manage agents', 'Review investors'];

export default function SimpleModeOrgsMock() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;

  return (
    <Box sx={simpleModeFrameSx(theme)}>
      <Box sx={{ p: { xs: 2, md: 2.5 } }}>
        <Typography sx={{ ...simpleModeLabelSx(), mb: 1.5 }}>Organizations · Simple view</Typography>
        <Stack spacing={1.25}>
          {ORGS.map((o) => (
            <Stack
              key={o.name}
              spacing={1}
              sx={{
                p: 1.5,
                borderRadius: 2.5,
                border: `1px solid ${theme.palette.divider}`,
                bgcolor: alpha(primary, 0.03),
              }}
            >
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography sx={{ fontWeight: 800, fontSize: '0.9rem' }}>{o.name}</Typography>
                <Box sx={{ px: 0.75, py: 0.2, borderRadius: 0.75, bgcolor: alpha(primary, 0.12), color: 'primary.main', fontSize: '0.62rem', fontWeight: 800 }}>
                  {o.type}
                </Box>
              </Stack>
              <Stack direction="row" spacing={2}>
                <Stack direction="row" spacing={0.5} alignItems="center">
                  <AppIcon
                    name='Diversity3Rounded'
                    fallback={Diversity3RoundedIcon}
                    sx={{ fontSize: 14, color: 'text.secondary' }} />
                  <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>{o.teams} teams</Typography>
                </Stack>
                <Stack direction="row" spacing={0.5} alignItems="center">
                  <AppIcon
                    name='SmartToyRounded'
                    fallback={SmartToyRoundedIcon}
                    sx={{ fontSize: 14, color: 'text.secondary' }} />
                  <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>{o.agents} agents</Typography>
                </Stack>
              </Stack>
            </Stack>
          ))}
        </Stack>
        <Typography sx={{ ...simpleModeLabelSx(), mt: 2, mb: 1 }}>Quick actions</Typography>
        <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', rowGap: 0.75 }}>
          {ACTIONS.map((a) => (
            <Box
              key={a}
              sx={{
                px: 1.25,
                py: 0.5,
                borderRadius: 999,
                fontSize: '0.72rem',
                fontWeight: 700,
                border: `1px solid ${alpha(primary, 0.35)}`,
                color: 'primary.main',
                bgcolor: alpha(primary, 0.08),
              }}
            >
              {a}
            </Box>
          ))}
        </Stack>
      </Box>
    </Box>
  );
}
