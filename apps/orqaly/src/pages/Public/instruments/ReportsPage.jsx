import { Box, Button, Stack, Typography, alpha, useTheme } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import MarketingCtaButton from '@/components/Public/primitives/MarketingCtaButton';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import LaunchIcon from '@mui/icons-material/Launch';
import CheckIcon from '@mui/icons-material/Check';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import TuneIcon from '@mui/icons-material/Tune';
import PublicShell from '../../../components/Public/PublicShell';
import HeroQuote from '../../../components/Public/primitives/HeroQuote';
import FeatureMosaic from '../../../components/Public/primitives/FeatureMosaic';
import ComparisonMatrix from '../../../components/Public/primitives/ComparisonMatrix';
import Spotlight from '../../../components/Public/primitives/Spotlight';
import RelatedGrid from '../../../components/Public/primitives/RelatedGrid';
import ClosingCta from '../../../components/Public/primitives/ClosingCta';
import DemoReports from '../../../components/Public/demo/DemoReports';
import { ITEMS_BY_SLUG } from '../../../data/instruments';

import AppIcon from '../../../components/icons/AppIcon';

function BrandLockMock() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const isDark = theme.palette.mode === 'dark';
  const swatches = ['#10B981', '#0F172A', '#F59E0B', '#94A3B8'];
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
        Brand kit · applied to every draft
      </Typography>
      <Stack spacing={2}>
        <Stack direction="row" spacing={2} alignItems="center" sx={{ p: 1.75, borderRadius: 2, border: `1px solid ${theme.palette.divider}`, bgcolor: isDark ? alpha('#fff', 0.02) : alpha(theme.palette.text.primary, 0.015) }}>
          <Box
            sx={{
              width: 44,
              height: 44,
              borderRadius: 1.5,
              background: `linear-gradient(135deg, ${primary} 0%, ${alpha(primary, 0.7)} 100%)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontWeight: 800,
              fontSize: '1.1rem',
              letterSpacing: '-0.02em',
            }}
          >
            A
          </Box>
          <Stack spacing={0.25}>
            <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', color: 'text.primary' }}>Acme Co</Typography>
            <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>Logo · light + dark</Typography>
          </Stack>
        </Stack>

        <Box>
          <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: 'text.secondary', mb: 0.75 }}>Palette</Typography>
          <Stack direction="row" spacing={1}>
            {swatches.map((s) => (
              <Box key={s} sx={{ width: 32, height: 32, borderRadius: 1, bgcolor: s, border: `1px solid ${theme.palette.divider}` }} />
            ))}
          </Stack>
        </Box>

        <Box>
          <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: 'text.secondary', mb: 0.75 }}>Typography</Typography>
          <Stack direction="row" spacing={1.5} alignItems="baseline">
            <Typography sx={{ fontWeight: 800, fontSize: '1.05rem', color: 'text.primary' }}>Inter</Typography>
            <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>700 / 600 / 400</Typography>
          </Stack>
        </Box>

        <Box>
          <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: 'text.secondary', mb: 0.75 }}>Tone</Typography>
          <Box sx={{ position: 'relative', height: 6, borderRadius: 999, bgcolor: alpha(primary, 0.12) }}>
            <Box sx={{ position: 'absolute', top: 0, left: '0%', width: '32%', height: '100%', borderRadius: 999, bgcolor: primary }} />
            <Box sx={{ position: 'absolute', top: -4, left: '32%', width: 14, height: 14, borderRadius: '50%', bgcolor: primary, transform: 'translateX(-50%)', boxShadow: `0 0 0 3px ${theme.palette.background.paper}` }} />
          </Box>
          <Stack direction="row" justifyContent="space-between" sx={{ mt: 0.5 }}>
            <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>Friendly</Typography>
            <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>Formal</Typography>
          </Stack>
        </Box>
      </Stack>
      <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mt: 2, pt: 2, borderTop: `1px solid ${theme.palette.divider}`, color: 'primary.main' }}>
        <AppIcon name='Check' fallback={CheckIcon} sx={{ fontSize: 14 }} />
        <Typography sx={{ fontSize: '0.78rem', fontWeight: 700 }}>Applied to 4 reports this week</Typography>
      </Stack>
    </Box>
  );
}

function AiReportCoreMock() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const isDark = theme.palette.mode === 'dark';
  const kpis = ['Revenue $125k · +14%', 'Active leads 142 · +3%', 'CSAT 4.7 · flat', 'Incidents 0'];
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
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <Box sx={{ width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: alpha(primary, 0.18), color: 'primary.main' }}>
          <AppIcon name='AutoAwesome' fallback={AutoAwesomeIcon} sx={{ fontSize: 18 }} />
        </Box>
        <Typography sx={{ fontWeight: 800, fontSize: '0.85rem', color: 'text.primary' }}>AI report core</Typography>
        <Box sx={{ px: 1, py: 0.25, borderRadius: 1, bgcolor: alpha(primary, 0.12), color: 'primary.main', fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.06em' }}>
          AUTO
        </Box>
      </Stack>
      <Box sx={{ borderRadius: 2, border: `1px solid ${theme.palette.divider}`, background: `linear-gradient(135deg, ${alpha(primary, 0.08)} 0%, ${alpha(theme.palette.info.main, 0.05)} 100%)`, p: 1.75, mb: 2 }}>
        <Typography sx={{ fontSize: '0.84rem', color: 'text.primary', lineHeight: 1.6 }}>
          The biggest movers: Revenue is up 14% ($125k); Active leads up 3% (142). No critical alerts firing right now -
          one warning worth a glance on follow-up cadence.
        </Typography>
      </Box>
      <Stack direction="row" useFlexGap flexWrap="wrap" spacing={1} sx={{ mb: 2 }}>
        {kpis.map((k) => (
          <Box key={k} sx={{ px: 1.5, py: 0.75, borderRadius: 999, bgcolor: alpha(primary, 0.08), color: 'primary.main', fontSize: '0.7rem', fontWeight: 700 }}>
            {k}
          </Box>
        ))}
      </Stack>
      <Stack direction="row" spacing={1.25} sx={{ pt: 2, borderTop: `1px solid ${theme.palette.divider}` }}>
        <MarketingCtaButton component={RouterLink} to="/reports"  size="small" endIcon={<AppIcon name='Launch' fallback={LaunchIcon} sx={{ fontSize: 16 }} />} sx={{ fontWeight: 700, borderRadius: 1.5, textTransform: 'none' }}>
          View the result
        </MarketingCtaButton>
        <Button component={RouterLink} to="/reports/builder" variant="text" size="small" startIcon={<AppIcon name='Tune' fallback={TuneIcon} sx={{ fontSize: 16 }} />} sx={{ fontWeight: 700, borderRadius: 1.5, textTransform: 'none' }}>
          Open the builder
        </Button>
      </Stack>
    </Box>
  );
}

export default function ReportsPage() {
  const item = ITEMS_BY_SLUG['instruments:reports'];
  return (
    <PublicShell>
      <HeroQuote
        eyebrow="INSTRUMENTS · Reports"
        quote="12 client reports, one Friday afternoon."
        attribution="Marketing agency, beta user"
        title={item.hero.title}
        subtitle={item.hero.subtitle}
        ctas={
          <>
            <MarketingCtaButton component={RouterLink} to="/reports/builder" endIcon={<AppIcon name='ArrowForward' fallback={ArrowForwardIcon} />} sx={{ px: 3, py: 1.25 }}>
              Open the Report Builder
            </MarketingCtaButton>
            <Button component={RouterLink} to={item.inAppRoute} variant="outlined" size="large" endIcon={<AppIcon name='Launch' fallback={LaunchIcon} sx={{ fontSize: 18 }} />} sx={{ fontWeight: 700, borderRadius: 2, textTransform: 'none', px: 3, py: 1.25 }}>
              View a live report
            </Button>
          </>
        }
        visual={<DemoReports />}
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
        eyebrow="Report Builder · AI report core"
        title="Build the report. The AI core reads the numbers for you."
        body="Drop in the sections you want, point them at live data, and the AI report core writes the summary - calling out the movers, the risks, and the recommendation. Open the result the moment it is ready."
        bullets={[
          'Drag-and-drop sections: KPI grids, charts, tables, alerts',
          'Live data in seconds via webhook, paste, or fetch URL',
          'AI report core narrates the numbers and flags what changed',
          'View the finished result in one click - no rebuild',
        ]}
        visual={<AiReportCoreMock />}
      />
      <Spotlight
        eyebrow="Brand-locked"
        title="Looks like you wrote it. Faster than you could."
        body="The brand kit applies automatically - logo, colors, tone. The agent picks up your voice from past reports stored in the knowledge base. You read, refine, send."
        bullets={[
          'Brand kit applied to every draft',
          'Tone customisable per audience',
          'Versioned with diff-like rollback',
          'Export to PDF, Notion, email, Slack',
        ]}
        visual={<BrandLockMock />}
        bg="tint"
      />
      <FeatureMosaic title="Inside Reports" features={item.features} featuredIndex={0} />
      <ComparisonMatrix
        title="Reports vs. the alternatives"
        competitors={[
          { id: 'orqaly', label: 'Orqaly Reports', us: true },
          { id: 'chatgpt', label: 'ChatGPT' },
          { id: 'tableau', label: 'Tableau / Looker' },
          { id: 'manual', label: 'Hand-built' },
        ]}
        rows={[
          { capability: 'Reads from your live data sources', values: { orqaly: true, chatgpt: false, tableau: true, manual: 'partial' } },
          { capability: 'Brand-locked output by default', values: { orqaly: true, chatgpt: false, tableau: 'partial', manual: true } },
          { capability: 'Prose narrative around the numbers', values: { orqaly: true, chatgpt: true, tableau: false, manual: true } },
          { capability: 'Scheduled recurring delivery', values: { orqaly: true, chatgpt: false, tableau: true, manual: false } },
          { capability: 'Citations / audit trail of which data was used', values: { orqaly: true, chatgpt: false, tableau: 'partial', manual: false } },
        ]}
        bg="tint"
      />
      <RelatedGrid
        title="Pairs well with"
        items={[
          { label: 'Dashboards', to: '/instruments/dashboards', iconName: 'DashboardOutlined', blurb: 'Charts and KPIs that feed your reports.' },
          { label: 'Knowledge Base', to: '/instruments/knowledge-base', iconName: 'MenuBookOutlined', blurb: 'Source of the prose voice and policies.' },
          { label: 'Projects', to: '/instruments/projects', iconName: 'FolderOpenOutlined', blurb: 'Group recurring reports under one outcome.' },
        ]}
      />
      <ClosingCta title="Your Friday afternoon, back." />
    </PublicShell>
  );
}
