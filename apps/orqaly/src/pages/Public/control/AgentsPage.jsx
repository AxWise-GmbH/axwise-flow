import { Box, Button, Container, Grid, Stack, Typography, alpha, useTheme } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import MarketingCtaButton from '@/components/Public/primitives/MarketingCtaButton';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import LaunchIcon from '@mui/icons-material/Launch';
import CheckIcon from '@mui/icons-material/Check';
import PublicShell from '../../../components/Public/PublicShell';
import HeroAsymmetric from '../../../components/Public/primitives/HeroAsymmetric';
import FeatureMosaic from '../../../components/Public/primitives/FeatureMosaic';
import ComparisonMatrix from '../../../components/Public/primitives/ComparisonMatrix';
import RelatedGrid from '../../../components/Public/primitives/RelatedGrid';
import ClosingCta from '../../../components/Public/primitives/ClosingCta';
import Spotlight from '../../../components/Public/primitives/Spotlight';
import DemoAgentHubMap from '../../../components/Public/demo/DemoAgentHubMap';
import DemoAgentHub from '../../../components/Public/demo/DemoAgentHub';
import DemoAgentTeams from '../../../components/Public/demo/DemoAgentTeams';
import DemoAgentPulse from '../../../components/Public/demo/DemoAgentPulse';
import DemoAgentAudit from '../../../components/Public/demo/DemoAgentAudit';
import LandingGlassIcon from '../../Landing/sections/LandingGlassIcon';
import { ITEMS_BY_SLUG } from '../../../data/instruments';
import {
  HUB_INTRO,
  AGENT_HUB_SURFACES,
  SPOTLIGHT_AGENTS,
  SPOTLIGHT_TEAMS,
  SPOTLIGHT_PULSE,
  SPOTLIGHT_OPERATE,
  COMPARISON_EXTRA_ROWS,
} from '../../../data/agentsPage';

import AppIcon from '../../../components/icons/AppIcon';

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

function HubSurfaceCard({ surface }) {
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
      <Stack direction="row" alignItems="flex-start" spacing={1.5}>
        <LandingGlassIcon name={surface.iconName} size={22} tone="brand" />
        <Stack spacing={0.75} sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            sx={{
              display: 'inline-flex',
              alignSelf: 'flex-start',
              fontWeight: 800,
              fontSize: '0.68rem',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'primary.main',
              px: 1,
              py: 0.35,
              borderRadius: 999,
              bgcolor: alpha(primary, 0.1),
              border: `1px solid ${alpha(primary, 0.22)}`,
            }}
          >
            {surface.label}
          </Typography>
          <Typography sx={{ fontWeight: 800, fontSize: '1.05rem', color: 'text.primary', lineHeight: 1.25 }}>
            {surface.title}
          </Typography>
        </Stack>
      </Stack>
      <Stack spacing={1} component="ul" sx={{ m: 0, pl: 0, listStyle: 'none' }}>
        {surface.bullets.map((b) => (
          <Stack key={b} component="li" direction="row" spacing={1} alignItems="flex-start">
            <AppIcon
              name='Check'
              fallback={CheckIcon}
              sx={{ fontSize: 16, color: 'primary.main', mt: '3px', flexShrink: 0 }} />
            <Typography sx={{ fontSize: '0.88rem', color: 'text.secondary', lineHeight: 1.55 }}>{b}</Typography>
          </Stack>
        ))}
      </Stack>
    </Stack>
  );
}

function UseCasesSection({ cases }) {
  const theme = useTheme();
  return (
    <Box component="section" sx={{ py: { xs: 5, md: 7 }, bgcolor: alpha(theme.palette.text.primary, 0.02), borderTop: `1px solid ${theme.palette.divider}` }}>
      <Container maxWidth="lg">
        <Typography component="h2" sx={{ fontWeight: 800, fontSize: { xs: '1.5rem', md: '2rem' }, mb: 3, color: 'text.primary' }}>
          Who Agent Hub is for
        </Typography>
        <Grid container spacing={2}>
          {cases.map((c) => (
            <Grid key={c} size={{ xs: 12, sm: 6 }}>
              <Typography
                sx={{
                  p: 2,
                  borderRadius: 2,
                  bgcolor: 'background.paper',
                  border: `1px solid ${theme.palette.divider}`,
                  fontSize: '0.95rem',
                  color: 'text.primary',
                  lineHeight: 1.55,
                }}
              >
                {c}
              </Typography>
            </Grid>
          ))}
        </Grid>
      </Container>
    </Box>
  );
}

export default function AgentsPage() {
  const item = ITEMS_BY_SLUG['control:agents'];
  const theme = useTheme();

  return (
    <PublicShell>
      <HeroAsymmetric
        eyebrow="CONTROL POINT · Agents"
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
              Build your first agent
            </MarketingCtaButton>
            <Button
              component={RouterLink}
              to={item.inAppRoute}
              variant="outlined"
              size="large"
              endIcon={<AppIcon name='Launch' fallback={LaunchIcon} sx={{ fontSize: 18 }} />}
              sx={{ fontWeight: 700, borderRadius: 2, textTransform: 'none', px: 3, py: 1.25 }}
            >
              Open Agent Hub
            </Button>
          </>
        }
        visual={<DemoAgentHubMap />}
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
              {HUB_INTRO.eyebrow}
            </Typography>
            <Typography component="h2" sx={{ fontWeight: 800, fontSize: { xs: '1.6rem', md: '2.2rem' }, lineHeight: 1.15, color: 'text.primary' }}>
              {HUB_INTRO.title}
            </Typography>
            <Typography sx={{ fontSize: { xs: '1rem', md: '1.08rem' }, color: 'text.secondary', lineHeight: 1.7 }}>
              {HUB_INTRO.subtitle}
            </Typography>
          </Stack>
          <Grid container spacing={2.5}>
            {AGENT_HUB_SURFACES.map((surface) => (
              <Grid key={surface.id} size={{ xs: 12, sm: 6, lg: 4 }}>
                <HubSurfaceCard surface={surface} />
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>
      <Spotlight
        eyebrow={SPOTLIGHT_AGENTS.eyebrow}
        title={SPOTLIGHT_AGENTS.title}
        body={SPOTLIGHT_AGENTS.body}
        bullets={SPOTLIGHT_AGENTS.bullets}
        visual={
          <DemoGlow>
            <DemoAgentHub />
          </DemoGlow>
        }
      />
      <Spotlight
        eyebrow={SPOTLIGHT_TEAMS.eyebrow}
        title={SPOTLIGHT_TEAMS.title}
        body={SPOTLIGHT_TEAMS.body}
        bullets={SPOTLIGHT_TEAMS.bullets}
        visual={
          <DemoGlow>
            <DemoAgentTeams />
          </DemoGlow>
        }
        reverse
        bg="tint"
      />
      <Spotlight
        eyebrow={SPOTLIGHT_PULSE.eyebrow}
        title={SPOTLIGHT_PULSE.title}
        body={SPOTLIGHT_PULSE.body}
        bullets={SPOTLIGHT_PULSE.bullets}
        visual={
          <DemoGlow>
            <DemoAgentPulse />
          </DemoGlow>
        }
      />
      <FeatureMosaic
        title="Full capability map"
        subtitle="Every Agent Hub tab plus channels, audit, versioning, and marketplace."
        features={item.features}
        featuredIndex={0}
      />
      <Spotlight
        eyebrow={SPOTLIGHT_OPERATE.eyebrow}
        title={SPOTLIGHT_OPERATE.title}
        body={SPOTLIGHT_OPERATE.body}
        bullets={SPOTLIGHT_OPERATE.bullets}
        visual={
          <DemoGlow>
            <DemoAgentAudit />
          </DemoGlow>
        }
        reverse
        bg="tint"
      />
      <UseCasesSection cases={item.useCases} />
      <ComparisonMatrix
        title="vs the usual suspects"
        subtitle="What makes Agent Hub the right place to build."
        minWidth={900}
        competitors={[
          { id: 'orqaly', label: 'Orqaly', us: true },
          { id: 'odysseus', label: 'Odysseus AI' },
          { id: 'hermes', label: 'Hermes AI' },
          { id: 'openclaw', label: 'OpenClaw' },
          { id: 'claude', label: 'Claude' },
          { id: 'langchain', label: 'LangChain' },
          { id: 'crewai', label: 'CrewAI' },
        ]}
        rows={[
          { capability: 'Voice + Telegram + email out of the box', values: { orqaly: true, odysseus: false, hermes: 'partial', openclaw: false, claude: false, langchain: false, crewai: false } },
          { capability: 'BYOK across providers', values: { orqaly: true, odysseus: 'partial', hermes: false, openclaw: true, claude: false, langchain: true, crewai: true } },
          { capability: 'Marketplace publish with revenue share', values: { orqaly: true, odysseus: false, hermes: false, openclaw: 'partial', claude: false, langchain: false, crewai: false } },
          { capability: 'Audit log on every run by default', values: { orqaly: true, odysseus: false, hermes: false, openclaw: 'partial', claude: 'partial', langchain: 'partial', crewai: 'partial' } },
          { capability: 'No-code composition for non-engineers', values: { orqaly: true, odysseus: 'partial', hermes: true, openclaw: false, claude: 'partial', langchain: false, crewai: 'partial' } },
          ...COMPARISON_EXTRA_ROWS,
        ]}
        bg="tint"
      />
      <RelatedGrid
        title="Pairs well with"
        items={[
          { label: 'Consilium', to: '/control/consilium', iconName: 'GroupsOutlined', blurb: 'Put a voting council behind any agent for high-stakes decisions.' },
          { label: 'Communicator', to: '/control/communicator', iconName: 'ForumOutlined', blurb: 'Deploy the same agent across voice, Telegram, chat, email.' },
          { label: 'Tools', to: '/control/tools', iconName: 'ExtensionOutlined', blurb: 'Wire any external API into your agents, permissioned per-agent.' },
        ]}
        bg="subtle"
      />
      <ClosingCta
        title="Hire your first AI agent today."
        body="Build it in minutes, deploy it on a channel your customers already use, monitor every run."
        primary={{ label: 'Start free', to: '/signup' }}
        secondary={{ label: 'Talk to sales', to: '/contact' }}
      />
    </PublicShell>
  );
}
