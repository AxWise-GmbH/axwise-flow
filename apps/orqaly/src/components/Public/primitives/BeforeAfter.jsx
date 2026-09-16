import { Box, Container, Grid, Stack, Typography, alpha, useTheme } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import CheckIcon from '@mui/icons-material/Check';

import AppIcon from '../../icons/AppIcon';

// Problem vs solution side-by-side. Each side lists items.
export default function BeforeAfter({ title, subtitle, before, after, bg = 'subtle' }) {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const error = theme.palette.error.main;
  const bgcolor = bg === 'tint' ? alpha(theme.palette.text.primary, 0.02) : 'transparent';
  return (
    <Box component="section" sx={{ py: { xs: 5, md: 8 }, bgcolor, borderTop: bg === 'tint' ? `1px solid ${theme.palette.divider}` : 'none', borderBottom: bg === 'tint' ? `1px solid ${theme.palette.divider}` : 'none' }}>
      <Container maxWidth="lg">
        {(title || subtitle) && (
          <Stack spacing={1.5} sx={{ mb: { xs: 4, md: 5 }, textAlign: 'center' }} alignItems="center">
            {title && (
              <Typography component="h2" sx={{ fontWeight: 800, fontSize: { xs: '1.6rem', md: '2.2rem' }, color: 'text.primary', letterSpacing: '-0.01em' }}>
                {title}
              </Typography>
            )}
            {subtitle && (
              <Typography sx={{ fontSize: '1rem', color: 'text.secondary', maxWidth: 560 }}>{subtitle}</Typography>
            )}
          </Stack>
        )}
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 6 }}>
            <Box
              sx={{
                p: { xs: 3, md: 4 },
                height: '100%',
                borderRadius: 3,
                bgcolor: alpha(error, 0.04),
                border: `1px solid ${alpha(error, 0.25)}`,
              }}
            >
              <Typography sx={{ fontWeight: 800, fontSize: '1.1rem', color: error, mb: 2 }}>
                {before.title || 'Without Orqaly'}
              </Typography>
              <Stack spacing={1.25}>
                {before.items.map((it, i) => (
                  <Stack key={i} direction="row" spacing={1.5} alignItems="flex-start">
                    <Box sx={{ mt: '4px', width: 20, height: 20, borderRadius: '50%', bgcolor: alpha(error, 0.15), color: error, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <AppIcon name='Close' fallback={CloseIcon} sx={{ fontSize: 13 }} />
                    </Box>
                    <Typography sx={{ fontSize: '0.95rem', color: 'text.primary', lineHeight: 1.55 }}>{it}</Typography>
                  </Stack>
                ))}
              </Stack>
            </Box>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <Box
              sx={{
                p: { xs: 3, md: 4 },
                height: '100%',
                borderRadius: 3,
                bgcolor: alpha(primary, 0.05),
                border: `1px solid ${alpha(primary, 0.35)}`,
                boxShadow: `0 0 40px ${alpha(primary, 0.12)}`,
              }}
            >
              <Typography sx={{ fontWeight: 800, fontSize: '1.1rem', color: 'primary.main', mb: 2 }}>
                {after.title || 'With Orqaly'}
              </Typography>
              <Stack spacing={1.25}>
                {after.items.map((it, i) => (
                  <Stack key={i} direction="row" spacing={1.5} alignItems="flex-start">
                    <Box sx={{ mt: '4px', width: 20, height: 20, borderRadius: '50%', bgcolor: alpha(primary, 0.18), color: primary, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <AppIcon name='Check' fallback={CheckIcon} sx={{ fontSize: 13 }} />
                    </Box>
                    <Typography sx={{ fontSize: '0.95rem', color: 'text.primary', lineHeight: 1.55 }}>{it}</Typography>
                  </Stack>
                ))}
              </Stack>
            </Box>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
}
