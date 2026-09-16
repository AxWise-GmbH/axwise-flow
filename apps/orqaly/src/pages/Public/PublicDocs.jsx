import { Box, Container, Grid, Stack, Typography, Button, alpha, useTheme } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import MarketingCtaButton from '@/components/Public/primitives/MarketingCtaButton';
import RocketLaunchOutlinedIcon from '@mui/icons-material/RocketLaunchOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import HubOutlinedIcon from '@mui/icons-material/HubOutlined';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import PublicShell from '../../components/Public/PublicShell';
import { PageHero } from './_shared';

import AppIcon from '../../components/icons/AppIcon';

const SECTIONS = [
  {
    Icon: RocketLaunchOutlinedIcon,
    title: 'Get started',
    body: 'Spin up your workspace, connect your data, and ship your first agent in under an hour.',
    links: [
      { label: 'Create your workspace', to: '/signup' },
      { label: 'Concepts: agents, tools, skills', to: '/documentation' },
      { label: 'First agent in 5 minutes', to: '/documentation' },
    ],
  },
  {
    Icon: SmartToyOutlinedIcon,
    title: 'Build agents',
    body: 'Compose agents from skills and tools, give them memory, and put a Consilium council behind their decisions.',
    links: [
      { label: 'Agent Builder walkthrough', to: '/documentation' },
      { label: 'Bring your own keys (BYOK)', to: '/documentation' },
      { label: 'Publishing to the marketplace', to: '/marketplace-preview' },
    ],
  },
  {
    Icon: HubOutlinedIcon,
    title: 'Connect channels',
    body: 'Run your agents on voice, Telegram, web chat, email and webhooks. Same agent, every channel.',
    links: [
      { label: 'Telegram setup', to: '/documentation' },
      { label: 'Voice agents', to: '/documentation' },
      { label: 'Webhooks & integrations', to: '/documentation' },
    ],
  },
];

export default function PublicDocs() {
  const theme = useTheme();
  return (
    <PublicShell>
      <PageHero
        eyebrow="Docs"
        title="Learn Orqaly."
        subtitle="From your first agent to a marketplace launch - guides written for humans, not engineers. Deeper API docs live behind your workspace at /documentation."
      />
      <Box sx={{ py: { xs: 5, md: 7 } }}>
        <Container maxWidth="lg">
          <Grid container spacing={3}>
            {SECTIONS.map(({ Icon, title, body, links }) => (
              <Grid key={title} size={{ xs: 12, md: 4 }}>
                <Stack
                  spacing={2}
                  sx={{
                    height: '100%',
                    p: 3,
                    borderRadius: 3,
                    border: `1px solid ${theme.palette.divider}`,
                    bgcolor: 'background.paper',
                  }}
                >
                  <Box sx={{ width: 44, height: 44, borderRadius: 2, bgcolor: alpha(theme.palette.primary.main, 0.1), color: 'primary.main', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon />
                  </Box>
                  <Typography sx={{ fontWeight: 800, fontSize: '1.1rem', color: 'text.primary' }}>
                    {title}
                  </Typography>
                  <Typography sx={{ fontSize: '0.92rem', color: 'text.secondary', lineHeight: 1.6 }}>
                    {body}
                  </Typography>
                  <Stack spacing={0.5} sx={{ pt: 1 }}>
                    {links.map((l) => (
                      <Box
                        key={l.label}
                        component={RouterLink}
                        to={l.to}
                        sx={{
                          textDecoration: 'none',
                          color: 'primary.main',
                          fontWeight: 600,
                          fontSize: '0.9rem',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 0.5,
                          '&:hover': { color: 'primary.dark' },
                        }}
                      >
                        {l.label}
                        <AppIcon name='ArrowForward' fallback={ArrowForwardIcon} sx={{ fontSize: 14 }} />
                      </Box>
                    ))}
                  </Stack>
                </Stack>
              </Grid>
            ))}
          </Grid>

          <Box
            sx={{
              mt: 6,
              p: { xs: 3, md: 4 },
              borderRadius: 3,
              bgcolor: alpha(theme.palette.primary.main, 0.05),
              border: `1px solid ${alpha(theme.palette.primary.main, 0.25)}`,
              textAlign: 'center',
            }}
          >
            <Typography sx={{ fontWeight: 800, fontSize: '1.25rem', color: 'text.primary', mb: 1 }}>
              Looking for the full reference?
            </Typography>
            <Typography sx={{ fontSize: '0.95rem', color: 'text.secondary', mb: 2.5, maxWidth: 520, mx: 'auto' }}>
              The complete API and admin docs live behind a workspace PIN. Sign in or create a free
              workspace to access them.
            </Typography>
            <Stack direction="row" spacing={2} justifyContent="center">
              <MarketingCtaButton component={RouterLink} to="/signup" sx={{ fontWeight: 700, borderRadius: 2, px: 3 }}>
                Create workspace
              </MarketingCtaButton>
              <Button component={RouterLink} to="/documentation" variant="outlined" sx={{ fontWeight: 700, borderRadius: 2, px: 3 }}>
                Open documentation
              </Button>
            </Stack>
          </Box>
        </Container>
      </Box>
    </PublicShell>
  );
}
