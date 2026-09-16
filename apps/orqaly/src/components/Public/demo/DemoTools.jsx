import { Box, Stack, Typography, alpha, useTheme } from '@mui/material';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import StorageOutlinedIcon from '@mui/icons-material/StorageOutlined';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import ChatOutlinedIcon from '@mui/icons-material/ChatOutlined';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';

import AppIcon from '../../icons/AppIcon';

const TOOLS = [
  { Icon: PaymentsOutlinedIcon, label: 'Stripe', perm: 'refund.create' },
  { Icon: EmailOutlinedIcon, label: 'Gmail', perm: 'send' },
  { Icon: StorageOutlinedIcon, label: 'Postgres', perm: 'read-only' },
  { Icon: CalendarMonthOutlinedIcon, label: 'Calendar', perm: 'event.create' },
  { Icon: ChatOutlinedIcon, label: 'Slack', perm: 'channel.post' },
  { Icon: PhoneOutlinedIcon, label: 'Twilio', perm: 'sms.send' },
];

export default function DemoTools() {
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
        p: { xs: 2, md: 2.5 },
      }}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography sx={{ fontWeight: 800, fontSize: '0.72rem', color: 'text.secondary', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Toolbox · this workspace
        </Typography>
        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ color: 'primary.main' }}>
          <AppIcon name='ShieldOutlined' fallback={ShieldOutlinedIcon} sx={{ fontSize: 14 }} />
          <Typography sx={{ fontSize: '0.7rem', fontWeight: 700 }}>VT-scanned</Typography>
        </Stack>
      </Stack>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1 }}>
        {TOOLS.map(({ Icon, label, perm }) => (
          <Stack
            key={label}
            direction="row"
            spacing={1.25}
            alignItems="center"
            sx={{
              p: 1.5,
              borderRadius: 2,
              border: `1px solid ${theme.palette.divider}`,
              bgcolor: isDark ? alpha('#fff', 0.02) : alpha(theme.palette.text.primary, 0.015),
            }}
          >
            <Box
              sx={{
                width: 28,
                height: 28,
                borderRadius: 1.5,
                bgcolor: alpha(primary, 0.12),
                color: 'primary.main',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon sx={{ fontSize: 16 }} />
            </Box>
            <Stack sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontWeight: 700, fontSize: '0.82rem', color: 'text.primary' }}>{label}</Typography>
              <Stack direction="row" spacing={0.5} alignItems="center" sx={{ color: 'text.secondary' }}>
                <AppIcon name='LockOutlined' fallback={LockOutlinedIcon} sx={{ fontSize: 10 }} />
                <Typography sx={{ fontSize: '0.66rem', fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}>{perm}</Typography>
              </Stack>
            </Stack>
          </Stack>
        ))}
      </Box>
    </Box>
  );
}
