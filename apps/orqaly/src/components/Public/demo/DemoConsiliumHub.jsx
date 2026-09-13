import { Box, Chip, Stack, Typography, alpha, useTheme } from '@mui/material';
import GavelOutlinedIcon from '@mui/icons-material/GavelOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';

import AppIcon from '../../icons/AppIcon';

export const CONSILIUM_TAB_LABELS = [
  'Boards',
  'Members',
  'Criteria',
  'Agent Helper',
  'Analytics',
  'Security',
  'Governance',
];

export default function DemoConsiliumHub() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const isDark = theme.palette.mode === 'dark';

  return (
    <Box
      role="img"
      aria-label={`Consilium with tabs: ${CONSILIUM_TAB_LABELS.join(', ')}`}
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
          app.orqaly.com / consilium
        </Typography>
      </Stack>
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
        {CONSILIUM_TAB_LABELS.map((tab, i) => (
          <Typography
            key={tab}
            sx={{
              px: 1,
              py: 0.75,
              fontSize: '0.68rem',
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
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1, mb: 2 }}>
          {[
            { label: 'Total boards', value: '6', color: primary },
            { label: 'Members', value: '24', color: theme.palette.info.main },
            { label: 'Active jobs', value: '3', color: theme.palette.warning.main },
            { label: 'Completed', value: '41', color: theme.palette.success.main },
          ].map((m) => (
            <Stack
              key={m.label}
              spacing={0.25}
              sx={{
                p: 1.25,
                borderRadius: 2,
                border: `1px solid ${alpha(m.color, 0.25)}`,
                bgcolor: alpha(m.color, 0.06),
              }}
            >
              <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase' }}>
                {m.label}
              </Typography>
              <Typography sx={{ fontWeight: 800, fontSize: '1.2rem', color: m.color }}>{m.value}</Typography>
            </Stack>
          ))}
        </Box>
        <Stack direction="row" alignItems="center" spacing={1}>
          <AppIcon
            name='GroupsOutlined'
            fallback={GroupsOutlinedIcon}
            sx={{ fontSize: 18, color: 'primary.main' }} />
          <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', flex: 1 }}>Product Launch Board</Typography>
          <Chip label="8 members" size="small" sx={{ height: 20, fontSize: '0.62rem', fontWeight: 700 }} />
        </Stack>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 1 }}>
          <AppIcon
            name='GavelOutlined'
            fallback={GavelOutlinedIcon}
            sx={{ fontSize: 16, color: 'text.secondary' }} />
          <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>Tool approval: Auto · View decision log →</Typography>
        </Stack>
      </Box>
    </Box>
  );
}
