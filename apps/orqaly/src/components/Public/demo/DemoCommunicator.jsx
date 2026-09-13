import { Box, Stack, Typography, alpha, useTheme } from '@mui/material';
import MicNoneOutlinedIcon from '@mui/icons-material/MicNoneOutlined';
import SendIcon from '@mui/icons-material/Send';

import AppIcon from '../../icons/AppIcon';

export default function DemoCommunicator() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const isDark = theme.palette.mode === 'dark';

  // Voice waveform - simple bar pattern
  const bars = [10, 18, 12, 22, 30, 24, 14, 26, 32, 20, 16, 24, 28, 18, 12, 20];

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
      {/* Voice call */}
      <Box sx={{ p: 2.5, borderBottom: `1px solid ${theme.palette.divider}` }}>
        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1.5 }}>
          <Box
            sx={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              bgcolor: alpha(primary, 0.15),
              color: 'primary.main',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <AppIcon
              name='MicNoneOutlined'
              fallback={MicNoneOutlinedIcon}
              sx={{ fontSize: 18 }} />
          </Box>
          <Stack sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 700, fontSize: '0.82rem', color: 'text.primary' }}>Triage voice agent</Typography>
            <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>Live · 0:42</Typography>
          </Stack>
          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: primary, animation: 'pulse 1.4s infinite', '@keyframes pulse': { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.4 } } }} />
        </Stack>
        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ height: 36, justifyContent: 'center' }}>
          {bars.map((h, i) => (
            <Box
              key={i}
              sx={{
                width: 3,
                height: h,
                borderRadius: 999,
                bgcolor: primary,
                opacity: i % 3 === 0 ? 0.9 : 0.4,
              }}
            />
          ))}
        </Stack>
      </Box>
      {/* Telegram thread */}
      <Stack spacing={1.25} sx={{ p: 2.5 }}>
        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 0.5 }}>
          <Box
            sx={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              bgcolor: alpha('#0088cc', 0.15),
              color: '#0088cc',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <AppIcon name='Send' fallback={SendIcon} sx={{ fontSize: 14 }} />
          </Box>
          <Typography sx={{ fontWeight: 700, fontSize: '0.8rem', color: 'text.primary' }}>Telegram · Sales agent</Typography>
        </Stack>
        <Box sx={{ pl: 4.5 }}>
          <Box
            sx={{
              maxWidth: '85%',
              p: 1.25,
              mb: 1,
              borderRadius: 2,
              bgcolor: isDark ? alpha('#fff', 0.05) : alpha(theme.palette.text.primary, 0.06),
              fontSize: '0.82rem',
            }}
          >
            Hi! Are the 2-bed listings still available this weekend?
          </Box>
          <Box
            sx={{
              maxWidth: '85%',
              p: 1.25,
              ml: 'auto',
              borderRadius: 2,
              bgcolor: alpha(primary, 0.12),
              color: 'text.primary',
              fontSize: '0.82rem',
            }}
          >
            Two are - I can book a viewing at 11:00 or 14:00 Saturday. Which works?
          </Box>
        </Box>
      </Stack>
    </Box>
  );
}
