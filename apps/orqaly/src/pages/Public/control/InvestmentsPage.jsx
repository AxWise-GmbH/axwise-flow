import { Box, Button, Stack, Typography, alpha, useTheme } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import MarketingCtaButton from '@/components/Public/primitives/MarketingCtaButton';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import LaunchIcon from '@mui/icons-material/Launch';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import PublicShell from '../../../components/Public/PublicShell';
import HeroSplit from '../../../components/Public/primitives/HeroSplit';
import StatsRow from '../../../components/Public/primitives/StatsRow';
import FeatureMosaic from '../../../components/Public/primitives/FeatureMosaic';
import Spotlight from '../../../components/Public/primitives/Spotlight';
import RelatedGrid from '../../../components/Public/primitives/RelatedGrid';
import ClosingCta from '../../../components/Public/primitives/ClosingCta';
import DemoInvestments from '../../../components/Public/demo/DemoInvestments';
import { ITEMS_BY_SLUG } from '../../../data/instruments';

import AppIcon from '../../../components/icons/AppIcon';

function InvestorProfileMock() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const isDark = theme.palette.mode === 'dark';
  return (
    <Box
      sx={{
        position: 'relative',
        borderRadius: 4,
        overflow: 'hidden',
        bgcolor: isDark ? alpha('#fff', 0.025) : '#fff',
        border: `1px solid ${theme.palette.divider}`,
        boxShadow: `0 20px 50px ${alpha(primary, 0.18)}`,
      }}
    >
      <Stack direction="row" alignItems="center" spacing={2} sx={{ p: 2.5, borderBottom: `1px solid ${theme.palette.divider}`, bgcolor: isDark ? alpha('#fff', 0.02) : alpha(theme.palette.text.primary, 0.02) }}>
        <Box
          sx={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: `linear-gradient(135deg, ${primary} 0%, ${alpha(primary, 0.7)} 100%)`,
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
            fontSize: '1.05rem',
            letterSpacing: '-0.01em',
          }}
        >
          SP
        </Box>
        <Stack sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography sx={{ fontWeight: 800, fontSize: '1rem', color: 'text.primary' }}>Sofia Petrova</Typography>
            <Box sx={{ px: 0.75, py: 0.2, borderRadius: 0.75, bgcolor: alpha(primary, 0.12), color: 'primary.main', fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.04em' }}>
              ACTIVE
            </Box>
          </Stack>
          <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>LP · joined 2024 · trust 92%</Typography>
        </Stack>
        <AppIcon
          name='LockOutlined'
          fallback={LockOutlinedIcon}
          sx={{ color: 'text.secondary', fontSize: 18 }}
          aria-hidden />
      </Stack>
      <Stack spacing={2} sx={{ p: 2.5 }}>
        <Box>
          <Typography sx={{ fontSize: '0.68rem', fontWeight: 800, color: 'text.secondary', letterSpacing: '0.08em', textTransform: 'uppercase', mb: 0.75 }}>
            Preferences
          </Typography>
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
            {['Healthcare', 'AI infra', 'Climate'].map((tag) => (
              <Box key={tag} sx={{ px: 1.25, py: 0.4, borderRadius: 999, bgcolor: alpha(primary, 0.1), color: 'primary.main', fontSize: '0.72rem', fontWeight: 700 }}>
                {tag}
              </Box>
            ))}
            <Box sx={{ px: 1.25, py: 0.4, borderRadius: 999, bgcolor: alpha(theme.palette.warning.main, 0.12), color: 'warning.main', fontSize: '0.72rem', fontWeight: 700 }}>
              Risk: balanced
            </Box>
          </Stack>
        </Box>

        <Box>
          <Typography sx={{ fontSize: '0.68rem', fontWeight: 800, color: 'text.secondary', letterSpacing: '0.08em', textTransform: 'uppercase', mb: 0.75 }}>
            Recent commitments
          </Typography>
          <Stack spacing={0.75}>
            {[
              { deal: 'Nimbus AI', amount: '$120k', date: 'Apr 2026' },
              { deal: 'Helix Health', amount: '$50k', date: 'Feb 2026' },
              { deal: 'Solstice', amount: '$75k', date: 'Nov 2025' },
            ].map((c) => (
              <Stack key={c.deal} direction="row" alignItems="center" sx={{ py: 0.5, borderBottom: `1px solid ${theme.palette.divider}` }}>
                <Typography sx={{ flex: 1, fontWeight: 700, fontSize: '0.82rem', color: 'text.primary' }}>{c.deal}</Typography>
                <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary', mr: 1.5 }}>{c.date}</Typography>
                <Typography sx={{ fontWeight: 800, fontSize: '0.85rem', color: 'primary.main' }}>{c.amount}</Typography>
              </Stack>
            ))}
          </Stack>
        </Box>

        <Stack direction="row" justifyContent="space-between" sx={{ pt: 1, borderTop: `1px solid ${theme.palette.divider}` }}>
          <Stack>
            <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Capacity</Typography>
            <Typography sx={{ fontWeight: 800, fontSize: '0.95rem', color: 'text.primary' }}>$500k</Typography>
          </Stack>
          <Stack alignItems="flex-end">
            <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Returns</Typography>
            <Typography sx={{ fontWeight: 800, fontSize: '0.95rem', color: 'primary.main' }}>+24%</Typography>
          </Stack>
        </Stack>
      </Stack>
    </Box>
  );
}

export default function InvestmentsPage() {
  const item = ITEMS_BY_SLUG['control:investments'];
  return (
    <PublicShell>
      <HeroSplit
        eyebrow="CONTROL POINT · Investments"
        title={item.hero.title}
        subtitle={item.hero.subtitle}
        ctas={
          <>
            <MarketingCtaButton component={RouterLink} to="/signup" endIcon={<AppIcon name='ArrowForward' fallback={ArrowForwardIcon} />} sx={{ px: 3, py: 1.25 }}>
              Set up your workspace
            </MarketingCtaButton>
            <Button component={RouterLink} to={item.inAppRoute} variant="outlined" size="large" endIcon={<AppIcon name='Launch' fallback={LaunchIcon} sx={{ fontSize: 18 }} />} sx={{ fontWeight: 700, borderRadius: 2, textTransform: 'none', px: 3, py: 1.25 }}>
              Open in app
            </Button>
          </>
        }
        visual={<DemoInvestments />}
      />
      <StatsRow
        title="Built around the questions an LP actually asks"
        stats={[
          { value: 'RLS', label: 'Per-investor isolation', sub: 'No accidental leaks' },
          { value: 'UUID', label: 'Gated public profiles', sub: 'Share without exposure' },
          { value: 'ROI', label: 'Per deal + per investor', sub: 'Rolled up automatically' },
          { value: 'Audit', label: 'Every state change', sub: 'Defensible by default' },
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
      <Spotlight
        eyebrow="Investor-side first"
        title="Built around the investor, not the cap table."
        body="Carta and friends start from the company side. Investments starts from the LP side - profiles, preferences, history, returns. The cap table is a consequence, not the centerpiece."
        bullets={[
          'Investor profiles with risk preferences',
          'Public profile pages (UUID-gated)',
          'Deal pipeline with custom stages',
          'Returns rolled up automatically',
        ]}
        visual={<InvestorProfileMock />}
      />
      <FeatureMosaic title="Inside Investments" features={item.features} featuredIndex={0} bg="tint" />
      <RelatedGrid
        title="Pairs well with"
        items={[
          { label: 'Organizations', to: '/control/organizations', iconName: 'BusinessOutlined', blurb: 'Run multiple funds or vehicles from one login.' },
          { label: 'Reports', to: '/instruments/reports', iconName: 'AssessmentOutlined', blurb: 'Quarterly LP updates drafted from the data.' },
          { label: 'Dashboards', to: '/instruments/dashboards', iconName: 'DashboardOutlined', blurb: 'Portfolio health at a glance.' },
        ]}
      />
      <ClosingCta title="Run your capital workflow like a product." />
    </PublicShell>
  );
}
