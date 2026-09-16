import { Box, Chip, Stack, Typography, alpha, useTheme } from '@mui/material';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';

import AppIcon from '../../icons/AppIcon';

const LAYERS = [
  {
    label: 'Edge & app',
    vendors: ['Vercel', 'React SPA'],
    accent: 0.5,
  },
  {
    label: 'Data plane',
    vendors: ['Supabase Postgres', 'Auth', 'Storage', 'RLS'],
    accent: 0.65,
  },
  {
    label: 'AI & voice',
    vendors: ['OpenAI', 'Anthropic', 'Groq', 'AssemblyAI'],
    accent: 0.8,
  },
  {
    label: 'Commerce & ops',
    vendors: ['Cryptocurrency/Fiat', 'Stripe Connect', 'Resend', 'Sentry'],
    accent: 0.55,
  },
  {
    label: 'Safety layer',
    vendors: ['VirusTotal', 'Rate limits', 'Audit log'],
    accent: 0.9,
  },
];

export default function DemoSecurityStack() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const isDark = theme.palette.mode === 'dark';

  return (
    <Box
      role="img"
      aria-label="Orqaly security stack: Vercel, Supabase, AI providers, Stripe, and safety controls"
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
        <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary', flex: 1, textAlign: 'center' }}>
          orqaly.com / security / stack
        </Typography>
        <Box sx={{ width: 36 }} />
      </Stack>
      <Box sx={{ p: { xs: 2, md: 2.5 } }}>
        <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 2 }}>
          <Box
            sx={{
              width: 32,
              height: 32,
              borderRadius: 1.5,
              bgcolor: alpha(primary, 0.12),
              color: 'primary.main',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <AppIcon name='ShieldOutlined' fallback={ShieldOutlinedIcon} sx={{ fontSize: 18 }} />
          </Box>
          <Box>
            <Typography sx={{ fontWeight: 800, fontSize: '0.9rem', color: 'text.primary' }}>
              Production stack
            </Typography>
            <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>
              Operated + BYOK integrations
            </Typography>
          </Box>
          <Chip
            label="All JWT-gated"
            size="small"
            sx={{
              ml: 'auto',
              height: 22,
              fontSize: '0.65rem',
              fontWeight: 700,
              bgcolor: alpha(primary, 0.12),
              color: 'primary.main',
            }}
          />
        </Stack>

        <Stack spacing={1}>
          {LAYERS.map((layer) => (
            <Box
              key={layer.label}
              sx={{
                p: 1.25,
                borderRadius: 2,
                border: `1px solid ${alpha(primary, 0.15 + layer.accent * 0.2)}`,
                bgcolor: alpha(primary, isDark ? 0.04 + layer.accent * 0.04 : 0.03 + layer.accent * 0.05),
              }}
            >
              <Typography
                sx={{
                  fontSize: '0.65rem',
                  fontWeight: 800,
                  letterSpacing: '0.07em',
                  textTransform: 'uppercase',
                  color: 'primary.main',
                  mb: 0.75,
                }}
              >
                {layer.label}
              </Typography>
              <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                {layer.vendors.map((v) => (
                  <Chip
                    key={v}
                    label={v}
                    size="small"
                    sx={{
                      height: 22,
                      fontSize: '0.65rem',
                      fontWeight: 600,
                      bgcolor: alpha(theme.palette.text.primary, 0.06),
                      color: 'text.secondary',
                    }}
                  />
                ))}
              </Stack>
            </Box>
          ))}
        </Stack>
      </Box>
    </Box>
  );
}
