import { useEffect } from 'react';
import { Box, Button, Container, Grid, Stack, Typography, alpha, useTheme } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import MarketingCtaButton from '@/components/Public/primitives/MarketingCtaButton';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import PublicShell from '../../components/Public/PublicShell';
import { PageHero } from './_shared';
import LandingGlassIcon from '../Landing/sections/LandingGlassIcon';
import { createHoverGlowShadow } from '../../theme/hoverGlow';

import Spotlight from '../../components/Public/primitives/Spotlight';
import ComparisonMatrix from '../../components/Public/primitives/ComparisonMatrix';
import StatsRow from '../../components/Public/primitives/StatsRow';
import FAQSlice from '../../components/Public/primitives/FAQSlice';
import ClosingCta from '../../components/Public/primitives/ClosingCta';

import DemoGoals from '../../components/Public/demo/DemoGoals';
import DemoRequests from '../../components/Public/demo/DemoRequests';
import DemoConsilium from '../../components/Public/demo/DemoConsilium';
import DemoMarketplace from '../../components/Public/demo/DemoMarketplace';
import DemoCommunicator from '../../components/Public/demo/DemoCommunicator';
import DemoKnowledgeBase from '../../components/Public/demo/DemoKnowledgeBase';
import DemoDashboard from '../../components/Public/demo/DemoDashboard';
import DemoOrganizations from '../../components/Public/demo/DemoOrganizations';

import AppIcon from '../../components/icons/AppIcon';

const PILLARS = [
  {
    iconName: 'TrackChangesOutlined',
    title: 'Goals, not prompts',
    body: 'Describe an outcome - watch agents plan, ship, and version it.',
    to: '/signup',
  },
  {
    iconName: 'GroupsOutlined',
    title: 'A council, not a model',
    body: 'Multi-agent debate and a vote for every important decision.',
    to: '/signup',
  },
  {
    iconName: 'StorefrontRounded',
    title: '85% to creators',
    body: 'Open marketplace for agents, tools, skills, and replicators.',
    to: '/signup',
  },
  {
    iconName: 'MicNoneOutlined',
    title: 'Voice, chat, email',
    body: 'Reach agents in the channel you already live in.',
    to: '/signup',
  },
];

const SPOTLIGHTS = [
  {
    eyebrow: 'Goals & Deliverables',
    title: 'Describe an outcome. Ship a deliverable.',
    body:
      'Type a goal in plain language and Consilium decomposes it into tasks, assigns the right agents, and ships versioned deliverables to your review. No prompts to engineer.',
    bullets: [
      'Auto-decomposition with editable plans',
      'Versioned outputs - compare v1, v2, v3 side-by-side',
      'One-click refinement loop on any deliverable',
    ],
    Visual: DemoGoals,
    reverse: false,
    bg: 'subtle',
  },
  {
    eyebrow: 'Requests Pool',
    title: 'One inbox for every ask.',
    body:
      'Drop a request, pick who handles it, watch it get done. No Slack threads to mine, no spreadsheets to update - every ask is queued, claimed, and resolved in one place.',
    bullets: [
      'Priority queue with SLA timers',
      'Assign to humans or agents - same UI',
      'Full thread history per request',
    ],
    Visual: DemoRequests,
    reverse: true,
    bg: 'tint',
  },
  {
    eyebrow: 'Consilium',
    title: 'A council of specialists, not one model.',
    body:
      'One model is one opinion. Consilium runs an analyst, a critic, a synthesiser, and a devil\'s advocate over the same question and surfaces a defensible decision with a written rationale.',
    bullets: [
      'Configurable council size and personas',
      'Majority vote with dissent captured',
      'Full audit trail per decision',
    ],
    Visual: DemoConsilium,
    reverse: false,
    bg: 'subtle',
  },
  {
    eyebrow: 'Agent Marketplace',
    title: 'Discover, fork, and publish.',
    body:
      'Browse agents, tools, skills, and full business templates built by independent creators. Install in one click, fork to customise, publish your own and keep 85% of every sale.',
    bullets: [
      'Verified creators with revenue dashboards',
      'Free, one-time, and subscription pricing',
      'Stripe Connect payouts to 30+ countries',
    ],
    Visual: DemoMarketplace,
    reverse: true,
    bg: 'tint',
  },
  {
    eyebrow: 'Communicator + Voice',
    title: 'Talk to your agents, anywhere.',
    body:
      'AiOrb live voice when you are at the desk, Telegram when you are on the train, email for async briefs. Same agents, same memory, every channel.',
    bullets: [
      'Voice via the AiOrb interface',
      'Telegram bot in three clicks',
      'Inbound email - reply to a deliverable, refine it',
    ],
    Visual: DemoCommunicator,
    reverse: false,
    bg: 'subtle',
  },
  {
    eyebrow: 'Knowledge Base',
    title: 'Memory that sticks.',
    body:
      'Upload documents, semantic-search them, give agents long-term memory of your business. Context-aware answers without the copy-paste tax of a chatbot.',
    bullets: [
      'Drag-and-drop ingest (PDF, MD, web, audio)',
      'Per-agent and per-organisation scopes',
      'Row-Level Security by default',
    ],
    Visual: DemoKnowledgeBase,
    reverse: true,
    bg: 'tint',
  },
  {
    eyebrow: 'Dashboards & Reports',
    title: 'Charts in English.',
    body:
      'Ask in plain language, get a dashboard. Custom KPIs, drill-downs, daily emails - all without writing a SQL query or wrestling with a BI tool.',
    bullets: [
      'AI-built widgets from a one-line ask',
      'Schedule daily / weekly digests',
      'Embed any dashboard into a public report',
    ],
    Visual: DemoDashboard,
    reverse: false,
    bg: 'subtle',
  },
  {
    eyebrow: 'Organizations',
    title: 'Multi-tenant from day one.',
    body:
      'Run multiple businesses from one account or invite your team into one workspace. Row-Level Security, shared agents, per-role billing, audit logs - the boring parts handled.',
    bullets: [
      'Unlimited seats inside your plan',
      'Per-role permissions and PIN-gated areas',
      'Audit log retention you can defend',
    ],
    Visual: DemoOrganizations,
    reverse: true,
    bg: 'tint',
  },
];

const MATRIX = {
  competitors: [
    { id: 'orqaly',  label: 'Orqaly', us: true },
    { id: 'diy',     label: 'DIY stack' },
    { id: 'chatbot', label: 'Chatbot' },
    { id: 'rpa',     label: 'RPA tool' },
  ],
  rows: [
    { capability: 'Goals with versioned deliverables', values: { orqaly: true,  diy: false,    chatbot: false, rpa: 'partial' } },
    { capability: 'Multi-agent decision council',      values: { orqaly: true,  diy: false,    chatbot: false, rpa: false }    },
    { capability: 'Marketplace with 85% creator cut',  values: { orqaly: true,  diy: false,    chatbot: false, rpa: false }    },
    { capability: 'Voice + Telegram + email native',   values: { orqaly: true,  diy: 'partial',chatbot: 'partial', rpa: false }},
    { capability: 'Per-row security (RLS)',            values: { orqaly: true,  diy: 'partial',chatbot: false, rpa: 'partial' } },
    { capability: 'BYOK + BYOS',                       values: { orqaly: true,  diy: 'partial',chatbot: false, rpa: false }    },
    { capability: 'Audit log on every action',         values: { orqaly: true,  diy: false,    chatbot: false, rpa: 'partial' } },
    { capability: 'One workspace, no glue code',       values: { orqaly: true,  diy: false,    chatbot: 'partial', rpa: false } },
  ],
};

const STATS = [
  { value: 'BYOK',     label: 'Your keys',         sub: 'pass-through usage cost'    },
  { value: '85 / 15',  label: 'Creator split',     sub: 'builders keep 85%'          },
  { value: '4',        label: 'Channels live',     sub: 'voice, Telegram, web, email'},
  { value: 'RLS',      label: 'On by default',     sub: 'per-row data isolation'     },
];

const FAQS = [
  {
    q: 'How does BYOK / BYOS work?',
    a: 'BYOK lets you connect your own OpenAI / Groq / AssemblyAI keys so model usage is billed directly to you by those providers. BYOS keeps your files in your own Supabase or S3 bucket. We never touch the data, we just orchestrate around it.',
  },
  {
    q: 'Is everything audited?',
    a: 'Yes. Every agent action - tool call, model invocation, deliverable refinement, council vote - writes an audit log entry. Retention is configurable per workspace and visible from day one of your subscription.',
  },
  {
    q: 'How are agents and tools imported?',
    a: 'One-click install from the marketplace. Free tier lets you use what is already in your workspace; the Paid tier unlocks imports of agents, tools, skills, and full replicator templates.',
  },
  {
    q: 'Can my team share one workspace?',
    a: 'Yes. Seats are unlimited inside your plan. Use Organizations for separate businesses or invite teammates into one shared workspace with per-role permissions.',
  },
  {
    q: 'Do the dashboards refresh on their own?',
    a: 'Yes - each widget has its own refresh cadence (live, hourly, daily). Daily and weekly digests can be emailed automatically; you can also embed any dashboard into a public, share-able report.',
  },
];

function PillarCard({ pillar, theme }) {
  const primary = theme.palette.primary.main;
  const isDark = theme.palette.mode === 'dark';
  return (
    <Stack
      component={RouterLink}
      to={pillar.to}
      spacing={1.5}
      sx={{
        height: '100%',
        p: { xs: 2.5, md: 3 },
        borderRadius: 3,
        textDecoration: 'none',
        bgcolor: isDark ? alpha('#fff', 0.025) : alpha('#fff', 0.7),
        border: `1px solid ${theme.palette.divider}`,
        backdropFilter: 'saturate(140%) blur(10px)',
        WebkitBackdropFilter: 'saturate(140%) blur(10px)',
        transition: 'transform 220ms ease, box-shadow 220ms ease, border-color 220ms ease',
        '&:hover': {
          transform: 'translateY(-3px)',
          borderColor: alpha(primary, 0.45),
          boxShadow: createHoverGlowShadow(theme),
        },
      }}
    >
      <LandingGlassIcon name={pillar.iconName} size={26} tone="brand" />
      <Typography sx={{ fontWeight: 800, fontSize: '1.05rem', color: 'text.primary', letterSpacing: '-0.01em' }}>
        {pillar.title}
      </Typography>
      <Typography sx={{ fontSize: '0.9rem', color: 'text.secondary', lineHeight: 1.6, flex: 1 }}>
        {pillar.body}
      </Typography>
    </Stack>
  );
}

function SpotlightVisual({ Visual, theme }) {
  const primary = theme.palette.primary.main;
  return (
    <Box
      sx={{
        position: 'relative',
        '&::before': {
          content: '""',
          position: 'absolute',
          inset: -24,
          background: `radial-gradient(ellipse at center, ${alpha(primary, 0.18)} 0%, transparent 65%)`,
          filter: 'blur(28px)',
          zIndex: 0,
          pointerEvents: 'none',
        },
      }}
    >
      <Box sx={{ position: 'relative', zIndex: 1 }}>
        <Visual />
      </Box>
    </Box>
  );
}

export default function Features() {
  const theme = useTheme();

  useEffect(() => {
    const prevTitle = document.title;
    document.title = 'Features - Orqaly';
    const meta = document.querySelector('meta[name="description"]');
    const prevDesc = meta?.getAttribute('content');
    if (meta) {
      meta.setAttribute(
        'content',
        'Orqaly features: goals with versioned deliverables, multi-agent Consilium, an 85/15 marketplace, voice and chat channels, dashboards, and multi-tenant orgs.',
      );
    }
    return () => {
      document.title = prevTitle;
      if (meta && prevDesc) meta.setAttribute('content', prevDesc);
    };
  }, []);

  return (
    <PublicShell>
      <PageHero
        eyebrow="Features"
        title="Everything you need to run an AI-powered business."
        subtitle="No glue code. No tab juggling. One workspace where agents plan, execute, ship, and get paid."
      />
      {/* Hero CTA row */}
      <Box sx={{ pt: { xs: 4, md: 5 } }}>
        <Container maxWidth="md">
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <MarketingCtaButton
              component={RouterLink}
              to="/signup"
                            size="large"
              endIcon={<AppIcon name='ArrowForward' fallback={ArrowForwardIcon} />}
              sx={{ fontWeight: 700, borderRadius: 2, textTransform: 'none', px: 3, py: 1.25 }}
            >
              Start free
            </MarketingCtaButton>
            <Button
              component={RouterLink}
              to="/pricing"
              variant="outlined"
              size="large"
              sx={{ fontWeight: 700, borderRadius: 2, textTransform: 'none', px: 3, py: 1.25 }}
            >
              See pricing
            </Button>
          </Stack>
        </Container>
      </Box>
      {/* Pillars */}
      <Box component="section" id="pillars" sx={{ py: { xs: 6, md: 8 } }}>
        <Container maxWidth="lg">
          <Grid container spacing={2.5}>
            {PILLARS.map((p) => (
              <Grid key={p.title} size={{ xs: 12, sm: 6, md: 3 }}>
                <PillarCard pillar={p} theme={theme} />
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>
      {/* Spotlights */}
      {SPOTLIGHTS.map((s, i) => (
        <Spotlight
          key={i}
          eyebrow={s.eyebrow}
          title={s.title}
          body={s.body}
          bullets={s.bullets}
          reverse={s.reverse}
          bg={s.bg}
          visual={<SpotlightVisual Visual={s.Visual} theme={theme} />}
        />
      ))}
      <ComparisonMatrix
        title="Orqaly vs the stitched-together stack"
        subtitle="What you can do in one workspace - versus what you would have to glue together with Zapier, ChatGPT, custom scripts, and spreadsheets."
        competitors={MATRIX.competitors}
        rows={MATRIX.rows}
        bg="tint"
      />
      <StatsRow stats={STATS} bg="subtle" />
      <FAQSlice
        title="Feature questions"
        subtitle="The things people ask before they sign up."
        items={FAQS}
        bg="tint"
      />
      <ClosingCta
        title="Spin up your workspace in five minutes."
        body="Free forever for the first 1,000 builders. No card required."
        primary={{ label: 'Start free', to: '/signup' }}
        secondary={{ label: 'See pricing', to: '/pricing' }}
      />
    </PublicShell>
  );
}
