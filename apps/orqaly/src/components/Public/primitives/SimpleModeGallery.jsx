import { Box, Container, Grid, Stack, Typography, alpha, useTheme } from '@mui/material';
import ResultsArt from '../../../pages/DashboardHub/illustrations/ResultsArt';
import OrganizationsArt from '../../../pages/Marketplace/components/illustrations/OrganizationsArt';
import DashboardsArt from '../../../pages/DashboardHub/illustrations/DashboardsArt';
import ReplicatorsArt from '../../../pages/Marketplace/components/illustrations/ReplicatorsArt';
import AccountArt from '../../../pages/Marketplace/components/illustrations/AccountArt';
import AgentsArt from '../../../pages/Marketplace/components/illustrations/AgentsArt';
import DemoSimpleMode from '../demo/DemoSimpleMode';
import SimpleModeDockMock from '../demo/SimpleModeDockMock';
import SimpleModeOrgsMock from '../demo/SimpleModeOrgsMock';
import SimpleModeMarketplaceMock from '../demo/SimpleModeMarketplaceMock';
import SimpleModeToggleMock from '../demo/SimpleModeToggleMock';
import SimpleModeIntroMock from '../demo/SimpleModeIntroMock';

const GALLERY_ITEMS = [
  {
    tag: 'Home',
    title: 'Pipeline at a glance',
    caption: 'In-flight goals, attention queue, spend, and New Request - one screen.',
    Illustration: ResultsArt,
    Visual: DemoSimpleMode,
  },
  {
    tag: 'Dock',
    title: 'Four-stop navigation',
    caption: 'Glass bottom bar: Home, Organizations, Reports, Marketplace.',
    Illustration: null,
    Visual: SimpleModeDockMock,
  },
  {
    tag: 'Organizations',
    title: 'Org cards + shortcuts',
    caption: 'Tile layout with quick jumps to teams, agents, and investments.',
    Illustration: OrganizationsArt,
    Visual: SimpleModeOrgsMock,
  },
  {
    tag: 'Marketplace',
    title: 'Compact hire grid',
    caption: 'Illustrated category tiles in a fixed simple-mode order.',
    Illustration: ReplicatorsArt,
    Visual: SimpleModeMarketplaceMock,
  },
  {
    tag: 'Mode',
    title: 'Simple or Advanced',
    caption: 'Toggle from the account menu; tour plays when you switch to Simple.',
    Illustration: AccountArt,
    Visual: SimpleModeToggleMock,
  },
  {
    tag: 'Tour',
    title: 'Five-step welcome',
    caption: 'Goals, orgs, providers, dashboards, marketplace - on enable.',
    Illustration: DashboardsArt,
    Visual: SimpleModeIntroMock,
  },
];

function GalleryCard({ item, theme }) {
  const primary = theme.palette.primary.main;
  const { Illustration, Visual } = item;

  return (
    <Stack
      spacing={1.5}
      sx={{
        height: '100%',
        p: { xs: 2, md: 2.5 },
        borderRadius: 3,
        bgcolor: 'background.paper',
        border: `1px solid ${theme.palette.divider}`,
      }}
    >
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
        <Box
          sx={{
            px: 1,
            py: 0.35,
            borderRadius: 999,
            bgcolor: alpha(primary, 0.12),
            color: 'primary.main',
            fontSize: '0.68rem',
            fontWeight: 800,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}
        >
          {item.tag}
        </Box>
        <Typography sx={{ fontWeight: 800, fontSize: '0.95rem', color: 'text.primary' }}>{item.title}</Typography>
      </Stack>
      <Typography sx={{ fontSize: '0.85rem', color: 'text.secondary', lineHeight: 1.5 }}>{item.caption}</Typography>
      {Illustration && (
        <Box
          sx={{
            position: 'relative',
            height: 72,
            borderRadius: 2,
            overflow: 'hidden',
            color: primary,
            bgcolor: alpha(primary, 0.06),
            border: `1px solid ${alpha(primary, 0.12)}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            '& svg': { width: '85%', height: '85%', maxHeight: 64 },
          }}
        >
          <Illustration />
        </Box>
      )}
      <Box
        sx={{
          position: 'relative',
          flex: 1,
          '&::before': Illustration
            ? undefined
            : {
                content: '""',
                position: 'absolute',
                inset: -8,
                background: `radial-gradient(ellipse at center, ${alpha(primary, 0.12)} 0%, transparent 70%)`,
                pointerEvents: 'none',
              },
        }}
      >
        <Visual />
      </Box>
    </Stack>
  );
}

export default function SimpleModeGallery() {
  const theme = useTheme();

  return (
    <Box
      component="section"
      sx={{
        py: { xs: 5, md: 8 },
        bgcolor: alpha(theme.palette.text.primary, 0.02),
        borderTop: `1px solid ${theme.palette.divider}`,
        borderBottom: `1px solid ${theme.palette.divider}`,
      }}
    >
      <Container maxWidth="lg">
        <Stack spacing={1.5} sx={{ mb: { xs: 3, md: 4 } }} alignItems="center" textAlign="center">
          <Typography
            sx={{
              fontSize: '0.78rem',
              fontWeight: 800,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'primary.main',
            }}
          >
            In the product
          </Typography>
          <Typography
            component="h2"
            sx={{
              fontWeight: 800,
              fontSize: { xs: '1.6rem', md: '2.2rem' },
              color: 'text.primary',
              letterSpacing: '-0.01em',
            }}
          >
            See Simple Mode in the app
          </Typography>
          <Typography sx={{ fontSize: '1rem', color: 'text.secondary', maxWidth: 560, lineHeight: 1.6 }}>
            Illustrations and UI snapshots from the live simple-mode surfaces - dock, home, orgs, marketplace, and onboarding.
          </Typography>
        </Stack>
        <Grid container spacing={{ xs: 2, md: 2.5 }}>
          {GALLERY_ITEMS.map((item) => (
            <Grid key={item.tag} size={{ xs: 12, sm: 6, md: 4 }}>
              <GalleryCard item={item} theme={theme} />
            </Grid>
          ))}
        </Grid>
        <Box
          sx={{
            mt: 3,
            p: 2,
            borderRadius: 2,
            border: `1px dashed ${alpha(theme.palette.primary.main, 0.35)}`,
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            color: theme.palette.primary.main,
            overflow: 'hidden',
          }}
        >
          <Box sx={{ width: 56, height: 56, flexShrink: 0, '& svg': { width: '100%', height: '100%' } }}>
            <AgentsArt />
          </Box>
          <Typography sx={{ fontSize: '0.88rem', color: 'text.secondary', lineHeight: 1.5 }}>
            <Box component="span" sx={{ fontWeight: 800, color: 'text.primary' }}>My Agents</Box>
            {' '}
            and Requests stay in the burger menu - deep links from org tiles reach Investments, Consilium, and Tools without leaving Simple Mode.
          </Typography>
        </Box>
      </Container>
    </Box>
  );
}
