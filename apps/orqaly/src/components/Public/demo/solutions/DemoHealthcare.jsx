import { Box, Stack, Typography, alpha, useTheme } from '@mui/material';
import LocalHospitalOutlinedIcon from '@mui/icons-material/LocalHospitalOutlined';
import { ChatThread } from '../../../../pages/Public/solutions/_shared';
import { GlassPanel } from './demoShell';

import AppIcon from '../../../icons/AppIcon';

export function DemoHealthcareHub() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const bars = [10, 22, 14, 28, 38, 24, 18, 32, 44, 28, 16, 20, 36, 22, 14];
  return (
    <GlassPanel sx={{ p: { xs: 3, md: 4 }, textAlign: 'center' }}>
      <Box sx={{ width: 64, height: 64, borderRadius: '50%', bgcolor: alpha(primary, 0.12), color: 'primary.main', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', mb: 2 }}>
        <AppIcon
          name='LocalHospitalOutlined'
          fallback={LocalHospitalOutlinedIcon}
          sx={{ fontSize: 32 }} />
      </Box>
      <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', color: 'text.primary', mb: 1.5 }}>Triage voice agent · live</Typography>
      <Stack direction="row" spacing={0.5} alignItems="center" justifyContent="center" sx={{ height: 50 }}>
        {bars.map((h, i) => (
          <Box key={i} sx={{ width: 4, height: h, borderRadius: 999, bgcolor: primary, opacity: i % 3 === 0 ? 0.9 : 0.4 }} />
        ))}
      </Stack>
      <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary', mt: 1.5 }}>142 calls today · 0 dropped · 4.7 CSAT</Typography>
    </GlassPanel>
  );
}

export function DemoHealthcareCallFlow() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const steps = [
    { n: '01', title: 'Call lands', body: 'Voice agent answers in under a second.' },
    { n: '02', title: 'Triage', body: 'Standard questions; urgent cases flagged.' },
    { n: '03', title: 'Book', body: 'Next-available slot on your calendar.' },
    { n: '04', title: 'Handoff', body: 'Chart-ready summary in inbox.' },
  ];
  return (
    <GlassPanel sx={{ p: { xs: 2.5, md: 3 } }}>
      <Typography sx={{ fontWeight: 800, fontSize: '0.95rem', color: 'text.primary', mb: 2 }}>Patient call · end to end</Typography>
      <Stack spacing={1.5}>
        {steps.map((s) => (
          <Stack key={s.n} direction="row" spacing={2} alignItems="flex-start">
            <Box sx={{ minWidth: 28, height: 28, borderRadius: 1, bgcolor: alpha(primary, 0.12), color: 'primary.main', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 800 }}>{s.n}</Box>
            <Stack>
              <Typography sx={{ fontWeight: 700, fontSize: '0.88rem', color: 'text.primary' }}>{s.title}</Typography>
              <Typography sx={{ fontSize: '0.82rem', color: 'text.secondary', lineHeight: 1.5 }}>{s.body}</Typography>
            </Stack>
          </Stack>
        ))}
      </Stack>
    </GlassPanel>
  );
}

export function DemoHealthcareChat() {
  return (
    <ChatThread
      messages={[
        { who: 'patient', text: 'Hi, I think I sprained my ankle this morning. Can I come in today?' },
        { who: 'agent', text: 'I can offer 2:30pm or 4:15pm today with Dr Petrescu. Both are walk-in slots. Which works?' },
        { who: 'patient', text: '2:30 works. Do I need to bring anything?' },
        { who: 'agent', text: 'Just your insurance card. I have noted "ankle, sprain suspected" on the booking. See you at 2:30.' },
      ]}
    />
  );
}

export function DemoHealthcareIntake() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const rows = [
    { field: 'Chief complaint', value: 'Ankle sprain suspected' },
    { field: 'Allergies', value: 'None reported' },
    { field: 'Meds', value: 'Ibuprofen PRN' },
    { field: 'Status', value: 'Chart-ready' },
  ];
  return (
    <GlassPanel>
      <Box sx={{ p: 2, borderBottom: `1px solid ${theme.palette.divider}` }}>
        <Typography sx={{ fontWeight: 800, fontSize: '0.95rem', color: 'text.primary' }}>Intake summary · pending visit</Typography>
      </Box>
      <Stack divider={<Box sx={{ borderBottom: `1px solid ${theme.palette.divider}` }} />}>
        {rows.map((r) => (
          <Stack key={r.field} direction="row" spacing={2} sx={{ p: 1.75 }}>
            <Typography sx={{ fontWeight: 700, fontSize: '0.82rem', color: 'text.secondary', minWidth: 120 }}>{r.field}</Typography>
            <Typography sx={{ fontSize: '0.85rem', color: 'text.primary', fontWeight: 600 }}>{r.value}</Typography>
          </Stack>
        ))}
      </Stack>
    </GlassPanel>
  );
}

export function DemoHealthcareReminders() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const rows = [
    { time: '24h before', status: 'SMS sent', tone: 'ok' },
    { time: '1h before', status: 'SMS + voice', tone: 'ok' },
    { time: 'Reschedule', status: '1 tap link', tone: 'ok' },
    { time: 'No-show', status: 'waitlist backfill', tone: 'warn' },
  ];
  return (
    <GlassPanel>
      <Box sx={{ p: 2, borderBottom: `1px solid ${theme.palette.divider}` }}>
        <Typography sx={{ fontWeight: 800, fontSize: '0.95rem', color: 'text.primary' }}>Reminder agent · tomorrow</Typography>
        <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>38 appointments · 2 opened reschedule</Typography>
      </Box>
      <Stack divider={<Box sx={{ borderBottom: `1px solid ${theme.palette.divider}` }} />}>
        {rows.map((r) => (
          <Stack key={r.time} direction="row" spacing={2} alignItems="center" sx={{ p: 1.75 }}>
            <Typography sx={{ flex: 1, fontWeight: 600, fontSize: '0.85rem', color: 'text.primary' }}>{r.time}</Typography>
            <Box sx={{ px: 1, py: 0.3, borderRadius: 1, bgcolor: alpha(r.tone === 'warn' ? theme.palette.warning.main : primary, 0.12), color: r.tone === 'warn' ? 'warning.main' : 'primary.main', fontSize: '0.68rem', fontWeight: 800 }}>{r.status}</Box>
          </Stack>
        ))}
      </Stack>
    </GlassPanel>
  );
}
