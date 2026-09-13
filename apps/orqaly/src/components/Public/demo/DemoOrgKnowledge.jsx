import { Box, Chip, Stack, Typography, alpha, useTheme } from '@mui/material';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import PaletteOutlinedIcon from '@mui/icons-material/PaletteOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';

import AppIcon from '../../icons/AppIcon';

const DOCS = [
  { title: 'Brand voice & tone', type: 'doc' },
  { title: 'Refund policy 2026', type: 'doc' },
  { title: 'Product catalog export', type: 'file' },
];

export default function DemoOrgKnowledge() {
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
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2.5, py: 1.75, borderBottom: `1px solid ${theme.palette.divider}` }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <AppIcon
            name='MenuBookOutlined'
            fallback={MenuBookOutlinedIcon}
            sx={{ fontSize: 18, color: '#F59E0B' }} />
          <Typography sx={{ fontWeight: 800, fontSize: '0.72rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary' }}>
            Knowledge · Roastedco
          </Typography>
        </Stack>
        <Chip
          size="small"
          icon={<AppIcon
            name='LockOutlined'
            fallback={LockOutlinedIcon}
            sx={{ fontSize: '12px !important' }} />}
          label="org_rsc only"
          sx={{ fontWeight: 700, fontSize: '0.62rem', fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}
        />
      </Stack>
      <Stack spacing={1} sx={{ p: 2.5 }}>
        {DOCS.map((d) => (
          <Stack
            key={d.title}
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
            <AppIcon
              name='DescriptionOutlined'
              fallback={DescriptionOutlinedIcon}
              sx={{ fontSize: 18, color: '#F59E0B' }} />
            <Typography sx={{ fontWeight: 600, fontSize: '0.85rem', color: 'text.primary', flex: 1 }} noWrap>
              {d.title}
            </Typography>
          </Stack>
        ))}
      </Stack>
      <Stack direction="row" spacing={1} sx={{ px: 2.5, pb: 2.5, flexWrap: 'wrap' }}>
        <Chip size="small" icon={<AppIcon
          name='PaletteOutlined'
          fallback={PaletteOutlinedIcon}
          sx={{ fontSize: '14px !important' }} />} label="Brand kit" variant="outlined" sx={{ fontSize: '0.68rem', fontWeight: 700 }} />
        <Chip size="small" icon={<AppIcon
          name='SmartToyOutlined'
          fallback={SmartToyOutlinedIcon}
          sx={{ fontSize: '14px !important' }} />} label="6 agents" variant="outlined" sx={{ fontSize: '0.68rem', fontWeight: 700 }} />
        <Chip size="small" label="28 docs" variant="outlined" sx={{ fontSize: '0.68rem', fontWeight: 700 }} />
      </Stack>
    </Box>
  );
}
