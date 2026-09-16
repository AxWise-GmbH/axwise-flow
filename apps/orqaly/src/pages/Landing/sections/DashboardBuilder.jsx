import { useState } from 'react';
import { Box, Button, Container, Grid, Stack, Typography, alpha, useTheme } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import MarketingCtaButton from '@/components/Public/primitives/MarketingCtaButton';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import PaidOutlinedIcon from '@mui/icons-material/PaidOutlined';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import SpeedOutlinedIcon from '@mui/icons-material/SpeedOutlined';
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';
import HandshakeOutlinedIcon from '@mui/icons-material/HandshakeOutlined';
import DashboardCustomizeOutlinedIcon from '@mui/icons-material/DashboardCustomizeOutlined';
import EditNoteOutlinedIcon from '@mui/icons-material/EditNoteOutlined';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';
import LandingGlassIcon from './LandingGlassIcon';

const CATEGORIES = [
  {
    iconName: 'PaidOutlined',
    Fallback: PaidOutlinedIcon,
    title: 'AI Costs',
    metrics: 'Spend by model, cost per agent, $ per goal shipped, monthly burn trend.',
  },
  {
    iconName: 'CampaignOutlined',
    Fallback: CampaignOutlinedIcon,
    title: 'Marketing',
    metrics: 'Leads by channel, campaign ROI, conversion funnel, customer acquisition cost.',
  },
  {
    iconName: 'SpeedOutlined',
    Fallback: SpeedOutlinedIcon,
    title: 'Operational',
    metrics: 'Tasks completed, cycle time, SLA breaches, throughput by team.',
  },
  {
    iconName: 'AccountBalanceOutlined',
    Fallback: AccountBalanceOutlinedIcon,
    title: 'Accountant',
    metrics: 'Revenue, MRR, expenses, partner payouts on the 85/15 split.',
  },
  {
    iconName: 'HandshakeOutlined',
    Fallback: HandshakeOutlinedIcon,
    title: 'Partners',
    metrics: 'Top partners by revenue, funnel status, deals in flight.',
  },
  {
    iconName: 'DashboardCustomizeOutlined',
    Fallback: DashboardCustomizeOutlinedIcon,
    title: 'Custom',
    metrics: 'Anything you can describe - start from a template or a blank canvas.',
  },
];

const STARTER_CHIPS = [
  { label: 'AI Costs', prompt: 'Show my AI costs by model this month' },
  { label: 'Marketing ROI', prompt: 'Marketing ROI by channel this quarter' },
  { label: 'Ops throughput', prompt: 'Ops throughput and SLA breaches by team' },
  { label: 'Profit & Loss', prompt: 'Revenue, MRR, expenses, and partner payouts' },
];

const STEPS = [
  {
    title: 'Describe',
    desc: 'Type the metric or dashboard you want.',
    iconName: 'EditNoteOutlined',
    Fallback: EditNoteOutlinedIcon,
  },
  {
    title: 'Refine',
    desc: 'Answer two quick questions: time range and chart style.',
    iconName: 'TuneOutlined',
    Fallback: TuneOutlinedIcon,
  },
  {
    title: 'Live',
    desc: 'Your dashboard is built from real account data, ready to share.',
    iconName: 'InsightsOutlined',
    Fallback: InsightsOutlinedIcon,
  },
];

function CategoryCard({ iconName, Fallback, title, metrics }) {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const isDark = theme.palette.mode === 'dark';
  return (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        p: { xs: 2.5, md: 3 },
        borderRadius: 3,
        bgcolor: isDark ? alpha('#fff', 0.025) : alpha('#fff', 0.7),
        border: `1px solid ${theme.palette.divider}`,
        backdropFilter: 'saturate(140%) blur(10px)',
        WebkitBackdropFilter: 'saturate(140%) blur(10px)',
        transition: 'transform 220ms ease, border-color 220ms ease, box-shadow 220ms ease',
        '&:hover': {
          transform: 'translateY(-3px)',
          borderColor: alpha(primary, 0.5),
          boxShadow: `0 14px 36px ${alpha(primary, 0.18)}`,
        },
        '@media (prefers-reduced-motion: reduce)': {
          transition: 'none',
          '&:hover': { transform: 'none' },
        },
      }}
    >
      <Box sx={{ mb: 2 }}>
        <LandingGlassIcon name={iconName} fallback={Fallback} size={26} tone="brand" />
      </Box>
      <Typography
        sx={{
          fontWeight: 800,
          fontSize: '1.1rem',
          color: 'text.primary',
          mb: 1,
          letterSpacing: '-0.005em',
        }}
      >
        {title}
      </Typography>
      <Typography sx={{ fontSize: '0.9rem', color: 'text.secondary', lineHeight: 1.55, flex: 1 }}>
        {metrics}
      </Typography>
    </Box>
  );
}

export default function DashboardBuilder() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const isDark = theme.palette.mode === 'dark';
  const headingId = 'dashboard-builder-heading';
  const [activePrompt, setActivePrompt] = useState(STARTER_CHIPS[0].prompt);
  const signupHref = `/signup?intent=dashboard&prompt=${encodeURIComponent(activePrompt)}`;

  return (
    <Box
      component="section"
      id="dashboard-builder"
      aria-labelledby={headingId}
      sx={{ py: { xs: 8, md: 12 } }}
    >
      <Container maxWidth="lg">
        {/* Header block - same anatomy as the other sections */}
        <Stack spacing={2} alignItems="center" textAlign="center" sx={{ mb: { xs: 5, md: 7 } }}>
          <Typography
            sx={{
              fontSize: '0.85rem',
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'primary.main',
            }}
          >
            Dashboard Builder
          </Typography>
          <Typography
            id={headingId}
            component="h2"
            sx={{
              fontSize: { xs: '2rem', md: '2.75rem' },
              fontWeight: 800,
              lineHeight: 1.15,
              color: 'text.primary',
              maxWidth: 760,
            }}
          >
            One sentence in. A live dashboard out.
          </Typography>
          <Typography sx={{ fontSize: '1.05rem', color: 'text.secondary', maxWidth: 580 }}>
            Describe what you want to see in plain English. The builder picks the right charts,
            pulls your real data, and ships a live dashboard - for any part of the business.
          </Typography>
        </Stack>

        {/* Prompt pill (visual) + starter chips */}
        <Box sx={{ maxWidth: 680, mx: 'auto', mb: { xs: 5, md: 6 } }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              px: 1,
              py: 0.75,
              borderRadius: 999,
              bgcolor: isDark ? alpha('#fff', 0.04) : alpha('#fff', 0.8),
              border: `1px solid ${alpha(primary, 0.3)}`,
              backdropFilter: 'saturate(140%) blur(10px)',
              WebkitBackdropFilter: 'saturate(140%) blur(10px)',
            }}
          >
            <Typography
              sx={{
                flex: 1,
                minWidth: 0,
                px: 1.5,
                fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                fontSize: { xs: '0.85rem', md: '0.95rem' },
                color: 'text.secondary',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              e.g. {activePrompt}
            </Typography>
            <Box
              aria-hidden
              sx={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: 'primary.main',
                color: 'primary.contrastText',
              }}
            >
              <ArrowForwardRoundedIcon sx={{ fontSize: 18 }} />
            </Box>
          </Box>

          <Stack
            direction="row"
            spacing={1}
            useFlexGap
            flexWrap="wrap"
            justifyContent="center"
            sx={{ mt: 2 }}
          >
            <Typography
              sx={{
                fontSize: '0.8rem',
                color: 'text.disabled',
                fontWeight: 700,
                alignSelf: 'center',
                mr: 0.5,
              }}
            >
              Try:
            </Typography>
            {STARTER_CHIPS.map((chip) => {
              const active = chip.prompt === activePrompt;
              return (
                <Box
                  key={chip.label}
                  component="button"
                  type="button"
                  onClick={() => setActivePrompt(chip.prompt)}
                  sx={{
                    px: 1.5,
                    py: 0.625,
                    borderRadius: 999,
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    color: active ? 'primary.main' : 'text.primary',
                    bgcolor: active ? alpha(primary, 0.14) : alpha(primary, 0.06),
                    border: `1px solid ${active ? primary : alpha(primary, 0.25)}`,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    transition:
                      'border-color 150ms ease, background-color 150ms ease, color 150ms ease',
                  }}
                >
                  {chip.label}
                </Box>
              );
            })}
          </Stack>
        </Box>

        {/* Category grid - 2 x 3 on desktop */}
        <Grid container spacing={1.5} alignItems="stretch">
          {CATEGORIES.map((c) => (
            <Grid key={c.title} size={{ xs: 12, sm: 6, md: 4 }}>
              <CategoryCard {...c} />
            </Grid>
          ))}
        </Grid>

        {/* How-it-works strip */}
        <Box
          sx={{
            mt: { xs: 5, md: 6 },
            p: { xs: 3, md: 4 },
            borderRadius: 4,
            bgcolor: isDark ? alpha('#fff', 0.03) : alpha('#fff', 0.7),
            border: `1px solid ${theme.palette.divider}`,
            backdropFilter: 'saturate(140%) blur(14px)',
            WebkitBackdropFilter: 'saturate(140%) blur(14px)',
          }}
        >
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={{ xs: 3, md: 0 }}
            alignItems="stretch"
          >
            {STEPS.map((s, i) => (
              <Stack
                key={s.title}
                direction="row"
                alignItems="center"
                spacing={2}
                sx={{ flex: 1, position: 'relative' }}
              >
                <LandingGlassIcon name={s.iconName} fallback={s.Fallback} size={24} tone="brand" />
                <Box sx={{ flex: 1 }}>
                  <Typography sx={{ fontWeight: 800, fontSize: '1.05rem', color: 'text.primary' }}>
                    {s.title}
                  </Typography>
                  <Typography
                    sx={{ fontSize: '0.85rem', color: 'text.secondary', lineHeight: 1.5 }}
                  >
                    {s.desc}
                  </Typography>
                </Box>
                {i < STEPS.length - 1 && (
                  <ArrowForwardIcon
                    sx={{
                      color: alpha(primary, 0.6),
                      fontSize: 22,
                      display: { xs: 'none', md: 'block' },
                      flexShrink: 0,
                      mx: 1,
                    }}
                  />
                )}
              </Stack>
            ))}
          </Stack>
        </Box>

        <Typography
          sx={{ mt: 2.5, textAlign: 'center', fontSize: '0.9rem', color: 'text.secondary' }}
        >
          Not sure where to start? Pick from ready-made templates for each category and tweak from
          there.
        </Typography>

        {/* CTA */}
        <Stack alignItems="center" sx={{ mt: { xs: 4, md: 5 } }}>
          <MarketingCtaButton
            component={RouterLink}
            to={signupHref}
            endIcon={<ArrowForwardIcon />}
            sx={{ borderRadius: 999, px: 4, py: 1.25 }}
          >
            Build your first dashboard
          </MarketingCtaButton>
        </Stack>
      </Container>
    </Box>
  );
}
