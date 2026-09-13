import { Box, Stack, Typography, alpha, useTheme } from '@mui/material';
import { GlassPanel } from './demoShell';

export function DemoFreelancersHub() {
  const theme = useTheme();
  const rows = [
    { id: 'INV-1042', client: 'Northwind Studio', amount: '$2,400', status: 'sent', tone: 'ok' },
    { id: 'INV-1041', client: 'Acme Design', amount: '$890', status: 'paid', tone: 'ok' },
    { id: 'INV-1039', client: 'Beta Labs', amount: '$1,120', status: 'overdue 14d', tone: 'warn' },
  ];
  return (
    <GlassPanel>
      <Box sx={{ p: 2, borderBottom: `1px solid ${theme.palette.divider}` }}>
        <Typography sx={{ fontWeight: 800, fontSize: '0.95rem', color: 'text.primary' }}>Invoices · this week</Typography>
        <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>2 sent · 1 nudge scheduled</Typography>
      </Box>
      <Stack divider={<Box sx={{ borderBottom: `1px solid ${theme.palette.divider}` }} />}>
        {rows.map((r) => (
          <Stack key={r.id} direction="row" spacing={2} alignItems="center" sx={{ p: 1.75 }}>
            <Typography sx={{ fontFamily: 'monospace', fontSize: '0.82rem', color: 'text.primary', minWidth: 72 }}>{r.id}</Typography>
            <Stack sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', color: 'text.primary' }}>{r.client}</Typography>
              <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>{r.amount}</Typography>
            </Stack>
            <Box sx={{ px: 1, py: 0.3, borderRadius: 1, bgcolor: alpha(r.tone === 'warn' ? theme.palette.warning.main : theme.palette.primary.main, 0.12), color: r.tone === 'warn' ? 'warning.main' : 'primary.main', fontSize: '0.68rem', fontWeight: 800 }}>{r.status}</Box>
          </Stack>
        ))}
      </Stack>
    </GlassPanel>
  );
}

function BriefMock({ title, lines }) {
  const theme = useTheme();
  return (
    <GlassPanel sx={{ p: { xs: 2.5, md: 3 } }}>
      <Typography sx={{ fontWeight: 800, fontSize: '0.95rem', color: 'text.primary', mb: 2 }}>{title}</Typography>
      <Stack spacing={1}>
        {lines.map((l) => (
          <Typography key={l} sx={{ fontSize: '0.88rem', color: 'text.secondary', lineHeight: 1.55 }}>· {l}</Typography>
        ))}
      </Stack>
    </GlassPanel>
  );
}

export function DemoFreelancersDiscovery() {
  return <BriefMock title="Discovery brief · Zoom · 42 min" lines={['Scope: brand site + CMS', 'Budget signal: mid-market', 'Risk: tight launch date', 'Next: proposal by Friday']} />;
}

export function DemoFreelancersProposal() {
  return <BriefMock title="Proposal draft · from brief" lines={['3 milestones · fixed fee', 'Payment: 40/40/20', 'SOW attached', 'Ready for your review']} />;
}

export const DemoFreelancersInvoice = DemoFreelancersHub;

export function DemoFreelancersFollowup() {
  const theme = useTheme();
  const rows = [
    { client: 'Beta Labs', day: 'Day 14', tone: 'warn' },
    { client: 'Orbit SaaS', day: 'Day 7', tone: 'ok' },
    { client: 'Pixel Co', day: 'Day 21', tone: 'warn' },
  ];
  return (
    <GlassPanel>
      <Box sx={{ p: 2, borderBottom: `1px solid ${theme.palette.divider}` }}>
        <Typography sx={{ fontWeight: 800, fontSize: '0.95rem', color: 'text.primary' }}>Follow-up queue</Typography>
      </Box>
      <Stack divider={<Box sx={{ borderBottom: `1px solid ${theme.palette.divider}` }} />}>
        {rows.map((r) => (
          <Stack key={r.client} direction="row" spacing={2} sx={{ p: 1.75 }}>
            <Typography sx={{ flex: 1, fontWeight: 600, fontSize: '0.85rem', color: 'text.primary' }}>{r.client}</Typography>
            <Typography sx={{ fontSize: '0.82rem', color: r.tone === 'warn' ? 'warning.main' : 'primary.main', fontWeight: 700 }}>{r.day}</Typography>
          </Stack>
        ))}
      </Stack>
    </GlassPanel>
  );
}
