import { Box, Divider, Stack, Typography, alpha, useTheme } from '@mui/material';
import BuildOutlinedIcon from '@mui/icons-material/BuildOutlined';
import HealingOutlinedIcon from '@mui/icons-material/HealingOutlined';
import PauseCircleOutlinedIcon from '@mui/icons-material/PauseCircleOutlined';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import LoopOutlinedIcon from '@mui/icons-material/LoopOutlined';
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';

import AppIcon from '../../icons/AppIcon';

const SECTIONS = [
  {
    title: 'Status',
    items: [
      { label: 'Setup Tools', Icon: BuildOutlinedIcon, color: 'info.main' },
      { label: 'Heal Now', Icon: HealingOutlinedIcon, color: 'warning.main' },
      { label: 'Pause', Icon: PauseCircleOutlinedIcon, color: 'warning.main' },
    ],
  },
  {
    title: 'Organizations Control',
    items: [
      { label: 'Adopt to New Business', Icon: BusinessOutlinedIcon, color: 'primary.main' },
      { label: 'Implement in Existing', Icon: BusinessOutlinedIcon, color: 'info.main' },
    ],
  },
  {
    title: 'Goal Settings',
    items: [
      { label: 'Loop this request ON', Icon: LoopOutlinedIcon, color: 'primary.main' },
      { label: 'Add Pulse', Icon: BoltOutlinedIcon, color: 'warning.main' },
      { label: 'Attach Workflow', Icon: AccountTreeOutlinedIcon, color: 'info.main' },
    ],
  },
];

export default function DemoGoalActions() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const isDark = theme.palette.mode === 'dark';

  return (
    <Box
      sx={{
        borderRadius: 4,
        overflow: 'hidden',
        bgcolor: isDark ? alpha('#fff', 0.025) : '#fff',
        border: `1px solid ${theme.palette.divider}`,
        boxShadow: `0 16px 40px ${alpha(primary, 0.14)}`,
        minWidth: 220,
      }}
    >
      <Typography sx={{ px: 2, py: 1.25, fontWeight: 800, fontSize: '0.72rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary', borderBottom: `1px solid ${theme.palette.divider}` }}>
        Goal actions
      </Typography>
      {SECTIONS.map((section, si) => (
        <Box key={section.title}>
          <Typography sx={{ px: 2, py: 0.75, fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.06em', color: 'text.disabled' }}>
            {section.title}
          </Typography>
          {section.items.map((item) => (
            <Stack key={item.label} direction="row" alignItems="center" spacing={1.25} sx={{ px: 2, py: 1 }}>
              <AppIcon fallback={item.Icon} sx={{ fontSize: 18, color: item.color }} />
              <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: 'text.primary' }}>{item.label}</Typography>
            </Stack>
          ))}
          {si < SECTIONS.length - 1 && <Divider />}
        </Box>
      ))}
      <Divider />
      <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 2, py: 1 }}>
        <AppIcon
          name='CancelOutlined'
          fallback={CancelOutlinedIcon}
          sx={{ fontSize: 18, color: 'error.main' }} />
        <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: 'error.main' }}>Cancel Goal</Typography>
      </Stack>
      <Box sx={{ p: 1.5 }}>
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="center"
          spacing={1}
          sx={{
            py: 1,
            borderRadius: 2,
            bgcolor: alpha(primary, 0.12),
            color: 'primary.main',
          }}
        >
          <AppIcon name='ForumOutlined' fallback={ForumOutlinedIcon} sx={{ fontSize: 18 }} />
          <Typography sx={{ fontWeight: 700, fontSize: '0.78rem' }}>Talk with Team-Lead</Typography>
        </Stack>
      </Box>
    </Box>
  );
}
