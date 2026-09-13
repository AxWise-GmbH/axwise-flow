import { Box, Container, Grid, Stack, Typography, alpha, useTheme } from '@mui/material';
import FormatQuoteIcon from '@mui/icons-material/FormatQuote';

import AppIcon from '../../icons/AppIcon';

// Hero that opens with a customer outcome quote.
export default function HeroQuote({ eyebrow, quote, attribution, title, subtitle, ctas, visual }) {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  return (
    <Box
      sx={{
        position: 'relative',
        pt: { xs: 6, md: 10 },
        pb: { xs: 6, md: 9 },
        background: `linear-gradient(180deg, ${alpha(primary, 0.06)} 0%, transparent 80%), ${theme.palette.background.default}`,
        borderBottom: `1px solid ${theme.palette.divider}`,
      }}
    >
      <Container maxWidth="lg">
        <Grid container spacing={{ xs: 4, md: 6 }} alignItems="center">
          <Grid size={{ xs: 12, md: visual ? 7 : 12 }}>
            <Stack spacing={3}>
              {eyebrow && (
                <Typography sx={{ fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'primary.main' }}>
                  {eyebrow}
                </Typography>
              )}
              <Box
                sx={{
                  position: 'relative',
                  pl: { xs: 3, md: 4 },
                  borderLeft: `4px solid ${primary}`,
                }}
              >
                <AppIcon
                  name='FormatQuote'
                  fallback={FormatQuoteIcon}
                  sx={{ position: 'absolute', top: -8, left: -2, fontSize: 28, color: primary, opacity: 0.6, transform: 'scaleX(-1)' }} />
                <Typography
                  component="blockquote"
                  sx={{
                    fontSize: { xs: '1.6rem', md: '2.2rem' },
                    fontWeight: 700,
                    lineHeight: 1.2,
                    letterSpacing: '-0.01em',
                    color: 'text.primary',
                    m: 0,
                  }}
                >
                  {quote}
                </Typography>
                {attribution && (
                  <Typography sx={{ mt: 1.5, fontSize: '0.85rem', color: 'text.secondary', fontWeight: 600 }}>
                    {attribution}
                  </Typography>
                )}
              </Box>
              {title && (
                <Typography
                  component="h1"
                  sx={{ fontSize: { xs: '1.4rem', md: '1.75rem' }, fontWeight: 700, lineHeight: 1.3, color: 'text.primary' }}
                >
                  {title}
                </Typography>
              )}
              {subtitle && (
                <Typography sx={{ fontSize: { xs: '1rem', md: '1.05rem' }, color: 'text.secondary', lineHeight: 1.6, maxWidth: 560 }}>
                  {subtitle}
                </Typography>
              )}
              {ctas && <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ pt: 1 }}>{ctas}</Stack>}
            </Stack>
          </Grid>
          {visual && (
            <Grid size={{ xs: 12, md: 5 }}>
              {visual}
            </Grid>
          )}
        </Grid>
      </Container>
    </Box>
  );
}
