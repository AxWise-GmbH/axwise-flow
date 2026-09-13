import { useEffect } from 'react';
import { Box, Button, Container, Grid, Stack, Typography, alpha, useTheme } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import VpnKeyOutlinedIcon from '@mui/icons-material/VpnKeyOutlined';
import StorageOutlinedIcon from '@mui/icons-material/StorageOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';
import MarketingCtaButton from '@/components/Public/primitives/MarketingCtaButton';
import PublicShell from '../../components/Public/PublicShell';
import HeroAsymmetric from '../../components/Public/primitives/HeroAsymmetric';
import StatsRow from '../../components/Public/primitives/StatsRow';
import DemoSecurityStack from '../../components/Public/demo/DemoSecurityStack';
import LandingGlassIcon from '../Landing/sections/LandingGlassIcon';
import { CATEGORIES, PROVIDERS } from '../../data/providerCatalog';
import { createHoverGlowShadow } from '../../theme/hoverGlow';
import {
  HERO,
  TRUST_STATS,
  PILLARS,
  PILLARS_INTRO,
  OPERATED_STACK,
  INTEGRATIONS_INTRO,
  ACCESS_CONTROLS,
  COMPLIANCE,
  DISCLOSURE,
} from '../../data/security';

import AppIcon from '../../components/icons/AppIcon';

const PILLAR_ICON_FALLBACKS = {
  LockOutlined: LockOutlinedIcon,
  ShieldOutlined: ShieldOutlinedIcon,
  VpnKeyOutlined: VpnKeyOutlinedIcon,
  StorageOutlined: StorageOutlinedIcon,
  VisibilityOutlined: VisibilityOutlinedIcon,
  VerifiedUserOutlined: VerifiedUserOutlinedIcon,
};

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

function PillarCard({ pillar, theme }) {
  const primary = theme.palette.primary.main;
  const Fallback = PILLAR_ICON_FALLBACKS[pillar.iconName];
  return (
    <Stack
      spacing={1.5}
      sx={{
        height: '100%',
        p: { xs: 2.5, md: 3 },
        borderRadius: 3,
        bgcolor: 'background.paper',
        border: `1px solid ${theme.palette.divider}`,
        transition: 'border-color 180ms ease, transform 180ms ease, box-shadow 180ms ease',
        '&:hover': {
          borderColor: alpha(primary, 0.45),
          transform: 'translateY(-2px)',
          boxShadow: createHoverGlowShadow(theme),
        },
      }}
    >
      <LandingGlassIcon name={pillar.iconName} fallback={Fallback} size={26} tone="brand" />
      <Typography sx={{ fontWeight: 800, fontSize: '1rem', color: 'text.primary', lineHeight: 1.3 }}>
        {pillar.title}
      </Typography>
      <Typography sx={{ fontSize: '0.9rem', color: 'text.secondary', lineHeight: 1.6, flex: 1 }}>
        {pillar.body}
      </Typography>
    </Stack>
  );
}

function StackCategory({ category, items }) {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  return (
    <Box
      sx={{
        p: { xs: 2, md: 2.5 },
        borderRadius: 3,
        bgcolor: 'background.paper',
        border: `1px solid ${theme.palette.divider}`,
        height: '100%',
      }}
    >
      <Typography
        sx={{
          fontWeight: 800,
          fontSize: '0.95rem',
          color: 'text.primary',
          mb: 1.5,
          pb: 1,
          borderBottom: `1px solid ${theme.palette.divider}`,
        }}
      >
        {category}
      </Typography>
      <Stack spacing={1.25}>
        {items.map(({ name, detail }) => (
          <Stack key={name} direction="row" spacing={1.5} alignItems="flex-start">
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                bgcolor: primary,
                mt: 0.65,
                flexShrink: 0,
              }}
            />
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontWeight: 700, fontSize: '0.88rem', color: 'text.primary' }}>
                {name}
              </Typography>
              <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', lineHeight: 1.5 }}>
                {detail}
              </Typography>
            </Box>
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}

function IntegrationCategory({ category, providers }) {
  const theme = useTheme();
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography
        sx={{
          fontWeight: 800,
          fontSize: '0.82rem',
          color: 'text.primary',
          mb: 0.75,
        }}
      >
        {category.label}
      </Typography>
      <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mb: 1, lineHeight: 1.45 }}>
        {category.description}
      </Typography>
      <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
        {providers.map((p) => (
          <Box
            key={p.id}
            component="span"
            sx={{
              display: 'inline-flex',
              px: 1,
              py: 0.4,
              borderRadius: 1,
              fontSize: '0.72rem',
              fontWeight: 600,
              color: 'text.secondary',
              bgcolor: alpha(theme.palette.text.primary, 0.05),
              border: `1px solid ${theme.palette.divider}`,
            }}
          >
            {p.label}
          </Box>
        ))}
      </Stack>
    </Box>
  );
}

export default function SecurityPage() {
  const theme = useTheme();

  useEffect(() => {
    const prevTitle = document.title;
    document.title = 'Security - Orqaly';
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
              to="/contact"
              endIcon={<AppIcon name='ArrowForward' fallback={ArrowForwardIcon} />}
              sx={{ px: 3, py: 1.25 }}
            >
              Talk to security
            </MarketingCtaButton>
            <Button
              component={RouterLink}
              to="/privacy"
              variant="outlined"
              size="large"
              sx={{ fontWeight: 700, borderRadius: 2, textTransform: 'none', px: 3, py: 1.25 }}
            >
              Privacy policy
            </Button>
          </>
        }
        visual={<DemoSecurityStack />}
      />
      <StatsRow stats={TRUST_STATS} bg="tint" />
      <SectionShell>
        <Stack spacing={1.5} sx={{ mb: { xs: 3, md: 4 } }}>
          <Typography
            component="h2"
            sx={{
              fontSize: { xs: '1.5rem', md: '1.9rem' },
              fontWeight: 800,
              color: 'text.primary',
              letterSpacing: '-0.01em',
            }}
          >
            How we protect your workspace
          </Typography>
          <Typography sx={{ fontSize: '1rem', color: 'text.secondary', maxWidth: 640, lineHeight: 1.65 }}>
            {PILLARS_INTRO}
          </Typography>
        </Stack>
        <Grid container spacing={2.5}>
          {PILLARS.map((pillar) => (
            <Grid key={pillar.title} size={{ xs: 12, sm: 6, md: 4 }}>
              <PillarCard pillar={pillar} theme={theme} />
            </Grid>
          ))}
        </Grid>
      </SectionShell>
      <SectionShell tinted>
        <Stack spacing={1.5} alignItems="center" textAlign="center" sx={{ mb: { xs: 4, md: 5 } }}>
          <Typography
            component="h2"
            sx={{
              fontSize: { xs: '1.5rem', md: '2rem' },
              fontWeight: 800,
              color: 'text.primary',
              letterSpacing: '-0.01em',
            }}
          >
            Technology we run on
          </Typography>
          <Typography sx={{ fontSize: '1rem', color: 'text.secondary', maxWidth: 620, lineHeight: 1.65 }}>
            Transparent stack for security reviews and procurement - no hidden subprocessors in the core path.
          </Typography>
        </Stack>
        <Grid container spacing={2.5}>
          {OPERATED_STACK.map((group) => (
            <Grid key={group.category} size={{ xs: 12, sm: 6, lg: 4 }}>
              <StackCategory category={group.category} items={group.items} />
            </Grid>
          ))}
        </Grid>
      </SectionShell>
      <SectionShell>
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
          BYOK integrations catalog
        </Typography>
        <Typography sx={{ fontSize: '1rem', color: 'text.secondary', lineHeight: 1.65, mb: 1, maxWidth: 720 }}>
          {INTEGRATIONS_INTRO}
        </Typography>
        <Typography
          sx={{
            fontSize: '0.85rem',
            fontWeight: 700,
            color: 'primary.main',
            mb: 3,
          }}
        >
          {PROVIDERS.length}+ providers across {CATEGORIES.length} categories
        </Typography>
        <Grid container spacing={{ xs: 3, md: 4 }}>
          {CATEGORIES.map((cat) => {
            const providers = PROVIDERS.filter((p) => p.category === cat.id);
            if (!providers.length) return null;
            return (
              <Grid key={cat.id} size={{ xs: 12, sm: 6, md: 4 }}>
                <IntegrationCategory category={cat} providers={providers} />
              </Grid>
            );
          })}
        </Grid>
      </SectionShell>
      <SectionShell tinted>
        <Grid container spacing={{ xs: 4, md: 6 }}>
          <Grid size={{ xs: 12, md: 6 }}>
            <Typography
              component="h2"
              sx={{
                fontSize: { xs: '1.5rem', md: '1.75rem' },
                fontWeight: 800,
                color: 'text.primary',
                mb: 2,
                letterSpacing: '-0.01em',
              }}
            >
              Access controls
            </Typography>
            <Box component="ul" sx={{ pl: 2.5, m: 0 }}>
              {ACCESS_CONTROLS.map((item) => (
                <Typography
                  key={item.slice(0, 24)}
                  component="li"
                  sx={{ mb: 1.25, fontSize: '0.95rem', color: 'text.primary', lineHeight: 1.6 }}
                >
                  {item}
                </Typography>
              ))}
            </Box>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <Typography
              component="h2"
              sx={{
                fontSize: { xs: '1.5rem', md: '1.75rem' },
                fontWeight: 800,
                color: 'text.primary',
                mb: 2,
                letterSpacing: '-0.01em',
              }}
            >
              Compliance roadmap
            </Typography>
            <Stack spacing={1.5}>
              {COMPLIANCE.map((row) => (
                <Stack
                  key={row.label}
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={{ xs: 0.5, sm: 2 }}
                  alignItems={{ xs: 'flex-start', sm: 'center' }}
                  sx={{
                    p: 2,
                    borderRadius: 2,
                    bgcolor: 'background.paper',
                    border: `1px solid ${theme.palette.divider}`,
                  }}
                >
                  <Typography sx={{ fontWeight: 800, fontSize: '0.95rem', color: 'text.primary', minWidth: 120 }}>
                    {row.label}
                  </Typography>
                  <ChipStatus label={row.status} />
                  <Typography sx={{ fontSize: '0.85rem', color: 'text.secondary', flex: 1 }}>
                    {row.note}
                  </Typography>
                </Stack>
              ))}
            </Stack>
          </Grid>
        </Grid>
      </SectionShell>
      <SectionShell>
        <Typography
          component="h2"
          sx={{
            fontSize: { xs: '1.5rem', md: '1.75rem' },
            fontWeight: 800,
            color: 'text.primary',
            mb: 1.5,
          }}
        >
          Responsible disclosure
        </Typography>
        <Typography sx={{ fontSize: '1rem', color: 'text.primary', lineHeight: 1.7, maxWidth: 720 }}>
          {DISCLOSURE.body.split(DISCLOSURE.email)[0]}
          <Box
            component="a"
            href={`mailto:${DISCLOSURE.email}`}
            sx={{ color: 'primary.main', fontWeight: 700, textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
          >
            {DISCLOSURE.email}
          </Box>
          {DISCLOSURE.body.split(DISCLOSURE.email)[1]}
        </Typography>
      </SectionShell>
    </PublicShell>
  );
}

function ChipStatus({ label }) {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const isLive = label === 'Operational';
  return (
    <Typography
      sx={{
        display: 'inline-flex',
        px: 1.25,
        py: 0.35,
        borderRadius: 999,
        fontSize: '0.72rem',
        fontWeight: 800,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        bgcolor: isLive ? alpha(primary, 0.12) : alpha(theme.palette.text.primary, 0.06),
        color: isLive ? 'primary.main' : 'text.secondary',
        border: `1px solid ${isLive ? alpha(primary, 0.3) : theme.palette.divider}`,
        flexShrink: 0,
      }}
    >
      {label}
    </Typography>
  );
}
