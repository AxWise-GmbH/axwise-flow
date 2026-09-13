import { Box, Chip, Container, Stack, Typography, alpha, useTheme } from '@mui/material';
import HeroAnimatedDemo from './HeroAnimatedDemo';

export default function Hero() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;

  return (
    <Box
      component="section"
      sx={{
        position: 'relative',
        pt: { xs: 12, md: 16 },
        pb: { xs: 8, md: 12 },
        background: `radial-gradient(ellipse at 50% 0%, ${alpha(primary, 0.1)} 0%, transparent 60%)`,
        overflow: { xs: 'visible', md: 'hidden' },
        touchAction: 'pan-y',
      }}
    >
      <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 1 }}>
        <Stack spacing={4} alignItems="center" textAlign="center">
          <Chip
            label="● First 1000 users free · Beta"
            sx={{
              bgcolor: alpha(primary, 0.1),
              color: primary,
              fontWeight: 600,
              borderRadius: 999,
              px: 1.5,
              height: 32,
              border: `1px solid ${alpha(primary, 0.25)}`,
            }}
          />

          <Stack spacing={1.5} alignItems="center">
            <Typography
              variant="h1"
              sx={{
                fontSize: { xs: '2.5rem', sm: '3.5rem', md: '4.5rem' },
                fontWeight: 800,
                lineHeight: 1.05,
                letterSpacing: '-0.02em',
                maxWidth: 980,
                background: `linear-gradient(180deg, ${theme.palette.text.primary} 0%, ${alpha(theme.palette.text.primary, 0.75)} 100%)`,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              AI-Driven Success
            </Typography>

            <Typography
              sx={{
                fontSize: { xs: '1.05rem', md: '1.25rem' },
                color: 'text.secondary',
                maxWidth: 680,
                lineHeight: 1.5,
              }}
            >
              Watch a AI Team build the plan, execute and run the business for you.
            </Typography>
          </Stack>

          <Box sx={{ mt: 4, width: '100%', display: 'flex', justifyContent: 'center' }}>
            <HeroAnimatedDemo />
          </Box>
        </Stack>
      </Container>
    </Box>
  );
}
