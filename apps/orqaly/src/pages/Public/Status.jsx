import { Box, Container, Stack, Typography, alpha, useTheme } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PublicShell from '../../components/Public/PublicShell';
import { PageHero, PageSection, ProseP } from './_shared';

import AppIcon from '../../components/icons/AppIcon';

const SERVICES = [
  { name: 'Web application', status: 'operational' },
  { name: 'API', status: 'operational' },
  { name: 'Authentication', status: 'operational' },
  { name: 'Database', status: 'operational' },
  { name: 'Agent job queue', status: 'operational' },
  { name: 'Voice channels', status: 'operational' },
];

const STATUS_LABEL = {
  operational: { color: '#10B981', label: 'Operational' },
  degraded: { color: '#F59E0B', label: 'Degraded performance' },
  outage: { color: '#EF4444', label: 'Outage' },
};

function ServiceRow({ name, status, theme }) {
  const { color, label } = STATUS_LABEL[status];
  return (
    <Stack
      direction="row"
      alignItems="center"
      justifyContent="space-between"
      sx={{
        p: 2,
        borderRadius: 2,
        border: `1px solid ${theme.palette.divider}`,
        bgcolor: 'background.paper',
      }}
    >
      <Stack direction="row" spacing={1.5} alignItems="center">
        <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: color, boxShadow: `0 0 8px ${alpha(color, 0.5)}` }} />
        <Typography sx={{ fontWeight: 600, color: 'text.primary' }}>{name}</Typography>
      </Stack>
      <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color, textTransform: 'none' }}>
        {label}
      </Typography>
    </Stack>
  );
}

export default function StatusPage() {
  const theme = useTheme();
  const allGreen = SERVICES.every((s) => s.status === 'operational');
  const headlineColor = allGreen ? '#10B981' : '#F59E0B';
  return (
    <PublicShell>
      <PageHero
        eyebrow="Status"
        title={allGreen ? 'All systems operational.' : 'Investigating an incident.'}
        subtitle="This page shows the current health of Orqaly’s services. We’re working on a real-time integration; for now it is updated manually."
      />
      <Box sx={{ py: { xs: 4, md: 6 } }}>
        <Container maxWidth="md">
          <Stack
            direction="row"
            alignItems="center"
            spacing={2}
            sx={{
              p: 3,
              mb: 4,
              borderRadius: 3,
              bgcolor: alpha(headlineColor, 0.08),
              border: `1px solid ${alpha(headlineColor, 0.4)}`,
            }}
          >
            <AppIcon
              name='CheckCircle'
              fallback={CheckCircleIcon}
              sx={{ color: headlineColor, fontSize: 32 }} />
            <Stack>
              <Typography sx={{ fontWeight: 800, fontSize: '1.05rem', color: 'text.primary' }}>
                {allGreen ? 'All systems normal' : 'Service degraded'}
              </Typography>
              <Typography sx={{ fontSize: '0.85rem', color: 'text.secondary' }}>
                Last checked: just now
              </Typography>
            </Stack>
          </Stack>

          <Stack spacing={1.5}>
            {SERVICES.map((s) => (
              <ServiceRow key={s.name} {...s} theme={theme} />
            ))}
          </Stack>
        </Container>
      </Box>
      <PageSection title="Subscribe to updates">
        <ProseP>
          We post incident updates here and via email to workspace owners. A real-time status feed
          with historical uptime is on the roadmap - until then, follow{' '}
          <a href="mailto:status@orqaly.com">status@orqaly.com</a> or check this page.
        </ProseP>
      </PageSection>
      <PageSection title="Recent incidents">
        <ProseP>No incidents in the past 30 days.</ProseP>
      </PageSection>
    </PublicShell>
  );
}
