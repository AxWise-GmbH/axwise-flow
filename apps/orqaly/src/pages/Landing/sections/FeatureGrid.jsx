import { useState } from 'react';
import {
  Box,
  Button,
  ButtonBase,
  Collapse,
  Container,
  Grid,
  Stack,
  Typography,
  alpha,
  useTheme,
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import OutlinedFlagIcon from '@mui/icons-material/OutlinedFlag';
import AllInboxOutlinedIcon from '@mui/icons-material/AllInboxOutlined';
import HubOutlinedIcon from '@mui/icons-material/HubOutlined';
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';
import RecordVoiceOverOutlinedIcon from '@mui/icons-material/RecordVoiceOverOutlined';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import BarChartOutlinedIcon from '@mui/icons-material/BarChartOutlined';
import CorporateFareOutlinedIcon from '@mui/icons-material/CorporateFareOutlined';
import { createHoverGlowShadow } from '../../../theme/hoverGlow';
import LandingGlassIcon from './LandingGlassIcon';

const FEATURES = [
  {
    iconName: 'FlagOutlined',
    Fallback: OutlinedFlagIcon,
    title: 'Goals & Deliverables',
    desc: 'Describe an outcome. Watch agents break it into tasks and ship versioned results.',
    detail:
      'Type a goal in plain language and Consilium decomposes it into tasks, assigns the right agents, and ships versioned deliverables to your review. No prompts to engineer.',
    bullets: [
      'Auto-decomposition with editable plans',
      'Versioned outputs - compare v1, v2, v3 side-by-side',
      'One-click refinement loop on any deliverable',
    ],
    cta: 'See goals',
    to: '/goals',
  },
  {
    iconName: 'AllInboxOutlined',
    Fallback: AllInboxOutlinedIcon,
    title: 'Requests Pool',
    desc: 'One inbox for every ask. Drop a request, pick who handles it, see it get done - no chasing, no Slack threads.',
    detail:
      'Drop a request, pick who handles it, watch it get done. No Slack threads to mine, no spreadsheets to update - every ask is queued, claimed, and resolved in one place.',
    bullets: [
      'Priority queue with SLA timers',
      'Assign to humans or agents - same UI',
      'Full thread history per request',
    ],
    cta: 'See requests',
    to: '/job-pool',
  },
  {
    iconName: 'HubOutlined',
    Fallback: HubOutlinedIcon,
    title: 'Consilium',
    desc: 'Multi-agent council where agents debate and vote on complex decisions.',
    detail:
      "One model is one opinion. Consilium runs an analyst, a critic, a synthesiser, and a devil's advocate over the same question and surfaces a defensible decision with a written rationale.",
    bullets: [
      'Configurable council size and personas',
      'Majority vote with dissent captured',
      'Full audit trail per decision',
    ],
    cta: 'See consilium',
    to: '/consilium',
  },
  {
    iconName: 'StorefrontRounded',
    Fallback: StorefrontOutlinedIcon,
    title: 'Agent Marketplace',
    desc: 'Discover, fork, and publish skills, tools, replicators. Creators keep 85% of every sale.',
    detail:
      'Browse agents, tools, skills, and full business templates built by independent creators. Install in one click, fork to customise, publish your own and keep 85% of every sale.',
    bullets: [
      'Verified creators with revenue dashboards',
      'Free, one-time, and subscription pricing',
      'Stripe Connect payouts to 30+ countries',
    ],
    cta: 'See marketplace',
    to: '/marketplace',
  },
  {
    iconName: 'RecordVoiceOverOutlined',
    Fallback: RecordVoiceOverOutlinedIcon,
    title: 'Communicator + Voice',
    desc: 'Talk to your agents via voice, Telegram, chat. Live AiOrb interface for natural conversation.',
    detail:
      'AiOrb live voice when you are at the desk, Telegram when you are on the train, email for async briefs. Same agents, same memory, every channel.',
    bullets: [
      'Voice via the AiOrb interface',
      'Telegram bot in three clicks',
      'Inbound email - reply to a deliverable, refine it',
    ],
    cta: 'Try voice',
    to: '/communicator',
  },
  {
    iconName: 'MenuBookOutlined',
    Fallback: MenuBookOutlinedIcon,
    title: 'Knowledge Base',
    desc: 'Documents, semantic search, long-term memory for agents. Context that sticks.',
    detail:
      'Upload documents, semantic-search them, give agents long-term memory of your business. Context-aware answers without the copy-paste tax of a chatbot.',
    bullets: [
      'Drag-and-drop ingest (PDF, MD, web, audio)',
      'Per-agent and per-organisation scopes',
      'Row-Level Security by default',
    ],
    cta: 'See KB',
    to: '/knowledge-base',
  },
  {
    iconName: 'BarChartOutlined',
    Fallback: BarChartOutlinedIcon,
    title: 'Dashboards & Reports',
    desc: 'AI-built dashboards. Ask in English, get charts. Custom KPIs and drill-downs.',
    detail:
      'Ask in plain language, get a dashboard. Custom KPIs, drill-downs, daily emails - all without writing a SQL query or wrestling with a BI tool.',
    bullets: [
      'AI-built widgets from a one-line ask',
      'Schedule daily / weekly digests',
      'Embed any dashboard into a public report',
    ],
    cta: 'See dashboards',
    to: '/dashboards',
  },
  {
    iconName: 'CorporateFareOutlined',
    Fallback: CorporateFareOutlinedIcon,
    title: 'Organizations',
    desc: 'Multi-tenant teams, shared agents, row-level security, billing, roles.',
    detail:
      'Run multiple businesses from one account or invite your team into one workspace. Row-Level Security, shared agents, per-role billing, audit logs - the boring parts handled.',
    bullets: [
      'Unlimited seats inside your plan',
      'Per-role permissions and PIN-gated areas',
      'Audit log retention you can defend',
    ],
    cta: 'See orgs',
    to: '/organizations',
  },
];

function FeatureItem({
  iconName,
  Fallback,
  title,
  desc,
  detail,
  bullets,
  cta,
  to,
  isOpen,
  onToggle,
}) {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const isDark = theme.palette.mode === 'dark';
  return (
    <Box
      sx={{
        borderRadius: 3,
        bgcolor: isDark ? alpha('#fff', 0.025) : alpha('#fff', 0.7),
        border: `1px solid ${isOpen ? alpha(primary, 0.45) : theme.palette.divider}`,
        backdropFilter: 'saturate(140%) blur(10px)',
        WebkitBackdropFilter: 'saturate(140%) blur(10px)',
        transition: 'border-color 220ms ease, box-shadow 220ms ease',
        boxShadow: isOpen ? createHoverGlowShadow(theme) : 'none',
        overflow: 'hidden',
      }}
    >
      <ButtonBase
        onClick={onToggle}
        aria-expanded={isOpen}
        sx={{
          width: '100%',
          px: 2.5,
          py: 2,
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          textAlign: 'left',
          justifyContent: 'flex-start',
          '&:hover': { bgcolor: alpha(primary, 0.04) },
        }}
      >
        <LandingGlassIcon name={iconName} fallback={Fallback} size={24} tone="brand" />
        <Typography sx={{ flex: 1, fontWeight: 700, fontSize: '1rem', color: 'text.primary' }}>
          {title}
        </Typography>
        <ExpandMoreIcon
          sx={{
            color: isOpen ? primary : 'text.secondary',
            transform: isOpen ? 'rotate(180deg)' : 'none',
            transition: 'transform 220ms ease, color 220ms ease',
          }}
        />
      </ButtonBase>
      <Collapse in={isOpen} timeout={260} unmountOnExit>
        <Box sx={{ px: 2.5, pb: 2.5, pt: 0.5 }}>
          <Typography sx={{ fontSize: '0.9rem', color: 'text.secondary', lineHeight: 1.55 }}>
            {desc}
          </Typography>
          <Typography
            sx={{ fontSize: '0.88rem', color: 'text.secondary', lineHeight: 1.65, mt: 1.5 }}
          >
            {detail}
          </Typography>
          <Stack
            component="ul"
            spacing={0.75}
            sx={{ mt: 1.5, mb: 2, pl: 0, m: 0, listStyle: 'none' }}
          >
            {bullets.map((bullet) => (
              <Stack
                key={bullet}
                component="li"
                direction="row"
                spacing={1.25}
                alignItems="flex-start"
              >
                <Box
                  sx={{
                    mt: '7px',
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    bgcolor: 'primary.main',
                    flexShrink: 0,
                  }}
                />
                <Typography sx={{ fontSize: '0.85rem', color: 'text.secondary', lineHeight: 1.5 }}>
                  {bullet}
                </Typography>
              </Stack>
            ))}
          </Stack>
          <Button
            component={RouterLink}
            to={to}
            variant="outlined"
            size="small"
            endIcon={<ArrowForwardIcon />}
            sx={{
              fontWeight: 700,
              borderRadius: 2,
              textTransform: 'none',
              borderColor: alpha(primary, 0.4),
              '&:hover': { borderColor: 'primary.main', bgcolor: alpha(primary, 0.06) },
            }}
          >
            {cta}
          </Button>
        </Box>
      </Collapse>
    </Box>
  );
}

export default function FeatureGrid() {
  const [expanded, setExpanded] = useState(null);
  return (
    <Box component="section" id="product" sx={{ py: { xs: 8, md: 12 } }}>
      <Container maxWidth="lg">
        <Stack spacing={2} alignItems="center" textAlign="center" sx={{ mb: 6 }}>
          <Typography
            sx={{
              fontSize: '0.85rem',
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'primary.main',
            }}
          >
            The platform
          </Typography>
          <Typography
            sx={{
              fontSize: { xs: '2rem', md: '2.75rem' },
              fontWeight: 800,
              lineHeight: 1.15,
              color: 'text.primary',
              maxWidth: 720,
            }}
          >
            Everything you need
          </Typography>
          <Typography sx={{ fontSize: '1.05rem', color: 'text.secondary', maxWidth: 580 }}>
            Run an AI-powered business. No glue code, no juggling tabs.
          </Typography>
        </Stack>

        <Grid container spacing={1.5} alignItems="flex-start">
          {FEATURES.map((f) => (
            <Grid key={f.title} size={{ xs: 12, md: 6 }}>
              <FeatureItem
                {...f}
                isOpen={expanded === f.title}
                onToggle={() => setExpanded((prev) => (prev === f.title ? null : f.title))}
              />
            </Grid>
          ))}
        </Grid>
      </Container>
    </Box>
  );
}

export { FEATURES };
