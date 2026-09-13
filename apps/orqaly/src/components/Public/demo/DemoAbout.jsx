import { Box, Chip, Stack, Typography, alpha, useTheme } from '@mui/material';
import TrackChangesOutlinedIcon from '@mui/icons-material/TrackChangesOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';

import AppIcon from '../../icons/AppIcon';

const STATUS_CHIPS = [
  { label: '12 goals active', tone: 'primary' },
  { label: 'Council live', tone: 'default' },
  { label: 'Marketplace open', tone: 'default' },
];

const FLOW = [
  { icon: TrackChangesOutlinedIcon, label: 'Goal', sub: 'Outcome defined' },
  { icon: GroupsOutlinedIcon, label: 'Council', sub: 'Plan voted' },
  { icon: CheckCircleOutlineIcon, label: 'Deliverable', sub: 'Shipped v2' },
];

export default function DemoAbout() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const isDark = theme.palette.mode === 'dark';

  return (
    <Box
      role="img"
      aria-label="Orqaly workspace overview: active goals, council, and deliverables on one operating system"
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
        <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary', flex: 1, textAlign: 'center' }}>
          orqaly.com / workspace
        </Typography>
        <Box sx={{ width: 36 }} />
      </Stack>
      <Box sx={{ p: { xs: 2, md: 2.5 } }}>
        <Typography sx={{ fontWeight: 800, fontSize: { xs: '0.9rem', md: '1rem' }, color: 'text.primary', mb: 0.5 }}>
          Operating system for goals
        </Typography>
        <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mb: 1.5, lineHeight: 1.5 }}>
          One workspace - plan, execute, audit, and ship.
        </Typography>

        <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
          {STATUS_CHIPS.map(({ label, tone }) => (
            <Chip
              key={label}
              label={label}
              size="small"
              sx={{
                height: 22,
                fontSize: '0.65rem',
                fontWeight: 700,
                bgcolor: tone === 'primary' ? alpha(primary, 0.12) : alpha(theme.palette.text.primary, 0.06),
                color: tone === 'primary' ? 'primary.main' : 'text.secondary',
              }}
            />
          ))}
        </Stack>

        <Stack
          direction="row"
          alignItems="center"
          spacing={0.5}
          sx={{
            p: 1.5,
            borderRadius: 2,
            border: `1px solid ${theme.palette.divider}`,
            bgcolor: isDark ? alpha('#fff', 0.02) : alpha(theme.palette.text.primary, 0.02),
          }}
        >
          {FLOW.map((step, i) => (
            <Stack key={step.label} direction="row" alignItems="center" spacing={0.5} sx={{ flex: 1, minWidth: 0 }}>
              <Stack alignItems="center" spacing={0.5} sx={{ flex: 1, minWidth: 0 }}>
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
                  }}
                >
                  <AppIcon fallback={step.icon} sx={{ fontSize: 18 }} />
                </Box>
                <Typography sx={{ fontWeight: 700, fontSize: '0.72rem', color: 'text.primary', textAlign: 'center' }}>
                  {step.label}
                </Typography>
                <Typography sx={{ fontSize: '0.62rem', color: 'text.secondary', textAlign: 'center', lineHeight: 1.3 }}>
                  {step.sub}
                </Typography>
              </Stack>
              {i < FLOW.length - 1 ? (
                <AppIcon
                  name='ArrowForward'
                  fallback={ArrowForwardIcon}
                  sx={{ fontSize: 14, color: 'text.disabled', flexShrink: 0, mx: 0.25 }} />
              ) : null}
            </Stack>
          ))}
        </Stack>
      </Box>
    </Box>
  );
}
