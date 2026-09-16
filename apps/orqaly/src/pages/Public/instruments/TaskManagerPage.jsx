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
import DemoTaskManager from '../../../components/Public/demo/DemoTaskManager';
import DemoTaskManagerReview from '../../../components/Public/demo/DemoTaskManagerReview';
import DemoTaskManagerDeliverable from '../../../components/Public/demo/DemoTaskManagerDeliverable';
import DemoTaskManagerFilters from '../../../components/Public/demo/DemoTaskManagerFilters';
import { ITEMS_BY_SLUG } from '../../../data/instruments';
import {
  TASK_MANAGER_HUB_INTRO,
  TASK_MANAGER_PILLARS,
  SPOTLIGHT_SCOPES,
  SPOTLIGHT_REVIEW,
  SPOTLIGHT_DELIVERABLE,
  SPOTLIGHT_FILTERS,
} from '../../../data/taskManagerPage';

import AppIcon from '../../../components/icons/AppIcon';

export default function TaskManagerPage() {
  const item = ITEMS_BY_SLUG['instruments:task-manager'];
  const theme = useTheme();

  return (
    <PublicShell>
      <HeroSplit
        eyebrow="INSTRUMENTS · Task Manager"
        title={item.hero.title}
        subtitle={item.hero.subtitle}
        bgVariant="mesh"
        ctas={
          <>
            <MarketingCtaButton component={RouterLink} to="/signup" endIcon={<AppIcon name='ArrowForward' fallback={ArrowForwardIcon} />} sx={{ px: 3, py: 1.25 }}>
              Try Task Manager
            </MarketingCtaButton>
            <Button component={RouterLink} to={item.inAppRoute} variant="outlined" size="large" endIcon={<AppIcon name='Launch' fallback={LaunchIcon} sx={{ fontSize: 18 }} />} sx={{ fontWeight: 700, borderRadius: 2, textTransform: 'none', px: 3, py: 1.25 }}>
              Open in app
            </Button>
          </>
        }
        visual={<DemoTaskManager />}
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
              {TASK_MANAGER_HUB_INTRO.eyebrow}
            </Typography>
            <Typography component="h2" sx={{ fontWeight: 800, fontSize: { xs: '1.6rem', md: '2.2rem' }, lineHeight: 1.15, color: 'text.primary' }}>
              {TASK_MANAGER_HUB_INTRO.title}
            </Typography>
            <Typography sx={{ fontSize: { xs: '1rem', md: '1.08rem' }, color: 'text.secondary', lineHeight: 1.7 }}>
              {TASK_MANAGER_HUB_INTRO.subtitle}
            </Typography>
          </Stack>
          <Grid container spacing={2.5}>
            {TASK_MANAGER_PILLARS.map((pillar) => (
              <Grid key={pillar.id} size={{ xs: 12, sm: 6 }}>
                <PillarCard pillar={pillar} />
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>
      <Spotlight
        eyebrow={SPOTLIGHT_SCOPES.eyebrow}
        title={SPOTLIGHT_SCOPES.title}
        body={SPOTLIGHT_SCOPES.body}
        bullets={SPOTLIGHT_SCOPES.bullets}
        visual={
          <DemoGlow>
            <DemoTaskManager />
          </DemoGlow>
        }
      />
      <Spotlight
        eyebrow={SPOTLIGHT_REVIEW.eyebrow}
        title={SPOTLIGHT_REVIEW.title}
        body={SPOTLIGHT_REVIEW.body}
        bullets={SPOTLIGHT_REVIEW.bullets}
        visual={
          <DemoGlow>
            <DemoTaskManagerReview />
          </DemoGlow>
        }
        reverse
        bg="tint"
      />
      <Spotlight
        eyebrow={SPOTLIGHT_DELIVERABLE.eyebrow}
        title={SPOTLIGHT_DELIVERABLE.title}
        body={SPOTLIGHT_DELIVERABLE.body}
        bullets={SPOTLIGHT_DELIVERABLE.bullets}
        visual={
          <DemoGlow>
            <DemoTaskManagerDeliverable />
          </DemoGlow>
        }
      />
      <Spotlight
        eyebrow={SPOTLIGHT_FILTERS.eyebrow}
        title={SPOTLIGHT_FILTERS.title}
        body={SPOTLIGHT_FILTERS.body}
        bullets={SPOTLIGHT_FILTERS.bullets}
        visual={
          <DemoGlow>
            <DemoTaskManagerFilters />
          </DemoGlow>
        }
        reverse
        bg="tint"
      />
      <FeatureMosaic
        title="Everything in one control surface"
        subtitle="Categorised, filterable, and built for agent + human work."
        features={item.features}
        featuredIndex={0}
        bg="tint"
      />
      <RelatedGrid
        title="Works with"
        items={[
          { label: 'Workflow', to: '/instruments/workflow', iconName: 'AccountTreeOutlined', blurb: 'Workflow plans create tasks your team and agents can pick up.' },
          { label: 'Projects', to: '/instruments/projects', iconName: 'FolderOpenOutlined', blurb: 'Project tasks roll up under one outcome.' },
          { label: 'Agents', to: '/control/agents', iconName: 'SmartToyOutlined', blurb: 'Agents are assignees - not a separate queue.' },
        ]}
      />
      <ClosingCta title="Put every task in one place." />
    </PublicShell>
  );
}
