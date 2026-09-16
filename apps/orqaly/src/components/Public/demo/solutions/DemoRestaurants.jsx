import { Box, Stack, Typography, alpha, useTheme } from '@mui/material';
import RestaurantOutlinedIcon from '@mui/icons-material/RestaurantOutlined';
import { GlassPanel } from './demoShell';

import AppIcon from '../../../icons/AppIcon';

export function DemoRestaurantsReservations() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const rows = [
    { party: '4 · 19:30', name: 'Chen', status: 'confirmed' },
    { party: '2 · 20:00', name: 'Weber', status: 'confirmed' },
    { party: '6 · 21:00', name: 'Patel', status: 'SMS sent' },
  ];
  return (
    <GlassPanel>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ p: 2, borderBottom: `1px solid ${theme.palette.divider}` }}>
        <AppIcon
          name='RestaurantOutlined'
          fallback={RestaurantOutlinedIcon}
          sx={{ color: 'primary.main' }} />
        <Typography sx={{ fontWeight: 800, fontSize: '0.92rem', color: 'text.primary' }}>Restaurant reservations · tonight</Typography>
      </Stack>
      <Stack divider={<Box sx={{ borderBottom: `1px solid ${theme.palette.divider}` }} />}>
        {rows.map((r) => (
          <Stack key={r.name} direction="row" spacing={2} sx={{ p: 1.75 }}>
            <Typography sx={{ fontWeight: 700, color: 'primary.main', minWidth: 64 }}>{r.party}</Typography>
            <Typography sx={{ flex: 1, fontWeight: 600, fontSize: '0.85rem' }}>{r.name}</Typography>
            <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>{r.status}</Typography>
          </Stack>
        ))}
      </Stack>
    </GlassPanel>
  );
}

export const DemoRestaurantsHub = DemoRestaurantsReservations;

export function DemoRestaurantsHousekeeping() {
  const theme = useTheme();
  const rows = [
    { room: '412', task: 'Turndown', eta: '18 min', tone: 'ok' },
    { room: '408', task: 'Maintenance · AC', eta: '45 min', tone: 'warn' },
    { room: '401', task: 'Extra towels', eta: '8 min', tone: 'ok' },
  ];
  return (
    <GlassPanel>
      <Box sx={{ p: 2, borderBottom: `1px solid ${theme.palette.divider}` }}>
        <Typography sx={{ fontWeight: 800, fontSize: '0.95rem', color: 'text.primary' }}>Housekeeping · floor 4</Typography>
      </Box>
      <Stack divider={<Box sx={{ borderBottom: `1px solid ${theme.palette.divider}` }} />}>
        {rows.map((r) => (
          <Stack key={r.room} direction="row" spacing={2} sx={{ p: 1.75 }}>
            <Typography sx={{ fontWeight: 800, color: 'primary.main' }}>{r.room}</Typography>
            <Stack sx={{ flex: 1 }}>
              <Typography sx={{ fontWeight: 600, fontSize: '0.85rem' }}>{r.task}</Typography>
              <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>ETA {r.eta}</Typography>
            </Stack>
          </Stack>
        ))}
      </Stack>
    </GlassPanel>
  );
}

export function DemoRestaurantsRoomService() {
  const theme = useTheme();
  return (
    <GlassPanel sx={{ p: 2.5 }}>
      <Typography sx={{ fontWeight: 800, fontSize: '0.95rem', mb: 1.5 }}>Room service · order #RS-88</Typography>
      <Typography sx={{ fontSize: '0.88rem', color: 'text.secondary' }}>Club sandwich ×2 · allergy: gluten-free bun</Typography>
      <Typography sx={{ fontSize: '0.88rem', color: 'primary.main', fontWeight: 700, mt: 1 }}>Kitchen confirmed · 25 min</Typography>
    </GlassPanel>
  );
}

export function DemoRestaurantsPartners() {
  const theme = useTheme();
  const rows = [
    { service: 'Airport transfer', partner: 'RideCo', status: 'booked' },
    { service: 'Spa · 60 min', partner: 'Wellness EU', status: 'confirmed' },
    { service: 'City tour', partner: 'Local Guides', status: 'pending' },
  ];
  return (
    <GlassPanel>
      <Box sx={{ p: 2, borderBottom: `1px solid ${theme.palette.divider}` }}>
        <Typography sx={{ fontWeight: 800, fontSize: '0.95rem', color: 'text.primary' }}>Partner catalog · room 412</Typography>
      </Box>
      <Stack divider={<Box sx={{ borderBottom: `1px solid ${theme.palette.divider}` }} />}>
        {rows.map((r) => (
          <Stack key={r.service} direction="row" spacing={2} sx={{ p: 1.75 }}>
            <Stack sx={{ flex: 1 }}>
              <Typography sx={{ fontWeight: 600, fontSize: '0.85rem' }}>{r.service}</Typography>
              <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>{r.partner}</Typography>
            </Stack>
            <Typography sx={{ fontSize: '0.78rem', color: 'primary.main', fontWeight: 700 }}>{r.status}</Typography>
          </Stack>
        ))}
      </Stack>
    </GlassPanel>
  );
}
