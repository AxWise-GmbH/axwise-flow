import { Box, Container, Stack, Typography, alpha, useTheme, useMediaQuery } from '@mui/material';

// Horizontal step flow with a connecting line. Collapses to vertical on xs.
export default function TimelineHorizontal({ title, subtitle, steps, bg = 'subtle' }) {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const bgcolor = bg === 'tint' ? alpha(theme.palette.text.primary, 0.02) : 'transparent';
  return (
    <Box component="section" sx={{ py: { xs: 5, md: 8 }, bgcolor, borderTop: bg === 'tint' ? `1px solid ${theme.palette.divider}` : 'none', borderBottom: bg === 'tint' ? `1px solid ${theme.palette.divider}` : 'none' }}>
      <Container maxWidth="lg">
        {(title || subtitle) && (
          <Stack spacing={1.5} sx={{ mb: { xs: 4, md: 6 }, textAlign: 'center' }} alignItems="center">
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
        <Box sx={{ position: 'relative' }}>
          {isDesktop && (
            <Box
              sx={{
                position: 'absolute',
                top: 28,
                left: '8%',
                right: '8%',
                height: 2,
                background: `linear-gradient(90deg, transparent 0%, ${alpha(primary, 0.5)} 10%, ${alpha(primary, 0.5)} 90%, transparent 100%)`,
                zIndex: 0,
              }}
            />
          )}
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={{ xs: 4, md: 0 }} sx={{ position: 'relative', zIndex: 1 }} alignItems="stretch">
            {steps.map((s, i) => (
              <Stack key={i} alignItems="center" textAlign="center" sx={{ flex: 1, px: 1.5 }} spacing={1.5}>
                <Box
                  sx={{
                    width: 56,
                    height: 56,
                    borderRadius: '50%',
                    background: `linear-gradient(135deg, ${primary} 0%, ${alpha(primary, 0.7)} 100%)`,
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: '1.05rem',
                    boxShadow: `0 0 0 6px ${theme.palette.background.default}, 0 0 0 7px ${alpha(primary, 0.25)}`,
                  }}
                >
                  {s.n || `0${i + 1}`}
                </Box>
                <Typography sx={{ fontWeight: 800, fontSize: { xs: '1.05rem', md: '1.15rem' }, color: 'text.primary' }}>
                  {s.title}
                </Typography>
                <Typography sx={{ fontSize: '0.92rem', color: 'text.secondary', lineHeight: 1.55, maxWidth: 240 }}>
                  {s.body}
                </Typography>
              </Stack>
            ))}
          </Stack>
        </Box>
      </Container>
    </Box>
  );
}
