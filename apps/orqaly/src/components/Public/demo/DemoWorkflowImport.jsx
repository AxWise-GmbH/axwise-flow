import { Box, Stack, Typography, alpha, useTheme } from '@mui/material';
import ImportExportOutlinedIcon from '@mui/icons-material/ImportExportOutlined';

import AppIcon from '../../icons/AppIcon';

export default function DemoWorkflowImport() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const isDark = theme.palette.mode === 'dark';
  const rows = [
    { name: 'stripe-refund-handler.json', status: 'imported', nodes: 8 },
    { name: 'weekly-slack-summary.js', status: 'ready', nodes: 5 },
    { name: 'lead-routing-v2.json', status: 'mapped', nodes: 12 },
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
          name='ImportExportOutlined'
          fallback={ImportExportOutlinedIcon}
          sx={{ color: 'primary.main' }} />
        <Stack sx={{ flex: 1 }}>
          <Typography sx={{ fontWeight: 800, fontSize: '0.92rem', color: 'text.primary' }}>Import workflow</Typography>
          <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>JSON · JS · n8n-compatible</Typography>
        </Stack>
      </Stack>
      <Stack divider={<Box sx={{ borderBottom: `1px solid ${theme.palette.divider}` }} />}>
        {rows.map((r) => (
          <Stack key={r.name} direction="row" spacing={2} alignItems="center" sx={{ p: 1.75 }}>
            <Typography sx={{ flex: 1, fontWeight: 600, fontSize: '0.85rem', color: 'text.primary' }}>{r.name}</Typography>
            <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>{r.nodes} nodes</Typography>
            <Box sx={{ px: 1, py: 0.3, borderRadius: 1, bgcolor: alpha(primary, 0.12), color: 'primary.main', fontSize: '0.68rem', fontWeight: 800 }}>{r.status}</Box>
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}
