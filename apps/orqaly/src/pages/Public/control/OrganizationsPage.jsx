import { Box, Button, Container, Grid, Stack, Typography, alpha, useTheme } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import MarketingCtaButton from '@/components/Public/primitives/MarketingCtaButton';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import LaunchIcon from '@mui/icons-material/Launch';
import CheckIcon from '@mui/icons-material/Check';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import PublicShell from '../../../components/Public/PublicShell';
import HeroSplit from '../../../components/Public/primitives/HeroSplit';
import Spotlight from '../../../components/Public/primitives/Spotlight';
import FeatureMosaic from '../../../components/Public/primitives/FeatureMosaic';
import RelatedGrid from '../../../components/Public/primitives/RelatedGrid';
import ClosingCta from '../../../components/Public/primitives/ClosingCta';
import DemoOrgCommandCenter from '../../../components/Public/demo/DemoOrgCommandCenter';
import DemoOrgGoalsResults from '../../../components/Public/demo/DemoOrgGoalsResults';
import DemoOrgTeamsReuse from '../../../components/Public/demo/DemoOrgTeamsReuse';
import DemoOrgKnowledge from '../../../components/Public/demo/DemoOrgKnowledge';
import DemoOrganizations from '../../../components/Public/demo/DemoOrganizations';
import LandingGlassIcon from '../../Landing/sections/LandingGlassIcon';
import { ITEMS_BY_SLUG } from '../../../data/instruments';
import {
  ORG_HUB_INTRO,
  ORG_PILLARS,
  SPOTLIGHT_GOALS,
  SPOTLIGHT_TEAMS,
  SPOTLIGHT_KB,
  WORKSPACE_NOTE,
  SPOTLIGHT_RLS,
} from '../../../data/organizationsPage';

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

function PillarCard({ pillar }) {
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
      <LandingGlassIcon name={pillar.iconName} size={22} tone="brand" />
      <Typography sx={{ fontWeight: 800, fontSize: '1.05rem', color: 'text.primary', lineHeight: 1.25 }}>
        {pillar.title}
      </Typography>
      <Typography sx={{ fontSize: '0.88rem', color: 'text.secondary', lineHeight: 1.55, flex: 1 }}>
        {pillar.body}
      </Typography>
      {pillar.linkLabel && (
        <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: 'primary.main' }}>
          {pillar.linkLabel}
        </Typography>
      )}
    </Stack>
  );
}

function RLSIsolationMock() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const isDark = theme.palette.mode === 'dark';

  const TableTile = ({ title, rows, locked }) => (
    <Box
      sx={{
        borderRadius: 2.5,
        overflow: 'hidden',
        border: `1px solid ${locked ? theme.palette.divider : alpha(primary, 0.4)}`,
        bgcolor: locked
          ? alpha(theme.palette.text.primary, 0.03)
          : alpha(primary, 0.05),
        opacity: locked ? 0.7 : 1,
        position: 'relative',
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 1.75, py: 1.25, bgcolor: locked ? alpha(theme.palette.text.primary, 0.04) : alpha(primary, 0.08), borderBottom: `1px solid ${locked ? theme.palette.divider : alpha(primary, 0.3)}` }}>
        <Typography sx={{ flex: 1, fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontWeight: 800, fontSize: '0.78rem', color: locked ? 'text.secondary' : 'primary.main' }}>
          {title}
        </Typography>
        {locked && <AppIcon
          name='LockOutlined'
          fallback={LockOutlinedIcon}
          sx={{ fontSize: 14, color: 'text.disabled' }}
          aria-hidden />}
      </Stack>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderBottom: `1px solid ${theme.palette.divider}`, bgcolor: isDark ? alpha('#fff', 0.02) : alpha(theme.palette.text.primary, 0.02) }}>
        {['id', 'org_id', 'name'].map((col) => (
          <Box key={col} sx={{ px: 1.5, py: 0.75, fontSize: '0.66rem', color: 'text.secondary', fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            {col}
          </Box>
        ))}
      </Box>
      {rows.map((r, i) => (
        <Box key={i} sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderBottom: i < rows.length - 1 ? `1px solid ${theme.palette.divider}` : 'none' }}>
          {r.map((cell, j) => (
            <Box
              key={j}
              sx={{
                px: 1.5,
                py: 0.9,
                fontSize: '0.74rem',
                fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                color: j === 1 ? (locked ? 'text.disabled' : 'primary.main') : 'text.primary',
                bgcolor: j === 1 ? (locked ? 'transparent' : alpha(primary, 0.08)) : 'transparent',
                fontWeight: j === 1 ? 700 : 400,
              }}
            >
              {cell}
            </Box>
          ))}
        </Box>
      ))}
    </Box>
  );

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
        <AppIcon
          name='ShieldOutlined'
          fallback={ShieldOutlinedIcon}
          sx={{ color: 'primary.main', fontSize: 18 }} />
        <Typography sx={{ fontWeight: 800, fontSize: '0.72rem', color: 'text.secondary', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Row-level security · same table, two orgs
        </Typography>
      </Stack>
      <Stack spacing={2}>
        <TableTile
          title="agents · current org (Roastedco)"
          rows={[
            ['ag_104', 'org_rsc', 'Triage voice'],
            ['ag_107', 'org_rsc', 'Refund reviewer'],
          ]}
        />
        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ pl: 1 }}>
          <Box sx={{ flex: 1, height: 1, bgcolor: theme.palette.divider }} />
          <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', fontWeight: 700, fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}>
            WHERE org_id = current_user.org
          </Typography>
          <Box sx={{ flex: 1, height: 1, bgcolor: theme.palette.divider }} />
        </Stack>
        <TableTile
          title="agents · neighbour org (locked)"
          locked
          rows={[
            ['ag_241', 'org_flw', '- hidden -'],
            ['ag_244', 'org_flw', '- hidden -'],
          ]}
        />
      </Stack>
    </Box>
  );
}

export default function OrganizationsPage() {
  const item = ITEMS_BY_SLUG['control:organizations'];
  const theme = useTheme();

  return (
    <PublicShell>
      <HeroSplit
        eyebrow="CONTROL POINT · Organizations"
        title={item.hero.title}
        subtitle={item.hero.subtitle}
        ctas={
          <>
            <MarketingCtaButton component={RouterLink} to="/signup" endIcon={<AppIcon name='ArrowForward' fallback={ArrowForwardIcon} />} sx={{ px: 3, py: 1.25 }}>
              Create your workspaces
            </MarketingCtaButton>
            <Button component={RouterLink} to={item.inAppRoute} variant="outlined" size="large" endIcon={<AppIcon name='Launch' fallback={LaunchIcon} sx={{ fontSize: 18 }} />} sx={{ fontWeight: 700, borderRadius: 2, textTransform: 'none', px: 3, py: 1.25 }}>
              Open in app
            </Button>
          </>
        }
        visual={<DemoOrgCommandCenter />}
        bgVariant="mesh"
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
              {ORG_HUB_INTRO.eyebrow}
            </Typography>
            <Typography component="h2" sx={{ fontWeight: 800, fontSize: { xs: '1.6rem', md: '2.2rem' }, lineHeight: 1.15, color: 'text.primary' }}>
              {ORG_HUB_INTRO.title}
            </Typography>
            <Typography sx={{ fontSize: { xs: '1rem', md: '1.08rem' }, color: 'text.secondary', lineHeight: 1.7 }}>
              {ORG_HUB_INTRO.subtitle}
            </Typography>
          </Stack>
          <Grid container spacing={2.5}>
            {ORG_PILLARS.map((pillar) => (
              <Grid key={pillar.id} size={{ xs: 12, sm: 6 }}>
                <PillarCard pillar={pillar} />
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>
      <Spotlight
        eyebrow={SPOTLIGHT_GOALS.eyebrow}
        title={SPOTLIGHT_GOALS.title}
        body={SPOTLIGHT_GOALS.body}
        bullets={SPOTLIGHT_GOALS.bullets}
        visual={
          <DemoGlow>
            <DemoOrgGoalsResults />
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
            <DemoOrgTeamsReuse />
          </DemoGlow>
        }
        reverse
        bg="tint"
      />
      <Spotlight
        eyebrow={SPOTLIGHT_KB.eyebrow}
        title={SPOTLIGHT_KB.title}
        body={SPOTLIGHT_KB.body}
        bullets={SPOTLIGHT_KB.bullets}
        visual={
          <DemoGlow>
            <DemoOrgKnowledge />
          </DemoGlow>
        }
      />
      <Spotlight
        eyebrow={WORKSPACE_NOTE.eyebrow}
        title={WORKSPACE_NOTE.title}
        body={WORKSPACE_NOTE.body}
        visual={<DemoOrganizations />}
        bg="tint"
        reverse
      />
      <Spotlight
        eyebrow={SPOTLIGHT_RLS.eyebrow}
        title={SPOTLIGHT_RLS.title}
        body={SPOTLIGHT_RLS.body}
        bullets={SPOTLIGHT_RLS.bullets}
        visual={<RLSIsolationMock />}
        reverse
      />
      <FeatureMosaic title="Inside Organizations" features={item.features} featuredIndex={0} />
      <RelatedGrid
        title="Pairs well with"
        items={[
          { label: 'Job Pool', to: '/job-pool', iconName: 'AssignmentOutlined', blurb: 'Launch and track goals scoped to an org.' },
          { label: 'Agents', to: '/control/agents', iconName: 'SmartToyOutlined', blurb: 'Each org has its own agent fleet.' },
          { label: 'Knowledge Base', to: '/instruments/knowledge-base', iconName: 'MenuBookOutlined', blurb: 'KB scoped to the org, never leaks across.' },
        ]}
        bg="tint"
      />
      <ClosingCta title="Stand up one org. Run every goal from the same command center." />
    </PublicShell>
  );
}
