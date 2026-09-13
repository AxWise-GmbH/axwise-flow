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
import DemoCommunicatorHub from '../../../components/Public/demo/DemoCommunicatorHub';
import DemoCommWorkspace from '../../../components/Public/demo/DemoCommWorkspace';
import DemoCommAgentRoom from '../../../components/Public/demo/DemoCommAgentRoom';
import DemoCommConsilium from '../../../components/Public/demo/DemoCommConsilium';
import DemoCommChannels from '../../../components/Public/demo/DemoCommChannels';
import DemoCommunicator from '../../../components/Public/demo/DemoCommunicator';
import LandingGlassIcon from '../../Landing/sections/LandingGlassIcon';
import { ITEMS_BY_SLUG } from '../../../data/instruments';
import {
  COMM_HUB_INTRO,
  COMM_PILLARS,
  SPOTLIGHT_WORKSPACE,
  SPOTLIGHT_ROOMS,
  SPOTLIGHT_CONSILIUM,
  SPOTLIGHT_CHANNELS,
} from '../../../data/communicatorPage';

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

export default function CommunicatorPage() {
  const item = ITEMS_BY_SLUG['control:communicator'];
  const theme = useTheme();

  return (
    <PublicShell>
      <HeroSplit
        eyebrow="CONTROL POINT · Communicator"
        title={item.hero.title}
        subtitle={item.hero.subtitle}
        ctas={
          <>
            <MarketingCtaButton component={RouterLink} to="/signup" endIcon={<AppIcon name='ArrowForward' fallback={ArrowForwardIcon} />} sx={{ px: 3, py: 1.25 }}>
              Open your control room
            </MarketingCtaButton>
            <Button component={RouterLink} to={item.inAppRoute} variant="outlined" size="large" endIcon={<AppIcon name='Launch' fallback={LaunchIcon} sx={{ fontSize: 18 }} />} sx={{ fontWeight: 700, borderRadius: 2, textTransform: 'none', px: 3, py: 1.25 }}>
              Open Communicator
            </Button>
          </>
        }
        visual={<DemoCommunicatorHub />}
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
              {COMM_HUB_INTRO.eyebrow}
            </Typography>
            <Typography component="h2" sx={{ fontWeight: 800, fontSize: { xs: '1.6rem', md: '2.2rem' }, lineHeight: 1.15, color: 'text.primary' }}>
              {COMM_HUB_INTRO.title}
            </Typography>
            <Typography sx={{ fontSize: { xs: '1rem', md: '1.08rem' }, color: 'text.secondary', lineHeight: 1.7 }}>
              {COMM_HUB_INTRO.subtitle}
            </Typography>
          </Stack>
          <Grid container spacing={2.5}>
            {COMM_PILLARS.map((pillar) => (
              <Grid key={pillar.id} size={{ xs: 12, sm: 6 }}>
                <PillarCard pillar={pillar} />
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>
      <Spotlight
        eyebrow={SPOTLIGHT_WORKSPACE.eyebrow}
        title={SPOTLIGHT_WORKSPACE.title}
        body={SPOTLIGHT_WORKSPACE.body}
        bullets={SPOTLIGHT_WORKSPACE.bullets}
        visual={
          <DemoGlow>
            <DemoCommWorkspace />
          </DemoGlow>
        }
      />
      <Spotlight
        eyebrow={SPOTLIGHT_ROOMS.eyebrow}
        title={SPOTLIGHT_ROOMS.title}
        body={SPOTLIGHT_ROOMS.body}
        bullets={SPOTLIGHT_ROOMS.bullets}
        visual={
          <DemoGlow>
            <DemoCommAgentRoom />
          </DemoGlow>
        }
        reverse
        bg="tint"
      />
      <Spotlight
        eyebrow={SPOTLIGHT_CONSILIUM.eyebrow}
        title={SPOTLIGHT_CONSILIUM.title}
        body={SPOTLIGHT_CONSILIUM.body}
        bullets={SPOTLIGHT_CONSILIUM.bullets}
        visual={
          <DemoGlow>
            <DemoCommConsilium />
          </DemoGlow>
        }
      />
      <Spotlight
        eyebrow={SPOTLIGHT_CHANNELS.eyebrow}
        title={SPOTLIGHT_CHANNELS.title}
        body={SPOTLIGHT_CHANNELS.body}
        bullets={SPOTLIGHT_CHANNELS.bullets}
        visual={
          <DemoGlow>
            <Stack spacing={2}>
              <DemoCommChannels />
              <DemoCommunicator />
            </Stack>
          </DemoGlow>
        }
        reverse
        bg="tint"
      />
      <FeatureMosaic title="Inside Communicator" features={item.features} featuredIndex={0} />
      <RelatedGrid
        title="Pairs well with"
        items={[
          { label: 'Requests', to: '/control/requests', iconName: 'TrackChangesOutlined', blurb: 'Goals in Job Pool — filter Communicator activity by goal.' },
          { label: 'Agents', to: '/control/agents', iconName: 'SmartToyOutlined', blurb: 'Deploy any agent on voice, Telegram, and email.' },
          { label: 'Organizations', to: '/control/organizations', iconName: 'BusinessOutlined', blurb: 'Organizations tab in Agent Workspace.' },
          { label: 'Knowledge Base', to: '/instruments/knowledge-base', iconName: 'MenuBookOutlined', blurb: 'Channel responses pull from the same KB.' },
        ]}
        bg="tint"
      />
      <ClosingCta title="Monitor every goal. Reach customers on every channel." />
    </PublicShell>
  );
}
