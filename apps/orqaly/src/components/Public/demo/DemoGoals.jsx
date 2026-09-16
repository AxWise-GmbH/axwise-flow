import { Box, Chip, Stack, Typography, alpha, useTheme } from '@mui/material';
import TrackChangesOutlinedIcon from '@mui/icons-material/TrackChangesOutlined';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import PendingOutlinedIcon from '@mui/icons-material/PendingOutlined';

import AppIcon from '../../icons/AppIcon';

const SAMPLE_GOAL =
  'Launch a Black-Friday campaign by Nov 28: landing page, 5-email sequence, paid ads creative, and a daily revenue report.';

const TASKS = [
  { title: 'Draft landing page copy + hero',           agent: 'CopyAgent',     status: 'done',    eta: 'completed' },
  { title: 'Generate 5-email sequence',                agent: 'EmailAgent',    status: 'doing',   eta: 'in progress · 4 min' },
  { title: 'Produce 6 ad creatives (1:1, 9:16, 16:9)', agent: 'CreativeAgent', status: 'queued',  eta: 'queued · 12 min' },
  { title: 'Build daily revenue dashboard',            agent: 'AnalyticsAgent',status: 'queued',  eta: 'queued · 9 min' },
  { title: 'QA pass + brand review',                   agent: 'BrandReviewer', status: 'queued',  eta: 'queued · 6 min' },
];

function StatusIcon({ status, primary, theme }) {
  if (status === 'done') {
    return (
      <AppIcon
        name='CheckCircleOutline'
        fallback={CheckCircleOutlineIcon}
        sx={{ fontSize: 20, color: primary }} />
    );
  }
  if (status === 'doing') {
    return (
      <AppIcon
        name='PendingOutlined'
        fallback={PendingOutlinedIcon}
        sx={{ fontSize: 20, color: theme.palette.warning.main }} />
    );
  }
  return (
    <AppIcon
      name='RadioButtonUnchecked'
      fallback={RadioButtonUncheckedIcon}
      sx={{ fontSize: 20, color: theme.palette.text.disabled }} />
  );
}

export default function DemoGoals() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const isDark = theme.palette.mode === 'dark';
  return (
    <Box
      role="img"
      aria-label="Orqaly goal definition screen: a typed goal being decomposed into agent-assigned tasks"
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
        <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary', flex: 1, textAlign: 'center' }}>
          orqaly.com / goals / new
        </Typography>
        <Box sx={{ width: 36 }} />
      </Stack>
      {/* Goal input card */}
      <Box sx={{ p: { xs: 2, md: 2.75 } }}>
        <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 1.25 }}>
          <Box
            sx={{
              width: 30,
              height: 30,
              borderRadius: 1.5,
              bgcolor: alpha(primary, 0.12),
              color: 'primary.main',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <AppIcon
              name='TrackChangesOutlined'
              fallback={TrackChangesOutlinedIcon}
              sx={{ fontSize: 18 }} />
          </Box>
          <Typography sx={{ fontWeight: 700, fontSize: '0.88rem', color: 'text.primary' }}>
            New goal
          </Typography>
          <Chip
            label="auto-decomposed"
            size="small"
            sx={{
              ml: 'auto',
              bgcolor: alpha(primary, 0.12),
              color: 'primary.main',
              fontWeight: 700,
              fontSize: '0.7rem',
              height: 22,
            }}
          />
        </Stack>

        <Box
          sx={{
            p: 2,
            borderRadius: 2,
            border: `1px solid ${theme.palette.divider}`,
            bgcolor: isDark ? alpha('#fff', 0.015) : alpha(theme.palette.text.primary, 0.015),
          }}
        >
          <Typography sx={{ fontSize: '0.9rem', color: 'text.primary', lineHeight: 1.55 }}>
            {SAMPLE_GOAL}
          </Typography>
        </Box>
      </Box>
      {/* Decomposition header */}
      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        sx={{
          px: { xs: 2, md: 2.75 },
          pb: 1,
        }}
      >
        <AppIcon
          name='AutoAwesomeOutlined'
          fallback={AutoAwesomeOutlinedIcon}
          sx={{ fontSize: 16, color: 'primary.main' }} />
        <Typography
          sx={{
            fontWeight: 800,
            fontSize: '0.7rem',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'primary.main',
          }}
        >
          5 tasks planned by Consilium
        </Typography>
      </Stack>
      {/* Task list */}
      <Stack spacing={1} sx={{ px: { xs: 2, md: 2.75 }, pb: { xs: 2, md: 2.75 } }}>
        {TASKS.map((t, i) => (
          <Stack
            key={i}
            direction="row"
            spacing={1.5}
            alignItems="center"
            sx={{
              p: 1.25,
              borderRadius: 2,
              border: `1px solid ${theme.palette.divider}`,
              bgcolor: isDark ? alpha('#fff', 0.02) : alpha(theme.palette.text.primary, 0.015),
            }}
          >
            <StatusIcon status={t.status} primary={primary} theme={theme} />
            <Stack sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', color: 'text.primary', lineHeight: 1.3 }}>
                {t.title}
              </Typography>
              <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', mt: 0.25 }}>
                {t.eta}
              </Typography>
            </Stack>
            <Chip
              label={t.agent}
              size="small"
              sx={{
                bgcolor: alpha(primary, 0.08),
                color: 'primary.main',
                fontWeight: 700,
                fontSize: '0.68rem',
                height: 22,
                border: `1px solid ${alpha(primary, 0.22)}`,
              }}
            />
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}
