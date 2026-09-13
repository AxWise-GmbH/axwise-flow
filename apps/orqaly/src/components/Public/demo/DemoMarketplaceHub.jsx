import { Box, Chip, Stack, Typography, alpha, useTheme } from '@mui/material';
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';
import { MARKETPLACE_PUBLIC_CATEGORIES } from '../../../data/marketplaceCategories';

import AppIcon from '../../icons/AppIcon';

export const MARKETPLACE_TAB_LABELS = MARKETPLACE_PUBLIC_CATEGORIES.map((c) => c.label);

export default function DemoMarketplaceHub() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const isDark = theme.palette.mode === 'dark';

  return (
    <Box
      role="img"
      aria-label={`Marketplace with tabs: ${MARKETPLACE_TAB_LABELS.join(', ')}`}
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
          app.orqaly.com / marketplace
        </Typography>
        <Chip label="Agents" size="small" sx={{ fontWeight: 700, fontSize: '0.65rem', height: 22 }} />
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
        {MARKETPLACE_PUBLIC_CATEGORIES.map((cat, i) => (
          <Typography
            key={cat.id}
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
            {cat.label}
          </Typography>
        ))}
      </Stack>
      <Box sx={{ p: 2.5 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
          <AppIcon
            name='StorefrontOutlined'
            fallback={StorefrontOutlinedIcon}
            sx={{ fontSize: 18, color: 'primary.main' }} />
          <Typography sx={{ fontWeight: 800, fontSize: '0.72rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary' }}>
            Agent templates
          </Typography>
        </Stack>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1 }}>
          {[
            { name: 'Sales Follow-up Pro', meta: '4.9 · 2.1k installs' },
            { name: 'Voice Triage Nurse', meta: '5.0 · 318 installs' },
          ].map((a) => (
            <Box
              key={a.name}
              sx={{
                p: 1.25,
                borderRadius: 2,
                border: `1px solid ${theme.palette.divider}`,
                bgcolor: isDark ? alpha('#fff', 0.02) : alpha(theme.palette.text.primary, 0.015),
              }}
            >
              <Typography sx={{ fontWeight: 700, fontSize: '0.78rem' }} noWrap>{a.name}</Typography>
              <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary' }}>{a.meta}</Typography>
            </Box>
          ))}
        </Box>
        <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary', mt: 1.5 }}>
          1,247 listings · creators earn crypto
        </Typography>
      </Box>
    </Box>
  );
}
