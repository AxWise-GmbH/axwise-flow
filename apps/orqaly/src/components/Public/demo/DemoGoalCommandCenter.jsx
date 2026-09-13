import { Box, Chip, LinearProgress, Stack, Typography, alpha, useTheme } from '@mui/material';
import TrackChangesOutlinedIcon from '@mui/icons-material/TrackChangesOutlined';
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';

import AppIcon from '../../icons/AppIcon';

export const GOAL_DETAIL_TABS = ['Pipeline', 'Work Log', 'Report', 'Result'];

export default function DemoGoalCommandCenter() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const isDark = theme.palette.mode === 'dark';

  return (
    <Box
      role="img"
      aria-label={`Goal command center with tabs: ${GOAL_DETAIL_TABS.join(', ')}`}
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
          app.orqaly.com / job-pool
        </Typography>
      </Stack>
      <Box sx={{ px: 2.5, py: 2, borderBottom: `1px solid ${theme.palette.divider}` }}>
        <Stack direction="row" alignItems="flex-start" spacing={1.5}>
          <Box
            sx={{
              width: 44,
              height: 44,
              borderRadius: 2,
              bgcolor: alpha(primary, 0.12),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <AppIcon
              name='TrackChangesOutlined'
              fallback={TrackChangesOutlinedIcon}
              sx={{ color: 'primary.main', fontSize: 24 }} />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 800, fontSize: '1.05rem', color: 'text.primary' }} noWrap>
              Create a landing page for AaaS
            </Typography>
            <Stack direction="row" spacing={0.75} sx={{ mt: 0.75, flexWrap: 'wrap' }}>
              <Chip label="active" size="small" color="success" sx={{ height: 20, fontSize: '0.62rem', fontWeight: 700 }} />
              <Chip label="Team Formation" size="small" variant="outlined" sx={{ height: 20, fontSize: '0.62rem', fontWeight: 700 }} />
            </Stack>
          </Box>
        </Stack>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 1.5 }}>
          <AppIcon
            name='AccountBalanceWalletOutlined'
            fallback={AccountBalanceWalletOutlinedIcon}
            sx={{ fontSize: 16, color: 'text.secondary' }} />
          <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', flex: 1 }}>
            Budget: $42.10 / $200.00
          </Typography>
        </Stack>
        <LinearProgress variant="determinate" value={21} sx={{ mt: 0.75, height: 6, borderRadius: 999 }} />
      </Box>
      <Stack
        direction="row"
        spacing={0.5}
        sx={{
          px: 1.5,
          py: 0.75,
          borderBottom: `1px solid ${theme.palette.divider}`,
          overflowX: 'auto',
        }}
      >
        {GOAL_DETAIL_TABS.map((tab, i) => (
          <Typography
            key={tab}
            sx={{
              px: 1.25,
              py: 0.75,
              fontSize: '0.72rem',
              fontWeight: 700,
              whiteSpace: 'nowrap',
              color: i === 0 ? 'primary.main' : 'text.secondary',
              borderBottom: i === 0 ? `2px solid ${primary}` : '2px solid transparent',
            }}
          >
            {tab}
          </Typography>
        ))}
      </Stack>
      <Box sx={{ p: 2.5 }}>
        <Typography sx={{ fontWeight: 800, fontSize: '0.68rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary', mb: 1.5 }}>
          Pipeline · step 4 of 7
        </Typography>
        <Stack spacing={0.75}>
          {['Analysis', 'PO Tech Doc', 'PM Planning', 'Team Formation', 'Tool Setup', 'Estimates', 'Executing'].map((stage, i) => (
            <Stack key={stage} direction="row" alignItems="center" spacing={1}>
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  bgcolor: i < 4 ? primary : i === 4 ? primary : alpha(theme.palette.text.primary, 0.15),
                  boxShadow: i === 4 ? `0 0 8px ${alpha(primary, 0.5)}` : 'none',
                }}
              />
              <Typography
                sx={{
                  fontSize: '0.78rem',
                  fontWeight: i <= 4 ? 700 : 500,
                  color: i <= 4 ? 'text.primary' : 'text.disabled',
                }}
              >
                {stage}
              </Typography>
            </Stack>
          ))}
        </Stack>
      </Box>
    </Box>
  );
}
