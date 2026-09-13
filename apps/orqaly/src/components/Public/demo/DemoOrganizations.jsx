import { Box, Stack, Typography, alpha, useTheme } from '@mui/material';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import CheckIcon from '@mui/icons-material/Check';

import AppIcon from '../../icons/AppIcon';

const ORGS = [
  { name: 'Roastedco', members: 4, agents: 6, goals: 4, kb: 28, current: true },
  { name: 'Flow Studio', members: 2, agents: 3, goals: 2, kb: 11, current: false },
  { name: 'Klein Consulting', members: 5, agents: 9, goals: 7, kb: 42, current: false },
];

export default function DemoOrganizations() {
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
      <Box sx={{ p: { xs: 2, md: 2.5 }, borderBottom: `1px solid ${theme.palette.divider}` }}>
        <Typography sx={{ fontWeight: 800, fontSize: '0.72rem', color: 'text.secondary', letterSpacing: '0.08em', textTransform: 'uppercase', mb: 0.5 }}>
          Workspace switcher
        </Typography>
        <Typography sx={{ fontSize: '0.8rem', color: 'text.primary' }}>
          One login. Each org keeps its own goals, teams, and knowledge base.
        </Typography>
      </Box>
      <Stack spacing={1.25} sx={{ p: { xs: 2, md: 2.5 } }}>
        {ORGS.map((o, i) => (
          <Stack
            key={i}
            direction="row"
            alignItems="center"
            spacing={1.5}
            sx={{
              p: 1.75,
              borderRadius: 2.5,
              border: `1.5px solid ${o.current ? alpha(primary, 0.5) : theme.palette.divider}`,
              bgcolor: o.current ? alpha(primary, 0.05) : isDark ? alpha('#fff', 0.02) : alpha(theme.palette.text.primary, 0.015),
            }}
          >
            <Box
              sx={{
                width: 36,
                height: 36,
                borderRadius: 1.5,
                bgcolor: alpha(primary, 0.12),
                color: 'primary.main',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AppIcon
                name='BusinessOutlined'
                fallback={BusinessOutlinedIcon}
                sx={{ fontSize: 20 }} />
            </Box>
            <Stack sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontWeight: 700, fontSize: '0.88rem', color: 'text.primary' }}>{o.name}</Typography>
              <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>
                {o.members} members · {o.goals} goals · {o.agents} agents · {o.kb} KB docs
              </Typography>
            </Stack>
            {o.current && <AppIcon
              name='Check'
              fallback={CheckIcon}
              sx={{ color: 'primary.main', fontSize: 20 }} />}
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}
