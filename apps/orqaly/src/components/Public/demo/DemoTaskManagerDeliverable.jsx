import { Box, Stack, Typography, alpha, useTheme } from '@mui/material';
import LayersOutlinedIcon from '@mui/icons-material/LayersOutlined';

import AppIcon from '../../icons/AppIcon';

export default function DemoTaskManagerDeliverable() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const isDark = theme.palette.mode === 'dark';
  const versions = [
    { v: 'v3', author: 'Agent · Report writer', note: 'Final charts + exec summary', current: true },
    { v: 'v2', author: 'Maya (editor)', note: 'Tone adjustments on intro', current: false },
    { v: 'v1', author: 'Agent · Report writer', note: 'First draft from KPI pull', current: false },
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
          name='LayersOutlined'
          fallback={LayersOutlinedIcon}
          sx={{ color: 'primary.main' }} />
        <Typography sx={{ fontWeight: 800, fontSize: '0.92rem', color: 'text.primary' }}>Deliverable versions</Typography>
      </Stack>
      <Stack divider={<Box sx={{ borderBottom: `1px solid ${theme.palette.divider}` }} />}>
        {versions.map((ver) => (
          <Stack key={ver.v} direction="row" spacing={2} sx={{ p: 1.75, bgcolor: ver.current ? alpha(primary, 0.04) : 'transparent' }}>
            <Typography sx={{ fontWeight: 800, fontSize: '0.78rem', color: 'primary.main', minWidth: 28 }}>{ver.v}</Typography>
            <Stack sx={{ flex: 1 }}>
              <Typography sx={{ fontWeight: 600, fontSize: '0.85rem', color: 'text.primary' }}>{ver.author}</Typography>
              <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>{ver.note}</Typography>
            </Stack>
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}
