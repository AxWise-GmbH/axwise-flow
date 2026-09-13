import { Box, Container, Grid, Stack, Typography, alpha, useTheme } from '@mui/material';

export default function HeroSplit({ eyebrow, title, subtitle, ctas, visual, bgVariant = 'subtle' }) {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const bg = {
    subtle: alpha(primary, 0.04),
    mesh: `radial-gradient(circle at 0% 0%, ${alpha(primary, 0.08)} 0%, transparent 40%), radial-gradient(circle at 100% 100%, ${alpha(primary, 0.06)} 0%, transparent 40%), ${theme.palette.background.default}`,
    flat: 'transparent',
  }[bgVariant];
  return (
    <Box
      sx={{
        position: 'relative',
        pt: { xs: 6, md: 10 },
        pb: { xs: 6, md: 9 },
        background: bg,
        borderBottom: `1px solid ${theme.palette.divider}`,
        overflow: 'hidden',
      }}
    >
      <Container maxWidth="lg">
        <Grid container spacing={{ xs: 4, md: 6 }} alignItems="center">
          <Grid size={{ xs: 12, md: 6 }}>
            <Stack spacing={2.5}>
              {eyebrow && (
                <Typography sx={{ fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'primary.main' }}>
                  {eyebrow}
                </Typography>
              )}
              <Typography component="h1" sx={{ fontSize: { xs: '2.1rem', md: '3rem' }, fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.02em', color: 'text.primary' }}>
                {title}
              </Typography>
              {subtitle && (
                <Typography sx={{ fontSize: { xs: '1rem', md: '1.15rem' }, color: 'text.secondary', lineHeight: 1.6, maxWidth: 560 }}>
                  {subtitle}
                </Typography>
              )}
              {ctas && <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ pt: 1 }}>{ctas}</Stack>}
            </Stack>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>{visual}</Grid>
        </Grid>
      </Container>
    </Box>
  );
}
