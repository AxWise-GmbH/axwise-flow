import { Box, Chip, Stack, Typography, alpha, useTheme } from '@mui/material';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import Diversity3OutlinedIcon from '@mui/icons-material/Diversity3Outlined';
import StorageOutlinedIcon from '@mui/icons-material/StorageOutlined';
import AutoFixHighOutlinedIcon from '@mui/icons-material/AutoFixHighOutlined';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import FavoriteOutlinedIcon from '@mui/icons-material/FavoriteOutlined';
import CircleIcon from '@mui/icons-material/Circle';
import MicNoneOutlinedIcon from '@mui/icons-material/MicNoneOutlined';
import SendIcon from '@mui/icons-material/Send';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import EventRepeatOutlinedIcon from '@mui/icons-material/EventRepeatOutlined';

import AppIcon from '../../icons/AppIcon';

export const HUB_TAB_LABELS = ['Agents', 'Teams', 'Knowledge', 'Skills', 'Pulse', 'Prompt Lab', 'My Agents'];

const TABS = [
  { id: 'agents', label: 'Agents', Icon: SmartToyOutlinedIcon },
  { id: 'teams', label: 'Teams', Icon: Diversity3OutlinedIcon },
  { id: 'knowledge', label: 'Knowledge', Icon: StorageOutlinedIcon },
  { id: 'skills', label: 'Skills', Icon: AutoFixHighOutlinedIcon },
  { id: 'pulse', label: 'Pulse', Icon: FiberManualRecordIcon },
  { id: 'prompt-lab', label: 'Prompt Lab', Icon: ScienceOutlinedIcon },
  { id: 'my-agents', label: 'My Agents', Icon: FavoriteOutlinedIcon },
];

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

export default function DemoAgentHubMap() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const isDark = theme.palette.mode === 'dark';

  return (
    <Box
      role="img"
      aria-label={`Agent Hub with tabs: ${HUB_TAB_LABELS.join(', ')}`}
      sx={{
        position: 'relative',
        borderRadius: 4,
        overflow: 'hidden',
        bgcolor: isDark ? alpha('#fff', 0.025) : '#fff',
        border: `1px solid ${theme.palette.divider}`,
        boxShadow: `0 20px 50px ${alpha(primary, 0.18)}`,
      }}
    >
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
      <Stack spacing={1.5} sx={{ px: { xs: 1.5, md: 2 }, pt: 1.5, pb: 1 }}>
        <Stack direction="row" alignItems="baseline" spacing={1} flexWrap="wrap">
          <Typography sx={{ fontWeight: 800, fontSize: '0.95rem', color: 'text.primary' }}>Agents</Typography>
          <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>Agent orchestration hub</Typography>
        </Stack>
        <Box
          sx={{
            display: 'flex',
            gap: 0.5,
            p: 0.5,
            borderRadius: 3,
            bgcolor: alpha(theme.palette.text.primary, 0.04),
            overflowX: 'auto',
            WebkitOverflowScrolling: 'touch',
            '&::-webkit-scrollbar': { display: 'none' },
            scrollbarWidth: 'none',
          }}
        >
          {TABS.map((t) => {
            const active = t.id === 'agents';
            const Icon = t.Icon;
            return (
              <Stack
                key={t.id}
                direction="row"
                alignItems="center"
                spacing={0.75}
                sx={{
                  px: 1.5,
                  py: 0.75,
                  borderRadius: 2.5,
                  flexShrink: 0,
                  bgcolor: active ? alpha(primary, 0.1) : 'transparent',
                  color: active ? 'primary.main' : 'text.secondary',
                  boxShadow: active ? `0 2px 4px ${alpha(primary, 0.1)}` : 'none',
                }}
              >
                <AppIcon fallback={Icon} sx={{ fontSize: 16 }} />
                <Typography sx={{ fontWeight: 700, fontSize: '0.78rem', whiteSpace: 'nowrap' }}>{t.label}</Typography>
              </Stack>
            );
          })}
        </Box>
        <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ pb: 0.5 }}>
          <Chip
            size="small"
            icon={<AppIcon
              name='EventRepeatOutlined'
              fallback={EventRepeatOutlinedIcon}
              sx={{ fontSize: '14px !important' }} />}
            label="Pulse · next run 8:00"
            sx={{ fontSize: '0.68rem', fontWeight: 600, bgcolor: alpha(primary, 0.08) }}
          />
        </Stack>
      </Stack>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1.1fr' }, borderTop: `1px solid ${theme.palette.divider}` }}>
        <Stack
          spacing={1.25}
          sx={{
            p: { xs: 2, md: 2.5 },
            borderRight: { md: `1px solid ${theme.palette.divider}` },
            borderBottom: { xs: `1px solid ${theme.palette.divider}`, md: 'none' },
          }}
        >
          <Typography sx={{ fontWeight: 800, fontSize: '0.72rem', color: 'text.secondary', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
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
                <Typography sx={{ fontWeight: 700, fontSize: '0.85rem' }}>{a.name}</Typography>
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
        <Stack spacing={1.25} sx={{ p: { xs: 2, md: 2.5 } }}>
          <Typography sx={{ fontWeight: 800, fontSize: '0.72rem', color: 'text.secondary', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Live activity
          </Typography>
          {ACTIVITY.map((a, i) => (
            <Stack key={i} direction="row" spacing={1.5} alignItems="flex-start">
              <Typography sx={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.7rem', color: 'text.disabled', minWidth: 32 }}>
                {a.t}
              </Typography>
              <Box sx={{ mt: '6px', width: 6, height: 6, borderRadius: '50%', bgcolor: primary, flexShrink: 0 }} />
              <Typography sx={{ fontSize: '0.82rem', lineHeight: 1.5 }}>
                <Box component="span" sx={{ fontWeight: 700 }}>{a.who}</Box> · {a.what}
              </Typography>
            </Stack>
          ))}
        </Stack>
      </Box>
    </Box>
  );
}
