import { Box, Stack, Typography, alpha, useTheme } from '@mui/material';
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';
import { GlassPanel } from './demoShell';

import AppIcon from '../../../icons/AppIcon';

export function DemoEcommerceOrders() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const warn = theme.palette.warning.main;
  const rows = [
    { id: '#28401', status: 'customer notified', tone: 'ok' },
    { id: '#28399', status: 'shipped', tone: 'ok' },
    { id: '#28396', status: 'delay triggered', tone: 'warn' },
    { id: '#28394', status: 'crm synced', tone: 'ok' },
  ];
  return (
    <GlassPanel>
      <Box sx={{ p: 2, borderBottom: `1px solid ${theme.palette.divider}` }}>
        <Typography sx={{ fontWeight: 800, fontSize: '0.95rem', color: 'text.primary' }}>Order monitor · live triggers</Typography>
        <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>12 updated · 2 escalated</Typography>
      </Box>
      <Stack divider={<Box sx={{ borderBottom: `1px solid ${theme.palette.divider}` }} />}>
        {rows.map((r) => (
          <Stack key={r.id} direction="row" spacing={2} alignItems="center" sx={{ p: 1.75 }}>
            <Typography sx={{ fontFamily: 'monospace', fontSize: '0.82rem', minWidth: 70 }}>{r.id}</Typography>
            <Box sx={{ px: 1.25, py: 0.3, borderRadius: 1, bgcolor: alpha(r.tone === 'warn' ? warn : primary, 0.12), color: r.tone === 'warn' ? 'warning.main' : 'primary.main', fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase' }}>{r.status}</Box>
          </Stack>
        ))}
      </Stack>
    </GlassPanel>
  );
}

export const DemoEcommerceHub = DemoEcommerceOrders;

export function DemoEcommerceSuppliers() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const warn = theme.palette.warning.main;
  const items = [
    { from: 'Shenzhen Fulfillment', subject: 'PO #8821 stock confirmed', tone: 'ok', tag: 'Auto-replied' },
    { from: 'EU 3PL', subject: 'Tracking #TRK-4492 logged', tone: 'ok', tag: 'Logged' },
    { from: 'Print-on-demand', subject: 'Lead time slip: 3→7 days', tone: 'warn', tag: 'Escalated' },
  ];
  return (
    <GlassPanel>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ p: 2, borderBottom: `1px solid ${theme.palette.divider}` }}>
        <AppIcon
          name='StorefrontOutlined'
          fallback={StorefrontOutlinedIcon}
          sx={{ color: 'primary.main' }} />
        <Stack sx={{ flex: 1 }}>
          <Typography sx={{ fontWeight: 800, fontSize: '0.92rem', color: 'text.primary' }}>Supplier bot inbox</Typography>
          <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>9 handled · 1 escalated</Typography>
        </Stack>
      </Stack>
      <Stack divider={<Box sx={{ borderBottom: `1px solid ${theme.palette.divider}` }} />}>
        {items.map((it, i) => {
          const tint = it.tone === 'warn' ? warn : primary;
          return (
            <Stack key={i} direction="row" spacing={2} alignItems="center" sx={{ p: 1.75 }}>
              <Box sx={{ width: 4, height: 28, borderRadius: 999, bgcolor: tint }} />
              <Stack sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', color: 'text.primary' }}>{it.subject}</Typography>
                <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>{it.from}</Typography>
              </Stack>
              <Box sx={{ px: 1, py: 0.3, borderRadius: 1, bgcolor: alpha(tint, 0.12), color: tint, fontSize: '0.68rem', fontWeight: 800 }}>{it.tag}</Box>
            </Stack>
          );
        })}
      </Stack>
    </GlassPanel>
  );
}

export function DemoEcommerceSupport() {
  const theme = useTheme();
  return (
    <GlassPanel sx={{ p: 2.5 }}>
      <Typography sx={{ fontWeight: 800, fontSize: '0.95rem', color: 'text.primary', mb: 1.5 }}>Support concierge · overnight</Typography>
      {['WISMO #28401 — tracking sent', 'Size exchange — policy OK', 'Damaged item — escalated'].map((t) => (
        <Typography key={t} sx={{ fontSize: '0.88rem', color: 'text.secondary', py: 0.75, borderBottom: `1px solid ${theme.palette.divider}` }}>{t}</Typography>
      ))}
    </GlassPanel>
  );
}

export function DemoEcommerceReturns() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const rows = [
    { id: '#28401', status: 'auto-approved', amount: '$48.20' },
    { id: '#28396', status: 'escalated', amount: '$420.00' },
    { id: '#28394', status: 'auto-approved', amount: '$32.50' },
  ];
  return (
    <GlassPanel>
      <Box sx={{ p: 2, borderBottom: `1px solid ${theme.palette.divider}` }}>
        <Typography sx={{ fontWeight: 800, fontSize: '0.95rem', color: 'text.primary' }}>Returns queue · cleared overnight</Typography>
      </Box>
      <Stack divider={<Box sx={{ borderBottom: `1px solid ${theme.palette.divider}` }} />}>
        {rows.map((r) => (
          <Stack key={r.id} direction="row" spacing={2} sx={{ p: 1.75 }}>
            <Typography sx={{ fontFamily: 'monospace', fontSize: '0.82rem', minWidth: 70 }}>{r.id}</Typography>
            <Typography sx={{ flex: 1, fontSize: '0.85rem', fontWeight: 600 }}>{r.status}</Typography>
            <Typography sx={{ fontWeight: 800 }}>{r.amount}</Typography>
          </Stack>
        ))}
      </Stack>
    </GlassPanel>
  );
}
