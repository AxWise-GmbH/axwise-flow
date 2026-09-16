import { Box, Stack, Typography, alpha, useTheme } from '@mui/material';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';

import AppIcon from '../../icons/AppIcon';

export default function DemoReports() {
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
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ p: 2, borderBottom: `1px solid ${theme.palette.divider}`, bgcolor: isDark ? alpha('#fff', 0.02) : alpha(theme.palette.text.primary, 0.02) }}>
        <AppIcon
          name='PictureAsPdfOutlined'
          fallback={PictureAsPdfOutlinedIcon}
          sx={{ color: 'primary.main' }} />
        <Stack sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700, fontSize: '0.88rem', color: 'text.primary' }}>Performance report · Acme Co</Typography>
          <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>Draft v3 · ready to send</Typography>
        </Stack>
        <Box sx={{ px: 1, py: 0.25, borderRadius: 1, bgcolor: alpha(primary, 0.12), color: 'primary.main', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.06em' }}>
          BRAND OK
        </Box>
      </Stack>
      <Box sx={{ p: { xs: 2.5, md: 3 } }}>
        <Typography sx={{ fontWeight: 800, fontSize: '1.05rem', color: 'text.primary', mb: 1.25 }}>
          Acme Co · May 2026 performance
        </Typography>
        <Typography sx={{ fontSize: '0.85rem', color: 'text.secondary', lineHeight: 1.7, mb: 2 }}>
          Paid social held efficiency while partner traffic scaled in DE. Meta CPA improved 12% after creative refresh.
          LinkedIn CPL stable. One partner flagged for quality review - spend capped pending audit.
        </Typography>
        <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mb: 2 }}>
          {['CPA €42', 'ROI 3.2x', 'LTV €890', 'COC ↓12%'].map((s) => (
            <Box
              key={s}
              sx={{
                px: 1.5,
                py: 0.75,
                borderRadius: 999,
                bgcolor: alpha(primary, 0.08),
                color: 'primary.main',
                fontSize: '0.72rem',
                fontWeight: 700,
              }}
            >
              {s}
            </Box>
          ))}
        </Stack>
        <Box sx={{ borderRadius: 1.5, bgcolor: alpha(primary, 0.06), p: 1.5 }}>
          <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary', lineHeight: 1.55 }}>
            <Box component="span" sx={{ color: 'primary.main', fontWeight: 700 }}>Recommendation:</Box>{' '}
            Shift 15% of Meta budget to top-performing partner segment in DE - forecast ROAS +0.4x at same CPA cap.
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
