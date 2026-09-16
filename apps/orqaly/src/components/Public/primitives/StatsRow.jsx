import { Box, Container, Grid, Stack, Typography, alpha, useTheme } from '@mui/material';

export default function StatsRow({ stats, title, subtitle, bg = 'tint' }) {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const bgcolor = bg === 'tint' ? alpha(primary, 0.04) : 'transparent';
  return (
    <Box component="section" sx={{ py: { xs: 5, md: 7 }, bgcolor, borderTop: bg === 'tint' ? `1px solid ${theme.palette.divider}` : 'none', borderBottom: bg === 'tint' ? `1px solid ${theme.palette.divider}` : 'none' }}>
      <Container maxWidth="lg">
        {(title || subtitle) && (
          <Stack spacing={1.5} sx={{ mb: { xs: 3, md: 5 }, textAlign: 'center' }} alignItems="center">
            {title && (
              <Typography component="h2" sx={{ fontWeight: 800, fontSize: { xs: '1.5rem', md: '2rem' }, color: 'text.primary', letterSpacing: '-0.01em' }}>
                {title}
              </Typography>
            )}
            {subtitle && (
              <Typography sx={{ fontSize: '1rem', color: 'text.secondary', maxWidth: 560 }}>{subtitle}</Typography>
            )}
          </Stack>
        )}
        <Grid container spacing={{ xs: 2, md: 3 }}>
          {stats.map((s, i) => (
            <Grid key={i} size={{ xs: 6, md: 12 / Math.min(stats.length, 4) }}>
              <Stack spacing={0.75} alignItems={{ xs: 'flex-start', md: 'center' }} sx={{ textAlign: { xs: 'left', md: 'center' } }}>
                <Typography sx={{ fontWeight: 800, fontSize: { xs: '2rem', md: '3rem' }, lineHeight: 1.05, color: 'primary.main', letterSpacing: '-0.02em' }}>
                  {s.value}
                </Typography>
                <Typography sx={{ fontWeight: 700, fontSize: '0.92rem', color: 'text.primary' }}>{s.label}</Typography>
                {s.sub && (
                  <Typography sx={{ fontSize: '0.82rem', color: 'text.secondary' }}>{s.sub}</Typography>
                )}
              </Stack>
            </Grid>
          ))}
        </Grid>
      </Container>
    </Box>
  );
}
