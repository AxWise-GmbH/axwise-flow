import { Box, Stack, Typography, LinearProgress, alpha, useTheme } from '@mui/material';
import FolderOpenOutlinedIcon from '@mui/icons-material/FolderOpenOutlined';

import AppIcon from '../../icons/AppIcon';

const PROJECTS = [
  { name: 'Q1 product launch', pct: 72, status: 'On track', agents: 4, tasks: 28, color: 'ok' },
  { name: 'Acme Co engagement', pct: 45, status: 'At risk', agents: 2, tasks: 14, color: 'warn' },
  { name: 'Investor roadshow', pct: 90, status: 'Closing', agents: 3, tasks: 9, color: 'ok' },
];

export default function DemoProjects() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const warn = theme.palette.warning.main;
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
        p: { xs: 2, md: 2.5 },
      }}
    >
      <Typography sx={{ fontWeight: 800, fontSize: '0.72rem', color: 'text.secondary', letterSpacing: '0.08em', textTransform: 'uppercase', mb: 2 }}>
        Active projects
      </Typography>
      <Stack spacing={1.5}>
        {PROJECTS.map((p, i) => {
          const tint = p.color === 'warn' ? warn : primary;
          return (
            <Stack
              key={i}
              spacing={1}
              sx={{
                p: 2,
                borderRadius: 2.5,
                border: `1px solid ${theme.palette.divider}`,
                bgcolor: isDark ? alpha('#fff', 0.02) : alpha(theme.palette.text.primary, 0.015),
              }}
            >
              <Stack direction="row" alignItems="center" spacing={1.5}>
                <Box
                  sx={{
                    width: 32,
                    height: 32,
                    borderRadius: 1.5,
                    bgcolor: alpha(tint, 0.12),
                    color: tint,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <AppIcon
                    name='FolderOpenOutlined'
                    fallback={FolderOpenOutlinedIcon}
                    sx={{ fontSize: 18 }} />
                </Box>
                <Stack sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 700, fontSize: '0.88rem', color: 'text.primary' }}>{p.name}</Typography>
                  <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>
                    {p.agents} agents · {p.tasks} tasks · <Box component="span" sx={{ color: tint, fontWeight: 700 }}>{p.status}</Box>
                  </Typography>
                </Stack>
                <Typography sx={{ fontWeight: 800, fontSize: '0.95rem', color: 'text.primary' }}>{p.pct}%</Typography>
              </Stack>
              <LinearProgress
                variant="determinate"
                value={p.pct}
                sx={{
                  height: 6,
                  borderRadius: 999,
                  bgcolor: alpha(tint, 0.1),
                  '& .MuiLinearProgress-bar': { bgcolor: tint, borderRadius: 999 },
                }}
              />
            </Stack>
          );
        })}
      </Stack>
    </Box>
  );
}
