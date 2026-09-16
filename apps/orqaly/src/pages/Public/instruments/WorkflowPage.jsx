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
import DemoWorkflow from '../../../components/Public/demo/DemoWorkflow';
import DemoWorkflowImport from '../../../components/Public/demo/DemoWorkflowImport';
import DemoWorkflowExecution from '../../../components/Public/demo/DemoWorkflowExecution';
import DemoWorkflowTriggers from '../../../components/Public/demo/DemoWorkflowTriggers';
import { ITEMS_BY_SLUG } from '../../../data/instruments';
import {
  WORKFLOW_HUB_INTRO,
  WORKFLOW_PILLARS,
  SPOTLIGHT_CANVAS,
  SPOTLIGHT_IMPORT,
  SPOTLIGHT_EXECUTION,
  SPOTLIGHT_TRIGGERS,
} from '../../../data/workflowPage';

import AppIcon from '../../../components/icons/AppIcon';

export default function WorkflowPage() {
  const item = ITEMS_BY_SLUG['instruments:workflow'];
  const theme = useTheme();

  return (
    <PublicShell>
      <HeroSplit
        eyebrow="INSTRUMENTS · Workflow"
        title={item.hero.title}
        subtitle={item.hero.subtitle}
        bgVariant="mesh"
        ctas={
          <>
            <MarketingCtaButton component={RouterLink} to="/signup" endIcon={<AppIcon name='ArrowForward' fallback={ArrowForwardIcon} />} sx={{ px: 3, py: 1.25 }}>
              Draw your first workflow
            </MarketingCtaButton>
            <Button component={RouterLink} to={item.inAppRoute} variant="outlined" size="large" endIcon={<AppIcon name='Launch' fallback={LaunchIcon} sx={{ fontSize: 18 }} />} sx={{ fontWeight: 700, borderRadius: 2, textTransform: 'none', px: 3, py: 1.25 }}>
              Open canvas
            </Button>
          </>
        }
        visual={<DemoWorkflow />}
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
              {WORKFLOW_HUB_INTRO.eyebrow}
            </Typography>
            <Typography component="h2" sx={{ fontWeight: 800, fontSize: { xs: '1.6rem', md: '2.2rem' }, lineHeight: 1.15, color: 'text.primary' }}>
              {WORKFLOW_HUB_INTRO.title}
            </Typography>
            <Typography sx={{ fontSize: { xs: '1rem', md: '1.08rem' }, color: 'text.secondary', lineHeight: 1.7 }}>
              {WORKFLOW_HUB_INTRO.subtitle}
            </Typography>
          </Stack>
          <Grid container spacing={2.5}>
            {WORKFLOW_PILLARS.map((pillar) => (
              <Grid key={pillar.id} size={{ xs: 12, sm: 6 }}>
                <PillarCard pillar={pillar} />
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>
      <Spotlight
        eyebrow={SPOTLIGHT_CANVAS.eyebrow}
        title={SPOTLIGHT_CANVAS.title}
        body={SPOTLIGHT_CANVAS.body}
        bullets={SPOTLIGHT_CANVAS.bullets}
        visual={
          <DemoGlow>
            <DemoWorkflow />
          </DemoGlow>
        }
      />
      <Spotlight
        eyebrow={SPOTLIGHT_IMPORT.eyebrow}
        title={SPOTLIGHT_IMPORT.title}
        body={SPOTLIGHT_IMPORT.body}
        bullets={SPOTLIGHT_IMPORT.bullets}
        visual={
          <DemoGlow>
            <DemoWorkflowImport />
          </DemoGlow>
        }
        reverse
        bg="tint"
      />
      <Spotlight
        eyebrow={SPOTLIGHT_EXECUTION.eyebrow}
        title={SPOTLIGHT_EXECUTION.title}
        body={SPOTLIGHT_EXECUTION.body}
        bullets={SPOTLIGHT_EXECUTION.bullets}
        visual={
          <DemoGlow>
            <DemoWorkflowExecution />
          </DemoGlow>
        }
      />
      <Spotlight
        eyebrow={SPOTLIGHT_TRIGGERS.eyebrow}
        title={SPOTLIGHT_TRIGGERS.title}
        body={SPOTLIGHT_TRIGGERS.body}
        bullets={SPOTLIGHT_TRIGGERS.bullets}
        visual={
          <DemoGlow>
            <DemoWorkflowTriggers />
          </DemoGlow>
        }
        reverse
        bg="tint"
      />
      <FeatureMosaic title="The canvas in detail" features={item.features} featuredIndex={0} />
      <RelatedGrid
        title="Pairs well with"
        items={[
          { label: 'Agents', to: '/control/agents', iconName: 'SmartToyOutlined', blurb: 'Drop any agent into any node.' },
          { label: 'Tools', to: '/control/tools', iconName: 'ExtensionOutlined', blurb: 'Sandboxed connectors for everything else in your stack.' },
          { label: 'Consilium', to: '/control/consilium', iconName: 'GroupsOutlined', blurb: 'Put a voting council inside a node for hard decisions.' },
        ]}
        bg="tint"
      />
      <ClosingCta title="Stop writing glue code. Start drawing workflows." />
    </PublicShell>
  );
}
