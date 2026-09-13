import { Box, Stack, Typography, alpha, useTheme } from '@mui/material';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import AccessTimeIcon from '@mui/icons-material/AccessTime';

import AppIcon from '../../icons/AppIcon';

const REQUESTS = [
  { from: 'IT', subject: 'Strategy for Estonian market to implement agents', age: '2m', owner: 'agent', sla: 88, tone: 'ok' },
  { from: 'Client - Acme', subject: 'Create a landing page for AaaS', age: '8m', owner: 'agent', sla: 62, tone: 'ok' },
  { from: 'Support', subject: 'Generate banner for SMM', age: '14m', owner: 'human', sla: 24, tone: 'warn' },
  { from: 'Sales', subject: 'Brainstorm a price range for our new product', age: '32m', owner: 'human', sla: 12, tone: 'warn' },
];

export default function DemoRequests() {
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
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Typography sx={{ fontWeight: 800, fontSize: '0.72rem', color: 'text.secondary', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Inbox · all routes
        </Typography>
        <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>
          <Box component="span" sx={{ color: primary, fontWeight: 700 }}>11</Box> open · each becomes a goal in Job Pool
        </Typography>
      </Stack>
      <Stack spacing={1}>
        {REQUESTS.map((r, i) => {
          const tint = r.tone === 'warn' ? warn : primary;
          return (
            <Stack
              key={i}
              direction="row"
              spacing={1.5}
              alignItems="center"
              sx={{
                p: 1.5,
                borderRadius: 2,
                border: `1px solid ${theme.palette.divider}`,
                bgcolor: isDark ? alpha('#fff', 0.02) : alpha(theme.palette.text.primary, 0.015),
              }}
            >
              <Box sx={{ width: 6, height: 28, borderRadius: 999, bgcolor: tint }} />
              <Stack sx={{ flex: 1, minWidth: 0 }}>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                    {r.from}
                  </Typography>
                  <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>· {r.age} ago</Typography>
                </Stack>
                <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', color: 'text.primary' }}>{r.subject}</Typography>
              </Stack>
              <Stack alignItems="flex-end" spacing={0.25}>
                {r.owner === 'agent' ? (
                  <AppIcon
                    name='SmartToyOutlined'
                    fallback={SmartToyOutlinedIcon}
                    sx={{ fontSize: 16, color: 'primary.main' }} />
                ) : (
                  <AppIcon
                    name='PersonOutline'
                    fallback={PersonOutlineIcon}
                    sx={{ fontSize: 16, color: 'text.secondary' }} />
                )}
                <Stack direction="row" alignItems="center" spacing={0.25} sx={{ color: tint }}>
                  <AppIcon name='AccessTime' fallback={AccessTimeIcon} sx={{ fontSize: 10 }} />
                  <Typography sx={{ fontSize: '0.66rem', fontWeight: 700 }}>{r.sla}%</Typography>
                </Stack>
              </Stack>
            </Stack>
          );
        })}
      </Stack>
    </Box>
  );
}
