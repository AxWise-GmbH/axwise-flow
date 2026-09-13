import { Box, Container, Stack, Typography, alpha, useTheme } from '@mui/material';

// Text-led hero where the visual peeks in from the right with a slight overlap.
// Use for surfaces where the visual is the proof (kanban, inbox, listing card).
export default function HeroAsymmetric({ eyebrow, title, subtitle, ctas, visual }) {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  return (
    <Box
      sx={{
        position: 'relative',
        pt: { xs: 6, md: 11 },
        pb: { xs: 6, md: 10 },
        background: `radial-gradient(80% 60% at 80% 30%, ${alpha(primary, 0.1)} 0%, transparent 70%), ${theme.palette.background.default}`,
        borderBottom: `1px solid ${theme.palette.divider}`,
        overflow: 'hidden',
      }}
    >
      <Container maxWidth="lg" sx={{ position: 'relative' }}>
        <Stack spacing={3} sx={{ maxWidth: { xs: '100%', md: 580 } }}>
          {eyebrow && (
            <Typography sx={{ fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'primary.main' }}>
              {eyebrow}
            </Typography>
          )}
          <Typography component="h1" sx={{ fontSize: { xs: '2.1rem', md: '3.25rem' }, fontWeight: 800, lineHeight: 1.05, letterSpacing: '-0.02em', color: 'text.primary' }}>
            {title}
          </Typography>
          {subtitle && (
            <Typography sx={{ fontSize: { xs: '1rem', md: '1.15rem' }, color: 'text.secondary', lineHeight: 1.6, maxWidth: 540 }}>
              {subtitle}
            </Typography>
          )}
          {ctas && <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ pt: 1 }}>{ctas}</Stack>}
        </Stack>
        <Box
          sx={{
            mt: { xs: 5, md: -8 },
            ml: { md: 'auto' },
            mr: { md: -6 },
            position: 'relative',
            zIndex: 1,
            maxWidth: { xs: '100%', md: 560 },
          }}
        >
          {visual}
        </Box>
      </Container>
    </Box>
  );
}
