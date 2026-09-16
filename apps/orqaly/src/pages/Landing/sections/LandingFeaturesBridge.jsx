import { Box, Container, Typography, alpha, useMediaQuery, useTheme } from '@mui/material';

const FEATURES_SECTION_ID = 'product';

export function scrollToFeaturesSection({ behavior = 'smooth' } = {}) {
  document.getElementById(FEATURES_SECTION_ID)?.scrollIntoView({ behavior, block: 'start' });
}

export default function LandingFeaturesBridge() {
  const theme = useTheme();
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  const handleClick = () => {
    scrollToFeaturesSection({
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
    });
  };

  return (
    <Box
      component="section"
      id="review-features"
      aria-label="Review platform features"
      sx={{
        py: { xs: 2.5, md: 3 },
        bgcolor: alpha(theme.palette.text.primary, 0.02),
        borderTop: `1px solid ${theme.palette.divider}`,
        borderBottom: `1px solid ${theme.palette.divider}`,
      }}
    >
      <Container maxWidth="lg">
        <Box
          component="button"
          type="button"
          onClick={handleClick}
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            minHeight: 44,
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            p: 0,
            font: 'inherit',
            color: 'primary.main',
            transition: 'opacity 180ms ease',
            '&:hover': { opacity: 0.88 },
            '&:focus-visible': {
              outline: `2px solid ${alpha(theme.palette.primary.main, 0.55)}`,
              outlineOffset: 4,
              borderRadius: 1,
            },
          }}
        >
          <Typography
            component="span"
            sx={{
              fontSize: { xs: '1rem', md: '1.05rem' },
              fontWeight: 700,
              letterSpacing: '-0.01em',
              textDecoration: 'underline',
              textDecorationColor: alpha(theme.palette.primary.main, 0.35),
              textUnderlineOffset: 6,
              '&:hover': {
                textDecorationColor: theme.palette.primary.main,
              },
            }}
          >
            Review Our Features
          </Typography>
        </Box>
      </Container>
    </Box>
  );
}
