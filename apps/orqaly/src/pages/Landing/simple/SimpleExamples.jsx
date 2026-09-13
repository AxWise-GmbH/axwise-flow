import { Box, Container, Grid, Stack, Typography, alpha, useTheme } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { PERSONA_BY_SLUG } from '../../../data/personas';
import LandingGlassIcon from '../sections/LandingGlassIcon';
import Reveal from '../../../components/Common/Reveal';

const EXAMPLE_SLUGS = ['ecommerce', 'restaurants', 'legal'];

function ExampleCard({ slug }) {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const persona = PERSONA_BY_SLUG[slug];
  if (!persona) return null;

  return (
    <Box
      component={RouterLink}
      to={`/solutions/${slug}`}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5,
        height: '100%',
        p: 2.5,
        borderRadius: 3,
        textDecoration: 'none',
        bgcolor: 'background.paper',
        border: `1px solid ${theme.palette.divider}`,
        transition: 'border-color 200ms ease, transform 200ms ease, box-shadow 200ms ease',
        '&:hover': {
          borderColor: alpha(primary, 0.45),
          transform: 'translateY(-3px)',
          boxShadow: `0 10px 24px ${alpha(primary, 0.12)}`,
        },
        '&:active': { transform: 'scale(0.98)' },
      }}
    >
      <LandingGlassIcon name={persona.iconName} size={22} tone="brand" />
      <Typography sx={{ fontWeight: 800, fontSize: '0.72rem', letterSpacing: '0.08em', color: primary, textTransform: 'uppercase' }}>
        {persona.label}
      </Typography>
      <Typography sx={{ fontWeight: 700, fontSize: '1.05rem', color: 'text.primary', lineHeight: 1.3 }}>
        {persona.teaser.headline}
      </Typography>
      <Typography sx={{ fontSize: '0.88rem', color: 'text.secondary', lineHeight: 1.5, flex: 1 }}>
        {persona.teaser.desc}
      </Typography>
      <Stack direction="row" alignItems="center" spacing={0.5} sx={{ color: primary, fontWeight: 700, fontSize: '0.82rem' }}>
        See example <ArrowForwardIcon sx={{ fontSize: 16 }} />
      </Stack>
    </Box>
  );
}

export default function SimpleExamples() {
  return (
    <Box component="section" sx={{ py: { xs: 6, md: 9 } }}>
      <Container maxWidth="md">
        <Reveal>
          <Typography
            sx={{
              textAlign: 'center',
              fontSize: { xs: '1.5rem', md: '1.85rem' },
              fontWeight: 800,
              color: 'text.primary',
              mb: { xs: 4, md: 6 },
            }}
          >
            See it in action
          </Typography>
        </Reveal>

        <Grid container spacing={2.5}>
          {EXAMPLE_SLUGS.map((slug, idx) => (
            <Grid key={slug} size={{ xs: 12, sm: 4 }}>
              <Reveal delay={idx * 120} sx={{ height: '100%' }}>
                <ExampleCard slug={slug} />
              </Reveal>
            </Grid>
          ))}
        </Grid>
      </Container>
    </Box>
  );
}
