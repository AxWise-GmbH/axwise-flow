import { useEffect } from 'react';
import { Box, Container, Grid, Stack, Typography, alpha, useTheme, Accordion, AccordionSummary, AccordionDetails } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PublicShell from '../../components/Public/PublicShell';
import HeroAsymmetric from '../../components/Public/primitives/HeroAsymmetric';
import Spotlight from '../../components/Public/primitives/Spotlight';
import DemoInvestorStack from '../../components/Public/demo/DemoInvestorStack';
import DemoConsilium from '../../components/Public/demo/DemoConsilium';
import DemoMarketplace from '../../components/Public/demo/DemoMarketplace';
import {
  HERO,
  MARKET,
  ASK,
  INVESTOR_FAQ,
  PRODUCT_SPOTLIGHTS,
} from '../Landing/data/investor';
import {
  Eyebrow,
  SectionHeading,
  RaisingPill,
  EmailButton,
  CompetitiveGrid,
  MarketViz,
  MoatChips,
  RoadmapColumns,
  WhyNowSection,
  TractionGrid,
  RevenueStreamsMock,
  BusinessModelNotes,
  ChannelRowMock,
} from './investors/investorVisuals';

import AppIcon from '../../components/icons/AppIcon';

function SectionShell({ children, tinted = false }) {
  const theme = useTheme();
  return (
    <Box
      component="section"
      sx={{
        py: { xs: 5, md: 7 },
        bgcolor: tinted ? alpha(theme.palette.text.primary, 0.02) : 'transparent',
        borderTop: tinted ? `1px solid ${theme.palette.divider}` : 'none',
        borderBottom: tinted ? `1px solid ${theme.palette.divider}` : 'none',
      }}
    >
      <Container maxWidth="lg">{children}</Container>
    </Box>
  );
}

export default function Investors() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;

  useEffect(() => {
    const prevTitle = document.title;
    document.title = 'For investors - Orqaly';
    return () => {
      document.title = prevTitle;
    };
  }, []);

  return (
    <PublicShell>
      <HeroAsymmetric
        eyebrow={HERO.eyebrow}
        title={HERO.headline}
        subtitle={HERO.subhead}
        ctas={
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'flex-start', sm: 'center' }}>
            <EmailButton />
            <RaisingPill />
          </Stack>
        }
        visual={<DemoInvestorStack />}
      />
      <SectionShell>
        <WhyNowSection />
      </SectionShell>
      <Box component="section">
        {PRODUCT_SPOTLIGHTS.map((spot, i) => (
          <Spotlight
            key={spot.title}
            eyebrow={spot.eyebrow}
            title={spot.title}
            body={spot.body}
            visual={i === 0 ? <DemoConsilium /> : i === 1 ? <DemoMarketplace /> : <ChannelRowMock />}
            reverse={i % 2 === 1}
            bg={i % 2 === 0 ? 'tint' : 'subtle'}
          />
        ))}
      </Box>
      <SectionShell tinted>
        <Eyebrow>Where we play</Eyebrow>
        <SectionHeading component="h2">How Orqaly compares.</SectionHeading>
        <CompetitiveGrid />
      </SectionShell>
      <SectionShell>
        <Grid container spacing={{ xs: 4, md: 6 }} alignItems="center">
          <Grid size={{ xs: 12, md: 6 }}>
            <Eyebrow>Market</Eyebrow>
            <SectionHeading component="h2">A growing TAM, an undefended layer.</SectionHeading>
            <MarketViz />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <Typography sx={{ fontSize: '1rem', color: 'text.primary', lineHeight: 1.7, mb: 2 }}>
              {MARKET.blurb}
            </Typography>
            <Typography sx={{ fontSize: '0.8rem', color: 'text.disabled', lineHeight: 1.55 }}>
              {MARKET.citation}
            </Typography>
          </Grid>
        </Grid>
      </SectionShell>
      <SectionShell tinted>
        <Grid container spacing={{ xs: 4, md: 6 }} alignItems="flex-start">
          <Grid size={{ xs: 12, md: 6 }}>
            <Eyebrow>Business model</Eyebrow>
            <SectionHeading component="h2">Three revenue streams.</SectionHeading>
            <RevenueStreamsMock />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <Eyebrow>Operating notes</Eyebrow>
            <SectionHeading component="h2">Clean rails, low platform risk.</SectionHeading>
            <BusinessModelNotes />
          </Grid>
        </Grid>
      </SectionShell>
      <SectionShell>
        <Eyebrow>Moat</Eyebrow>
        <SectionHeading component="h2">What makes this hard to copy.</SectionHeading>
        <MoatChips />
      </SectionShell>
      <SectionShell tinted>
        <Eyebrow>Traction</Eyebrow>
        <SectionHeading component="h2">Directional today, deeper under NDA.</SectionHeading>
        <TractionGrid />
      </SectionShell>
      <SectionShell>
        <Eyebrow>The round</Eyebrow>
        <SectionHeading component="h2">Currently raising.</SectionHeading>
        <Box
          sx={{
            p: { xs: 3, md: 4 },
            borderRadius: 3,
            bgcolor: alpha(primary, 0.06),
            border: `1px solid ${alpha(primary, 0.3)}`,
          }}
        >
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} alignItems={{ xs: 'flex-start', md: 'center' }} justifyContent="space-between">
            <Stack spacing={1.5} sx={{ flex: 1 }}>
              <RaisingPill />
              <Typography sx={{ fontSize: { xs: '1rem', md: '1.1rem' }, color: 'text.primary', lineHeight: 1.65, maxWidth: 640 }}>
                {ASK.body}
              </Typography>
            </Stack>
            <EmailButton />
          </Stack>
        </Box>
      </SectionShell>
      <SectionShell tinted>
        <Eyebrow>Roadmap</Eyebrow>
        <SectionHeading component="h2">What we ship next.</SectionHeading>
        <RoadmapColumns />
      </SectionShell>
      <SectionShell>
        <SectionHeading component="h2">Frequently asked by investors</SectionHeading>
        {INVESTOR_FAQ.map((f, i) => (
          <Accordion
            key={i}
            elevation={0}
            sx={{
              bgcolor: 'transparent',
              '&:before': { display: 'none' },
              borderBottom: `1px solid ${theme.palette.divider}`,
            }}
          >
            <AccordionSummary expandIcon={<AppIcon name='ExpandMore' fallback={ExpandMoreIcon} />} sx={{ px: 0 }}>
              <Typography sx={{ fontWeight: 700, fontSize: '1rem', color: 'text.primary' }}>{f.q}</Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ px: 0, pb: 2 }}>
              <Typography sx={{ color: 'text.secondary', lineHeight: 1.7 }}>{f.a}</Typography>
            </AccordionDetails>
          </Accordion>
        ))}
      </SectionShell>
      <Box sx={{ py: { xs: 5, md: 7 }, textAlign: 'center', borderTop: `1px solid ${theme.palette.divider}` }}>
        <Container maxWidth="sm">
          <Stack spacing={2.5} alignItems="center">
            <Typography sx={{ fontWeight: 800, fontSize: { xs: '1.4rem', md: '1.75rem' }, color: 'text.primary' }}>
              Reach out for the deeper conversation.
            </Typography>
            <Typography sx={{ color: 'text.secondary', fontSize: '0.95rem' }}>
              Round details, cap table, and the data room are shared after a 15-minute intro.
            </Typography>
            <EmailButton />
          </Stack>
        </Container>
      </Box>
    </PublicShell>
  );
}
