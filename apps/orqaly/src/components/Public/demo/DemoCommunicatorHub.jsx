import { Box, Chip, Stack, Typography, alpha, useTheme } from '@mui/material';
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import SettingsInputAntennaOutlinedIcon from '@mui/icons-material/SettingsInputAntennaOutlined';
import TerminalIcon from '@mui/icons-material/Terminal';

import AppIcon from '../../icons/AppIcon';

export const WORKSPACE_SECTION_LABELS = ['Live activity', 'Goal History', 'Organizations', 'Consilium', 'History'];
export const COMMUNICATOR_SECTION_LABELS = ['Bot Settings', 'Channels', 'Files', 'Scheduled Reports', 'Controller', 'Audit Log'];

const VIEWS = [
  { id: 'workspace', label: 'Agent Workspace', Icon: BoltOutlinedIcon, sections: WORKSPACE_SECTION_LABELS, active: true },
  { id: 'communicator', label: 'Communicator', Icon: SettingsInputAntennaOutlinedIcon, sections: COMMUNICATOR_SECTION_LABELS, active: false },
];

export default function DemoCommunicatorHub() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const isDark = theme.palette.mode === 'dark';
  const activeView = VIEWS.find((v) => v.active);

  return (
    <Box
      role="img"
      aria-label="Communicator with Agent Workspace and Communicator views"
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
          app.orqaly.com / communicator
        </Typography>
      </Stack>
      <Stack direction="row" sx={{ borderBottom: `1px solid ${theme.palette.divider}` }}>
        {VIEWS.map((v) => (
          <Stack
            key={v.id}
            direction="row"
            alignItems="center"
            spacing={0.75}
            sx={{
              flex: 1,
              justifyContent: 'center',
              py: 1.25,
              borderBottom: v.active ? `2px solid ${primary}` : '2px solid transparent',
              bgcolor: v.active ? alpha(primary, 0.05) : 'transparent',
            }}
          >
            <AppIcon
              fallback={v.Icon}
              sx={{ fontSize: 16, color: v.active ? 'primary.main' : 'text.disabled' }} />
            <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: v.active ? 'primary.main' : 'text.secondary' }}>
              {v.label}
            </Typography>
          </Stack>
        ))}
      </Stack>
      <Box sx={{ display: 'flex', minHeight: 200 }}>
        <Stack sx={{ width: 140, borderRight: `1px solid ${theme.palette.divider}`, py: 1, flexShrink: 0 }}>
          {activeView.sections.map((label, i) => (
            <Typography
              key={label}
              sx={{
                px: 1.5,
                py: 0.85,
                fontSize: '0.72rem',
                fontWeight: i === 0 ? 700 : 500,
                color: i === 0 ? 'primary.main' : 'text.secondary',
                bgcolor: i === 0 ? alpha(primary, 0.08) : 'transparent',
              }}
            >
              {label}
            </Typography>
          ))}
        </Stack>
        <Box sx={{ flex: 1, p: 2 }}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
            <AppIcon
              name='SmartToyOutlined'
              fallback={SmartToyOutlinedIcon}
              sx={{ fontSize: 18, color: 'primary.main' }} />
            <Typography sx={{ fontWeight: 800, fontSize: '0.72rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'text.secondary' }}>
              Live activity
            </Typography>
            <Chip label="goal: landing-page" size="small" sx={{ height: 20, fontSize: '0.6rem', fontWeight: 700 }} />
          </Stack>
          {[
            { t: '12:04', msg: 'Sales Follow-up sent nudge to 3 leads' },
            { t: '12:02', msg: 'Team channel · PM plan approved' },
            { t: '11:58', msg: 'Consilium vote · proceed 4–1' },
          ].map((e) => (
            <Stack key={e.t} direction="row" spacing={1} sx={{ py: 0.75, borderBottom: `1px solid ${theme.palette.divider}` }}>
              <Typography sx={{ fontSize: '0.65rem', color: 'text.disabled', fontFamily: 'ui-monospace, monospace', width: 36 }}>{e.t}</Typography>
              <Typography sx={{ fontSize: '0.78rem', color: 'text.primary', flex: 1 }}>{e.msg}</Typography>
            </Stack>
          ))}
          <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mt: 1.5 }}>
            <AppIcon
              name='Terminal'
              fallback={TerminalIcon}
              sx={{ fontSize: 14, color: 'text.secondary' }} />
            <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary' }}>4 active rooms · 128 messages today</Typography>
          </Stack>
        </Box>
      </Box>
    </Box>
  );
}
