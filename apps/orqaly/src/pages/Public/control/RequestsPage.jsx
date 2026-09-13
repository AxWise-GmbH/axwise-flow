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
import DemoGoalCommandCenter from '../../../components/Public/demo/DemoGoalCommandCenter';
import DemoGoalLaunch from '../../../components/Public/demo/DemoGoalLaunch';
import DemoGoalPipeline from '../../../components/Public/demo/DemoGoalPipeline';
import DemoGoalActions from '../../../components/Public/demo/DemoGoalActions';
import DemoGoalResults from '../../../components/Public/demo/DemoGoalResults';
import DemoRequests from '../../../components/Public/demo/DemoRequests';
import LandingGlassIcon from '../../Landing/sections/LandingGlassIcon';
import { ITEMS_BY_SLUG } from '../../../data/instruments';
import {
  REQUESTS_HUB_INTRO,
  GOAL_PILLARS,
  SPOTLIGHT_LAUNCH,
  SPOTLIGHT_PIPELINE,
  SPOTLIGHT_ACTIONS,
  SPOTLIGHT_RESULTS,
} from '../../../data/requestsPage';

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

export default function RequestsPage() {
  const item = ITEMS_BY_SLUG['control:requests'];
  const theme = useTheme();

  return (
    <PublicShell>
      <HeroSplit
        eyebrow="CONTROL POINT · Requests"
        title={item.hero.title}
        subtitle={item.hero.subtitle}
        ctas={
          <>
            <MarketingCtaButton component={RouterLink} to="/signup" endIcon={<AppIcon name='ArrowForward' fallback={ArrowForwardIcon} />} sx={{ px: 3, py: 1.25 }}>
              Start a goal
            </MarketingCtaButton>
            <Button component={RouterLink} to={item.inAppRoute} variant="outlined" size="large" endIcon={<AppIcon name='Launch' fallback={LaunchIcon} sx={{ fontSize: 18 }} />} sx={{ fontWeight: 700, borderRadius: 2, textTransform: 'none', px: 3, py: 1.25 }}>
              Open Job Pool
            </Button>
          </>
        }
        visual={<DemoGoalCommandCenter />}
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
              {REQUESTS_HUB_INTRO.eyebrow}
            </Typography>
            <Typography component="h2" sx={{ fontWeight: 800, fontSize: { xs: '1.6rem', md: '2.2rem' }, lineHeight: 1.15, color: 'text.primary' }}>
              {REQUESTS_HUB_INTRO.title}
            </Typography>
            <Typography sx={{ fontSize: { xs: '1rem', md: '1.08rem' }, color: 'text.secondary', lineHeight: 1.7 }}>
              {REQUESTS_HUB_INTRO.subtitle}
            </Typography>
          </Stack>
          <Grid container spacing={2.5}>
            {GOAL_PILLARS.map((pillar) => (
              <Grid key={pillar.id} size={{ xs: 12, sm: 6 }}>
                <PillarCard pillar={pillar} />
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>
      <Spotlight
        eyebrow={SPOTLIGHT_LAUNCH.eyebrow}
        title={SPOTLIGHT_LAUNCH.title}
        body={SPOTLIGHT_LAUNCH.body}
        bullets={SPOTLIGHT_LAUNCH.bullets}
        visual={
          <DemoGlow>
            <DemoGoalLaunch />
          </DemoGlow>
        }
      />
      <Spotlight
        eyebrow={SPOTLIGHT_PIPELINE.eyebrow}
        title={SPOTLIGHT_PIPELINE.title}
        body={SPOTLIGHT_PIPELINE.body}
        bullets={SPOTLIGHT_PIPELINE.bullets}
        visual={
          <DemoGlow>
            <DemoGoalPipeline />
          </DemoGlow>
        }
        reverse
        bg="tint"
      />
      <Spotlight
        eyebrow={SPOTLIGHT_ACTIONS.eyebrow}
        title={SPOTLIGHT_ACTIONS.title}
        body={SPOTLIGHT_ACTIONS.body}
        bullets={SPOTLIGHT_ACTIONS.bullets}
        visual={
          <DemoGlow>
            <DemoGoalActions />
          </DemoGlow>
        }
      />
      <Spotlight
        eyebrow={SPOTLIGHT_RESULTS.eyebrow}
        title={SPOTLIGHT_RESULTS.title}
        body={SPOTLIGHT_RESULTS.body}
        bullets={SPOTLIGHT_RESULTS.bullets}
        visual={
          <DemoGlow>
            <Stack spacing={2}>
              <DemoGoalResults />
              <DemoRequests />
            </Stack>
          </DemoGlow>
        }
        reverse
        bg="tint"
      />
      <FeatureMosaic title="Inside Requests" features={item.features} featuredIndex={0} />
      <RelatedGrid
        title="Pairs well with"
        items={[
          { label: 'Job Pool', to: '/job-pool', iconName: 'TrackChangesOutlined', blurb: 'Goals list, Smart Request, and full goal detail.' },
          { label: 'Organizations', to: '/control/organizations', iconName: 'BusinessOutlined', blurb: 'Adopt or implement completed goals per org.' },
          { label: 'Agents', to: '/control/agents', iconName: 'SmartToyOutlined', blurb: 'Agents and teams that execute your goals.' },
          { label: 'Workflow', to: '/instruments/workflow', iconName: 'AccountTreeOutlined', blurb: 'Attach workflows from the goal actions menu.' },
          { label: 'Knowledge Base', to: '/instruments/knowledge-base', iconName: 'MenuBookOutlined', blurb: 'Context agents read while fulfilling goals.' },
        ]}
        bg="tint"
      />
      <ClosingCta title="Submit one ask. Run the full goal lifecycle from Job Pool." />
    </PublicShell>
  );
}
