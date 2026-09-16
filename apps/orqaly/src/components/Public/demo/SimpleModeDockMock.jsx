import { Box, Stack, Typography, alpha, darken, useTheme } from '@mui/material';
import HomeRoundedIcon from '@mui/icons-material/HomeRounded';
import CorporateFareRoundedIcon from '@mui/icons-material/CorporateFareRounded';
import BarChartRoundedIcon from '@mui/icons-material/BarChartRounded';
import StorefrontRoundedIcon from '@mui/icons-material/StorefrontRounded';
import { simpleModeFrameSx, simpleModeLabelSx } from './simpleModeFrame';

const ITEMS = [
  { Icon: HomeRoundedIcon, label: 'Home' },
  { Icon: CorporateFareRoundedIcon, label: 'Organizations' },
  { Icon: BarChartRoundedIcon, label: 'Reports' },
  { Icon: StorefrontRoundedIcon, label: 'Marketplace' },
];

export default function SimpleModeDockMock() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const isDark = theme.palette.mode === 'dark';

  return (
    <Box sx={simpleModeFrameSx(theme)}>
      <Box sx={{ p: { xs: 2, md: 3 }, minHeight: 140, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography sx={{ fontSize: '0.85rem', color: 'text.secondary', textAlign: 'center', maxWidth: 280 }}>
          Primary navigation stays fixed at the bottom - four stops, glass blur, no sidebar clutter.
        </Typography>
      </Box>
      <Box
        sx={{
          mx: 2,
          mb: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: { xs: 0.5, sm: 1 },
          p: 1.5,
          borderRadius: 3,
          background: isDark ? alpha(darken(primary, 0.86), 0.85) : alpha(theme.palette.background.paper, 0.9),
          backdropFilter: 'blur(16px)',
          border: `1px solid ${alpha(isDark ? '#fff' : theme.palette.divider, isDark ? 0.1 : 0.4)}`,
          boxShadow: `0 12px 32px ${alpha('#000', isDark ? 0.4 : 0.12)}`,
        }}
      >
        {ITEMS.map(({ Icon, label }, i) => (
          <Stack key={label} alignItems="center" spacing={0.5}>
            <Box
              sx={{
                width: 48,
                height: 48,
                borderRadius: 1.75,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: i === 0 ? 'primary.main' : 'text.primary',
                bgcolor: i === 0 ? alpha(primary, 0.18) : alpha(theme.palette.text.primary, 0.04),
                border: i === 0 ? `1px solid ${alpha(primary, 0.4)}` : `1px solid ${theme.palette.divider}`,
                transform: i === 0 ? 'scale(1.08)' : 'none',
              }}
            >
              <Icon sx={{ fontSize: 26 }} />
            </Box>
            <Typography sx={{ fontSize: '0.62rem', fontWeight: 700, color: i === 0 ? 'primary.main' : 'text.secondary' }}>
              {label}
            </Typography>
          </Stack>
        ))}
      </Box>
      <Box sx={{ px: 2, pb: 2 }}>
        <Typography sx={simpleModeLabelSx()}>Routes · /dashboard · /organizations · /hub · /marketplace</Typography>
      </Box>
    </Box>
  );
}
