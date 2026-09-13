import { Box, Stack, Typography, alpha, useTheme } from '@mui/material';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import CheckIcon from '@mui/icons-material/Check';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';

import AppIcon from '../../icons/AppIcon';

export default function DemoTaskManagerReview() {
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
      <Box sx={{ p: 2.5, borderBottom: `1px solid ${theme.palette.divider}`, bgcolor: isDark ? alpha('#fff', 0.02) : alpha(theme.palette.text.primary, 0.02) }}>
        <Typography sx={{ fontWeight: 800, fontSize: '0.92rem', color: 'text.primary' }}>
          Draft follow-up emails for 12 dormant leads
        </Typography>
        <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>Sales · due tomorrow · 2 versions</Typography>
      </Box>
      <Stack spacing={1.5} sx={{ p: 2.5 }}>
        <Stack direction="row" spacing={1.5} alignItems="flex-start">
          <Box sx={{ width: 28, height: 28, borderRadius: 1.5, bgcolor: alpha(primary, 0.15), color: 'primary.main', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <AppIcon
              name='SmartToyOutlined'
              fallback={SmartToyOutlinedIcon}
              sx={{ fontSize: 16 }} />
          </Box>
          <Stack spacing={0.5} sx={{ flex: 1 }}>
            <Typography sx={{ fontWeight: 800, fontSize: '0.78rem', color: 'text.primary' }}>v1 · Sales Follow-up agent</Typography>
            <Typography sx={{ fontSize: '0.82rem', color: 'text.secondary', lineHeight: 1.55 }}>12 personalised emails from CRM history.</Typography>
          </Stack>
        </Stack>
        <Stack direction="row" spacing={1.5} alignItems="flex-start">
          <Box sx={{ width: 28, height: 28, borderRadius: 1.5, bgcolor: alpha(theme.palette.text.primary, 0.08), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <AppIcon name='PersonOutline' fallback={PersonOutlineIcon} sx={{ fontSize: 16 }} />
          </Box>
          <Stack spacing={0.5} sx={{ flex: 1 }}>
            <Typography sx={{ fontWeight: 800, fontSize: '0.78rem', color: 'text.primary' }}>v2 · Vlad (sales lead)</Typography>
            <Typography sx={{ fontSize: '0.82rem', color: 'text.secondary', lineHeight: 1.55 }}>Softened opener on three emails; tightened CTA on all twelve.</Typography>
          </Stack>
        </Stack>
      </Stack>
      <Stack direction="row" spacing={1.25} sx={{ p: 2.5, borderTop: `1px solid ${theme.palette.divider}` }}>
        <Box sx={{ px: 2, py: 0.85, borderRadius: 1.5, bgcolor: primary, color: '#fff', fontSize: '0.82rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
          <AppIcon name='Check' fallback={CheckIcon} sx={{ fontSize: 14 }} />
          Approve + send
        </Box>
        <Box sx={{ px: 2, py: 0.85, borderRadius: 1.5, border: `1px solid ${theme.palette.divider}`, fontSize: '0.82rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
          <AppIcon name='EditOutlined' fallback={EditOutlinedIcon} sx={{ fontSize: 14 }} />
          Request changes
        </Box>
      </Stack>
    </Box>
  );
}
