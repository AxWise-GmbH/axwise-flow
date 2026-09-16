import { Box, Chip, Stack, Typography, alpha, useTheme } from '@mui/material';
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import PsychologyOutlinedIcon from '@mui/icons-material/PsychologyOutlined';

import AppIcon from '../../icons/AppIcon';

const CHANNELS = [
  { id: 'team', label: 'Team', Icon: GroupsOutlinedIcon, active: true, preview: 'PM: Sprint plan locked — design starts Monday.' },
  { id: 'lead', label: 'Lead', Icon: PsychologyOutlinedIcon, active: false, preview: 'Consilium brief attached for review.' },
  { id: 'agent', label: 'Agent', Icon: SmartToyOutlinedIcon, active: false, preview: 'Sales Follow-up: 3 emails drafted.' },
];

export default function DemoCommAgentRoom() {
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
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 2.5, py: 1.75, borderBottom: `1px solid ${theme.palette.divider}` }}>
        <AppIcon
          name='ForumOutlined'
          fallback={ForumOutlinedIcon}
          sx={{ fontSize: 18, color: 'primary.main' }} />
        <Typography sx={{ fontWeight: 800, fontSize: '0.72rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary', flex: 1 }}>
          Agent Room · Create landing page for AaaS
        </Typography>
        <Chip label="active" size="small" color="success" sx={{ height: 20, fontSize: '0.62rem', fontWeight: 700 }} />
      </Stack>
      <Stack direction="row" sx={{ borderBottom: `1px solid ${theme.palette.divider}` }}>
        {CHANNELS.map((ch) => (
          <Typography
            key={ch.id}
            sx={{
              flex: 1,
              textAlign: 'center',
              py: 1,
              fontSize: '0.72rem',
              fontWeight: 700,
              color: ch.active ? 'primary.main' : 'text.secondary',
              borderBottom: ch.active ? `2px solid ${primary}` : '2px solid transparent',
            }}
          >
            {ch.label}
          </Typography>
        ))}
      </Stack>
      <Box sx={{ p: 2.5 }}>
        <Stack spacing={1.25}>
          {CHANNELS.filter((c) => c.active).map((ch) => (
            <Box
              key={ch.id}
              sx={{
                p: 1.5,
                borderRadius: 2.5,
                border: `1px solid ${theme.palette.divider}`,
                bgcolor: isDark ? alpha('#fff', 0.02) : alpha(theme.palette.text.primary, 0.015),
              }}
            >
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.75 }}>
                <AppIcon fallback={ch.Icon} sx={{ fontSize: 16, color: 'primary.main' }} />
                <Typography sx={{ fontWeight: 700, fontSize: '0.8rem' }}>{ch.label}</Typography>
              </Stack>
              <Typography sx={{ fontSize: '0.82rem', color: 'text.secondary', lineHeight: 1.5 }}>{ch.preview}</Typography>
            </Box>
          ))}
        </Stack>
      </Box>
    </Box>
  );
}
