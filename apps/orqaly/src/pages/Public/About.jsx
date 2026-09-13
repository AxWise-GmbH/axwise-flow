import { useEffect } from 'react';
import { Box, Button, Container, Grid, Stack, Typography, alpha, useTheme } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import MarketingCtaButton from '@/components/Public/primitives/MarketingCtaButton';
import PublicShell from '../../components/Public/PublicShell';
import HeroAsymmetric from '../../components/Public/primitives/HeroAsymmetric';
import StatsRow from '../../components/Public/primitives/StatsRow';
import ClosingCta from '../../components/Public/primitives/ClosingCta';
import DemoAbout from '../../components/Public/demo/DemoAbout';
import { ABOUT_MISSION_DEMO, ABOUT_PILLAR_DEMOS } from '../../components/Public/about/AboutVisuals';
import {
  HERO,
  MISSION,
  PILLARS,
  PILLARS_INTRO,
  ROADMAP,
  ROADMAP_INTRO,
  TRACTION,
  TRACTION_TITLE,
  VALUES,
  VALUES_INTRO,
} from '../../data/about';

import AppIcon from '../../components/icons/AppIcon';

function DemoGlow({ children, theme }) {
  const primary = theme.palette.primary.main;
  return (
    <Box
      sx={{
        position: 'relative',
        minWidth: 0,
        '&::before': {
          content: '""',
          position: 'absolute',
          inset: -20,
          background: `radial-gradient(ellipse at center, ${alpha(primary, 0.16)} 0%, transparent 65%)`,
          filter: 'blur(24px)',
          zIndex: 0,
          pointerEvents: 'none',
        },
      }}
    >
      <Box sx={{ position: 'relative', zIndex: 1 }}>{children}</Box>
    </Box>
  );
}

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

function AboutSplitSection({
  title,
  body,
  extra,
  tagline,
  cta,
  to,
  visual,
  reverse,
  visualFirstOnMobile = false,
  noSectionPadding = false,
}) {
  const theme = useTheme();
  return (
    <Box component="section" sx={{ py: noSectionPadding ? 0 : { xs: 5, md: 7 } }}>
      <Container maxWidth="lg">
        <Grid
          container
          spacing={{ xs: 4, md: 6 }}
          alignItems="center"
          direction={reverse ? { xs: 'column', md: 'row-reverse' } : 'row'}
        >
          <Grid
            size={{ xs: 12, md: 6 }}
            sx={{
              order: visualFirstOnMobile ? { xs: 2, md: 'unset' } : undefined,
            }}
          >
            <Stack spacing={2}>
              <Typography
                component="h2"
                sx={{
                  fontWeight: 800,
                  fontSize: { xs: '1.5rem', md: '2rem' },
                  color: 'text.primary',
                  letterSpacing: '-0.01em',
                  lineHeight: 1.2,
                }}
              >
                {title}
              </Typography>
              {body && (
                <Typography sx={{ fontSize: { xs: '1rem', md: '1.05rem' }, color: 'text.secondary', lineHeight: 1.7 }}>
                  {body}
                </Typography>
              )}
              {extra && (
                <Typography sx={{ fontSize: { xs: '1rem', md: '1.05rem' }, color: 'text.secondary', lineHeight: 1.7 }}>
                  {extra}
                </Typography>
              )}
              {tagline && (
                <Typography
                  sx={{
                    fontSize: '0.95rem',
                    color: 'text.secondary',
                    fontWeight: 600,
                    fontStyle: 'italic',
                    lineHeight: 1.6,
                  }}
                >
                  {tagline}
                </Typography>
              )}
              {cta && to && (
                <Stack direction="row" alignItems="center" spacing={0.5} sx={{ pt: 0.5 }}>
                  <Button
                    component={RouterLink}
                    to={to}
                    endIcon={<AppIcon name='ArrowForward' fallback={ArrowForwardIcon} sx={{ fontSize: 16 }} />}
                    sx={{
                      fontWeight: 700,
                      fontSize: '0.9rem',
                      textTransform: 'none',
                      px: 0,
                      color: 'primary.main',
                      '&:hover': { bgcolor: 'transparent', textDecoration: 'underline' },
                    }}
                  >
                    {cta}
                  </Button>
                </Stack>
              )}
            </Stack>
          </Grid>
          <Grid
            size={{ xs: 12, md: 6 }}
            sx={{
              order: visualFirstOnMobile ? { xs: 1, md: 'unset' } : undefined,
            }}
          >
            <DemoGlow theme={theme}>{visual}</DemoGlow>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
}

function ValueCard({ value, theme }) {
  const primary = theme.palette.primary.main;
  return (
    <Stack
      spacing={1.5}
      sx={{
        height: '100%',
        p: { xs: 3, md: 3.5 },
        borderRadius: 3,
        bgcolor: 'background.paper',
        border: `1px solid ${theme.palette.divider}`,
        transition: 'border-color 200ms ease',
        '&:hover': { borderColor: alpha(primary, 0.4) },
      }}
    >
      <Typography sx={{ fontWeight: 800, fontSize: '1.1rem', color: 'text.primary' }}>
        {value.title}
      </Typography>
      <Typography sx={{ fontSize: '0.95rem', color: 'text.secondary', lineHeight: 1.65 }}>
        {value.body}
      </Typography>
      <Box sx={{ mt: 1, pt: 1.5, borderTop: `1px dashed ${theme.palette.divider}` }}>
        <Typography
          sx={{
            fontWeight: 700,
            fontSize: '0.72rem',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'primary.main',
            mb: 0.5,
          }}
        >
          In practice
        </Typography>
        <Typography sx={{ fontSize: '0.88rem', color: 'text.primary', lineHeight: 1.55 }}>
          {value.inPractice}
        </Typography>
      </Box>
    </Stack>
  );
}

function RoadmapColumns({ theme }) {
  const primary = theme.palette.primary.main;
  return (
    <Grid container spacing={2.5}>
      {ROADMAP.map((col) => (
        <Grid key={col.period} size={{ xs: 12, md: 4 }}>
          <Stack
            spacing={1.5}
            sx={{
              height: '100%',
              p: 2.75,
              borderRadius: 2.5,
              bgcolor: 'background.paper',
              border: `1px solid ${theme.palette.divider}`,
              borderLeft: `3px solid ${primary}`,
            }}
          >
            <ChipPeriod label={col.period} />
            <Stack component="ul" spacing={1} sx={{ pl: 2.5, m: 0 }}>
              {col.items.map((item) => (
                <Typography
                  key={item}
                  component="li"
                  sx={{ fontSize: '0.9rem', color: 'text.primary', lineHeight: 1.55 }}
                >
                  {item}
                </Typography>
              ))}
            </Stack>
          </Stack>
        </Grid>
      ))}
    </Grid>
  );
}

function ChipPeriod({ label }) {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  return (
    <Typography
      sx={{
        display: 'inline-flex',
        alignSelf: 'flex-start',
        fontWeight: 800,
        fontSize: '0.72rem',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'primary.main',
        px: 1.25,
        py: 0.5,
        borderRadius: 999,
        bgcolor: alpha(primary, 0.1),
        border: `1px solid ${alpha(primary, 0.25)}`,
      }}
    >
      {label}
    </Typography>
  );
}

export default function About() {
  const theme = useTheme();
  const MissionDemo = ABOUT_MISSION_DEMO;

  useEffect(() => {
    const prevTitle = document.title;
    document.title = 'About Orqaly - Orqaly';
    return () => {
      document.title = prevTitle;
    };
  }, []);

  return (
    <PublicShell>
      <HeroAsymmetric
        eyebrow={HERO.eyebrow}
        title={HERO.title}
        subtitle={HERO.subtitle}
        ctas={
          <>
            <MarketingCtaButton
              component={RouterLink}
              to="/signup"
              endIcon={<AppIcon name='ArrowForward' fallback={ArrowForwardIcon} />}
              sx={{ px: 3, py: 1.25 }}
            >
              Get started
            </MarketingCtaButton>
            <Button
              component={RouterLink}
              to="/contact"
              variant="outlined"
              size="large"
              sx={{ fontWeight: 700, borderRadius: 2, textTransform: 'none', px: 3, py: 1.25 }}
            >
              Contact us
            </Button>
          </>
        }
        visual={<DemoAbout />}
      />
      <SectionShell tinted>
        <AboutSplitSection
          title={MISSION.title}
          body={MISSION.paragraphs[0]}
          extra={MISSION.paragraphs[1]}
          tagline={MISSION.tagline}
          visual={<MissionDemo />}
          reverse={false}
          visualFirstOnMobile
          noSectionPadding
        />
      </SectionShell>
      <Box
        component="section"
        sx={{
          py: { xs: 5, md: 6 },
          borderBottom: `1px solid ${theme.palette.divider}`,
        }}
      >
        <Container maxWidth="lg">
          <Stack spacing={1.5} alignItems="center" textAlign="center" sx={{ mb: { xs: 2, md: 4 } }}>
            <Typography
              component="h2"
              sx={{
                fontSize: { xs: '1.5rem', md: '2rem' },
                fontWeight: 800,
                color: 'text.primary',
                letterSpacing: '-0.01em',
              }}
            >
              What we&apos;re building
            </Typography>
            <Typography sx={{ fontSize: '1rem', color: 'text.secondary', maxWidth: 560, lineHeight: 1.65 }}>
              {PILLARS_INTRO}
            </Typography>
          </Stack>
        </Container>
      </Box>
      {PILLARS.map((pillar) => {
        const Demo = ABOUT_PILLAR_DEMOS[pillar.demoId];
        return (
          <AboutSplitSection
            key={pillar.title}
            title={pillar.title}
            body={pillar.body}
            cta={pillar.cta}
            to={pillar.to}
            visual={Demo ? <Demo /> : null}
            reverse={pillar.reverse}
          />
        );
      })}
      <SectionShell tinted>
        <Typography
          component="h2"
          sx={{
            fontSize: { xs: '1.5rem', md: '1.9rem' },
            fontWeight: 800,
            color: 'text.primary',
            mb: 1,
            letterSpacing: '-0.01em',
          }}
        >
          What&apos;s next
        </Typography>
        <Typography sx={{ fontSize: '1rem', color: 'text.secondary', lineHeight: 1.65, mb: 3, maxWidth: 640 }}>
          {ROADMAP_INTRO}
        </Typography>
        <RoadmapColumns theme={theme} />
      </SectionShell>
      <SectionShell tinted>
        <Typography
          component="h2"
          sx={{
            fontSize: { xs: '1.5rem', md: '1.9rem' },
            fontWeight: 800,
            color: 'text.primary',
            mb: 1,
            letterSpacing: '-0.01em',
          }}
        >
          What we will never compromise
        </Typography>
        <Typography sx={{ fontSize: '1rem', color: 'text.secondary', lineHeight: 1.65, mb: 3, maxWidth: 640 }}>
          {VALUES_INTRO}
        </Typography>
        <Grid container spacing={2.5}>
          {VALUES.map((v) => (
            <Grid key={v.title} size={{ xs: 12, md: 6 }}>
              <ValueCard value={v} theme={theme} />
            </Grid>
          ))}
        </Grid>
      </SectionShell>
      <StatsRow stats={TRACTION} title={TRACTION_TITLE} bg="tint" />
      <ClosingCta
        title="Talk to the founders."
        body="If you want to understand what we are building or just say hello, we read every message."
        primary={{ label: 'Email us', to: 'mailto:hello@orqaly.com' }}
        secondary={{ label: 'Open contact form', to: '/contact' }}
      />
    </PublicShell>
  );
}
