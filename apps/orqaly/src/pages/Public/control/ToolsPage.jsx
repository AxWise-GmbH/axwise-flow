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
import DemoToolsHub from '../../../components/Public/demo/DemoToolsHub';
import DemoTools from '../../../components/Public/demo/DemoTools';
import DemoToolsMcp from '../../../components/Public/demo/DemoToolsMcp';
import DemoToolsExecute from '../../../components/Public/demo/DemoToolsExecute';
import DemoToolsTrust from '../../../components/Public/demo/DemoToolsTrust';
import LandingGlassIcon from '../../Landing/sections/LandingGlassIcon';
import { ITEMS_BY_SLUG } from '../../../data/instruments';
import {
  TOOLS_HUB_INTRO,
  TOOLS_PILLARS,
  SPOTLIGHT_CONNECT,
  SPOTLIGHT_PERMISSION,
  SPOTLIGHT_RUN,
  SPOTLIGHT_TRUST,
} from '../../../data/toolsPage';

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

export default function ToolsPage() {
  const item = ITEMS_BY_SLUG['control:tools'];
  const theme = useTheme();

  return (
    <PublicShell>
      <HeroSplit
        eyebrow="CONTROL POINT · Tools"
        title={item.hero.title}
        subtitle={item.hero.subtitle}
        ctas={
          <>
            <MarketingCtaButton component={RouterLink} to="/signup" endIcon={<AppIcon name='ArrowForward' fallback={ArrowForwardIcon} />} sx={{ px: 3, py: 1.25 }}>
              Wire your stack
            </MarketingCtaButton>
            <Button component={RouterLink} to={item.inAppRoute} variant="outlined" size="large" endIcon={<AppIcon name='Launch' fallback={LaunchIcon} sx={{ fontSize: 18 }} />} sx={{ fontWeight: 700, borderRadius: 2, textTransform: 'none', px: 3, py: 1.25 }}>
              Open Tools
            </Button>
          </>
        }
        visual={<DemoToolsHub />}
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
              {TOOLS_HUB_INTRO.eyebrow}
            </Typography>
            <Typography component="h2" sx={{ fontWeight: 800, fontSize: { xs: '1.6rem', md: '2.2rem' }, lineHeight: 1.15, color: 'text.primary' }}>
              {TOOLS_HUB_INTRO.title}
            </Typography>
            <Typography sx={{ fontSize: { xs: '1rem', md: '1.08rem' }, color: 'text.secondary', lineHeight: 1.7 }}>
              {TOOLS_HUB_INTRO.subtitle}
            </Typography>
          </Stack>
          <Grid container spacing={2.5}>
            {TOOLS_PILLARS.map((pillar) => (
              <Grid key={pillar.id} size={{ xs: 12, sm: 6 }}>
                <PillarCard pillar={pillar} />
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>
      <Spotlight
        eyebrow={SPOTLIGHT_CONNECT.eyebrow}
        title={SPOTLIGHT_CONNECT.title}
        body={SPOTLIGHT_CONNECT.body}
        bullets={SPOTLIGHT_CONNECT.bullets}
        visual={
          <DemoGlow>
            <DemoToolsMcp />
          </DemoGlow>
        }
      />
      <Spotlight
        eyebrow={SPOTLIGHT_PERMISSION.eyebrow}
        title={SPOTLIGHT_PERMISSION.title}
        body={SPOTLIGHT_PERMISSION.body}
        bullets={SPOTLIGHT_PERMISSION.bullets}
        visual={
          <DemoGlow>
            <DemoTools />
          </DemoGlow>
        }
        reverse
        bg="tint"
      />
      <Spotlight
        eyebrow={SPOTLIGHT_RUN.eyebrow}
        title={SPOTLIGHT_RUN.title}
        body={SPOTLIGHT_RUN.body}
        bullets={SPOTLIGHT_RUN.bullets}
        visual={
          <DemoGlow>
            <DemoToolsExecute />
          </DemoGlow>
        }
      />
      <Spotlight
        eyebrow={SPOTLIGHT_TRUST.eyebrow}
        title={SPOTLIGHT_TRUST.title}
        body={SPOTLIGHT_TRUST.body}
        bullets={SPOTLIGHT_TRUST.bullets}
        visual={
          <DemoGlow>
            <DemoToolsTrust />
          </DemoGlow>
        }
        reverse
        bg="tint"
      />
      <FeatureMosaic title="Inside the Tools surface" features={item.features} featuredIndex={0} />
      <RelatedGrid
        title="Pairs well with"
        items={[
          { label: 'Agents', to: '/control/agents', iconName: 'SmartToyOutlined', blurb: 'Tools are the actions your agents take.' },
          { label: 'Marketplace', to: '/marketplace-preview', iconName: 'StorefrontRounded', blurb: 'Publish tools and earn crypto on installs.' },
          { label: 'Workflow', to: '/instruments/workflow', iconName: 'AccountTreeOutlined', blurb: 'Tools drop directly into workflow nodes.' },
          { label: 'Requests', to: '/control/requests', iconName: 'TrackChangesOutlined', blurb: 'Setup Tools when goals need integrations.' },
        ]}
        bg="tint"
      />
      <ClosingCta title="Powerful, permissioned, and never going rogue." />
    </PublicShell>
  );
}
