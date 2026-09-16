import { Box, Stack, Typography, alpha, useTheme } from '@mui/material';
import FilterListOutlinedIcon from '@mui/icons-material/FilterListOutlined';

import AppIcon from '../../icons/AppIcon';

const FILTERS = [
  { label: 'Scope', value: 'AI Agents' },
  { label: 'Status', value: 'In progress' },
  { label: 'Priority', value: 'High' },
  { label: 'SLA', value: '2 due today' },
];

export default function DemoTaskManagerFilters() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const warn = theme.palette.warning.main;
  const isDark = theme.palette.mode === 'dark';
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
          name='FilterListOutlined'
          fallback={FilterListOutlinedIcon}
          sx={{ color: 'primary.main' }} />
        <Typography sx={{ fontWeight: 800, fontSize: '0.95rem', color: 'text.primary' }}>Active filters</Typography>
      </Stack>
      <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mb: 2 }}>
        {FILTERS.map((f) => (
          <Box key={f.label} sx={{ px: 1.25, py: 0.5, borderRadius: 999, bgcolor: alpha(primary, 0.1), border: `1px solid ${alpha(primary, 0.25)}` }}>
            <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: 'primary.main' }}>{f.label}: {f.value}</Typography>
          </Box>
        ))}
      </Stack>
      <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: alpha(warn, 0.08), borderLeft: `3px solid ${warn}` }}>
        <Typography sx={{ fontSize: '0.85rem', color: 'text.primary', fontWeight: 600 }}>SLA · Email 12 dormant leads</Typography>
        <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>Due in 6h · escalates to sales lead at T-2h</Typography>
      </Box>
    </Box>
  );
}
