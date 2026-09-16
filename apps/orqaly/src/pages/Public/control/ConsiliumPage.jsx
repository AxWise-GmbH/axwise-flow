import { Box, Button, Container, Grid, Stack, Typography, alpha, useTheme } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import MarketingCtaButton from '@/components/Public/primitives/MarketingCtaButton';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import LaunchIcon from '@mui/icons-material/Launch';
import PublicShell from '../../../components/Public/PublicShell';
import HeroSplit from '../../../components/Public/primitives/HeroSplit';
import Spotlight from '../../../components/Public/primitives/Spotlight';
import FeatureMosaic from '../../../components/Public/primitives/FeatureMosaic';
import RelatedGrid from '../../../components/Public/primitives/RelatedGrid';
import ClosingCta from '../../../components/Public/primitives/ClosingCta';
import DemoConsiliumHub from '../../../components/Public/demo/DemoConsiliumHub';
import DemoConsilium from '../../../components/Public/demo/DemoConsilium';
import DemoConsiliumLog from '../../../components/Public/demo/DemoConsiliumLog';
import DemoConsiliumIntegrate from '../../../components/Public/demo/DemoConsiliumIntegrate';
import LandingGlassIcon from '../../Landing/sections/LandingGlassIcon';
import { ITEMS_BY_SLUG } from '../../../data/instruments';
import {
  CONSILIUM_HUB_INTRO,
  CONSILIUM_PILLARS,
  SPOTLIGHT_BOARDS,
  SPOTLIGHT_DELIBERATE,
  SPOTLIGHT_AUDIT,
  SPOTLIGHT_INTEGRATE,
} from '../../../data/consiliumPage';

import AppIcon from '../../../components/icons/AppIcon';

function DemoGlow({ children }) {
  const theme = useTheme();
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

function PillarCard({ pillar }) {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  return (
    <Stack
      spacing={1.5}
      sx={{
        height: '100%',
        p: 2.5,
        borderRadius: 2.5,
        bgcolor: 'background.paper',
        border: `1px solid ${theme.palette.divider}`,
        transition: 'border-color 200ms ease',
        '&:hover': { borderColor: alpha(primary, 0.45) },
      }}
    >
      <LandingGlassIcon name={pillar.iconName} size={22} tone="brand" />
      <Typography sx={{ fontWeight: 800, fontSize: '1.05rem', color: 'text.primary', lineHeight: 1.25 }}>
        {pillar.title}
      </Typography>
      <Typography sx={{ fontSize: '0.88rem', color: 'text.secondary', lineHeight: 1.55, flex: 1 }}>
        {pillar.body}
      </Typography>
      {pillar.linkLabel && (
        <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: 'primary.main' }}>
          {pillar.linkLabel}
        </Typography>
      )}
    </Stack>
  );
}

export default function ConsiliumPage() {
  const item = ITEMS_BY_SLUG['control:consilium'];
  const theme = useTheme();

  return (
    <PublicShell>
      <HeroSplit
        eyebrow="CONTROL POINT · Consilium"
        title={item.hero.title}
        subtitle={item.hero.subtitle}
        ctas={
          <>
            <MarketingCtaButton
              component={RouterLink}
              to="/signup"
              endIcon={<AppIcon name='ArrowForward' fallback={ArrowForwardIcon} />}
              sx={{ px: 3, py: 1.25 }}
            >
              Try a council
            </MarketingCtaButton>
            <Button
              component={RouterLink}
              to={item.inAppRoute}
              variant="outlined"
              size="large"
              endIcon={<AppIcon name='Launch' fallback={LaunchIcon} sx={{ fontSize: 18 }} />}
              sx={{ fontWeight: 700, borderRadius: 2, textTransform: 'none', px: 3, py: 1.25 }}
            >
              Open Consilium
            </Button>
          </>
        }
        visual={<DemoConsiliumHub />}
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
              {CONSILIUM_HUB_INTRO.eyebrow}
            </Typography>
            <Typography component="h2" sx={{ fontWeight: 800, fontSize: { xs: '1.6rem', md: '2.2rem' }, lineHeight: 1.15, color: 'text.primary' }}>
              {CONSILIUM_HUB_INTRO.title}
            </Typography>
            <Typography sx={{ fontSize: { xs: '1rem', md: '1.08rem' }, color: 'text.secondary', lineHeight: 1.7 }}>
              {CONSILIUM_HUB_INTRO.subtitle}
            </Typography>
          </Stack>
          <Grid container spacing={2.5}>
            {CONSILIUM_PILLARS.map((pillar) => (
              <Grid key={pillar.id} size={{ xs: 12, sm: 6 }}>
                <PillarCard pillar={pillar} />
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>
      <Spotlight
        eyebrow={SPOTLIGHT_BOARDS.eyebrow}
        title={SPOTLIGHT_BOARDS.title}
        body={SPOTLIGHT_BOARDS.body}
        bullets={SPOTLIGHT_BOARDS.bullets}
        visual={
          <DemoGlow>
            <DemoConsiliumHub />
          </DemoGlow>
        }
      />
      <Spotlight
        eyebrow={SPOTLIGHT_DELIBERATE.eyebrow}
        title={SPOTLIGHT_DELIBERATE.title}
        body={SPOTLIGHT_DELIBERATE.body}
        bullets={SPOTLIGHT_DELIBERATE.bullets}
        visual={
          <DemoGlow>
            <DemoConsilium />
          </DemoGlow>
        }
        reverse
        bg="tint"
      />
      <Spotlight
        eyebrow={SPOTLIGHT_AUDIT.eyebrow}
        title={SPOTLIGHT_AUDIT.title}
        body={SPOTLIGHT_AUDIT.body}
        bullets={SPOTLIGHT_AUDIT.bullets}
        visual={
          <DemoGlow>
            <DemoConsiliumLog />
          </DemoGlow>
        }
      />
      <Spotlight
        eyebrow={SPOTLIGHT_INTEGRATE.eyebrow}
        title={SPOTLIGHT_INTEGRATE.title}
        body={SPOTLIGHT_INTEGRATE.body}
        bullets={SPOTLIGHT_INTEGRATE.bullets}
        visual={
          <DemoGlow>
            <DemoConsiliumIntegrate />
          </DemoGlow>
        }
        reverse
        bg="tint"
      />
      <FeatureMosaic
        title="Inside the council"
        subtitle="Every knob you might want without writing custom code."
        features={item.features}
        featuredIndex={0}
      />
      <RelatedGrid
        title="Works with the rest of the platform"
        items={[
          { label: 'Agents', to: '/control/agents', iconName: 'SmartToyOutlined', blurb: 'Put a council behind any agent for hard decisions.' },
          { label: 'Workflow', to: '/instruments/workflow', iconName: 'AccountTreeOutlined', blurb: 'Drop a Consilium node into any flow.' },
          { label: 'Communicator', to: '/control/communicator', iconName: 'ForumOutlined', blurb: 'Full decision log in Agent Workspace.' },
          { label: 'Organizations', to: '/control/organizations', iconName: 'BusinessOutlined', blurb: 'Link boards to org governance.' },
        ]}
        bg="tint"
      />
      <ClosingCta
        title="Stop guessing. Start deliberating."
        body="A council you can audit. Built for decisions you have to defend."
        primary={{ label: 'Try Consilium free', to: '/signup' }}
        secondary={{ label: 'Talk to sales', to: '/contact' }}
      />
    </PublicShell>
  );
}
