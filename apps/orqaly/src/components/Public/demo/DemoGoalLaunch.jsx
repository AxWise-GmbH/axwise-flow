import { Box, Chip, Stack, Typography, alpha, useTheme } from '@mui/material';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import RocketLaunchOutlinedIcon from '@mui/icons-material/RocketLaunchOutlined';
import MicOutlinedIcon from '@mui/icons-material/MicOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';

import AppIcon from '../../icons/AppIcon';

const STEPS = [
  { n: 1, label: 'Tell us', sub: 'Voice, text, files', Icon: EditOutlinedIcon, active: true },
  { n: 2, label: 'Solution', sub: 'Team + estimate', Icon: AutoAwesomeIcon, active: false },
  { n: 3, label: 'Submit', sub: 'Create goal', Icon: RocketLaunchOutlinedIcon, active: false },
];

export default function DemoGoalLaunch() {
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
      <Stack direction="row" sx={{ borderBottom: `1px solid ${theme.palette.divider}` }}>
        {STEPS.map((s) => (
          <Stack
            key={s.n}
            alignItems="center"
            spacing={0.5}
            sx={{
              flex: 1,
              py: 1.5,
              px: 1,
              bgcolor: s.active ? alpha(primary, 0.06) : 'transparent',
              borderBottom: s.active ? `2px solid ${primary}` : '2px solid transparent',
            }}
          >
            <Typography sx={{ fontSize: '0.65rem', fontWeight: 800, color: s.active ? 'primary.main' : 'text.disabled' }}>
              {s.n}
            </Typography>
            <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: s.active ? 'text.primary' : 'text.secondary' }}>
              {s.label}
            </Typography>
          </Stack>
        ))}
      </Stack>
      <Box sx={{ p: 2.5 }}>
        <Typography sx={{ fontWeight: 800, fontSize: '0.72rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary', mb: 1.5 }}>
          Smart Request · step 1
        </Typography>
        <Box
          sx={{
            p: 1.75,
            borderRadius: 2.5,
            border: `1px solid ${theme.palette.divider}`,
            bgcolor: isDark ? alpha('#fff', 0.02) : alpha(theme.palette.text.primary, 0.015),
            mb: 1.5,
          }}
        >
          <Typography sx={{ fontSize: '0.85rem', color: 'text.primary', lineHeight: 1.55 }}>
            We need a landing page for our AaaS product — hero, pricing, and a demo booking CTA.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Chip size="small" icon={<AppIcon
            name='MicOutlined'
            fallback={MicOutlinedIcon}
            sx={{ fontSize: '14px !important' }} />} label="Voice intake" sx={{ fontWeight: 700, fontSize: '0.68rem' }} />
          <Chip size="small" icon={<AppIcon
            name='GroupsOutlined'
            fallback={GroupsOutlinedIcon}
            sx={{ fontSize: '14px !important' }} />} label="Consilium next" variant="outlined" sx={{ fontWeight: 700, fontSize: '0.68rem' }} />
          <Chip size="small" label="Est. ~$180" variant="outlined" sx={{ fontWeight: 700, fontSize: '0.68rem' }} />
        </Stack>
      </Box>
    </Box>
  );
}
