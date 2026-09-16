import { Box, Button, Stack, Typography, alpha, useTheme } from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import HomeRoundedIcon from '@mui/icons-material/HomeRounded';
import CorporateFareRoundedIcon from '@mui/icons-material/CorporateFareRounded';
import BarChartRoundedIcon from '@mui/icons-material/BarChartRounded';
import StorefrontRoundedIcon from '@mui/icons-material/StorefrontRounded';
import { simpleModeFrameSx, simpleModeLabelSx } from './simpleModeFrame';

import AppIcon from '../../icons/AppIcon';

const METRICS = [
  { label: 'In flight', value: '3', sub: 'goals running' },
  { label: 'Needs you', value: '1', sub: 'awaiting approval' },
  { label: 'Spend', value: '$24', sub: 'this week' },
];

const GOALS = [
  { title: 'Launch Q2 landing page', status: 'Executing', pct: 68, color: 'primary' },
  { title: 'Investor update draft', status: 'Awaiting approval', pct: 40, color: 'warning' },
];

const DOCK = [
  { Icon: HomeRoundedIcon, label: 'Home', active: true },
  { Icon: CorporateFareRoundedIcon, label: 'Organizations', active: false },
  { Icon: BarChartRoundedIcon, label: 'Reports', active: false },
  { Icon: StorefrontRoundedIcon, label: 'Marketplace', active: false },
];

export default function DemoSimpleMode() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const warn = theme.palette.warning.main;

  return (
    <Box sx={simpleModeFrameSx(theme)}>
      <Box sx={{ p: { xs: 2, md: 2.5 } }}>
        <Typography sx={{ ...simpleModeLabelSx(), mb: 1.5 }}>Request Hub · Home</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, mb: 2 }}>
          {METRICS.map((m) => (
            <Stack
              key={m.label}
              spacing={0.25}
              sx={{
                p: 1.25,
                borderRadius: 2,
                border: `1px solid ${theme.palette.divider}`,
                bgcolor: alpha(primary, 0.04),
              }}
            >
              <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase' }}>
                {m.label}
              </Typography>
              <Typography sx={{ fontWeight: 800, fontSize: '1.25rem', lineHeight: 1 }}>{m.value}</Typography>
              <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary' }}>{m.sub}</Typography>
            </Stack>
          ))}
        </Box>
        <Button
          variant="contained"
          disableElevation
          startIcon={<AppIcon name='AddRounded' fallback={AddRoundedIcon} />}
          sx={{ mb: 2, fontWeight: 700, borderRadius: 2, textTransform: 'none', width: '100%' }}
        >
          New Request
        </Button>
        <Typography sx={{ ...simpleModeLabelSx(), mb: 1 }}>Active goals</Typography>
        <Stack spacing={1}>
          {GOALS.map((g) => (
            <Stack
              key={g.title}
              spacing={0.75}
              sx={{
                p: 1.25,
                borderRadius: 2,
                border: `1px solid ${alpha(g.color === 'warning' ? warn : primary, 0.25)}`,
              }}
            >
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography sx={{ fontWeight: 700, fontSize: '0.82rem' }}>{g.title}</Typography>
                <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: g.color === 'warning' ? 'warning.main' : 'primary.main' }}>
                  {g.status}
                </Typography>
              </Stack>
              <Box sx={{ height: 4, borderRadius: 999, bgcolor: alpha(theme.palette.text.primary, 0.08), overflow: 'hidden' }}>
                <Box sx={{ width: `${g.pct}%`, height: '100%', bgcolor: g.color === 'warning' ? warn : primary, borderRadius: 999 }} />
              </Box>
            </Stack>
          ))}
        </Stack>
      </Box>
      <Box
        sx={{
          borderTop: `1px solid ${theme.palette.divider}`,
          p: 1.5,
          display: 'flex',
          justifyContent: 'center',
          gap: 1,
          bgcolor: alpha(theme.palette.background.default, 0.5),
        }}
      >
        {DOCK.map(({ Icon, label, active }) => (
          <Stack key={label} alignItems="center" spacing={0.25} sx={{ minWidth: 52 }}>
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: 1.5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: active ? 'primary.main' : 'text.secondary',
                bgcolor: active ? alpha(primary, 0.15) : alpha(theme.palette.text.primary, 0.04),
                border: active ? `1px solid ${alpha(primary, 0.35)}` : `1px solid ${theme.palette.divider}`,
              }}
            >
              <Icon sx={{ fontSize: 22 }} />
            </Box>
            <Typography sx={{ fontSize: '0.58rem', fontWeight: 700, color: active ? 'primary.main' : 'text.secondary' }}>
              {label}
            </Typography>
          </Stack>
        ))}
      </Box>
    </Box>
  );
}
