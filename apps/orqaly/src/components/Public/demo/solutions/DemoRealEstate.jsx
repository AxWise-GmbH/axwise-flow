import { Box, Stack, Typography, alpha, useTheme } from '@mui/material';
import HomeWorkOutlinedIcon from '@mui/icons-material/HomeWorkOutlined';
import { ChatThread } from '../../../../pages/Public/solutions/_shared';
import { GlassPanel } from './demoShell';

import AppIcon from '../../../icons/AppIcon';

export function DemoRealEstateHub() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  return (
    <GlassPanel>
      <Box sx={{ height: 140, background: `linear-gradient(135deg, ${alpha(primary, 0.4)} 0%, ${alpha(primary, 0.15)} 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <AppIcon
          name='HomeWorkOutlined'
          fallback={HomeWorkOutlinedIcon}
          sx={{ fontSize: 64, color: '#fff', opacity: 0.85 }} />
      </Box>
      <Box sx={{ p: 2.5 }}>
        <Typography sx={{ fontWeight: 800, fontSize: '1.05rem', color: 'text.primary' }}>2-bed riverside loft, Riga</Typography>
        <Typography sx={{ fontSize: '0.85rem', color: 'text.secondary', mb: 1.5 }}>€2,100/mo · viewing slots open</Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap">
          {['Sat 11:00', 'Sat 14:00', 'Sun 10:00'].map((s) => (
            <Box key={s} sx={{ px: 1.25, py: 0.5, borderRadius: 999, bgcolor: alpha(primary, 0.1), color: 'primary.main', fontSize: '0.72rem', fontWeight: 700 }}>{s}</Box>
          ))}
        </Stack>
      </Box>
    </GlassPanel>
  );
}

export const DemoRealEstateListing = DemoRealEstateHub;

export function DemoRealEstateChat() {
  return (
    <ChatThread
      messages={[
        { who: 'lead', text: 'Is the riverside loft still available? What are the fees?' },
        { who: 'agent', text: 'Yes — €2,100/mo plus €120 building fee. I can offer Sat 11:00 or 14:00 for a viewing. Which works?' },
        { who: 'lead', text: 'Saturday 11 works.' },
        { who: 'agent', text: 'Booked. I have sent a calendar invite and listing PDF. See you Saturday.' },
      ]}
    />
  );
}

export function DemoRealEstateViewings() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const slots = [
    { time: 'Sat 11:00', listing: 'Riverside loft', status: 'confirmed' },
    { time: 'Sat 14:00', listing: 'Old town 1-bed', status: 'confirmed' },
    { time: 'Sun 10:00', listing: 'Marina studio', status: 'pending' },
  ];
  return (
    <GlassPanel>
      <Box sx={{ p: 2, borderBottom: `1px solid ${theme.palette.divider}` }}>
        <Typography sx={{ fontWeight: 800, fontSize: '0.95rem', color: 'text.primary' }}>Viewing calendar · this weekend</Typography>
      </Box>
      <Stack divider={<Box sx={{ borderBottom: `1px solid ${theme.palette.divider}` }} />}>
        {slots.map((s) => (
          <Stack key={s.time} direction="row" spacing={2} sx={{ p: 1.75 }}>
            <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', color: 'primary.main', minWidth: 72 }}>{s.time}</Typography>
            <Stack sx={{ flex: 1 }}>
              <Typography sx={{ fontWeight: 600, fontSize: '0.85rem', color: 'text.primary' }}>{s.listing}</Typography>
              <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>{s.status}</Typography>
            </Stack>
          </Stack>
        ))}
      </Stack>
    </GlassPanel>
  );
}

export function DemoRealEstateFollowup() {
  const theme = useTheme();
  const rows = [
    { lead: 'Zillow · M. Jensen', day: 'Day 12 check-in', tone: 'ok' },
    { lead: 'Site · A. Okonkwo', day: 'Day 5 check-in', tone: 'ok' },
    { lead: 'Referral · K. Silva', day: 'Viewing booked', tone: 'ok' },
  ];
  return (
    <GlassPanel>
      <Box sx={{ p: 2, borderBottom: `1px solid ${theme.palette.divider}` }}>
        <Typography sx={{ fontWeight: 800, fontSize: '0.95rem', color: 'text.primary' }}>30-day nurture · active</Typography>
      </Box>
      <Stack divider={<Box sx={{ borderBottom: `1px solid ${theme.palette.divider}` }} />}>
        {rows.map((r) => (
          <Stack key={r.lead} direction="row" spacing={2} sx={{ p: 1.75 }}>
            <Typography sx={{ flex: 1, fontWeight: 600, fontSize: '0.85rem', color: 'text.primary' }}>{r.lead}</Typography>
            <Typography sx={{ fontSize: '0.78rem', color: 'primary.main', fontWeight: 700 }}>{r.day}</Typography>
          </Stack>
        ))}
      </Stack>
    </GlassPanel>
  );
}
