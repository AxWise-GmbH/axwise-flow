import { Box, Stack, Typography, alpha, useTheme } from '@mui/material';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';

import AppIcon from '../../icons/AppIcon';

export default function DemoProjectKb() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const isDark = theme.palette.mode === 'dark';
  const docs = [
    { title: 'Launch brief v3.pdf', tag: 'indexed' },
    { title: 'Brand voice guide', tag: 'agent-ready' },
    { title: 'Q1 OKRs · internal', tag: 'indexed' },
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
          name='MenuBookOutlined'
          fallback={MenuBookOutlinedIcon}
          sx={{ color: 'primary.main' }} />
        <Stack sx={{ flex: 1 }}>
          <Typography sx={{ fontWeight: 800, fontSize: '0.92rem', color: 'text.primary' }}>Project KB · Q1 launch</Typography>
          <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>Scoped to this outcome only</Typography>
        </Stack>
      </Stack>
      <Stack divider={<Box sx={{ borderBottom: `1px solid ${theme.palette.divider}` }} />}>
        {docs.map((d) => (
          <Stack key={d.title} direction="row" spacing={2} sx={{ p: 1.75 }}>
            <Typography sx={{ flex: 1, fontWeight: 600, fontSize: '0.85rem', color: 'text.primary' }}>{d.title}</Typography>
            <Box sx={{ px: 1, py: 0.3, borderRadius: 1, bgcolor: alpha(primary, 0.12), color: 'primary.main', fontSize: '0.68rem', fontWeight: 800 }}>{d.tag}</Box>
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}
