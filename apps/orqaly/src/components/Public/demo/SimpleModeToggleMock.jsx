import { Box, Stack, Switch, Typography, alpha, useTheme } from '@mui/material';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
import { simpleModeFrameSx, simpleModeLabelSx } from './simpleModeFrame';

import AppIcon from '../../icons/AppIcon';

export default function SimpleModeToggleMock() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;

  return (
    <Box sx={simpleModeFrameSx(theme)}>
      <Box sx={{ p: { xs: 2, md: 2.5 } }}>
        <Typography sx={{ ...simpleModeLabelSx(), mb: 2 }}>Account menu · Platform mode</Typography>
        <Box
          sx={{
            p: 2,
            borderRadius: 2.5,
            border: `1px solid ${theme.palette.divider}`,
            bgcolor: alpha(primary, 0.04),
          }}
        >
          <Typography sx={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'text.secondary', mb: 1 }}>
            Platform mode
          </Typography>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Stack direction="row" spacing={1.25} alignItems="center">
              <Box
                sx={{
                  width: 36,
                  height: 36,
                  borderRadius: 1.5,
                  bgcolor: alpha(primary, 0.15),
                  color: 'primary.main',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <AppIcon name='TuneOutlined' fallback={TuneOutlinedIcon} sx={{ fontSize: 20 }} />
              </Box>
              <Stack>
                <Typography sx={{ fontWeight: 700, fontSize: '0.88rem' }}>Simple</Typography>
                <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>Switch to Advanced</Typography>
              </Stack>
            </Stack>
            <Switch checked={false} size="small" readOnly sx={{ pointerEvents: 'none' }} />
          </Stack>
        </Box>
        <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', mt: 2, lineHeight: 1.55 }}>
          Enabling Simple opens the five-step tour and sends you to Home. Advanced restores the full CONTROL POINT sidebar.
        </Typography>
      </Box>
    </Box>
  );
}
