import { Box, Container, Grid, Stack, Typography, alpha, useTheme } from '@mui/material';
import LandingGlassIcon from '../../../pages/Landing/sections/LandingGlassIcon';

// Asymmetric grid of features. First feature can be sized larger when `feature` index is provided.
export default function FeatureMosaic({ title, subtitle, features, featuredIndex = null, bg = 'subtle' }) {
  const theme = useTheme();
  const bgcolor = bg === 'tint' ? alpha(theme.palette.text.primary, 0.02) : 'transparent';
  return (
    <Box component="section" sx={{ py: { xs: 5, md: 8 }, bgcolor, borderTop: bg === 'tint' ? `1px solid ${theme.palette.divider}` : 'none', borderBottom: bg === 'tint' ? `1px solid ${theme.palette.divider}` : 'none' }}>
      <Container maxWidth="lg">
        {(title || subtitle) && (
          <Stack spacing={1.5} sx={{ mb: { xs: 4, md: 5 } }}>
            {title && (
              <Typography component="h2" sx={{ fontWeight: 800, fontSize: { xs: '1.6rem', md: '2.2rem' }, color: 'text.primary', letterSpacing: '-0.01em' }}>
                {title}
              </Typography>
            )}
            {subtitle && (
              <Typography sx={{ fontSize: { xs: '1rem', md: '1.1rem' }, color: 'text.secondary', maxWidth: 640 }}>
                {subtitle}
              </Typography>
            )}
          </Stack>
        )}
        <Grid container spacing={{ xs: 2, md: 2.5 }}>
          {features.map((f, i) => {
            const featured = featuredIndex !== null && i === featuredIndex;
            return (
              <Grid key={i} size={{ xs: 12, sm: 6, md: featured ? 6 : 4 }}>
                <Stack
                  direction={featured ? 'column' : 'row'}
                  spacing={2}
                  sx={{
                    height: '100%',
                    p: featured ? 3.5 : 2.75,
                    borderRadius: 3,
                    bgcolor: 'background.paper',
                    border: `1px solid ${theme.palette.divider}`,
                    transition: 'border-color 200ms ease, transform 200ms ease',
                    '&:hover': { borderColor: alpha(theme.palette.primary.main, 0.5), transform: 'translateY(-2px)' },
                  }}
                >
                  <LandingGlassIcon name={f.iconName} size={featured ? 28 : 22} tone="brand" />
                  <Stack spacing={0.75} sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 800, fontSize: featured ? '1.15rem' : '0.98rem', color: 'text.primary' }}>
                      {f.title}
                    </Typography>
                    <Typography sx={{ fontSize: featured ? '0.96rem' : '0.88rem', color: 'text.secondary', lineHeight: 1.6 }}>
                      {f.body}
                    </Typography>
                  </Stack>
                </Stack>
              </Grid>
            );
          })}
        </Grid>
      </Container>
    </Box>
  );
}
