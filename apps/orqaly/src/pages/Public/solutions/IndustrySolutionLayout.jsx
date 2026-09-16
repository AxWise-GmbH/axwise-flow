import { Navigate } from 'react-router-dom';
import { Box, Button, Container, Grid, Stack, Typography, alpha, useTheme } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import MarketingCtaButton from '@/components/Public/primitives/MarketingCtaButton';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import PublicShell from '../../../components/Public/PublicShell';
import HeroSplit from '../../../components/Public/primitives/HeroSplit';
import Spotlight from '../../../components/Public/primitives/Spotlight';
import FeatureMosaic from '../../../components/Public/primitives/FeatureMosaic';
import RelatedGrid from '../../../components/Public/primitives/RelatedGrid';
import ClosingCta from '../../../components/Public/primitives/ClosingCta';
import PromptsStrip from '../../../components/Public/primitives/PromptsStrip';
import { DemoGlow, PillarCard } from '../../../components/Public/primitives/MarketingHubPrimitives';
import { PERSONA_BY_SLUG } from '../../../data/personas';
import { getSolutionPageData } from '../../../data/solutions';
import { SOLUTION_VISUALS_BY_SLUG } from '../../../components/Public/demo/solutions/visualRegistry';
import { AgentProfileCard } from './_shared';

import AppIcon from '../../../components/icons/AppIcon';

export default function IndustrySolutionLayout({ slug }) {
  const theme = useTheme();
  const persona = PERSONA_BY_SLUG[slug];
  const data = getSolutionPageData(slug);
  const visuals = SOLUTION_VISUALS_BY_SLUG[slug];

  if (!persona || !data || !visuals) {
    return <Navigate to="/solutions/healthcare" replace />;
  }

  const tryLabel = `Try for ${persona.label.toLowerCase()}`;
  const { hubIntro, pillars, spotlights, mosaicTitle, mosaicSubtitle, mosaicFeatures, closingCta, relatedItems } = data;
  const { Hero, spotlights: SpotlightVisuals } = visuals;

  return (
    <PublicShell>
      <HeroSplit
        eyebrow={`SOLUTIONS · ${persona.label}`}
        title={persona.hero.title}
        subtitle={persona.hero.subtitle}
        ctas={
          <>
            <MarketingCtaButton component={RouterLink} to="/signup" endIcon={<AppIcon name='ArrowForward' fallback={ArrowForwardIcon} />} sx={{ px: 3, py: 1.25 }}>
              {tryLabel}
            </MarketingCtaButton>
            <Button component={RouterLink} to="/contact" variant="outlined" size="large" sx={{ fontWeight: 700, borderRadius: 2, textTransform: 'none', px: 3, py: 1.25 }}>
              Book a walkthrough
            </Button>
          </>
        }
        visual={<Hero />}
        bgVariant="mesh"
      />
      <Box
        component="section"
        sx={{
          py: { xs: 5, md: 8 },
          borderTop: `1px solid ${theme.palette.divider}`,
          bgcolor: alpha(theme.palette.text.primary, 0.02),
        }}
      >
        <Container maxWidth="lg">
          <Stack spacing={1.5} sx={{ mb: 4, maxWidth: 720 }}>
            <Typography sx={{ fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'primary.main' }}>
              {hubIntro.eyebrow}
            </Typography>
            <Typography component="h2" sx={{ fontWeight: 800, fontSize: { xs: '1.6rem', md: '2.2rem' }, lineHeight: 1.15, color: 'text.primary' }}>
              {hubIntro.title}
            </Typography>
            <Typography sx={{ fontSize: { xs: '1rem', md: '1.08rem' }, color: 'text.secondary', lineHeight: 1.7 }}>
              {hubIntro.subtitle}
            </Typography>
          </Stack>
          <Grid container spacing={2.5}>
            {pillars.map((pillar) => (
              <Grid key={pillar.id} size={{ xs: 12, sm: 6 }}>
                <PillarCard pillar={pillar} />
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>
      {spotlights.map((spot, i) => {
        const Visual = SpotlightVisuals[i];
        if (!Visual) return null;
        return (
          <Spotlight
            key={spot.title}
            eyebrow={spot.eyebrow}
            title={spot.title}
            body={spot.body}
            bullets={spot.bullets}
            visual={
              <DemoGlow>
                <Visual />
              </DemoGlow>
            }
            reverse={i % 2 === 1}
            bg={i % 2 === 1 ? 'tint' : 'subtle'}
          />
        );
      })}
      <FeatureMosaic title={mosaicTitle} subtitle={mosaicSubtitle} features={mosaicFeatures} bg="tint" featuredIndex={0} />
      <Box component="section" sx={{ py: { xs: 5, md: 7 } }}>
        <Container maxWidth="lg">
          <Typography component="h2" sx={{ fontWeight: 800, fontSize: { xs: '1.5rem', md: '2rem' }, color: 'text.primary', mb: 3, letterSpacing: '-0.01em' }}>
            Agents you would hire
          </Typography>
          <Grid container spacing={2.5}>
            {persona.agents.map((a) => (
              <Grid key={a.name} size={{ xs: 12, md: 6 }}>
                <AgentProfileCard name={a.name} desc={a.desc} iconName={persona.iconName} />
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>
      <PromptsStrip prompts={persona.prompts} ctaLabel={tryLabel} />
      <RelatedGrid title="Other industries we serve" items={relatedItems} bg="tint" />
      <ClosingCta title={closingCta} />
    </PublicShell>
  );
}
