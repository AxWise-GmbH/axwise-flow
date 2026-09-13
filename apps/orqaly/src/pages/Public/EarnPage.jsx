import { useEffect } from 'react';
import { Box, Button, Grid, Stack, Typography, alpha } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import MarketingCtaButton from '@/components/Public/primitives/MarketingCtaButton';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import PublicShell from '../../components/Public/PublicShell';
import HeroAsymmetric from '../../components/Public/primitives/HeroAsymmetric';
import FeatureMosaic from '../../components/Public/primitives/FeatureMosaic';
import TimelineVertical from '../../components/Public/primitives/TimelineVertical';
import FAQSlice from '../../components/Public/primitives/FAQSlice';
import RelatedGrid from '../../components/Public/primitives/RelatedGrid';
import ClosingCta from '../../components/Public/primitives/ClosingCta';
import {
  EARN_CLOSING_CTA,
  EARN_FAQ,
  EARN_FEATURE_MOSAIC,
  EARN_FEATURE_TILES,
  EARN_HERO,
  EARN_PILLARS,
  EARN_TIMELINE,
} from '../../data/earnEconomy';
import { EARN_PILLAR_MOCKS, EarnOverviewMock } from '../../components/Public/earn/EarnEconomyMocks';

import AppIcon from '../../components/icons/AppIcon';

function PillarSection({ title, body, extra, visual, reverse }) {
  return (
    <Box
      component="section"
      sx={{
        py: { xs: 5, md: 7 },
      }}
    >
      <Box sx={{ maxWidth: 960, mx: 'auto', px: { xs: 2, md: 3 } }}>
        <Grid container spacing={{ xs: 4, md: 6 }} alignItems="center">
          <Grid size={{ xs: 12, md: 6 }} sx={{ order: reverse ? { xs: 1, md: 2 } : undefined }}>
            <Typography sx={{ fontWeight: 800, fontSize: { xs: '1.5rem', md: '2rem' }, color: 'text.primary', mb: 2, letterSpacing: '-0.01em' }}>
              {title}
            </Typography>
            <Typography sx={{ fontSize: '1rem', color: 'text.secondary', lineHeight: 1.7, mb: extra ? 2 : 0 }}>
              {body}
            </Typography>
            {extra && (
              <Typography sx={{ fontSize: '1rem', color: 'text.secondary', lineHeight: 1.7 }}>
                {extra}
              </Typography>
            )}
          </Grid>
          <Grid size={{ xs: 12, md: 6 }} sx={{ order: reverse ? { xs: 2, md: 1 } : undefined }}>
            {visual}
          </Grid>
        </Grid>
      </Box>
    </Box>
  );
}

export default function EarnPage() {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = 'Earn with Orqaly - Orqaly';
    return () => {
      document.title = prevTitle;
    };
  }, []);

  return (
    <PublicShell>
      <HeroAsymmetric
        eyebrow={EARN_HERO.eyebrow}
        title={EARN_HERO.title}
        subtitle={EARN_HERO.subtitle}
        ctas={
          <>
            <MarketingCtaButton component={RouterLink} to="/signup" endIcon={<AppIcon name='ArrowForward' fallback={ArrowForwardIcon} />} sx={{ px: 3, py: 1.25 }}>
              Start contributing
            </MarketingCtaButton>
            <Button component={RouterLink} to="/contact" variant="outlined" size="large" sx={{ fontWeight: 700, borderRadius: 2, textTransform: 'none', px: 3, py: 1.25 }}>
              Join USDT waitlist
            </Button>
          </>
        }
        visual={<EarnOverviewMock />}
      />
      <FeatureMosaic
        title={EARN_FEATURE_MOSAIC.title}
        subtitle={EARN_FEATURE_MOSAIC.subtitle}
        features={EARN_FEATURE_TILES}
        bg="tint"
      />
      {EARN_PILLARS.map((pillar) => {
        const Mock = EARN_PILLAR_MOCKS[pillar.id];
        return (
          <PillarSection
            key={pillar.id}
            title={pillar.title}
            body={pillar.body}
            extra={pillar.extra}
            visual={Mock ? <Mock /> : null}
            reverse={pillar.reverse}
          />
        );
      })}
      <TimelineVertical title={EARN_TIMELINE.title} steps={EARN_TIMELINE.steps} bg="tint" />
      <FAQSlice title="Common questions" items={EARN_FAQ} bg="subtle" />
      <RelatedGrid
        title="Explore the platform"
        items={[
          { label: 'Marketplace', to: '/marketplace-preview', iconName: 'StorefrontRounded', blurb: 'Browse, install, publish - creators keep 85%.' },
          { label: 'Features', to: '/features', iconName: 'AutoAwesomeOutlined', blurb: 'Goals, council, BYOK, and the full stack.' },
          { label: 'How it works', to: '/how-it-works', iconName: 'TimelineOutlined', blurb: 'From goal to deliverable in four steps.' },
        ]}
        bg="tint"
      />
      <ClosingCta title={EARN_CLOSING_CTA} />
    </PublicShell>
  );
}
