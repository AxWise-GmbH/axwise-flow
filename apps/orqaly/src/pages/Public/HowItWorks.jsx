import { useEffect } from 'react';
import { Box, Container, Grid, Stack, Typography, alpha, useTheme } from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import PublicShell from '../../components/Public/PublicShell';

import HeroAnimatedDemo from '../Landing/sections/HeroAnimatedDemo';
import TimelineVertical from '../../components/Public/primitives/TimelineVertical';
import BeforeAfter from '../../components/Public/primitives/BeforeAfter';
import QuoteBlock from '../../components/Public/primitives/QuoteBlock';
import FAQSlice from '../../components/Public/primitives/FAQSlice';
import ClosingCta from '../../components/Public/primitives/ClosingCta';

import DemoRequests from '../../components/Public/demo/DemoRequests';
import DemoConsilium from '../../components/Public/demo/DemoConsilium';
import DemoTaskManager from '../../components/Public/demo/DemoTaskManager';
import DemoDeliverable from '../../components/Public/demo/DemoDeliverable';

import AppIcon from '../../components/icons/AppIcon';

const STEPS = [
  {
    n: '01',
    title: 'Define',
    narrative: [
      'Type a goal in the language you would use to brief a teammate. No PRD, no system prompt, no template.',
      'Orqaly captures the intent, asks one or two clarifying questions if it needs to, and confirms scope before any agent picks up work.',
    ],
    bullets: [
      'Plain-language input - no prompt engineering',
      'Clarification round before kickoff, not after',
      'Goal is versioned so you can edit later without losing history',
    ],
    Visual: DemoRequests,
    reverse: false,
    bg: 'subtle',
  },
  {
    n: '02',
    title: 'Plan',
    narrative: [
      'Consilium decomposes the goal into a task graph and assigns the right agent to each task based on skills, history, and your tool budget.',
      'A council of specialists - analyst, critic, synthesiser, devil\'s advocate - debates the plan and votes before execution starts.',
    ],
    bullets: [
      'Tasks routed to the right agent automatically',
      'Council vote on every important branching decision',
      'Dissent captured in the audit trail',
    ],
    Visual: DemoConsilium,
    reverse: true,
    bg: 'tint',
  },
  {
    n: '03',
    title: 'Execute',
    narrative: [
      'Tasks run in parallel inside the job pool. You watch agents work live - tool calls, intermediate outputs, retries - and intervene any time.',
      'Long-running jobs continue when you close the tab. The job pool retries failures with backoff and routes blockers back to you.',
    ],
    bullets: [
      'Parallel execution with live status',
      'Automatic retries with exponential backoff',
      'Pause, resume, or override any task without breaking the chain',
    ],
    Visual: DemoTaskManager,
    reverse: false,
    bg: 'subtle',
  },
  {
    n: '04',
    title: 'Deliver',
    narrative: [
      'Versioned deliverables ship to your review with a one-click refine loop. v1, v2, v3 - everything compared side-by-side, nothing lost.',
      'Approve to publish, refine to keep iterating, or download the raw output. Every action writes to the audit log automatically.',
    ],
    bullets: [
      'Versioned outputs with side-by-side diff',
      'One-click refinement loop',
      'Download, approve, or publish - your call',
    ],
    Visual: DemoDeliverable,
    reverse: true,
    bg: 'tint',
  },
];

const TIMELINE = [
  { n: '01', title: 'Goal received',         body: 'You type an outcome. Orqaly normalises it into a structured intent with scope and constraints.' },
  { n: '02', title: 'Consilium plans',       body: 'A council of agent specialists debates and votes on the plan. Dissent is captured, not hidden.' },
  { n: '03', title: 'Tasks dispatched',      body: 'The job pool routes each task to the right agent based on skill match and your tool budget.' },
  { n: '04', title: 'Tool calls run',        body: 'Agents call your tools - via BYOK provider keys - and write intermediate state to the audit log.' },
  { n: '05', title: 'Deliverable shipped',   body: 'Versioned output lands in your review queue. Approve, refine, or download in one click.' },
  { n: '06', title: 'Audit entry written',   body: 'Every step is logged: who ran what, when, with which inputs, producing which outputs. Defensible by design.' },
];

const BEFORE = {
  title: 'The Old way',
  items: [
    'Zapier triggers, Make scenarios, glued together at midnight',
    'A ChatGPT tab open for prompts and another for results',
    'Spreadsheets to track who owns which AI task',
    'Slack threads to pass outputs between humans and bots',
    'No audit log when something goes sideways',
    'Each new business unit reinvents the same plumbing',
  ],
};

const AFTER = {
  title: 'The Orqaly way',
  items: [
    'One workspace where agents plan, execute, and ship',
    'Goals and deliverables versioned, not lost in chat history',
    'Council vote captured for every important decision',
    'Voice, Telegram, email and chat - same agents, same memory',
    'Full audit trail you can hand to legal or to a board',
    'Templates and replicators reusable across teams',
  ],
};

const FAQS = [
  {
    q: 'How does Consilium decide?',
    a: 'A configurable panel - analyst, critic, synthesiser, devil\'s advocate by default - reads the goal and proposes an answer each. They argue in shared context, then cast a vote. The majority wins; dissent is preserved in the audit log so you can revisit any decision later.',
  },
  {
    q: 'How are tools chosen for a task?',
    a: 'Each tool exposes a capability descriptor (what it does, what it costs, what scopes it needs). The planner matches the task to the cheapest, highest-trust tool inside your enabled set, then asks for confirmation if the cost or scope is unusual.',
  },
  {
    q: 'Can I override the plan or a single step?',
    a: 'Yes - any time. Pause the task graph, edit the plan, approve or reject single steps, or re-route work to a different agent. The job pool persists state, so you can resume where you left off.',
  },
  {
    q: 'How is versioning handled?',
    a: 'Every deliverable is immutable. Refining produces v2, v3, v4 - the prior versions stay reachable forever. You can compare any two versions side-by-side and revert to any version with one click.',
  },
  {
    q: 'What does the audit log capture?',
    a: 'Goal text, plan, council vote, every tool call (with inputs and outputs), every model call (with token counts), every deliverable version, and every human approval. Retention is configurable per workspace.',
  },
];

function StepDeepDive({ step, index, theme }) {
  const primary = theme.palette.primary.main;
  const isDark = theme.palette.mode === 'dark';
  const isReverse = step.reverse;
  const bgcolor = step.bg === 'tint' ? alpha(theme.palette.text.primary, 0.02) : 'transparent';

  return (
    <Box
      component="section"
      id={`step-${step.n}`}
      sx={{
        py: { xs: 5, md: 9 },
        bgcolor,
        borderTop: step.bg === 'tint' ? `1px solid ${theme.palette.divider}` : 'none',
        borderBottom: step.bg === 'tint' ? `1px solid ${theme.palette.divider}` : 'none',
        scrollMarginTop: 80,
      }}
    >
      <Container maxWidth="lg">
        <Grid
          container
          spacing={{ xs: 4, md: 6 }}
          alignItems="center"
          direction={isReverse ? { xs: 'column', md: 'row-reverse' } : 'row'}
        >
          <Grid size={{ xs: 12, md: 6 }}>
            <Stack spacing={2.5}>
              <Stack direction="row" spacing={2} alignItems="center">
                <Box
                  sx={{
                    width: 60,
                    height: 60,
                    borderRadius: '50%',
                    background: `linear-gradient(135deg, ${primary} 0%, ${alpha(primary, 0.7)} 100%)`,
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: '1.1rem',
                    boxShadow: `0 10px 30px ${alpha(primary, 0.35)}`,
                    flexShrink: 0,
                  }}
                >
                  {step.n}
                </Box>
                <Typography
                  sx={{
                    fontSize: '0.78rem',
                    fontWeight: 800,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: 'primary.main',
                  }}
                >
                  Step {step.n}
                </Typography>
              </Stack>

              <Typography
                component="h2"
                sx={{
                  fontWeight: 800,
                  fontSize: { xs: '1.8rem', md: '2.5rem' },
                  lineHeight: 1.15,
                  letterSpacing: '-0.01em',
                  color: 'text.primary',
                }}
              >
                {step.title}
              </Typography>

              <Stack spacing={2}>
                {step.narrative.map((p, i) => (
                  <Typography
                    key={i}
                    sx={{
                      fontSize: { xs: '1rem', md: '1.05rem' },
                      color: 'text.secondary',
                      lineHeight: 1.7,
                    }}
                  >
                    {p}
                  </Typography>
                ))}
              </Stack>

              <Stack spacing={1.25} sx={{ pt: 1 }}>
                <Typography
                  sx={{
                    fontWeight: 800,
                    fontSize: '0.72rem',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: 'primary.main',
                  }}
                >
                  Behind the scenes
                </Typography>
                {step.bullets.map((b, i) => (
                  <Stack key={i} direction="row" spacing={1.5} alignItems="flex-start">
                    <Box
                      sx={{
                        mt: '4px',
                        width: 22,
                        height: 22,
                        borderRadius: '50%',
                        bgcolor: alpha(primary, 0.12),
                        color: 'primary.main',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <AppIcon name='Check' fallback={CheckIcon} sx={{ fontSize: 14 }} />
                    </Box>
                    <Typography sx={{ fontSize: '0.98rem', color: 'text.primary', lineHeight: 1.55 }}>
                      {b}
                    </Typography>
                  </Stack>
                ))}
              </Stack>
            </Stack>
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
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
                <step.Visual />
              </Box>
            </Box>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
}

export default function HowItWorks() {
  const theme = useTheme();

  useEffect(() => {
    const prevTitle = document.title;
    document.title = 'How it works - Orqaly';
    const meta = document.querySelector('meta[name="description"]');
    const prevDesc = meta?.getAttribute('content');
    if (meta) {
      meta.setAttribute(
        'content',
        'How Orqaly works: define a goal in plain language, Consilium plans, agents execute in parallel, versioned deliverables ship to your review.',
      );
    }
    return () => {
      document.title = prevTitle;
      if (meta && prevDesc) meta.setAttribute('content', prevDesc);
    };
  }, []);

  return (
    <PublicShell>
      <Box
        sx={{
          pt: { xs: 6, md: 10 },
          pb: { xs: 5, md: 8 },
          bgcolor: alpha(theme.palette.primary.main, 0.03),
          borderBottom: `1px solid ${theme.palette.divider}`,
        }}
      >
        <Container maxWidth="lg" sx={{ display: 'flex', justifyContent: 'center' }}>
          <HeroAnimatedDemo
            eyebrow="How it works"
            title="From idea - to ready business"
            subtitle="No prompts, No PRDs. Describe a goal - agents do the rest."
            sx={{ width: '100%', maxWidth: 880 }}
          />
        </Container>
      </Box>

      {/* Step deep-dives */}
      {STEPS.map((s, i) => (
        <StepDeepDive key={s.n} step={s} index={i} theme={theme} />
      ))}

      <TimelineVertical
        title="What happens behind the scenes."
        subtitle="A full trace of one goal, from the moment you hit submit to the audit-log entry that closes the loop."
        steps={TIMELINE}
        bg="subtle"
      />

      <BeforeAfter
        title="Two paths to the same outcome."
        subtitle="One is held together with tape. The other was designed for it."
        before={BEFORE}
        after={AFTER}
        bg="tint"
      />

      <QuoteBlock
        quote="The bottleneck of the next decade is not model quality. It is the operating system around the model."
        attribution="Orqaly founding thesis"
        bg="tint"
      />

      <FAQSlice
        title="How-it-works questions"
        subtitle="Everything we get asked about the runtime."
        items={FAQS}
        bg="subtle"
      />

      <ClosingCta
        title="Start building. Watch agents ship for you."
        body="Free forever for the first 1,000 builders. No card required."
        primary={{ label: 'Start free', to: '/signup' }}
        secondary={{ label: 'See features', to: '/features' }}
      />
    </PublicShell>
  );
}
