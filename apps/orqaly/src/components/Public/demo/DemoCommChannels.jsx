import { Box, Stack, Typography, alpha, useTheme } from '@mui/material';
import MicNoneOutlinedIcon from '@mui/icons-material/MicNoneOutlined';
import SendIcon from '@mui/icons-material/Send';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';

import AppIcon from '../../icons/AppIcon';

const CHANNELS = [
  { Icon: MicNoneOutlinedIcon, label: 'Voice', sub: 'AssemblyAI · Groq', status: 'Live' },
  { Icon: SendIcon, label: 'Telegram', sub: 'BotFather token', status: 'Active' },
  { Icon: EmailOutlinedIcon, label: 'Email', sub: 'SMTP / IMAP', status: 'Connected' },
];

export default function DemoCommChannels() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;

  return (
    <Box
      sx={{
        borderRadius: 4,
        overflow: 'hidden',
        bgcolor: theme.palette.mode === 'dark' ? alpha('#fff', 0.025) : '#fff',
        border: `1px solid ${theme.palette.divider}`,
        boxShadow: `0 16px 40px ${alpha(primary, 0.14)}`,
        p: { xs: 2, md: 2.5 },
      }}
    >
      <Typography sx={{ fontWeight: 800, fontSize: '0.72rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary', mb: 2 }}>
        Channels · one agent config
      </Typography>
      <Stack spacing={1.5}>
        {CHANNELS.map(({ Icon, label, sub, status }) => (
          <Stack
            key={label}
            direction="row"
            alignItems="center"
            spacing={2}
            sx={{
              p: 2,
              borderRadius: 2.5,
              border: `1px solid ${theme.palette.divider}`,
              bgcolor: 'background.paper',
            }}
          >
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: 1.5,
                bgcolor: alpha(primary, 0.12),
                color: 'primary.main',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon sx={{ fontSize: 22 }} />
            </Box>
            <Stack sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', color: 'text.primary' }}>{label}</Typography>
              <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>{sub}</Typography>
            </Stack>
            <Stack direction="row" alignItems="center" spacing={0.5} sx={{ color: 'success.main' }}>
              <AppIcon
                name='CheckCircleOutline'
                fallback={CheckCircleOutlineIcon}
                sx={{ fontSize: 14 }} />
              <Typography sx={{ fontSize: '0.68rem', fontWeight: 700 }}>{status}</Typography>
            </Stack>
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}
