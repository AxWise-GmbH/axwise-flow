import { Box, Button, Stack, Typography, alpha, useTheme } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import MarketingCtaButton from '@/components/Public/primitives/MarketingCtaButton';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import LaunchIcon from '@mui/icons-material/Launch';
import LanguageOutlinedIcon from '@mui/icons-material/LanguageOutlined';
import CallSplitIcon from '@mui/icons-material/CallSplit';
import PublicShell from '../../../components/Public/PublicShell';
import HeroAsymmetric from '../../../components/Public/primitives/HeroAsymmetric';
import Spotlight from '../../../components/Public/primitives/Spotlight';
import FeatureMosaic from '../../../components/Public/primitives/FeatureMosaic';
import RelatedGrid from '../../../components/Public/primitives/RelatedGrid';
import ClosingCta from '../../../components/Public/primitives/ClosingCta';
import DemoReplicators from '../../../components/Public/demo/DemoReplicators';
import { ITEMS_BY_SLUG } from '../../../data/instruments';

import AppIcon from '../../../components/icons/AppIcon';

function CloneFamilyMock() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const isDark = theme.palette.mode === 'dark';
  const variants = [
    { label: 'Healthcare', accent: '#10B981' },
    { label: 'E-commerce', accent: '#F59E0B' },
    { label: 'Education', accent: '#6366F1' },
  ];
  return (
    <Box
      sx={{
        position: 'relative',
        borderRadius: 4,
        overflow: 'hidden',
        bgcolor: isDark ? alpha('#fff', 0.025) : '#fff',
        border: `1px solid ${theme.palette.divider}`,
        boxShadow: `0 20px 50px ${alpha(primary, 0.18)}`,
        p: { xs: 2.5, md: 3 },
      }}
    >
      <Typography sx={{ fontWeight: 800, fontSize: '0.72rem', color: 'text.secondary', letterSpacing: '0.08em', textTransform: 'uppercase', mb: 2 }}>
        One template · three audiences
      </Typography>
      <Stack direction="row" spacing={2} alignItems="center">
        <Stack
          spacing={1}
          alignItems="center"
          sx={{
            p: 2,
            borderRadius: 2.5,
            border: `2px solid ${alpha(primary, 0.45)}`,
            bgcolor: alpha(primary, 0.06),
            minWidth: 120,
            flexShrink: 0,
          }}
        >
          <Box
            sx={{
              width: 38,
              height: 38,
              borderRadius: 1.5,
              bgcolor: alpha(primary, 0.18),
              color: 'primary.main',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <AppIcon
              name='LanguageOutlined'
              fallback={LanguageOutlinedIcon}
              sx={{ fontSize: 20 }} />
          </Box>
          <Typography sx={{ fontWeight: 800, fontSize: '0.82rem', color: 'text.primary' }}>Template</Typography>
          <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary', textAlign: 'center' }}>Landing v2</Typography>
        </Stack>

        <Stack alignItems="center" justifyContent="center" sx={{ color: 'primary.main', flexShrink: 0 }}>
          <AppIcon
            name='CallSplit'
            fallback={CallSplitIcon}
            sx={{ fontSize: 28, transform: 'rotate(90deg)' }} />
        </Stack>

        <Stack spacing={1} sx={{ flex: 1 }}>
          {variants.map((v) => (
            <Stack
              key={v.label}
              direction="row"
              alignItems="center"
              spacing={1.5}
              sx={{
                p: 1.5,
                borderRadius: 2,
                border: `1px solid ${theme.palette.divider}`,
                bgcolor: isDark ? alpha('#fff', 0.02) : alpha(theme.palette.text.primary, 0.015),
                borderLeft: `3px solid ${v.accent}`,
              }}
            >
              <Box sx={{ width: 24, height: 24, borderRadius: 1, bgcolor: alpha(v.accent, 0.15), color: v.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <AppIcon
                  name='LanguageOutlined'
                  fallback={LanguageOutlinedIcon}
                  sx={{ fontSize: 14 }} />
              </Box>
              <Stack sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontWeight: 700, fontSize: '0.82rem', color: 'text.primary' }}>{v.label}</Typography>
                <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary', fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}>
                  {v.label.toLowerCase().replace(/[^a-z]/g, '')}.orqaly.test
                </Typography>
              </Stack>
              <Box sx={{ px: 0.75, py: 0.2, borderRadius: 0.75, bgcolor: alpha(primary, 0.12), color: 'primary.main', fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.04em' }}>
                LIVE
              </Box>
            </Stack>
          ))}
        </Stack>
      </Stack>
    </Box>
  );
}

export default function ReplicatorsPage() {
  const item = ITEMS_BY_SLUG['instruments:replicators'];
  return (
    <PublicShell>
      <HeroAsymmetric
        eyebrow="INSTRUMENTS · Replicators"
        title={item.hero.title}
        subtitle={item.hero.subtitle}
        ctas={
          <>
            <MarketingCtaButton component={RouterLink} to="/signup" endIcon={<AppIcon name='ArrowForward' fallback={ArrowForwardIcon} />} sx={{ px: 3, py: 1.25 }}>
              Spin up a site
            </MarketingCtaButton>
            <Button component={RouterLink} to={item.inAppRoute} variant="outlined" size="large" endIcon={<AppIcon name='Launch' fallback={LaunchIcon} sx={{ fontSize: 18 }} />} sx={{ fontWeight: 700, borderRadius: 2, textTransform: 'none', px: 3, py: 1.25 }}>
              Open in app
            </Button>
          </>
        }
        visual={<DemoReplicators />}
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
      <Spotlight
        eyebrow="One click clone"
        title="Same template. Different audience. Five minutes."
        body="Replicators let you stamp out the same site shape with new copy, branding, and SEO - because the second site you build for a campaign or vertical should not take a second week."
        bullets={[
          'Auto-fill from the knowledge base',
          'Brand kit applied automatically',
          'Custom domains, SEO defaults baked in',
          'Analytics integrated from day one',
        ]}
        visual={<CloneFamilyMock />}
        bg="tint"
        reverse
      />
      <FeatureMosaic title="Inside Replicators" features={item.features} featuredIndex={0} />
      <RelatedGrid
        title="Pairs well with"
        items={[
          { label: 'Knowledge Base', to: '/instruments/knowledge-base', iconName: 'MenuBookOutlined', blurb: 'Where the copy comes from.' },
          { label: 'Marketplace', to: '/marketplace-preview', iconName: 'StorefrontRounded', blurb: 'Discover templates to start from.' },
          { label: 'Agents', to: '/control/agents', iconName: 'SmartToyOutlined', blurb: 'Wire site events into agent actions.' },
        ]}
        bg="tint"
      />
      <ClosingCta title="A site in five minutes. Live in ten." />
    </PublicShell>
  );
}
