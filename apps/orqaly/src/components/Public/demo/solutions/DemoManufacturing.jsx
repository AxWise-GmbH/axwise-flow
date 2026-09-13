import { Box, Stack, Typography, alpha, useTheme } from '@mui/material';
import PrecisionManufacturingOutlinedIcon from '@mui/icons-material/PrecisionManufacturingOutlined';
import { GlassPanel } from './demoShell';

import AppIcon from '../../../icons/AppIcon';

export function DemoManufacturingHub() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const warn = theme.palette.warning.main;
  const items = [
    { from: 'Steel Supply Co', subject: 'PO #4423 lead time confirmed', tone: 'ok', tag: 'Auto-replied' },
    { from: 'PrecisionCNC', subject: 'Slip from 14 days to 21', tone: 'warn', tag: 'Escalated' },
    { from: 'QC Team', subject: 'Anomaly on batch #B-209', tone: 'warn', tag: 'Paged planner' },
    { from: 'Logistics EU', subject: 'Inbound truck booked Friday', tone: 'ok', tag: 'Logged' },
  ];
  return (
    <GlassPanel>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ p: 2, borderBottom: `1px solid ${theme.palette.divider}`, bgcolor: alpha(theme.palette.text.primary, 0.02) }}>
        <AppIcon
          name='PrecisionManufacturingOutlined'
          fallback={PrecisionManufacturingOutlinedIcon}
          sx={{ color: 'primary.main' }} />
        <Stack sx={{ flex: 1 }}>
          <Typography sx={{ fontWeight: 800, fontSize: '0.92rem', color: 'text.primary' }}>Supplier inbox · this morning</Typography>
          <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>11 handled · 2 escalated</Typography>
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
              <Box sx={{ px: 1, py: 0.3, borderRadius: 1, bgcolor: alpha(tint, 0.12), color: tint, fontSize: '0.68rem', fontWeight: 800, whiteSpace: 'nowrap' }}>{it.tag}</Box>
            </Stack>
          );
        })}
      </Stack>
    </GlassPanel>
  );
}

function ListMock({ title, subtitle, rows }) {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const warn = theme.palette.warning.main;
  return (
    <GlassPanel>
      <Box sx={{ p: 2, borderBottom: `1px solid ${theme.palette.divider}` }}>
        <Typography sx={{ fontWeight: 800, fontSize: '0.95rem', color: 'text.primary' }}>{title}</Typography>
        {subtitle && <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>{subtitle}</Typography>}
      </Box>
      <Stack divider={<Box sx={{ borderBottom: `1px solid ${theme.palette.divider}` }} />}>
        {rows.map((r) => {
          const tint = r.tone === 'warn' ? warn : primary;
          return (
            <Stack key={r.label} direction="row" spacing={2} alignItems="center" sx={{ p: 1.75 }}>
              <Typography sx={{ flex: 1, fontWeight: 600, fontSize: '0.85rem', color: 'text.primary' }}>{r.label}</Typography>
              <Box sx={{ px: 1, py: 0.3, borderRadius: 1, bgcolor: alpha(tint, 0.12), color: tint, fontSize: '0.68rem', fontWeight: 800, whiteSpace: 'nowrap' }}>{r.tag}</Box>
            </Stack>
          );
        })}
      </Stack>
    </GlassPanel>
  );
}

export const DemoManufacturingSupplier = DemoManufacturingHub;

export function DemoManufacturingInventory() {
  return (
    <ListMock
      title="Inventory · chat answers"
      subtitle="Floor queries · 6 today"
      rows={[
        { label: 'SKU-441 raw steel · 12 days left', tag: 'reorder draft', tone: 'warn' },
        { label: 'SKU-209 fasteners · OK', tag: 'in stock', tone: 'ok' },
        { label: 'SKU-118 polymer · 4 days left', tag: 'flagged', tone: 'warn' },
        { label: 'SKU-302 packaging · OK', tag: 'in stock', tone: 'ok' },
      ]}
    />
  );
}

export function DemoManufacturingQc() {
  return (
    <ListMock
      title="QC summary · this week"
      subtitle="Top 3 issues flagged"
      rows={[
        { label: 'Batch B-209 dimension drift', tag: 'escalated', tone: 'warn' },
        { label: 'Line 2 repeat scratch pattern', tag: 'trending', tone: 'warn' },
        { label: 'Incoming inspection pass rate', tag: '98.2%', tone: 'ok' },
      ]}
    />
  );
}

export function DemoManufacturingLeadtime() {
  return (
    <ListMock
      title="Lead-time watch · inbound POs"
      subtitle="1 slip · planner paged"
      rows={[
        { label: 'PO #4423 · Steel Supply', tag: 'on time', tone: 'ok' },
        { label: 'PO #4418 · PrecisionCNC', tag: '21d slip', tone: 'warn' },
        { label: 'PO #4401 · Logistics EU', tag: 'on time', tone: 'ok' },
      ]}
    />
  );
}
