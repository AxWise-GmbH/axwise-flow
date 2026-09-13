import { Box, Stack, Typography, alpha, useTheme } from '@mui/material';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';

import AppIcon from '../../icons/AppIcon';

export default function DemoWorkflowExecution() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const warn = theme.palette.warning.main;
  const isDark = theme.palette.mode === 'dark';
  const steps = [
    { n: '1', label: 'Trigger · refund.created', status: 'ok', ms: '12ms' },
    { n: '2', label: 'Agent · Refund Reviewer', status: 'ok', ms: '1.2s' },
    { n: '3', label: 'Tool · Stripe refunds.create', status: 'ok', ms: '340ms' },
    { n: '4', label: 'Notify · customer email', status: 'warn', ms: 'retry' },
  ];
  return (
    <Box
      sx={{
        borderRadius: 4,
        overflow: 'hidden',
        bgcolor: isDark ? alpha('#fff', 0.025) : '#fff',
        border: `1px solid ${theme.palette.divider}`,
        boxShadow: `0 20px 50px ${alpha(primary, 0.18)}`,
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ p: 2, borderBottom: `1px solid ${theme.palette.divider}` }}>
        <AppIcon
          name='PlayCircleOutline'
          fallback={PlayCircleOutlineIcon}
          sx={{ color: 'primary.main' }} />
        <Stack sx={{ flex: 1 }}>
          <Typography sx={{ fontWeight: 800, fontSize: '0.92rem', color: 'text.primary' }}>Execution trace · run #8842</Typography>
          <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>Refund auto-handler · 4 steps</Typography>
        </Stack>
      </Stack>
      <Stack divider={<Box sx={{ borderBottom: `1px solid ${theme.palette.divider}` }} />}>
        {steps.map((s) => {
          const tint = s.status === 'warn' ? warn : primary;
          return (
            <Stack key={s.n} direction="row" spacing={2} alignItems="center" sx={{ p: 1.75 }}>
              <Box sx={{ width: 24, height: 24, borderRadius: 1, bgcolor: alpha(tint, 0.12), color: tint, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 800 }}>{s.n}</Box>
              <Typography sx={{ flex: 1, fontWeight: 600, fontSize: '0.85rem', color: 'text.primary' }}>{s.label}</Typography>
              <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>{s.ms}</Typography>
            </Stack>
          );
        })}
      </Stack>
    </Box>
  );
}
