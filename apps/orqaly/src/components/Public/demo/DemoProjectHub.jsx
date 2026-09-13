import { Box, Stack, Typography, alpha, useTheme } from '@mui/material';
import FolderOpenOutlinedIcon from '@mui/icons-material/FolderOpenOutlined';

import AppIcon from '../../icons/AppIcon';

export default function DemoProjectHub() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const isDark = theme.palette.mode === 'dark';
  const tabs = ['Tasks', 'Agents', 'KB', 'KPIs'];
  const kpis = [
    { value: '28', label: 'Tasks done', sub: 'of 39' },
    { value: '92%', label: 'On track', sub: '+4% w/w' },
    { value: '12d', label: 'To ship', sub: 'beats target' },
  ];
  return (
    <Box
      sx={{
        borderRadius: 4,
        overflow: 'hidden',
        bgcolor: isDark ? alpha('#fff', 0.025) : '#fff',
        border: `1px solid ${theme.palette.divider}`,
        boxShadow: `0 20px 50px ${alpha(primary, 0.18)}`,
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ p: 2.5, borderBottom: `1px solid ${theme.palette.divider}`, bgcolor: isDark ? alpha('#fff', 0.02) : alpha(theme.palette.text.primary, 0.02) }}>
        <Box sx={{ width: 36, height: 36, borderRadius: 1.5, bgcolor: alpha(primary, 0.12), color: 'primary.main', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <AppIcon
            name='FolderOpenOutlined'
            fallback={FolderOpenOutlinedIcon}
            sx={{ fontSize: 20 }} />
        </Box>
        <Stack sx={{ flex: 1 }}>
          <Typography sx={{ fontWeight: 800, fontSize: '0.95rem', color: 'text.primary' }}>Q1 product launch</Typography>
          <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>Project · 4 agents · isolated KB</Typography>
        </Stack>
      </Stack>
      <Stack direction="row" sx={{ borderBottom: `1px solid ${theme.palette.divider}`, px: 1.5 }}>
        {tabs.map((t) => {
          const active = t === 'KPIs';
          return (
            <Box
              key={t}
              sx={{
                px: 2,
                py: 1.5,
                fontSize: '0.85rem',
                fontWeight: active ? 800 : 600,
                color: active ? 'primary.main' : 'text.secondary',
                borderBottom: active ? `2px solid ${primary}` : '2px solid transparent',
              }}
            >
              {t}
            </Box>
          );
        })}
      </Stack>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1.5, p: 2.5 }}>
        {kpis.map((k) => (
          <Stack key={k.label} spacing={0.5} sx={{ p: 2, borderRadius: 2, border: `1px solid ${theme.palette.divider}` }}>
            <Typography sx={{ fontWeight: 800, fontSize: '1.4rem', color: 'primary.main', lineHeight: 1 }}>{k.value}</Typography>
            <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: 'text.primary' }}>{k.label}</Typography>
            <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary' }}>{k.sub}</Typography>
          </Stack>
        ))}
      </Box>
    </Box>
  );
}
