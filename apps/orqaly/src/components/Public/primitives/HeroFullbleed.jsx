import { Box, Container, Stack, Typography, alpha, useTheme } from '@mui/material';

// Big centered headline. Visual sits below as the showcase.
export default function HeroFullbleed({ eyebrow, title, subtitle, ctas, visual }) {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  return (
    <Box
      sx={{
        position: 'relative',
        pt: { xs: 6, md: 12 },
        pb: { xs: 6, md: 8 },
        background: `radial-gradient(60% 50% at 50% 0%, ${alpha(primary, 0.12)} 0%, transparent 70%), ${theme.palette.background.default}`,
        borderBottom: `1px solid ${theme.palette.divider}`,
        overflow: 'hidden',
      }}
    >
      <Container maxWidth="md">
        <Stack spacing={3} alignItems="center" textAlign="center">
          {eyebrow && (
            <Typography sx={{ fontSize: '0.82rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'primary.main' }}>
              {eyebrow}
            </Typography>
          )}
          <Typography
            component="h1"
            sx={{ fontSize: { xs: '2.2rem', md: '3.6rem' }, fontWeight: 800, lineHeight: 1.05, letterSpacing: '-0.025em', color: 'text.primary', maxWidth: 820 }}
          >
            {title}
          </Typography>
          {subtitle && (
            <Typography sx={{ fontSize: { xs: '1.05rem', md: '1.2rem' }, color: 'text.secondary', lineHeight: 1.55, maxWidth: 640 }}>
              {subtitle}
            </Typography>
          )}
          {ctas && <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ pt: 1 }}>{ctas}</Stack>}
        </Stack>
      </Container>
      {visual && (
        <Container maxWidth="lg" sx={{ mt: { xs: 5, md: 8 } }}>
          {visual}
        </Container>
      )}
    </Box>
  );
}
