import { Box, Chip, Stack, Typography, alpha, useTheme } from '@mui/material';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import CircleIcon from '@mui/icons-material/Circle';
import MicNoneOutlinedIcon from '@mui/icons-material/MicNoneOutlined';
import SendIcon from '@mui/icons-material/Send';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';

import AppIcon from '../../icons/AppIcon';

const AGENTS = [
  { name: 'Triage Voice', status: 'live', channel: 'voice', runs: '142 today' },
  { name: 'Sales Follow-up', status: 'live', channel: 'tel', runs: '38 today' },
  { name: 'Refund Reviewer', status: 'live', channel: 'email', runs: '12 today' },
  { name: 'Lesson Planner', status: 'idle', channel: 'email', runs: 'Scheduled 8:00' },
];

const ACTIVITY = [
  { t: '12:04', who: 'Triage Voice', what: 'Booked appointment for Maria K.', tone: 'ok' },
  { t: '12:02', who: 'Refund Reviewer', what: 'Approved refund $48.20 (order #28401)', tone: 'ok' },
  { t: '11:58', who: 'Sales Follow-up', what: 'Sent nudge to 3 dormant leads', tone: 'ok' },
  { t: '11:51', who: 'Triage Voice', what: 'Escalated urgent case to on-call nurse', tone: 'warn' },
  { t: '11:42', who: 'Sales Follow-up', what: 'Scheduled viewing for Vlad R.', tone: 'ok' },
];

function channelIcon(ch) {
  if (ch === 'voice') return (
    <AppIcon
      name='MicNoneOutlined'
      fallback={MicNoneOutlinedIcon}
      sx={{ fontSize: 14 }} />
  );
  if (ch === 'tel') return <AppIcon name='Send' fallback={SendIcon} sx={{ fontSize: 14 }} />;
  return <AppIcon name='EmailOutlined' fallback={EmailOutlinedIcon} sx={{ fontSize: 14 }} />;
}

export default function DemoAgentHub() {
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
      {/* Top bar */}
      <Stack
        direction="row"
        alignItems="center"
        spacing={1.5}
        sx={{
          px: 2.5,
          py: 1.25,
          borderBottom: `1px solid ${theme.palette.divider}`,
          bgcolor: isDark ? alpha('#fff', 0.02) : alpha(theme.palette.text.primary, 0.02),
        }}
      >
        <Stack direction="row" spacing={0.6}>
          <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: alpha('#FF5F57', 0.7) }} />
          <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: alpha('#FEBC2E', 0.7) }} />
          <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: alpha('#28C840', 0.7) }} />
        </Stack>
        <Typography sx={{ flex: 1, fontSize: '0.78rem', color: 'text.secondary', fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}>
          app.orqaly.com / agent-hub
        </Typography>
        <Chip
          size="small"
          label="LIVE"
          icon={<AppIcon
            name='Circle'
            fallback={CircleIcon}
            sx={{ fontSize: 8, color: '#10B981 !important' }} />}
          sx={{
            bgcolor: alpha(primary, 0.12),
            color: 'primary.main',
            fontWeight: 700,
            fontSize: '0.7rem',
            letterSpacing: '0.08em',
            '& .MuiChip-icon': { ml: 1 },
          }}
        />
      </Stack>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1.1fr' } }}>
        {/* Left: agent list */}
        <Stack
          spacing={1.25}
          sx={{ p: { xs: 2, md: 2.5 }, borderRight: { md: `1px solid ${theme.palette.divider}` }, borderBottom: { xs: `1px solid ${theme.palette.divider}`, md: 'none' } }}
        >
          <Typography sx={{ fontWeight: 800, fontSize: '0.72rem', color: 'text.secondary', letterSpacing: '0.08em', textTransform: 'uppercase', mb: 0.5 }}>
            Agents
          </Typography>
          {AGENTS.map((a, i) => (
            <Stack
              key={i}
              direction="row"
              alignItems="center"
              spacing={1.5}
              sx={{
                p: 1.25,
                borderRadius: 2,
                border: `1px solid ${theme.palette.divider}`,
                bgcolor: isDark ? alpha('#fff', 0.02) : alpha(theme.palette.text.primary, 0.015),
              }}
            >
              <Box
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: 1.5,
                  bgcolor: alpha(primary, 0.12),
                  color: 'primary.main',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <AppIcon
                  name='SmartToyOutlined'
                  fallback={SmartToyOutlinedIcon}
                  sx={{ fontSize: 18 }} />
              </Box>
              <Stack sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', color: 'text.primary' }}>{a.name}</Typography>
                <Stack direction="row" spacing={0.75} alignItems="center" sx={{ color: 'text.secondary' }}>
                  {channelIcon(a.channel)}
                  <Typography sx={{ fontSize: '0.72rem' }}>{a.runs}</Typography>
                </Stack>
              </Stack>
              <AppIcon
                name='Circle'
                fallback={CircleIcon}
                sx={{ fontSize: 8, color: a.status === 'live' ? primary : alpha(theme.palette.text.primary, 0.3) }} />
            </Stack>
          ))}
        </Stack>

        {/* Right: activity feed */}
        <Stack spacing={1.25} sx={{ p: { xs: 2, md: 2.5 } }}>
          <Typography sx={{ fontWeight: 800, fontSize: '0.72rem', color: 'text.secondary', letterSpacing: '0.08em', textTransform: 'uppercase', mb: 0.5 }}>
            Live activity
          </Typography>
          {ACTIVITY.map((a, i) => (
            <Stack key={i} direction="row" spacing={1.5} alignItems="flex-start">
              <Typography sx={{ fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: '0.7rem', color: 'text.disabled', minWidth: 32, pt: 0.25 }}>
                {a.t}
              </Typography>
              <Box
                sx={{
                  mt: '6px',
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  bgcolor: a.tone === 'warn' ? theme.palette.warning.main : primary,
                  flexShrink: 0,
                }}
              />
              <Stack sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontSize: '0.82rem', color: 'text.primary', lineHeight: 1.5 }}>
                  <Box component="span" sx={{ fontWeight: 700 }}>{a.who}</Box> · {a.what}
                </Typography>
              </Stack>
            </Stack>
          ))}
        </Stack>
      </Box>
    </Box>
  );
}
