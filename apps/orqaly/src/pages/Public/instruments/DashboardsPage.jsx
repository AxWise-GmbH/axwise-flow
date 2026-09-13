import { useState } from 'react';
import {
  Box,
  Button,
  Container,
  Grid,
  Stack,
  Typography,
  alpha,
  useTheme,
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import MarketingCtaButton from '@/components/Public/primitives/MarketingCtaButton';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import LaunchIcon from '@mui/icons-material/Launch';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import DashboardCustomizeOutlinedIcon from '@mui/icons-material/DashboardCustomizeOutlined';
import EditNoteOutlinedIcon from '@mui/icons-material/EditNoteOutlined';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';
import PublicShell from '../../../components/Public/PublicShell';
import HeroSplit from '../../../components/Public/primitives/HeroSplit';
import FeatureMosaic from '../../../components/Public/primitives/FeatureMosaic';
import RelatedGrid from '../../../components/Public/primitives/RelatedGrid';
import ClosingCta from '../../../components/Public/primitives/ClosingCta';
import DemoDashboard from '../../../components/Public/demo/DemoDashboard';
import DemoDashboardTemplatePreview from '../../../components/Public/demo/dashboardPreview/DemoDashboardTemplatePreview';
import { TEMPLATE_CATEGORIES } from '../../../data/dashboardTemplates';
import { ITEMS_BY_SLUG } from '../../../data/instruments';

import AppIcon from '../../../components/icons/AppIcon';

const BUILDER_STEPS = [
  { n: '01', title: 'Describe', body: 'Type the metric or dashboard you want in plain English.' },
  { n: '02', title: 'Refine', body: 'Pick a time range and chart style - two quick taps.' },
  { n: '03', title: 'Live', body: 'Your board pulls real account data and is ready to share.' },
];

const STARTER_PROMPTS = [
  { label: 'AI Costs', text: 'Show my AI costs by model this month' },
  { label: 'Marketing ROI', text: 'Marketing ROI by channel this quarter' },
  { label: 'Ops throughput', text: 'Ops throughput and SLA breaches' },
  { label: 'Profit & Loss', text: 'Revenue, MRR, and partner payouts' },
];

const TIME_RANGES = ['Last 7 days', 'Last 30 days', 'This quarter', 'All time'];
const CHART_STYLES = ['Big numbers', 'Bar chart', 'Line / trend', 'Table'];

function PathCard({ kicker, title, body, bullets, to, cta, accent = 'primary', icon: Icon }) {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const isDark = theme.palette.mode === 'dark';
  const color = accent === 'secondary' ? theme.palette.info.main : primary;
  return (
    <Box
      sx={{
        height: '100%',
        p: { xs: 2.5, md: 3 },
        borderRadius: 4,
        border: `1px solid ${alpha(color, 0.35)}`,
        bgcolor: isDark ? alpha(color, 0.06) : alpha(color, 0.04),
        backgroundImage: `radial-gradient(ellipse at 100% 0%, ${alpha(color, 0.14)} 0%, transparent 55%)`,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      <Stack direction="row" spacing={1.5} alignItems="center">
        <Box sx={{ width: 44, height: 44, borderRadius: 2, bgcolor: alpha(color, 0.15), color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon sx={{ fontSize: 24 }} />
        </Box>
        <Box>
          <Typography sx={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color }}>
            {kicker}
          </Typography>
          <Typography sx={{ fontWeight: 800, fontSize: '1.25rem', color: 'text.primary', lineHeight: 1.2 }}>
            {title}
          </Typography>
        </Box>
      </Stack>
      <Typography sx={{ fontSize: '0.92rem', color: 'text.secondary', lineHeight: 1.6 }}>{body}</Typography>
      <Stack spacing={1} sx={{ flex: 1 }}>
        {bullets.map((b) => (
          <Typography key={b} sx={{ fontSize: '0.85rem', color: 'text.primary', pl: 1.5, borderLeft: `2px solid ${alpha(color, 0.5)}` }}>
            {b}
          </Typography>
        ))}
      </Stack>
      <MarketingCtaButton
        component={RouterLink}
        to={to}
        endIcon={<AppIcon name='ArrowForward' fallback={ArrowForwardIcon} />}
        sx={{ alignSelf: 'flex-start', fontWeight: 700, borderRadius: 999, textTransform: 'none', bgcolor: color, '&:hover': { bgcolor: color, filter: 'brightness(1.08)' } }}
      >
        {cta}
      </MarketingCtaButton>
    </Box>
  );
}

function BuilderPanel() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const isDark = theme.palette.mode === 'dark';
  const [promptIdx, setPromptIdx] = useState(0);
  const prompt = STARTER_PROMPTS[promptIdx].text;

  return (
    <Box
      id="dashboard-builder"
      component="section"
      sx={{
        py: { xs: 6, md: 9 },
        bgcolor: alpha(theme.palette.text.primary, 0.02),
        borderTop: `1px solid ${theme.palette.divider}`,
        borderBottom: `1px solid ${theme.palette.divider}`,
      }}
    >
      <Container maxWidth="lg">
        <Stack spacing={1.5} alignItems="center" textAlign="center" sx={{ mb: { xs: 4, md: 6 } }}>
          <Typography sx={{ fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'primary.main' }}>
            Dashboard Builder
          </Typography>
          <Typography component="h2" sx={{ fontWeight: 800, fontSize: { xs: '1.75rem', md: '2.5rem' }, lineHeight: 1.12, maxWidth: 680 }}>
            One sentence in. Two quick questions. A live board out.
          </Typography>
          <Typography sx={{ fontSize: '1rem', color: 'text.secondary', maxWidth: 560 }}>
            No SQL. No semantic model. Describe what you want - the builder picks charts, pulls your real data, and ships it.
          </Typography>
        </Stack>

        <Grid container spacing={3} alignItems="stretch">
          <Grid size={{ xs: 12, lg: 5 }}>
            <Stack spacing={2.5} sx={{ height: '100%' }}>
              {BUILDER_STEPS.map((step, i) => {
                const icons = [EditNoteOutlinedIcon, TuneOutlinedIcon, InsightsOutlinedIcon];
                const StepIcon = icons[i];
                return (
                  <Stack key={step.n} direction="row" spacing={2} alignItems="flex-start">
                    <Box sx={{ width: 48, height: 48, borderRadius: 2, flexShrink: 0, bgcolor: alpha(primary, 0.12), color: 'primary.main', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <StepIcon sx={{ fontSize: 22 }} />
                    </Box>
                    <Box>
                      <Typography sx={{ fontWeight: 800, fontSize: '1.05rem', color: 'text.primary' }}>{step.title}</Typography>
                      <Typography sx={{ fontSize: '0.88rem', color: 'text.secondary', lineHeight: 1.55, mt: 0.25 }}>{step.body}</Typography>
                    </Box>
                  </Stack>
                );
              })}
            </Stack>
          </Grid>

          <Grid size={{ xs: 12, lg: 7 }}>
            <Box
              sx={{
                p: { xs: 2.5, md: 3 },
                borderRadius: 4,
                border: `1px solid ${alpha(primary, 0.35)}`,
                bgcolor: isDark ? alpha('#fff', 0.03) : '#fff',
                boxShadow: `0 24px 60px ${alpha(primary, 0.12)}`,
              }}
            >
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
                <AppIcon
                  name='AutoAwesomeOutlined'
                  fallback={AutoAwesomeOutlinedIcon}
                  sx={{ color: 'primary.main', fontSize: 20 }} />
                <Typography sx={{ fontWeight: 800, fontSize: '0.85rem' }}>Try it now</Typography>
              </Stack>

              <Box
                sx={{
                  mb: 2,
                  p: 1.5,
                  borderRadius: 2,
                  bgcolor: alpha(primary, 0.06),
                  border: `1px solid ${alpha(primary, 0.2)}`,
                  fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                  fontSize: '0.84rem',
                  fontStyle: 'italic',
                }}
              >
                “{prompt}”
              </Box>

              <Typography sx={{ fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'text.secondary', mb: 0.75 }}>
                Time range
              </Typography>
              <Stack direction="row" useFlexGap flexWrap="wrap" spacing={0.75} sx={{ mb: 2 }}>
                {TIME_RANGES.map((r, i) => (
                  <Box key={r} sx={{ px: 1.25, py: 0.5, borderRadius: 999, fontSize: '0.72rem', fontWeight: 700, border: `1px solid ${i === 1 ? primary : alpha(primary, 0.25)}`, bgcolor: i === 1 ? alpha(primary, 0.14) : 'transparent', color: i === 1 ? 'primary.main' : 'text.primary' }}>
                    {r}
                  </Box>
                ))}
              </Stack>

              <Typography sx={{ fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'text.secondary', mb: 0.75 }}>
                Chart style
              </Typography>
              <Stack direction="row" useFlexGap flexWrap="wrap" spacing={0.75} sx={{ mb: 2 }}>
                {CHART_STYLES.map((s, i) => (
                  <Box key={s} sx={{ px: 1.25, py: 0.5, borderRadius: 999, fontSize: '0.72rem', fontWeight: 700, border: `1px solid ${i === 0 ? primary : alpha(primary, 0.25)}`, bgcolor: i === 0 ? alpha(primary, 0.14) : 'transparent', color: i === 0 ? 'primary.main' : 'text.primary' }}>
                    {s}
                  </Box>
                ))}
              </Stack>

              <Stack direction="row" useFlexGap flexWrap="wrap" spacing={0.75} sx={{ mb: 2.5 }}>
                {STARTER_PROMPTS.map((p, i) => (
                  <Box
                    key={p.label}
                    component="button"
                    type="button"
                    onClick={() => setPromptIdx(i)}
                    sx={{
                      border: `1px solid ${promptIdx === i ? primary : alpha(primary, 0.25)}`,
                      bgcolor: promptIdx === i ? alpha(primary, 0.12) : alpha(primary, 0.04),
                      color: promptIdx === i ? 'primary.main' : 'text.primary',
                      borderRadius: 999,
                      px: 1.25,
                      py: 0.5,
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    {p.label}
                  </Box>
                ))}
              </Stack>

              <MarketingCtaButton component={RouterLink} to="/dashboards/new" endIcon={<AppIcon name='Launch' fallback={LaunchIcon} sx={{ fontSize: 18 }} />} sx={{ fontWeight: 700, borderRadius: 999, textTransform: 'none' }}>
                Build it
              </MarketingCtaButton>
            </Box>
          </Grid>
        </Grid>

        <Box sx={{ mt: 4 }}>
          <Typography sx={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary', mb: 1.5, textAlign: 'center' }}>
            What you get
          </Typography>
          <DemoDashboard />
        </Box>
      </Container>
    </Box>
  );
}

function TemplatesGallery() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const isDark = theme.palette.mode === 'dark';
  const [activeId, setActiveId] = useState(TEMPLATE_CATEGORIES[0].id);
  const active = TEMPLATE_CATEGORIES.find((c) => c.id === activeId) ?? TEMPLATE_CATEGORIES[0];

  return (
    <Box id="dashboard-templates" component="section" sx={{ py: { xs: 6, md: 9 } }}>
      <Container maxWidth="lg">
        <Stack spacing={1.5} alignItems="center" textAlign="center" sx={{ mb: { xs: 4, md: 6 } }}>
          <Typography sx={{ fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'primary.main' }}>
            Templates
          </Typography>
          <Typography component="h2" sx={{ fontWeight: 800, fontSize: { xs: '1.75rem', md: '2.5rem' }, lineHeight: 1.12, maxWidth: 680 }}>
            Pick a category. Fork it. Tweak in English.
          </Typography>
          <Typography sx={{ fontSize: '1rem', color: 'text.secondary', maxWidth: 560 }}>
            Ready-made starting points for every part of the business - AI costs, marketing, ops, finance, partners, or a blank canvas.
          </Typography>
        </Stack>

        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 5 }}>
            <Stack spacing={1}>
              {TEMPLATE_CATEGORIES.map((c) => {
                const selected = c.id === activeId;
                return (
                  <Box
                    key={c.id}
                    component="button"
                    type="button"
                    onClick={() => setActiveId(c.id)}
                    sx={{
                      width: '100%',
                      textAlign: 'left',
                      p: 2,
                      borderRadius: 3,
                      border: `1px solid ${selected ? c.tint : theme.palette.divider}`,
                      bgcolor: selected ? alpha(c.tint, isDark ? 0.12 : 0.08) : isDark ? alpha('#fff', 0.02) : alpha(theme.palette.text.primary, 0.015),
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      transition: 'border-color 180ms ease, background-color 180ms ease, transform 180ms ease',
                      '&:hover': { borderColor: alpha(c.tint, 0.55), transform: 'translateX(4px)' },
                      '@media (prefers-reduced-motion: reduce)': { '&:hover': { transform: 'none' } },
                    }}
                  >
                    <Stack direction="row" spacing={1.5} alignItems="center">
                      <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: c.tint, flexShrink: 0 }} />
                      <Box>
                        <Typography sx={{ fontWeight: 800, fontSize: '0.95rem', color: 'text.primary' }}>{c.title}</Typography>
                        <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary', lineHeight: 1.45 }}>{c.blurb}</Typography>
                      </Box>
                    </Stack>
                  </Box>
                );
              })}
            </Stack>
            <Button
              component={RouterLink}
              to="/dashboards"
              variant="outlined"
              endIcon={<AppIcon name='Launch' fallback={LaunchIcon} sx={{ fontSize: 18 }} />}
              sx={{ mt: 2.5, fontWeight: 700, borderRadius: 999, textTransform: 'none', borderColor: alpha(primary, 0.4) }}
            >
              Browse all templates
            </Button>
          </Grid>
          <Grid size={{ xs: 12, md: 7 }}>
            <Box
              key={activeId}
              sx={{
                '@media (prefers-reduced-motion: no-preference)': {
                  animation: 'fadeIn 280ms ease',
                  '@keyframes fadeIn': { from: { opacity: 0.6 }, to: { opacity: 1 } },
                },
              }}
            >
              <DemoDashboardTemplatePreview category={active} />
            </Box>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
}

export default function DashboardsPage() {
  const item = ITEMS_BY_SLUG['instruments:dashboards'];
  return (
    <PublicShell>
      <HeroSplit
        eyebrow="INSTRUMENTS · Dashboards"
        title={item.hero.title}
        subtitle={item.hero.subtitle}
        bgVariant="mesh"
        ctas={
          <>
            <MarketingCtaButton component={RouterLink} to="/dashboards/new"  size="large" endIcon={<AppIcon name='ArrowForward' fallback={ArrowForwardIcon} />} sx={{ fontWeight: 700, borderRadius: 999, textTransform: 'none', px: 3, py: 1.25 }}>
              Open the Dashboard Builder
            </MarketingCtaButton>
            <Button component={RouterLink} to="#dashboard-templates" variant="outlined" size="large" sx={{ fontWeight: 700, borderRadius: 999, textTransform: 'none', px: 3, py: 1.25 }}>
              See templates
            </Button>
          </>
        }
        visual={
          <Box
            sx={{
              p: 2,
              borderRadius: 3,
              border: (t) => `1px solid ${alpha(t.palette.primary.main, 0.25)}`,
              bgcolor: (t) => alpha(t.palette.primary.main, 0.06),
              fontFamily: 'ui-monospace, SFMono-Regular, monospace',
              fontSize: '0.9rem',
            }}
          >
            <Box component="span" sx={{ color: 'primary.main', fontWeight: 800, mr: 1 }}>›</Box>
            Show me agent runs by channel for last 7 days, plus refund rate trend.
          </Box>
        }
      />
      <Box sx={{ mt: { xs: -3, md: -5 }, pb: { xs: 4, md: 6 }, position: 'relative', zIndex: 2 }}>
        <Container maxWidth="lg">
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6 }}>
              <PathCard
                kicker="Dashboard Builder"
                title="Describe it. Ship it."
                body="Type what you want to see. Answer two quick questions. Get a live dashboard from your real data."
                bullets={['Plain-English prompts - no SQL', 'Adaptive to AI costs, marketing, ops, finance', 'Share by link when it is ready']}
                to="/dashboards/new"
                cta="Open the builder"
                icon={AutoAwesomeOutlinedIcon}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <PathCard
                kicker="Templates"
                title="Start from a category."
                body="Six ready-made layouts for common business views. Fork one and tweak in English."
                bullets={['AI Costs, Marketing, Ops, Finance, Partners, Custom', 'Sensible default KPIs and charts', 'Save your own layouts for the team']}
                to="#dashboard-templates"
                cta="Browse templates"
                accent="secondary"
                icon={DashboardCustomizeOutlinedIcon}
              />
            </Grid>
          </Grid>
        </Container>
      </Box>
      <BuilderPanel />
      <TemplatesGallery />
      <FeatureMosaic title="Everything else inside Dashboards" features={item.features} featuredIndex={0} bg="tint" />
      <RelatedGrid
        title="Pairs well with"
        items={[
          { label: 'Reports', to: '/instruments/reports', iconName: 'AssessmentOutlined', blurb: 'Wrap charts in prose for stakeholders.' },
          { label: 'Projects', to: '/instruments/projects', iconName: 'FolderOpenOutlined', blurb: 'Per-project KPI views.' },
          { label: 'Agents', to: '/control/agents', iconName: 'SmartToyOutlined', blurb: 'Track agent health, run volume, costs.' },
        ]}
      />
      <ClosingCta title="Describe the chart. Skip the SQL." />
    </PublicShell>
  );
}
