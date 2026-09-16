import { Box, Button, Stack, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import MarketingCtaButton from '@/components/Public/primitives/MarketingCtaButton';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import LaunchIcon from '@mui/icons-material/Launch';
import PublicShell from '../../../components/Public/PublicShell';
import HeroSplit from '../../../components/Public/primitives/HeroSplit';
import StatsRow from '../../../components/Public/primitives/StatsRow';
import Spotlight from '../../../components/Public/primitives/Spotlight';
import FeatureMosaic from '../../../components/Public/primitives/FeatureMosaic';
import SimpleModeGallery from '../../../components/Public/primitives/SimpleModeGallery';
import RelatedGrid from '../../../components/Public/primitives/RelatedGrid';
import ClosingCta from '../../../components/Public/primitives/ClosingCta';
import DemoSimpleMode from '../../../components/Public/demo/DemoSimpleMode';
import SimpleModeToggleMock from '../../../components/Public/demo/SimpleModeToggleMock';
import SimpleModeIntroMock from '../../../components/Public/demo/SimpleModeIntroMock';
import { ITEMS_BY_SLUG } from '../../../data/instruments';

import AppIcon from '../../../components/icons/AppIcon';

export default function SimpleModePage() {
  const item = ITEMS_BY_SLUG['control:simple-mode'];
  return (
    <PublicShell>
      <HeroSplit
        eyebrow="CONTROL POINT · Simple Mode"
        title={item.hero.title}
        subtitle={item.hero.subtitle}
        ctas={
          <>
            <MarketingCtaButton
              component={RouterLink}
              to="/signup"
                            size="large"
              endIcon={<AppIcon name='ArrowForward' fallback={ArrowForwardIcon} />}
              sx={{ fontWeight: 700, borderRadius: 2, textTransform: 'none', px: 3, py: 1.25 }}
            >
              Start in Simple Mode
            </MarketingCtaButton>
            <Button
              component={RouterLink}
              to={item.inAppRoute}
              variant="outlined"
              size="large"
              endIcon={<AppIcon name='Launch' fallback={LaunchIcon} sx={{ fontSize: 18 }} />}
              sx={{ fontWeight: 700, borderRadius: 2, textTransform: 'none', px: 3, py: 1.25 }}
            >
              Open home
            </Button>
          </>
        }
        visual={<DemoSimpleMode />}
      />
      <StatsRow
        title="Built for operators who want outcomes, not admin chrome"
        stats={[
          { value: 'Default', label: 'Card-first UI', sub: 'New users land here' },
          { value: '4', label: 'Dock destinations', sub: 'Always one tap away' },
          { value: '5', label: 'Step intro tour', sub: 'On enable' },
          { value: 'Guard', label: 'Safe routes', sub: 'No partner-admin drift' },
        ]}
        bg="tint"
      />
      <Box component="section" sx={{ py: { xs: 5, md: 8 } }}>
        <Box sx={{ maxWidth: 720, mx: 'auto', px: { xs: 2, md: 3 } }}>
          <Stack spacing={2.5}>
            {item.description.map((p, i) => (
              <Typography key={i} sx={{ fontSize: { xs: '1rem', md: '1.1rem' }, color: 'text.primary', lineHeight: 1.75 }}>
                {p}
              </Typography>
            ))}
          </Stack>
        </Box>
      </Box>
      <SimpleModeGallery />
      <Spotlight
        eyebrow="Your choice"
        title="Simple when you want calm. Advanced when you need control."
        body="Flip the platform mode from your profile menu. Simple Mode hides the dense sidebar and shows the dock. Advanced restores CONTROL POINT, INSTRUMENTS, and BUSINESS groups for full administration."
        bullets={[
          'Preference synced to your account',
          'Five-step tour when switching to Simple',
          'Client roles can lock Simple only',
          'Advanced sends power users to Agent Hub',
        ]}
        visual={<SimpleModeToggleMock />}
        bg="tint"
      />
      <Spotlight
        eyebrow="Onboarding"
        title="A guided tour the first time you go simple."
        body="Each step pairs an illustration with plain-language copy: start a goal, bundle work under organizations, wire providers, watch dashboards, hire from the marketplace."
        bullets={[
          'Keyboard arrows to step through',
          'Explore Platform or Setup Everything',
          'Consumer onboarding for requests (3 steps)',
          'Same art system as marketplace tiles',
        ]}
        visual={<SimpleModeIntroMock />}
        reverse
      />
      <FeatureMosaic title="Inside Simple Mode" features={item.features} featuredIndex={0} bg="tint" />
      <RelatedGrid
        title="Pairs well with"
        items={[
          { label: 'Requests', to: '/control/requests', iconName: 'InboxOutlined', blurb: 'Submit and track every ask from the menu.' },
          { label: 'Organizations', to: '/control/organizations', iconName: 'BusinessOutlined', blurb: 'Multi-tenant workspaces with simple tiles.' },
          { label: 'Marketplace', to: '/marketplace-preview', iconName: 'StorefrontOutlined', blurb: 'Hire agents and templates from the dock.' },
        ]}
      />
      <ClosingCta title="Work in Simple Mode. Scale in Advanced." />
    </PublicShell>
  );
}
