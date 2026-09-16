import { Box, Button, Container, Grid, Stack, Typography, alpha, useTheme } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import MarketingCtaButton from '@/components/Public/primitives/MarketingCtaButton';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import LaunchIcon from '@mui/icons-material/Launch';
import PublicShell from '../../components/Public/PublicShell';
import HeroAsymmetric from '../../components/Public/primitives/HeroAsymmetric';
import Spotlight from '../../components/Public/primitives/Spotlight';
import FeatureMosaic from '../../components/Public/primitives/FeatureMosaic';
import RelatedGrid from '../../components/Public/primitives/RelatedGrid';
import ClosingCta from '../../components/Public/primitives/ClosingCta';
import DemoMarketplaceHub from '../../components/Public/demo/DemoMarketplaceHub';
import DemoMarketplace from '../../components/Public/demo/DemoMarketplace';
import DemoMarketplaceInstall from '../../components/Public/demo/DemoMarketplaceInstall';
import DemoMarketplaceUpload from '../../components/Public/demo/DemoMarketplaceUpload';
import DemoMarketplaceCreator from '../../components/Public/demo/DemoMarketplaceCreator';
import LandingGlassIcon from '../Landing/sections/LandingGlassIcon';
import { MARKETPLACE_PUBLIC_CATEGORIES } from '../../data/marketplaceCategories';
import {
  MARKETPLACE_HUB_INTRO,
  MARKETPLACE_PILLARS,
  SPOTLIGHT_BROWSE,
  SPOTLIGHT_INSTALL,
  SPOTLIGHT_UPLOAD,
  SPOTLIGHT_PUBLISH,
} from '../../data/marketplacePreviewPage';

import AppIcon from '../../components/icons/AppIcon';

const FEATURE_MOSAIC = [
  { iconName: 'SmartToyOutlined', title: 'Agent templates', body: 'Predefined agents with profiles, categories, and ratings.' },
  { iconName: 'PsychologyOutlined', title: 'Skill packs', body: 'Install skills on one or many agents from the marketplace.' },
  { iconName: 'BuildOutlined', title: 'MCP tools', body: 'Platform connectors plus libraries you upload.' },
  { iconName: 'GroupsOutlined', title: 'Consilium boards', body: 'Board templates for virtual directors.' },
  { iconName: 'CorporateFareOutlined', title: 'Org templates', body: 'Organization structures for teams and agents.' },
  { iconName: 'BusinessCenterOutlined', title: 'Business kits', body: 'Verified business model modules.' },
  { iconName: 'IntegrationInstructionsOutlined', title: 'Replicators', body: 'Turn an API into an agent-ready workflow.' },
  { iconName: 'StorefrontOutlined', title: 'Search & sort', body: 'Toolbar filters across every tab.' },
];

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

export default function MarketplacePublic() {
  const theme = useTheme();

  return (
    <PublicShell>
      <HeroAsymmetric
        eyebrow="Marketplace"
        title="Browse, install, upload, and publish in one place."
        subtitle="Seven category tabs in /marketplace — agents, skills, tools, Consilium, orgs, businesses, and replicators. Install to your workspace or publish and earn crypto."
        ctas={
          <>
            <MarketingCtaButton component={RouterLink} to="/marketplace" endIcon={<AppIcon name='ArrowForward' fallback={ArrowForwardIcon} />} sx={{ px: 3, py: 1.25 }}>
              Browse marketplace
            </MarketingCtaButton>
            <Button component={RouterLink} to="/signup" variant="outlined" size="large" endIcon={<AppIcon name='Launch' fallback={LaunchIcon} sx={{ fontSize: 18 }} />} sx={{ fontWeight: 700, borderRadius: 2, textTransform: 'none', px: 3, py: 1.25 }}>
              Become a creator
            </Button>
          </>
        }
        visual={<DemoMarketplaceHub />}
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
              {MARKETPLACE_HUB_INTRO.eyebrow}
            </Typography>
            <Typography component="h2" sx={{ fontWeight: 800, fontSize: { xs: '1.6rem', md: '2.2rem' }, lineHeight: 1.15, color: 'text.primary' }}>
              {MARKETPLACE_HUB_INTRO.title}
            </Typography>
            <Typography sx={{ fontSize: { xs: '1rem', md: '1.08rem' }, color: 'text.secondary', lineHeight: 1.7 }}>
              {MARKETPLACE_HUB_INTRO.subtitle}
            </Typography>
          </Stack>
          <Grid container spacing={2.5}>
            {MARKETPLACE_PILLARS.map((pillar) => (
              <Grid key={pillar.id} size={{ xs: 12, sm: 6 }}>
                <PillarCard pillar={pillar} />
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>
      <Spotlight
        eyebrow={SPOTLIGHT_BROWSE.eyebrow}
        title={SPOTLIGHT_BROWSE.title}
        body={SPOTLIGHT_BROWSE.body}
        bullets={SPOTLIGHT_BROWSE.bullets}
        visual={
          <DemoGlow>
            <Stack spacing={2}>
              <DemoMarketplace />
            </Stack>
          </DemoGlow>
        }
      />
      <Spotlight
        eyebrow={SPOTLIGHT_INSTALL.eyebrow}
        title={SPOTLIGHT_INSTALL.title}
        body={SPOTLIGHT_INSTALL.body}
        bullets={SPOTLIGHT_INSTALL.bullets}
        visual={
          <DemoGlow>
            <DemoMarketplaceInstall />
          </DemoGlow>
        }
        reverse
        bg="tint"
      />
      <Spotlight
        eyebrow={SPOTLIGHT_UPLOAD.eyebrow}
        title={SPOTLIGHT_UPLOAD.title}
        body={SPOTLIGHT_UPLOAD.body}
        bullets={SPOTLIGHT_UPLOAD.bullets}
        visual={
          <DemoGlow>
            <DemoMarketplaceUpload />
          </DemoGlow>
        }
      />
      <Spotlight
        eyebrow={SPOTLIGHT_PUBLISH.eyebrow}
        title={SPOTLIGHT_PUBLISH.title}
        body={SPOTLIGHT_PUBLISH.body}
        bullets={SPOTLIGHT_PUBLISH.bullets}
        visual={
          <DemoGlow>
            <DemoMarketplaceCreator />
          </DemoGlow>
        }
        reverse
        bg="tint"
      />
      <FeatureMosaic title="Inside the marketplace" features={FEATURE_MOSAIC} featuredIndex={0} />
      <Box component="section" sx={{ py: { xs: 4, md: 5 } }}>
        <Container maxWidth="lg">
          <Typography component="h2" sx={{ fontWeight: 800, fontSize: { xs: '1.25rem', md: '1.5rem' }, color: 'text.primary', mb: 2.5, textAlign: 'center' }}>
            Categories in the app
          </Typography>
          <Grid container spacing={2}>
            {MARKETPLACE_PUBLIC_CATEGORIES.map((cat) => (
              <Grid key={cat.id} size={{ xs: 12, sm: 6, md: 4 }}>
                <Stack
                  component={RouterLink}
                  to={`/marketplace?tab=${cat.id}`}
                  spacing={0.75}
                  sx={{
                    p: 2,
                    borderRadius: 2.5,
                    textDecoration: 'none',
                    border: `1px solid ${theme.palette.divider}`,
                    bgcolor: 'background.paper',
                    transition: 'border-color 200ms ease',
                    '&:hover': { borderColor: alpha(theme.palette.primary.main, 0.45) },
                  }}
                >
                  <Typography sx={{ fontWeight: 800, fontSize: '1rem', color: 'text.primary' }}>{cat.label}</Typography>
                  <Typography sx={{ fontSize: '0.85rem', color: 'text.secondary', lineHeight: 1.5 }}>{cat.description}</Typography>
                </Stack>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>
      <RelatedGrid
        title="Pairs well with"
        items={[
          { label: 'Agents', to: '/control/agents', iconName: 'SmartToyOutlined', blurb: 'Build and deploy the agents you install.' },
          { label: 'Tools', to: '/control/tools', iconName: 'ExtensionOutlined', blurb: 'The toolbox your agents reach for.' },
          { label: 'Replicators', to: '/instruments/replicators', iconName: 'IntegrationInstructionsOutlined', blurb: 'Turn APIs into publishable page flows.' },
          { label: 'Requests', to: '/control/requests', iconName: 'TrackChangesOutlined', blurb: 'Run goals with marketplace templates.' },
        ]}
        bg="tint"
      />
      <ClosingCta
        title="Start from a template. Ship by tonight."
        body="Browse the marketplace free, or sign up and install your first agent in minutes."
        primary={{ label: 'Browse marketplace', to: '/marketplace' }}
        secondary={{ label: 'Try it free', to: '/signup' }}
      />
    </PublicShell>
  );
}
