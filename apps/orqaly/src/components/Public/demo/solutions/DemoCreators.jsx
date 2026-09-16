import { Box, Stack, Typography, alpha, useTheme } from '@mui/material';
import VideocamOutlinedIcon from '@mui/icons-material/VideocamOutlined';
import { GlassPanel } from './demoShell';

import AppIcon from '../../../icons/AppIcon';

export function DemoCreatorsCalendar() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const days = [
    { d: 'Mon', items: ['IG reel', 'YT short'] },
    { d: 'Tue', items: ['Newsletter'] },
    { d: 'Wed', items: ['Long video', 'TikTok'] },
    { d: 'Thu', items: ['Podcast'] },
    { d: 'Fri', items: ['IG reel'] },
    { d: 'Sat', items: ['Stream'] },
    { d: 'Sun', items: [] },
  ];
  return (
    <GlassPanel sx={{ p: { xs: 2, md: 2.5 } }}>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
        <AppIcon
          name='VideocamOutlined'
          fallback={VideocamOutlinedIcon}
          sx={{ color: 'primary.main' }} />
        <Stack sx={{ flex: 1 }}>
          <Typography sx={{ fontWeight: 800, fontSize: '0.92rem' }}>Creator ops calendar · this week</Typography>
          <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>3 creators · 5 platforms</Typography>
        </Stack>
      </Stack>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0.75 }}>
        {days.map((d) => (
          <Stack key={d.d} spacing={0.5} sx={{ p: 1, borderRadius: 1.5, bgcolor: alpha(theme.palette.text.primary, 0.03), minHeight: 88 }}>
            <Typography sx={{ fontSize: '0.66rem', color: 'text.secondary', fontWeight: 700 }}>{d.d}</Typography>
            {d.items.map((item) => (
              <Box key={item} sx={{ px: 0.75, py: 0.4, borderRadius: 0.75, bgcolor: alpha(primary, 0.15), color: 'primary.main', fontSize: '0.66rem', fontWeight: 700 }}>{item}</Box>
            ))}
          </Stack>
        ))}
      </Box>
    </GlassPanel>
  );
}

export const DemoCreatorsHub = DemoCreatorsCalendar;

export function DemoCreatorsScripts() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const warn = theme.palette.warning.main;
  const rows = [
    { title: 'AI tools deep dive', creator: 'Alex', status: 'approved', tone: 'ok' },
    { title: 'Founder story reel', creator: 'Mia', status: 'in review', tone: 'warn' },
    { title: 'Podcast ep. 42', creator: 'Alex', status: 'outline ready', tone: 'ok' },
  ];
  return (
    <GlassPanel>
      <Box sx={{ p: 2, borderBottom: `1px solid ${theme.palette.divider}` }}>
        <Typography sx={{ fontWeight: 800, fontSize: '0.95rem' }}>Script pipeline · 4 in progress</Typography>
      </Box>
      <Stack divider={<Box sx={{ borderBottom: `1px solid ${theme.palette.divider}` }} />}>
        {rows.map((r) => {
          const tint = r.tone === 'warn' ? warn : primary;
          return (
            <Stack key={r.title} direction="row" spacing={1.5} sx={{ p: 1.75 }}>
              <Stack sx={{ flex: 1 }}>
                <Typography sx={{ fontWeight: 700, fontSize: '0.85rem' }}>{r.title}</Typography>
                <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>{r.creator}</Typography>
              </Stack>
              <Box sx={{ px: 1, py: 0.3, borderRadius: 1, bgcolor: alpha(tint, 0.12), color: tint, fontSize: '0.65rem', fontWeight: 800 }}>{r.status}</Box>
            </Stack>
          );
        })}
      </Stack>
    </GlassPanel>
  );
}

export function DemoCreatorsRepurpose() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const outputs = ['3 TikTok clips', 'IG carousel · 7 slides', 'LinkedIn thread', 'Newsletter section'];
  return (
    <GlassPanel>
      <Box sx={{ p: 2, borderBottom: `1px solid ${theme.palette.divider}` }}>
        <Typography sx={{ fontWeight: 800, fontSize: '0.95rem' }}>Repurpose map · 1 long video</Typography>
      </Box>
      <Stack divider={<Box sx={{ borderBottom: `1px solid ${theme.palette.divider}` }} />}>
        {outputs.map((o) => (
          <Stack key={o} direction="row" spacing={2} sx={{ p: 1.75 }}>
            <Typography sx={{ flex: 1, fontWeight: 600, fontSize: '0.85rem' }}>{o}</Typography>
            <Box sx={{ px: 1, py: 0.3, borderRadius: 1, bgcolor: alpha(primary, 0.12), color: 'primary.main', fontSize: '0.68rem', fontWeight: 800 }}>draft</Box>
          </Stack>
        ))}
      </Stack>
    </GlassPanel>
  );
}

export function DemoCreatorsSponsors() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const warn = theme.palette.warning.main;
  const rows = [
    { sponsor: 'TechGear Co', deliverable: 'YT segment', status: 'filmed', tone: 'ok' },
    { sponsor: 'FitApp', deliverable: '3x IG stories', status: 'edit due', tone: 'warn' },
  ];
  return (
    <GlassPanel>
      <Box sx={{ p: 2, borderBottom: `1px solid ${theme.palette.divider}` }}>
        <Typography sx={{ fontWeight: 800, fontSize: '0.95rem' }}>Brand deals · Q2</Typography>
      </Box>
      <Stack divider={<Box sx={{ borderBottom: `1px solid ${theme.palette.divider}` }} />}>
        {rows.map((r) => {
          const tint = r.tone === 'warn' ? warn : primary;
          return (
            <Stack key={r.sponsor} direction="row" spacing={1.5} sx={{ p: 1.75 }}>
              <Stack sx={{ flex: 1 }}>
                <Typography sx={{ fontWeight: 700, fontSize: '0.85rem' }}>{r.sponsor}</Typography>
                <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>{r.deliverable}</Typography>
              </Stack>
              <Box sx={{ px: 1, py: 0.3, borderRadius: 1, bgcolor: alpha(tint, 0.12), color: tint, fontSize: '0.65rem', fontWeight: 800 }}>{r.status}</Box>
            </Stack>
          );
        })}
      </Stack>
    </GlassPanel>
  );
}
