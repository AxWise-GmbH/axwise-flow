import { Box, Stack, Typography, alpha, useTheme } from '@mui/material';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import { GlassPanel } from './demoShell';

import AppIcon from '../../../icons/AppIcon';

function WeekGrid({ title, subtitle, days }) {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  return (
    <GlassPanel sx={{ p: { xs: 2, md: 2.5 } }}>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
        <AppIcon
          name='CampaignOutlined'
          fallback={CampaignOutlinedIcon}
          sx={{ color: 'primary.main' }} />
        <Stack sx={{ flex: 1 }}>
          <Typography sx={{ fontWeight: 800, fontSize: '0.92rem' }}>{title}</Typography>
          {subtitle && <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>{subtitle}</Typography>}
        </Stack>
      </Stack>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0.75 }}>
        {days.map((d) => (
          <Stack key={d.d} spacing={0.5} sx={{ p: 1, borderRadius: 1.5, bgcolor: alpha(theme.palette.text.primary, 0.03), minHeight: 80 }}>
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

const SMM_DAYS = [
  { d: 'Mon', items: ['IG reel', 'LinkedIn'] },
  { d: 'Tue', items: ['Email'] },
  { d: 'Wed', items: ['TikTok', 'IG story'] },
  { d: 'Thu', items: ['LinkedIn'] },
  { d: 'Fri', items: ['IG carousel'] },
  { d: 'Sat', items: [] },
  { d: 'Sun', items: [] },
];

export function DemoMarketingSmm() {
  return <WeekGrid title="SMM pack · Acme Co · May" subtitle="Captions + hashtags ready" days={SMM_DAYS} />;
}

export const DemoMarketingHub = DemoMarketingSmm;

export function DemoMarketingContent() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const rows = [
    { title: 'LinkedIn carousel · 5 slides', tag: 'brand OK' },
    { title: 'Meta ad · 3 variants', tag: 'draft' },
    { title: 'Newsletter intro · May', tag: 'brand OK' },
  ];
  return (
    <GlassPanel>
      <Box sx={{ p: 2, borderBottom: `1px solid ${theme.palette.divider}` }}>
        <Typography sx={{ fontWeight: 800, fontSize: '0.95rem' }}>Content drafts · Acme Co</Typography>
      </Box>
      <Stack divider={<Box sx={{ borderBottom: `1px solid ${theme.palette.divider}` }} />}>
        {rows.map((r) => (
          <Stack key={r.title} direction="row" spacing={2} sx={{ p: 1.75 }}>
            <Typography sx={{ flex: 1, fontWeight: 600, fontSize: '0.85rem' }}>{r.title}</Typography>
            <Box sx={{ px: 1, py: 0.3, borderRadius: 1, bgcolor: alpha(primary, 0.12), color: 'primary.main', fontSize: '0.68rem', fontWeight: 800 }}>{r.tag}</Box>
          </Stack>
        ))}
      </Stack>
    </GlassPanel>
  );
}

export function DemoMarketingMetrics() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const metrics = [
    { label: 'CPA', value: '€42', delta: '↓ 8%' },
    { label: 'ROI', value: '3.2x', delta: '↑ 0.3x' },
    { label: 'LTV', value: '€890', delta: '↑ 5%' },
    { label: 'ROAS', value: '2.8x', delta: 'flat' },
  ];
  return (
    <GlassPanel sx={{ p: 2.5 }}>
      <Typography sx={{ fontWeight: 800, fontSize: '0.95rem', mb: 2 }}>Critical metrics · May vs April</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1.25 }}>
        {metrics.map((m) => (
          <Box key={m.label} sx={{ p: 1.5, borderRadius: 2, border: `1px solid ${theme.palette.divider}` }}>
            <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary', fontWeight: 700 }}>{m.label}</Typography>
            <Stack direction="row" spacing={1} alignItems="baseline">
              <Typography sx={{ fontWeight: 800, fontSize: '1.1rem' }}>{m.value}</Typography>
              <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: 'primary.main' }}>{m.delta}</Typography>
            </Stack>
          </Box>
        ))}
      </Box>
    </GlassPanel>
  );
}

export function DemoMarketingPartners() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const rows = [
    { partner: 'MediaBuy EU', geo: 'DE', cap: '€25k' },
    { partner: 'Affiliate UK', geo: 'UK', cap: '€15k' },
  ];
  return (
    <GlassPanel>
      <Box sx={{ p: 2, borderBottom: `1px solid ${theme.palette.divider}` }}>
        <Typography sx={{ fontWeight: 800, fontSize: '0.95rem' }}>Partner traffic plan · €50k cap</Typography>
      </Box>
      <Stack divider={<Box sx={{ borderBottom: `1px solid ${theme.palette.divider}` }} />}>
        {rows.map((r) => (
          <Stack key={r.partner} direction="row" spacing={2} sx={{ p: 1.75 }}>
            <Stack sx={{ flex: 1 }}>
              <Typography sx={{ fontWeight: 700, fontSize: '0.85rem' }}>{r.partner}</Typography>
              <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>{r.geo} · cap {r.cap}</Typography>
            </Stack>
            <Box sx={{ px: 1, py: 0.3, borderRadius: 1, bgcolor: alpha(primary, 0.12), color: 'primary.main', fontSize: '0.65rem', fontWeight: 800 }}>concept</Box>
          </Stack>
        ))}
      </Stack>
    </GlassPanel>
  );
}
