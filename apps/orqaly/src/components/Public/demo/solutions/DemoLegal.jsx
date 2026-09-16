import { Box, Stack, Typography, alpha, useTheme } from '@mui/material';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { GlassPanel } from './demoShell';

import AppIcon from '../../../icons/AppIcon';

export function DemoLegalContract() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const warn = theme.palette.warning.main;
  return (
    <GlassPanel sx={{ p: { xs: 2.5, md: 3 } }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Typography sx={{ fontWeight: 800, fontSize: '0.88rem' }}>Master services agreement</Typography>
        <Box sx={{ px: 1, py: 0.3, borderRadius: 1, bgcolor: alpha(warn, 0.15), color: 'warning.main', fontSize: '0.68rem', fontWeight: 800 }}>3 RISKS</Box>
      </Stack>
      <Stack spacing={1.5}>
        <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: alpha(primary, 0.06), borderLeft: `3px solid ${primary}` }}>
          <Typography sx={{ fontSize: '0.85rem', color: 'text.primary' }}>§4.2 Termination — standard, no changes.</Typography>
        </Box>
        <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: alpha(warn, 0.08), borderLeft: `3px solid ${warn}` }}>
          <Typography sx={{ fontSize: '0.85rem', color: 'text.primary' }}>§7.1 Liability cap €5k — counter to €50k?</Typography>
        </Box>
      </Stack>
    </GlassPanel>
  );
}

export const DemoLegalHub = DemoLegalContract;

export function DemoLegalEcosystem() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const warn = theme.palette.warning.main;
  const rows = [
    { name: 'Acme Holding OÜ', jurisdiction: 'EE', rel: 'holding', status: 'mapped', tone: 'ok' },
    { name: 'Acme UK Ltd', jurisdiction: 'UK', rel: 'subsidiary', status: 'mapped', tone: 'ok' },
    { name: 'Acme EU SPV', jurisdiction: 'EE', rel: 'SPV', status: 'proposed', tone: 'warn' },
  ];
  return (
    <GlassPanel>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ p: 2, borderBottom: `1px solid ${theme.palette.divider}` }}>
        <AppIcon
          name='AccountTreeOutlined'
          fallback={AccountTreeOutlinedIcon}
          sx={{ color: 'primary.main' }} />
        <Typography sx={{ fontWeight: 800, fontSize: '0.92rem' }}>Ecosystem map · 6 entities</Typography>
      </Stack>
      <Stack divider={<Box sx={{ borderBottom: `1px solid ${theme.palette.divider}` }} />}>
        {rows.map((r) => {
          const tint = r.tone === 'warn' ? warn : primary;
          return (
            <Stack key={r.name} direction="row" spacing={1.5} sx={{ p: 1.75 }}>
              <Stack sx={{ flex: 1 }}>
                <Typography sx={{ fontWeight: 700, fontSize: '0.85rem' }}>{r.name}</Typography>
                <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>{r.jurisdiction} · {r.rel}</Typography>
              </Stack>
              <Box sx={{ px: 1, py: 0.3, borderRadius: 1, bgcolor: alpha(tint, 0.12), color: tint, fontSize: '0.65rem', fontWeight: 800 }}>{r.status}</Box>
            </Stack>
          );
        })}
      </Stack>
    </GlassPanel>
  );
}

export function DemoLegalReports() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const warn = theme.palette.warning.main;
  const sections = [
    { title: 'Executive summary', tag: 'complete', tone: 'ok' },
    { title: 'Jurisdiction analysis · EU/UK', tag: 'EU/UK', tone: 'ok' },
    { title: 'Risk register · 3 items', tag: '3 risks', tone: 'warn' },
  ];
  return (
    <GlassPanel>
      <Box sx={{ p: 2, borderBottom: `1px solid ${theme.palette.divider}` }}>
        <Typography sx={{ fontWeight: 800, fontSize: '0.95rem' }}>Matter memo · matter #4421</Typography>
      </Box>
      <Stack divider={<Box sx={{ borderBottom: `1px solid ${theme.palette.divider}` }} />}>
        {sections.map((s) => {
          const tint = s.tone === 'warn' ? warn : primary;
          return (
            <Stack key={s.title} direction="row" spacing={2} sx={{ p: 1.75 }}>
              <Typography sx={{ flex: 1, fontWeight: 600, fontSize: '0.85rem' }}>{s.title}</Typography>
              <Box sx={{ px: 1, py: 0.3, borderRadius: 1, bgcolor: alpha(tint, 0.12), color: tint, fontSize: '0.68rem', fontWeight: 800 }}>{s.tag}</Box>
            </Stack>
          );
        })}
      </Stack>
    </GlassPanel>
  );
}

export function DemoLegalJurisdiction() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const docs = [
    { title: 'EE Commercial Code notes', tag: 'indexed' },
    { title: 'UK GDPR client checklist', tag: 'agent-ready' },
    { title: '2024 SaaS liability playbook', tag: 'agent-ready' },
  ];
  return (
    <GlassPanel>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ p: 2, borderBottom: `1px solid ${theme.palette.divider}` }}>
        <AppIcon
          name='MenuBookOutlined'
          fallback={MenuBookOutlinedIcon}
          sx={{ color: 'primary.main' }} />
        <Typography sx={{ fontWeight: 800, fontSize: '0.92rem' }}>Knowledge base · jurisdiction</Typography>
      </Stack>
      <Stack divider={<Box sx={{ borderBottom: `1px solid ${theme.palette.divider}` }} />}>
        {docs.map((d) => (
          <Stack key={d.title} direction="row" spacing={2} sx={{ p: 1.75 }}>
            <Typography sx={{ flex: 1, fontWeight: 600, fontSize: '0.85rem' }}>{d.title}</Typography>
            <Box sx={{ px: 1, py: 0.3, borderRadius: 1, bgcolor: alpha(primary, 0.12), color: 'primary.main', fontSize: '0.68rem', fontWeight: 800 }}>{d.tag}</Box>
          </Stack>
        ))}
      </Stack>
    </GlassPanel>
  );
}

export function DemoLegalVault() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const docs = [
    { name: 'Acme MSA · final draft', type: 'MSA' },
    { name: 'Director ID · redacted', type: 'PII' },
    { name: 'Board resolution · EU SPV', type: 'resolution' },
  ];
  return (
    <GlassPanel>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ p: 2, borderBottom: `1px solid ${theme.palette.divider}` }}>
        <AppIcon
          name='LockOutlined'
          fallback={LockOutlinedIcon}
          sx={{ color: 'primary.main' }} />
        <Typography sx={{ fontWeight: 800, fontSize: '0.92rem' }}>Matter vault · encrypted</Typography>
      </Stack>
      <Stack divider={<Box sx={{ borderBottom: `1px solid ${theme.palette.divider}` }} />}>
        {docs.map((d) => (
          <Stack key={d.name} direction="row" spacing={2} sx={{ p: 1.75 }}>
            <Typography sx={{ flex: 1, fontWeight: 600, fontSize: '0.85rem' }}>{d.name}</Typography>
            <Box sx={{ px: 1, py: 0.3, borderRadius: 1, bgcolor: alpha(primary, 0.12), color: 'primary.main', fontSize: '0.68rem', fontWeight: 800 }}>{d.type}</Box>
          </Stack>
        ))}
      </Stack>
    </GlassPanel>
  );
}
