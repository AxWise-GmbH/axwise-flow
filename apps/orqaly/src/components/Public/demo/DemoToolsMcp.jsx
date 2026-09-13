import { Box, Chip, Stack, Typography, alpha, useTheme } from '@mui/material';
import ExtensionOutlinedIcon from '@mui/icons-material/ExtensionOutlined';
import LinkOutlinedIcon from '@mui/icons-material/LinkOutlined';

import AppIcon from '../../icons/AppIcon';

const APPS = [
  { name: 'Gmail', sub: 'Communication', risk: 'medium' },
  { name: 'Stripe', sub: 'Payments', risk: 'high' },
  { name: 'Slack', sub: 'Communication', risk: 'medium' },
  { name: 'Notion', sub: 'Productivity', risk: 'low' },
];

export default function DemoToolsMcp() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const isDark = theme.palette.mode === 'dark';

  const riskColor = (r) => {
    if (r === 'high') return theme.palette.error.main;
    if (r === 'medium') return theme.palette.warning.main;
    return theme.palette.success.main;
  };

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
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2.5, py: 1.75, borderBottom: `1px solid ${theme.palette.divider}` }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <AppIcon
            name='ExtensionOutlined'
            fallback={ExtensionOutlinedIcon}
            sx={{ fontSize: 18, color: 'info.main' }} />
          <Typography sx={{ fontWeight: 800, fontSize: '0.72rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary' }}>
            MCP · Composio
          </Typography>
        </Stack>
        <Chip size="small" label="Connect OAuth" sx={{ fontWeight: 700, fontSize: '0.65rem' }} />
      </Stack>
      <Stack spacing={1} sx={{ p: 2.5 }}>
        {APPS.map((app) => (
          <Stack
            key={app.name}
            direction="row"
            alignItems="center"
            spacing={1.25}
            sx={{
              p: 1.5,
              borderRadius: 2.5,
              border: `1px solid ${theme.palette.divider}`,
              bgcolor: isDark ? alpha('#fff', 0.02) : alpha(theme.palette.text.primary, 0.015),
            }}
          >
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontWeight: 700, fontSize: '0.85rem' }}>{app.name}</Typography>
              <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>{app.sub}</Typography>
            </Box>
            <Chip label={app.risk} size="small" sx={{ height: 20, fontSize: '0.6rem', fontWeight: 700, color: riskColor(app.risk), borderColor: alpha(riskColor(app.risk), 0.4) }} variant="outlined" />
            <AppIcon
              name='LinkOutlined'
              fallback={LinkOutlinedIcon}
              sx={{ fontSize: 16, color: 'primary.main' }} />
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}
