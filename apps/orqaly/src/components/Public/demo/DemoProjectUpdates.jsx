import { Box, Stack, Typography, alpha, useTheme } from '@mui/material';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';

import AppIcon from '../../icons/AppIcon';

export default function DemoProjectUpdates() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
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
          name='EmailOutlined'
          fallback={EmailOutlinedIcon}
          sx={{ color: 'primary.main' }} />
        <Typography sx={{ fontWeight: 800, fontSize: '0.95rem', color: 'text.primary' }}>Stakeholder update · draft</Typography>
      </Stack>
      <Typography sx={{ fontSize: '0.88rem', color: 'text.primary', lineHeight: 1.65, mb: 1.5 }}>
        Q1 launch is 72% complete — 28 of 39 tasks done. On-track KPIs improved 4% week over week. Next milestone: beta ship in 12 days.
      </Typography>
      <Stack direction="row" spacing={1}>
        <Box sx={{ px: 1.5, py: 0.5, borderRadius: 1, bgcolor: alpha(primary, 0.12), color: 'primary.main', fontSize: '0.72rem', fontWeight: 700 }}>From audit + KPIs</Box>
        <Box sx={{ px: 1.5, py: 0.5, borderRadius: 1, border: `1px solid ${theme.palette.divider}`, fontSize: '0.72rem', fontWeight: 700 }}>Edit before send</Box>
      </Stack>
    </Box>
  );
}
