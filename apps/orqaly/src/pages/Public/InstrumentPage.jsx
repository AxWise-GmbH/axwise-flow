import { useMemo } from 'react';
import { Navigate, useParams, Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Button,
  Container,
  Grid,
  Stack,
  Typography,
  alpha,
  useTheme,
} from '@mui/material';
import MarketingCtaButton from '@/components/Public/primitives/MarketingCtaButton';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import CheckIcon from '@mui/icons-material/Check';
import LaunchIcon from '@mui/icons-material/Launch';
import PublicShell from '../../components/Public/PublicShell';
import LandingGlassIcon from '../Landing/sections/LandingGlassIcon';
import { createHoverGlowShadow } from '../../theme/hoverGlow';
import { INSTRUMENTS, INSTRUMENTS_BY_GROUP, GROUPS } from '../../data/instruments';
import { LANDING_PASS_VERTICAL_TOUCH_SX } from '../../utils/mobileTouchScroll';

import AppIcon from '../../components/icons/AppIcon';

function InstrumentHero({ item, theme }) {
  const primary = theme.palette.primary.main;
  const groupMeta = GROUPS[item.group];
  return (
    <Box
      sx={{
        position: 'relative',
        pt: { xs: 6, md: 10 },
        pb: { xs: 6, md: 9 },
        bgcolor: alpha(primary, 0.04),
        borderBottom: `1px solid ${theme.palette.divider}`,
        overflow: 'hidden',
        ...LANDING_PASS_VERTICAL_TOUCH_SX,
      }}
    >
      <Container maxWidth="lg">
        <Grid container spacing={{ xs: 4, md: 6 }} alignItems="center">
          <Grid size={{ xs: 12, md: 7 }}>
            <Stack spacing={2.5}>
              <Stack direction="row" alignItems="center" spacing={1}>
                <LandingGlassIcon name={item.iconName} size={20} tone="brand" />
                <Typography
                  sx={{
                    fontSize: '0.78rem',
                    fontWeight: 800,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    color: 'primary.main',
                  }}
                >
                  {groupMeta.eyebrow} · {item.label}
                </Typography>
              </Stack>
              <Typography
                component="h1"
                sx={{
                  fontSize: { xs: '2.1rem', md: '3rem' },
                  fontWeight: 800,
                  lineHeight: 1.1,
                  letterSpacing: '-0.02em',
                  color: 'text.primary',
                }}
              >
                {item.hero.title}
              </Typography>
              <Typography
                sx={{
                  fontSize: { xs: '1rem', md: '1.15rem' },
                  color: 'text.secondary',
                  lineHeight: 1.6,
                  maxWidth: 620,
                }}
              >
                {item.hero.subtitle}
              </Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ pt: 1 }}>
                <MarketingCtaButton
                  component={RouterLink}
                  to="/signup"
                  endIcon={<AppIcon name='ArrowForward' fallback={ArrowForwardIcon} />}
                  sx={{
                    px: 3,
                    py: 1.25,
                    transition: 'box-shadow 220ms ease, transform 220ms ease',
                    '&:hover': {
                      boxShadow: createHoverGlowShadow(theme),
                      transform: 'translateY(-1px)',
                    },
                  }}
                >
                  Get started free
                </MarketingCtaButton>
                {item.inAppRoute && (
                  <Button
                    component={RouterLink}
                    to={item.inAppRoute}
                    variant="outlined"
                    size="large"
                    sx={{ fontWeight: 700, borderRadius: 2, textTransform: 'none', px: 3, py: 1.25 }}
                    endIcon={<AppIcon name='Launch' fallback={LaunchIcon} sx={{ fontSize: 18 }} />}
                  >
                    Open in app
                  </Button>
                )}
              </Stack>
            </Stack>
          </Grid>
          <Grid size={{ xs: 12, md: 5 }}>
            <HeroMock item={item} theme={theme} />
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
}

// Pure CSS mock - illustrative panel, no image files required.
function HeroMock({ item, theme }) {
  const primary = theme.palette.primary.main;
  const isDark = theme.palette.mode === 'dark';
  return (
    <Box
      sx={{
        position: 'relative',
        borderRadius: 4,
        p: { xs: 3, md: 4 },
        bgcolor: isDark ? alpha('#fff', 0.025) : '#fff',
        border: `1px solid ${theme.palette.divider}`,
        boxShadow: `0 18px 48px ${alpha(primary, 0.16)}`,
        backdropFilter: 'saturate(140%) blur(10px)',
        overflow: 'hidden',
        minHeight: 260,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1}>
        <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: alpha(primary, 0.6) }} />
        <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: 'text.secondary', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          {item.label}
        </Typography>
      </Stack>
      {item.useCases.slice(0, 3).map((line, i) => (
        <Stack key={i} direction="row" spacing={1.5} alignItems="flex-start">
          <Box
            sx={{
              mt: '6px',
              width: 8,
              height: 8,
              borderRadius: '50%',
              bgcolor: i === 0 ? primary : alpha(primary, 0.45),
              flexShrink: 0,
            }}
          />
          <Typography sx={{ fontSize: '0.92rem', color: 'text.primary', lineHeight: 1.55 }}>
            {line}
          </Typography>
        </Stack>
      ))}
      <Box sx={{ flex: 1 }} />
      <Box
        sx={{
          height: 6,
          borderRadius: 999,
          bgcolor: alpha(primary, 0.1),
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            bottom: 0,
            width: '68%',
            bgcolor: primary,
            borderRadius: 999,
          }}
        />
      </Box>
    </Box>
  );
}

function DescriptionBlock({ item }) {
  return (
    <Box component="section" sx={{ py: { xs: 5, md: 7 } }}>
      <Container maxWidth="md">
        <Stack spacing={2.5}>
          {item.description.map((p, i) => (
            <Typography key={i} sx={{ fontSize: { xs: '1rem', md: '1.05rem' }, color: 'text.primary', lineHeight: 1.75 }}>
              {p}
            </Typography>
          ))}
        </Stack>
      </Container>
    </Box>
  );
}

function UseCasesBlock({ item, theme }) {
  return (
    <Box component="section" sx={{ py: { xs: 5, md: 7 }, bgcolor: alpha(theme.palette.text.primary, 0.02), borderTop: `1px solid ${theme.palette.divider}`, borderBottom: `1px solid ${theme.palette.divider}` }}>
      <Container maxWidth="md">
        <Typography component="h2" sx={{ fontWeight: 800, fontSize: { xs: '1.5rem', md: '2rem' }, color: 'text.primary', letterSpacing: '-0.01em', mb: 3 }}>
          How it is used
        </Typography>
        <Stack spacing={1.5}>
          {item.useCases.map((u, i) => (
            <Stack key={i} direction="row" spacing={2} alignItems="flex-start">
              <Box
                sx={{
                  mt: '4px',
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  bgcolor: alpha(theme.palette.primary.main, 0.12),
                  color: 'primary.main',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <AppIcon name='Check' fallback={CheckIcon} sx={{ fontSize: 16 }} />
              </Box>
              <Typography sx={{ fontSize: '1.02rem', color: 'text.primary', lineHeight: 1.6 }}>
                {u}
              </Typography>
            </Stack>
          ))}
        </Stack>
      </Container>
    </Box>
  );
}

function AdvantagesBlock({ item, theme }) {
  const primary = theme.palette.primary.main;
  return (
    <Box component="section" sx={{ py: { xs: 5, md: 7 } }}>
      <Container maxWidth="lg">
        <Typography component="h2" sx={{ fontWeight: 800, fontSize: { xs: '1.5rem', md: '2rem' }, color: 'text.primary', letterSpacing: '-0.01em', mb: 3 }}>
          Why it is better
        </Typography>
        <Grid container spacing={2.5}>
          {item.advantages.map((adv, i) => (
            <Grid key={i} size={{ xs: 12, md: 4 }}>
              <Stack
                spacing={1.5}
                sx={{
                  height: '100%',
                  p: 3,
                  borderRadius: 2.5,
                  bgcolor: 'background.paper',
                  border: `1px solid ${theme.palette.divider}`,
                  transition: 'border-color 180ms ease, transform 180ms ease',
                  '&:hover': { borderColor: alpha(primary, 0.45), transform: 'translateY(-2px)' },
                }}
              >
                {adv.vs && (
                  <Box
                    sx={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 0.75,
                      bgcolor: alpha(primary, 0.1),
                      color: 'primary.main',
                      px: 1.25,
                      py: 0.5,
                      borderRadius: 999,
                      fontWeight: 700,
                      fontSize: '0.78rem',
                      width: 'fit-content',
                    }}
                  >
                    vs {adv.vs}
                  </Box>
                )}
                {adv.title && (
                  <Typography sx={{ fontWeight: 800, fontSize: '1.05rem', color: 'text.primary' }}>
                    {adv.title}
                  </Typography>
                )}
                <Typography sx={{ fontSize: '0.94rem', color: 'text.secondary', lineHeight: 1.65 }}>
                  {adv.body}
                </Typography>
              </Stack>
            </Grid>
          ))}
        </Grid>
      </Container>
    </Box>
  );
}

function FeaturesBlock({ item, theme }) {
  return (
    <Box component="section" sx={{ py: { xs: 5, md: 7 }, bgcolor: alpha(theme.palette.text.primary, 0.02), borderTop: `1px solid ${theme.palette.divider}`, borderBottom: `1px solid ${theme.palette.divider}` }}>
      <Container maxWidth="lg">
        <Typography component="h2" sx={{ fontWeight: 800, fontSize: { xs: '1.5rem', md: '2rem' }, color: 'text.primary', letterSpacing: '-0.01em', mb: 3 }}>
          Features
        </Typography>
        <Grid container spacing={2}>
          {item.features.map((f, i) => (
            <Grid key={i} size={{ xs: 12, sm: 6, md: 4 }}>
              <Stack
                direction="row"
                spacing={2}
                sx={{
                  height: '100%',
                  p: 2.5,
                  borderRadius: 2.5,
                  bgcolor: 'background.paper',
                  border: `1px solid ${theme.palette.divider}`,
                  alignItems: 'flex-start',
                }}
              >
                <LandingGlassIcon name={f.iconName} size={22} tone="brand" />
                <Stack spacing={0.5} sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 800, fontSize: '0.98rem', color: 'text.primary' }}>
                    {f.title}
                  </Typography>
                  <Typography sx={{ fontSize: '0.88rem', color: 'text.secondary', lineHeight: 1.55 }}>
                    {f.body}
                  </Typography>
                </Stack>
              </Stack>
            </Grid>
          ))}
        </Grid>
      </Container>
    </Box>
  );
}

function RelatedBlock({ item, theme }) {
  const siblings = INSTRUMENTS_BY_GROUP[item.group]
    .filter((it) => it.slug !== item.slug)
    .slice(0, 3);
  if (!siblings.length) return null;
  return (
    <Box component="section" sx={{ py: { xs: 5, md: 7 } }}>
      <Container maxWidth="lg">
        <Typography component="h2" sx={{ fontWeight: 800, fontSize: { xs: '1.5rem', md: '2rem' }, color: 'text.primary', letterSpacing: '-0.01em', mb: 3 }}>
          Related in {GROUPS[item.group].label}
        </Typography>
        <Grid container spacing={2.5}>
          {siblings.map((s) => (
            <Grid key={s.slug} size={{ xs: 12, md: 4 }}>
              <Box
                component={RouterLink}
                to={`/${s.group === 'instruments' ? 'instruments' : 'control'}/${s.slug}`}
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1.25,
                  p: 2.75,
                  height: '100%',
                  borderRadius: 2.5,
                  textDecoration: 'none',
                  bgcolor: 'background.paper',
                  border: `1px solid ${theme.palette.divider}`,
                  transition: 'border-color 180ms ease, transform 180ms ease',
                  '&:hover': {
                    borderColor: 'primary.main',
                    transform: 'translateY(-2px)',
                  },
                }}
              >
                <LandingGlassIcon name={s.iconName} size={22} tone="brand" />
                <Typography sx={{ fontWeight: 800, fontSize: '1rem', color: 'text.primary' }}>
                  {s.label}
                </Typography>
                <Typography sx={{ fontSize: '0.88rem', color: 'text.secondary', lineHeight: 1.55 }}>
                  {s.hero.title}
                </Typography>
                <Stack direction="row" spacing={0.5} alignItems="center" sx={{ color: 'primary.main', fontSize: '0.82rem', fontWeight: 600, mt: 'auto' }}>
                  Read more <AppIcon name='ArrowForward' fallback={ArrowForwardIcon} sx={{ fontSize: 14 }} />
                </Stack>
              </Box>
            </Grid>
          ))}
        </Grid>
      </Container>
    </Box>
  );
}

function ClosingCta({ theme }) {
  const primary = theme.palette.primary.main;
  return (
    <Box component="section" sx={{ py: { xs: 6, md: 9 } }}>
      <Container maxWidth="md">
        <Stack
          spacing={3}
          alignItems="center"
          textAlign="center"
          sx={{
            p: { xs: 4, md: 6 },
            borderRadius: 4,
            bgcolor: alpha(primary, 0.05),
            border: `1px solid ${alpha(primary, 0.25)}`,
          }}
        >
          <Typography sx={{ fontWeight: 800, fontSize: { xs: '1.6rem', md: '2rem' }, color: 'text.primary', letterSpacing: '-0.01em' }}>
            Want to see it in action?
          </Typography>
          <Typography sx={{ fontSize: '1rem', color: 'text.secondary', maxWidth: 520 }}>
            Sign up free, or have a five-minute call with the team to see if it fits.
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <MarketingCtaButton
              component={RouterLink}
              to="/signup"
              sx={{ px: 3.5 }}
            >
              Try it free
            </MarketingCtaButton>
            <Button
              component={RouterLink}
              to="/contact"
              variant="outlined"
              size="large"
              sx={{ fontWeight: 700, borderRadius: 2, textTransform: 'none', px: 3.5 }}
            >
              Talk to sales
            </Button>
          </Stack>
        </Stack>
      </Container>
    </Box>
  );
}

export default function InstrumentPage({ group: groupProp }) {
  const theme = useTheme();
  const params = useParams();
  const slug = params.slug;

  const item = useMemo(() => {
    if (!slug) return null;
    return INSTRUMENTS.find((it) => it.slug === slug && (!groupProp || it.group === groupProp)) || null;
  }, [slug, groupProp]);

  if (!item) {
    const fallback = groupProp === 'control' ? '/control/agents' : '/instruments/knowledge-base';
    return <Navigate to={fallback} replace />;
  }

  return (
    <PublicShell>
      <InstrumentHero item={item} theme={theme} />
      <DescriptionBlock item={item} />
      <UseCasesBlock item={item} theme={theme} />
      <AdvantagesBlock item={item} theme={theme} />
      <FeaturesBlock item={item} theme={theme} />
      <RelatedBlock item={item} theme={theme} />
      <ClosingCta theme={theme} />
    </PublicShell>
  );
}
