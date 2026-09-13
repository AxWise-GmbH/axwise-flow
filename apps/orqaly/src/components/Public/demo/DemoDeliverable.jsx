import { Box, Button, Chip, Stack, Typography, alpha, useTheme } from '@mui/material';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import AutoFixHighOutlinedIcon from '@mui/icons-material/AutoFixHighOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';

import AppIcon from '../../icons/AppIcon';

const VERSIONS = [
  { v: 'v1', label: 'first draft', stamp: 'Nov 12, 09:14' },
  { v: 'v2', label: 'refined', stamp: 'Nov 12, 10:02' },
  { v: 'v3', label: 'current', stamp: 'Nov 12, 11:48' },
];

const BULLETS = [
  'Total revenue: $148,920 (+38% vs Black Friday 2024).',
  'Top channel: paid social (43%) followed by email (31%).',
  'New customer share: 62% (target: 55%) - acquisition cap met.',
  'Refund rate held at 1.9%, inside the agreed 4% guardrail.',
];

function ChartMock({ primary, theme, isDark }) {
  const bars = [42, 58, 71, 64, 82, 91, 76];
  return (
    <Box
      sx={{
        p: 2,
        borderRadius: 2,
        bgcolor: isDark ? alpha('#fff', 0.02) : alpha(theme.palette.text.primary, 0.012),
        border: `1px solid ${theme.palette.divider}`,
      }}
    >
      <Stack direction="row" alignItems="flex-end" spacing={1} sx={{ height: 88 }}>
        {bars.map((h, i) => (
          <Box
            key={i}
            sx={{
              flex: 1,
              height: `${h}%`,
              borderRadius: '4px 4px 0 0',
              background: `linear-gradient(180deg, ${primary} 0%, ${alpha(primary, 0.45)} 100%)`,
              opacity: 0.85,
            }}
          />
        ))}
      </Stack>
      <Stack direction="row" justifyContent="space-between" sx={{ mt: 1, color: 'text.secondary', fontSize: '0.66rem' }}>
        <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span>
      </Stack>
    </Box>
  );
}

export default function DemoDeliverable() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const isDark = theme.palette.mode === 'dark';
  return (
    <Box
      role="img"
      aria-label="Orqaly deliverable view: a versioned report with chart and summary, plus download and refine actions"
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
        <Box
          sx={{
            width: 28,
            height: 28,
            borderRadius: 1.5,
            bgcolor: alpha(primary, 0.12),
            color: 'primary.main',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <AppIcon
            name='DescriptionOutlined'
            fallback={DescriptionOutlinedIcon}
            sx={{ fontSize: 16 }} />
        </Box>
        <Stack sx={{ flex: 1 }}>
          <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', color: 'text.primary' }}>
            Black-Friday revenue report
          </Typography>
          <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>
            Goal #284 · shipped by AnalyticsAgent
          </Typography>
        </Stack>
        <Chip
          label="Ready for review"
          size="small"
          icon={<AppIcon
            name='CheckCircleOutline'
            fallback={CheckCircleOutlineIcon}
            sx={{ fontSize: 14, color: `${primary} !important` }} />}
          sx={{
            bgcolor: alpha(primary, 0.12),
            color: 'primary.main',
            fontWeight: 700,
            fontSize: '0.68rem',
            height: 22,
            '& .MuiChip-icon': { ml: 0.5 },
          }}
        />
      </Stack>
      {/* Version tabs */}
      <Stack
        direction="row"
        spacing={0}
        sx={{
          borderBottom: `1px solid ${theme.palette.divider}`,
          bgcolor: isDark ? alpha('#fff', 0.015) : alpha(theme.palette.text.primary, 0.012),
        }}
      >
        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ px: 2, py: 1, color: 'text.secondary' }}>
          <AppIcon
            name='HistoryOutlined'
            fallback={HistoryOutlinedIcon}
            sx={{ fontSize: 14 }} />
          <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Versions
          </Typography>
        </Stack>
        {VERSIONS.map((v, i) => {
          const isCurrent = i === VERSIONS.length - 1;
          return (
            <Stack
              key={v.v}
              direction="row"
              spacing={0.6}
              alignItems="center"
              sx={{
                px: 1.5,
                py: 1,
                borderLeft: `1px solid ${theme.palette.divider}`,
                bgcolor: isCurrent ? alpha(primary, 0.08) : 'transparent',
                color: isCurrent ? 'primary.main' : 'text.secondary',
              }}
            >
              <Typography sx={{ fontWeight: 800, fontSize: '0.75rem' }}>{v.v}</Typography>
              <Typography sx={{ fontSize: '0.7rem' }}>{v.label}</Typography>
            </Stack>
          );
        })}
      </Stack>
      {/* Body */}
      <Stack spacing={2} sx={{ p: { xs: 2, md: 2.5 } }}>
        <ChartMock primary={primary} theme={theme} isDark={isDark} />
        <Stack spacing={0.75}>
          {BULLETS.map((b, i) => (
            <Stack key={i} direction="row" spacing={1} alignItems="flex-start">
              <Box
                sx={{
                  mt: '5px',
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  bgcolor: primary,
                  flexShrink: 0,
                }}
              />
              <Typography sx={{ fontSize: '0.85rem', color: 'text.primary', lineHeight: 1.55 }}>
                {b}
              </Typography>
            </Stack>
          ))}
        </Stack>
      </Stack>
      {/* Actions */}
      <Stack
        direction="row"
        spacing={1.25}
        sx={{
          px: { xs: 2, md: 2.5 },
          py: 1.5,
          borderTop: `1px solid ${theme.palette.divider}`,
          bgcolor: isDark ? alpha('#fff', 0.015) : alpha(theme.palette.text.primary, 0.015),
        }}
      >
        <Button
          size="small"
          startIcon={<AppIcon
            name='DownloadOutlined'
            fallback={DownloadOutlinedIcon}
            sx={{ fontSize: 16 }} />}
          variant="outlined"
          sx={{
            fontWeight: 700,
            fontSize: '0.75rem',
            textTransform: 'none',
            borderRadius: 1.5,
            py: 0.5,
          }}
        >
          Download
        </Button>
        <Button
          size="small"
          startIcon={<AppIcon
            name='AutoFixHighOutlined'
            fallback={AutoFixHighOutlinedIcon}
            sx={{ fontSize: 16 }} />}
          variant="outlined"
          sx={{
            fontWeight: 700,
            fontSize: '0.75rem',
            textTransform: 'none',
            borderRadius: 1.5,
            py: 0.5,
          }}
        >
          Refine
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button
          size="small"
          variant="contained"
          disableElevation
          startIcon={<AppIcon
            name='CheckCircleOutline'
            fallback={CheckCircleOutlineIcon}
            sx={{ fontSize: 16 }} />}
          sx={{
            fontWeight: 700,
            fontSize: '0.75rem',
            textTransform: 'none',
            borderRadius: 1.5,
            py: 0.5,
          }}
        >
          Approve
        </Button>
      </Stack>
    </Box>
  );
}
