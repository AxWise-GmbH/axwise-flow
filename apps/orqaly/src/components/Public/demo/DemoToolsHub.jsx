import { Box, Chip, Stack, Typography, alpha, useTheme } from '@mui/material';
import BuildOutlinedIcon from '@mui/icons-material/BuildOutlined';
import ExtensionOutlinedIcon from '@mui/icons-material/ExtensionOutlined';

import AppIcon from '../../icons/AppIcon';

export const TOOLS_CONNECTION_TYPES = ['API', 'Webhook', 'SDK', 'MCP', 'Internal'];

export default function DemoToolsHub() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const isDark = theme.palette.mode === 'dark';

  return (
    <Box
      role="img"
      aria-label="Tools workspace with integrations and metrics"
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
          app.orqaly.com / tools
        </Typography>
      </Stack>
      <Box sx={{ p: 2.5 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1, mb: 2 }}>
          {[
            { label: 'Total tools', value: '48', color: primary },
            { label: 'Active', value: '41', color: theme.palette.success.main },
            { label: 'MCP', value: '32', color: theme.palette.info.main },
            { label: 'Blocked', value: '2', color: theme.palette.warning.main },
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
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
          <AppIcon
            name='BuildOutlined'
            fallback={BuildOutlinedIcon}
            sx={{ fontSize: 18, color: 'primary.main' }} />
          <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', flex: 1 }}>Stripe · MCP Gmail</Typography>
          <Chip label="active" size="small" color="success" sx={{ height: 20, fontSize: '0.62rem', fontWeight: 700 }} />
        </Stack>
        <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
          {TOOLS_CONNECTION_TYPES.map((t) => (
            <Chip key={t} label={t} size="small" variant="outlined" sx={{ fontSize: '0.65rem', fontWeight: 700 }} />
          ))}
        </Stack>
        <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mt: 1.5 }}>
          <AppIcon
            name='ExtensionOutlined'
            fallback={ExtensionOutlinedIcon}
            sx={{ fontSize: 16, color: 'info.main' }} />
          <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>Composio · 9 MCP subcategories</Typography>
        </Stack>
      </Box>
    </Box>
  );
}
