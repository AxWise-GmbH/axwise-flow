import { Box, Stack, Typography, alpha, useTheme } from '@mui/material';
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';

import AppIcon from '../../icons/AppIcon';

export default function DemoWorkflowTriggers() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const isDark = theme.palette.mode === 'dark';
  const triggers = [
    { type: 'Webhook', label: 'Stripe refund.created', runs: '142 today' },
    { type: 'Cron', label: 'Daily 08:00 UTC', runs: '1 today' },
    { type: 'Manual', label: 'Ops replay button', runs: '3 today' },
  ];
  return (
    <Box
      sx={{
        borderRadius: 4,
        overflow: 'hidden',
        bgcolor: isDark ? alpha('#fff', 0.025) : '#fff',
        border: `1px solid ${theme.palette.divider}`,
        boxShadow: `0 20px 50px ${alpha(primary, 0.18)}`,
        p: { xs: 2.5, md: 3 },
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
        <AppIcon
          name='BoltOutlined'
          fallback={BoltOutlinedIcon}
          sx={{ color: 'primary.main' }} />
        <Typography sx={{ fontWeight: 800, fontSize: '0.95rem', color: 'text.primary' }}>Triggers · live</Typography>
      </Stack>
      <Stack spacing={1.25}>
        {triggers.map((t) => (
          <Stack key={t.label} direction="row" spacing={2} alignItems="center" sx={{ p: 1.5, borderRadius: 2, border: `1px solid ${theme.palette.divider}` }}>
            <Box sx={{ px: 1, py: 0.3, borderRadius: 1, bgcolor: alpha(primary, 0.12), color: 'primary.main', fontSize: '0.68rem', fontWeight: 800 }}>{t.type}</Box>
            <Stack sx={{ flex: 1 }}>
              <Typography sx={{ fontWeight: 600, fontSize: '0.85rem', color: 'text.primary' }}>{t.label}</Typography>
              <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>{t.runs}</Typography>
            </Stack>
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}
