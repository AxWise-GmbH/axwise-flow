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
import { DemoGlow, PillarCard } from '../../../components/Public/primitives/MarketingHubPrimitives';
import DemoProjects from '../../../components/Public/demo/DemoProjects';
import DemoProjectHub from '../../../components/Public/demo/DemoProjectHub';
import DemoProjectKb from '../../../components/Public/demo/DemoProjectKb';
import DemoProjectUpdates from '../../../components/Public/demo/DemoProjectUpdates';
import { ITEMS_BY_SLUG } from '../../../data/instruments';
import {
  PROJECTS_HUB_INTRO,
  PROJECTS_PILLARS,
  SPOTLIGHT_ROLLUP,
  SPOTLIGHT_HUB,
  SPOTLIGHT_KB,
  SPOTLIGHT_UPDATES,
} from '../../../data/projectsPage';

import AppIcon from '../../../components/icons/AppIcon';

export default function ProjectsPage() {
  const item = ITEMS_BY_SLUG['instruments:projects'];
  const theme = useTheme();

  return (
    <PublicShell>
      <HeroSplit
        eyebrow="INSTRUMENTS · Projects"
        title={item.hero.title}
        subtitle={item.hero.subtitle}
        bgVariant="mesh"
        ctas={
          <>
            <MarketingCtaButton component={RouterLink} to="/signup" endIcon={<AppIcon name='ArrowForward' fallback={ArrowForwardIcon} />} sx={{ px: 3, py: 1.25 }}>
              Start a project
            </MarketingCtaButton>
            <Button component={RouterLink} to={item.inAppRoute} variant="outlined" size="large" endIcon={<AppIcon name='Launch' fallback={LaunchIcon} sx={{ fontSize: 18 }} />} sx={{ fontWeight: 700, borderRadius: 2, textTransform: 'none', px: 3, py: 1.25 }}>
              Open in app
            </Button>
          </>
        }
        visual={<DemoProjects />}
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
              {PROJECTS_HUB_INTRO.eyebrow}
            </Typography>
            <Typography component="h2" sx={{ fontWeight: 800, fontSize: { xs: '1.6rem', md: '2.2rem' }, lineHeight: 1.15, color: 'text.primary' }}>
              {PROJECTS_HUB_INTRO.title}
            </Typography>
            <Typography sx={{ fontSize: { xs: '1rem', md: '1.08rem' }, color: 'text.secondary', lineHeight: 1.7 }}>
              {PROJECTS_HUB_INTRO.subtitle}
            </Typography>
          </Stack>
          <Grid container spacing={2.5}>
            {PROJECTS_PILLARS.map((pillar) => (
              <Grid key={pillar.id} size={{ xs: 12, sm: 6 }}>
                <PillarCard pillar={pillar} />
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>
      <Spotlight
        eyebrow={SPOTLIGHT_ROLLUP.eyebrow}
        title={SPOTLIGHT_ROLLUP.title}
        body={SPOTLIGHT_ROLLUP.body}
        bullets={SPOTLIGHT_ROLLUP.bullets}
        visual={
          <DemoGlow>
            <DemoProjects />
          </DemoGlow>
        }
      />
      <Spotlight
        eyebrow={SPOTLIGHT_HUB.eyebrow}
        title={SPOTLIGHT_HUB.title}
        body={SPOTLIGHT_HUB.body}
        bullets={SPOTLIGHT_HUB.bullets}
        visual={
          <DemoGlow>
            <DemoProjectHub />
          </DemoGlow>
        }
        reverse
        bg="tint"
      />
      <Spotlight
        eyebrow={SPOTLIGHT_KB.eyebrow}
        title={SPOTLIGHT_KB.title}
        body={SPOTLIGHT_KB.body}
        bullets={SPOTLIGHT_KB.bullets}
        visual={
          <DemoGlow>
            <DemoProjectKb />
          </DemoGlow>
        }
      />
      <Spotlight
        eyebrow={SPOTLIGHT_UPDATES.eyebrow}
        title={SPOTLIGHT_UPDATES.title}
        body={SPOTLIGHT_UPDATES.body}
        bullets={SPOTLIGHT_UPDATES.bullets}
        visual={
          <DemoGlow>
            <DemoProjectUpdates />
          </DemoGlow>
        }
        reverse
        bg="tint"
      />
      <FeatureMosaic title="Built for outcomes, not status grids" features={item.features} featuredIndex={0} />
      <RelatedGrid
        title="Pairs well with"
        items={[
          { label: 'Task Manager', to: '/instruments/task-manager', iconName: 'TaskAltOutlined', blurb: 'The list of things inside a project.' },
          { label: 'Dashboards', to: '/instruments/dashboards', iconName: 'DashboardOutlined', blurb: 'Per-project KPIs at a glance.' },
          { label: 'Reports', to: '/instruments/reports', iconName: 'AssessmentOutlined', blurb: 'Stakeholder updates drafted from project activity.' },
        ]}
        bg="tint"
      />
      <ClosingCta title="Group your work. Ship the outcome." />
    </PublicShell>
  );
}
