import { Box, Button, Container, Grid, Stack, Typography, alpha, useTheme } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { createHoverGlowShadow } from '../../../theme/hoverGlow';
import { HERO, MARKET, BUSINESS_MODEL, ASK, TRACTION } from '../data/investor';
import {
  Eyebrow,
  SectionHeading,
  RaisingPill,
  EmailButton,
  StatsStrip,
  CompetitiveGrid,
  MarketViz,
  MoatChips,
  RoadmapColumns,
  WhyNowSection,
  TractionGrid,
} from '../../Public/investors/investorVisuals';

export default function InvestorBlock() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  return (
    <Box
      component="section"
      sx={{
        py: { xs: 9, md: 14 },
        bgcolor: alpha(theme.palette.text.primary, 0.02),
        borderTop: `1px solid ${theme.palette.divider}`,
        borderBottom: `1px solid ${theme.palette.divider}`,
      }}
    >
      <Container maxWidth="lg">
        <Stack spacing={3} sx={{ mb: { xs: 6, md: 9 }, maxWidth: 860 }}>
          <Eyebrow>{HERO.eyebrow}</Eyebrow>
          <Typography
            component="h2"
            sx={{
              fontWeight: 800,
              fontSize: { xs: '2rem', md: '3rem' },
              lineHeight: 1.1,
              letterSpacing: '-0.02em',
              color: 'text.primary',
            }}
          >
            {HERO.headline}
          </Typography>
          <Typography
            sx={{
              fontSize: { xs: '1rem', md: '1.15rem' },
              color: 'text.secondary',
              lineHeight: 1.6,
              maxWidth: 760,
            }}
          >
            {HERO.subhead}
          </Typography>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={2}
            alignItems={{ xs: 'flex-start', sm: 'center' }}
            sx={{ pt: 1 }}
          >
            <EmailButton />
            <RaisingPill />
          </Stack>
        </Stack>

        <Box sx={{ mb: { xs: 7, md: 10 } }}>
          <StatsStrip />
        </Box>

        <Box sx={{ mb: { xs: 7, md: 10 } }}>
          <WhyNowSection />
        </Box>

        <Box sx={{ mb: { xs: 7, md: 10 } }}>
          <Eyebrow>Where we play</Eyebrow>
          <SectionHeading>How Orqaly compares.</SectionHeading>
          <CompetitiveGrid />
        </Box>

        <Grid
          container
          spacing={{ xs: 4, md: 6 }}
          sx={{ mb: { xs: 7, md: 10 } }}
          alignItems="center"
        >
          <Grid size={{ xs: 12, md: 6 }}>
            <Eyebrow>Market</Eyebrow>
            <SectionHeading>A growing TAM, an undefended layer.</SectionHeading>
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

        <Box sx={{ mb: { xs: 7, md: 10 } }}>
          <Eyebrow>Traction</Eyebrow>
          <SectionHeading>Directional today, deeper under NDA.</SectionHeading>
          <TractionGrid />
        </Box>

        <Box sx={{ mb: { xs: 7, md: 10 } }}>
          <Eyebrow>Moat</Eyebrow>
          <SectionHeading>What makes this hard to copy.</SectionHeading>
          <MoatChips />
        </Box>

        <Grid container spacing={{ xs: 4, md: 6 }} sx={{ mb: { xs: 7, md: 10 } }}>
          <Grid size={{ xs: 12, md: 6 }}>
            <Eyebrow>Business model</Eyebrow>
            <SectionHeading>Three revenue streams.</SectionHeading>
            <Stack spacing={1.5}>
              {BUSINESS_MODEL.streams.map((s) => (
                <Box
                  key={s.title}
                  sx={{
                    p: 2.25,
                    borderRadius: 2,
                    border: `1px solid ${theme.palette.divider}`,
                    bgcolor: 'background.paper',
                  }}
                >
                  <Typography sx={{ fontWeight: 800, fontSize: '0.95rem', color: 'text.primary' }}>
                    {s.title}
                  </Typography>
                  <Typography
                    sx={{ fontSize: '0.88rem', color: 'text.secondary', lineHeight: 1.6 }}
                  >
                    {s.body}
                  </Typography>
                </Box>
              ))}
            </Stack>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <Eyebrow>Operating notes</Eyebrow>
            <SectionHeading>Clean rails, low platform risk.</SectionHeading>
            <Stack component="ul" spacing={1.25} sx={{ pl: 2.5, m: 0 }}>
              {BUSINESS_MODEL.notes.map((n) => (
                <Typography
                  key={n}
                  component="li"
                  sx={{ fontSize: '0.95rem', color: 'text.primary', lineHeight: 1.65 }}
                >
                  {n}
                </Typography>
              ))}
            </Stack>
          </Grid>
        </Grid>

        <Box
          sx={{
            mb: { xs: 7, md: 10 },
            p: { xs: 3, md: 4 },
            borderRadius: 3,
            bgcolor: alpha(primary, 0.05),
            border: `1px solid ${alpha(primary, 0.3)}`,
          }}
        >
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={3}
            alignItems={{ xs: 'flex-start', md: 'center' }}
            justifyContent="space-between"
          >
            <Stack spacing={1.5} sx={{ flex: 1 }}>
              <RaisingPill />
              <Typography
                sx={{
                  fontSize: { xs: '1rem', md: '1.1rem' },
                  color: 'text.primary',
                  lineHeight: 1.6,
                  maxWidth: 640,
                }}
              >
                {ASK.body}
              </Typography>
            </Stack>
            <EmailButton />
          </Stack>
        </Box>

        <Box sx={{ mb: { xs: 7, md: 10 } }}>
          <Eyebrow>Roadmap</Eyebrow>
          <SectionHeading>What we ship next.</SectionHeading>
          <RoadmapColumns />
        </Box>

        <Box
          sx={{
            p: { xs: 3, md: 4 },
            borderRadius: 3,
            border: `1px solid ${theme.palette.divider}`,
            bgcolor: 'background.paper',
            transition: 'box-shadow 220ms ease',
            '&:hover': { boxShadow: createHoverGlowShadow(theme) },
          }}
        >
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={3}
            alignItems={{ xs: 'flex-start', md: 'center' }}
            justifyContent="space-between"
          >
            <Stack spacing={0.75}>
              <Typography
                sx={{
                  fontWeight: 800,
                  fontSize: { xs: '1.2rem', md: '1.4rem' },
                  color: 'text.primary',
                }}
              >
                Want the full picture?
              </Typography>
              <Typography sx={{ fontSize: '0.95rem', color: 'text.secondary', lineHeight: 1.55 }}>
                The investor page goes deeper on each section and answers the questions we hear
                most.
              </Typography>
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <Button
                component={RouterLink}
                to="/investors"
                variant="outlined"
                size="large"
                endIcon={<ArrowForwardIcon />}
                sx={{ fontWeight: 700, borderRadius: 2, textTransform: 'none', px: 2.75, py: 1.25 }}
              >
                Read the investor page
              </Button>
              <EmailButton />
            </Stack>
          </Stack>
        </Box>
      </Container>
    </Box>
  );
}
