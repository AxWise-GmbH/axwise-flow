import { Box, Stack, Typography, alpha, useTheme } from '@mui/material';
import MemoryOutlinedIcon from '@mui/icons-material/MemoryOutlined';
import SavingsOutlinedIcon from '@mui/icons-material/SavingsOutlined';

import AppIcon from '../../icons/AppIcon';

function mockShell(theme, primary, isDark, children, header, sub) {
  return (
    <Box
      sx={{
        borderRadius: 4,
        overflow: 'hidden',
        bgcolor: isDark ? alpha('#fff', 0.025) : '#fff',
        border: `1px solid ${theme.palette.divider}`,
        boxShadow: `0 20px 50px ${alpha(primary, 0.18)}`,
      }}
    >
      <Box sx={{ p: 2, borderBottom: `1px solid ${theme.palette.divider}`, bgcolor: isDark ? alpha('#fff', 0.02) : alpha(theme.palette.text.primary, 0.02) }}>
        <Typography sx={{ fontWeight: 800, fontSize: '0.95rem', color: 'text.primary' }}>{header}</Typography>
        {sub && <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>{sub}</Typography>}
      </Box>
      {children}
    </Box>
  );
}

export function EarnOverviewMock() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const isDark = theme.palette.mode === 'dark';
  const streams = [
    { label: 'LLM nodes online', value: '12', sub: 'members serving members' },
    { label: 'User listings', value: '340+', sub: 'peer-built solutions' },
    { label: 'Storage shared', value: '2.1 TB', sub: 'community pool' },
    { label: 'Peer payouts (30d)', value: '48k pts', sub: 'USDT soon' },
  ];
  return (
    <Box
      sx={{
        borderRadius: 4,
        overflow: 'hidden',
        bgcolor: isDark ? alpha('#fff', 0.025) : '#fff',
        border: `1px solid ${theme.palette.divider}`,
        boxShadow: `0 20px 50px ${alpha(primary, 0.18)}`,
        p: { xs: 2, md: 2.5 },
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
        <AppIcon
          name='SavingsOutlined'
          fallback={SavingsOutlinedIcon}
          sx={{ color: 'primary.main' }} />
        <Stack sx={{ flex: 1 }}>
          <Typography sx={{ fontWeight: 800, fontSize: '0.92rem', color: 'text.primary' }}>Member-to-member economy</Typography>
          <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>Users serve users · Orqaly connects</Typography>
        </Stack>
      </Stack>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1.25 }}>
        {streams.map((s) => (
          <Box key={s.label} sx={{ p: 1.5, borderRadius: 2, bgcolor: alpha(theme.palette.text.primary, 0.03), border: `1px solid ${theme.palette.divider}` }}>
            <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary', fontWeight: 700, letterSpacing: '0.06em', mb: 0.5 }}>{s.label}</Typography>
            <Typography sx={{ fontWeight: 800, fontSize: '1.1rem', color: 'text.primary' }}>{s.value}</Typography>
            <Typography sx={{ fontSize: '0.72rem', color: 'primary.main', fontWeight: 600 }}>{s.sub}</Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

export function LlmShareMock() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const isDark = theme.palette.mode === 'dark';
  const rows = [
    { node: 'home-gpu-01', model: 'Llama 3.1 70B', uptime: '99.2%', jobs: '847 routed', status: 'online' },
    { node: 'studio-m4', model: 'Mistral Large', uptime: '97.8%', jobs: '312 routed', status: 'online' },
    { node: 'rack-a3', model: 'Mixtral 8x22B', uptime: '-', jobs: 'maintenance', status: 'paused' },
  ];
  return mockShell(
    theme,
    primary,
    isDark,
    <Stack divider={<Box sx={{ borderBottom: `1px solid ${theme.palette.divider}` }} />}>
      {rows.map((r) => (
        <Stack key={r.node} direction="row" spacing={1.5} alignItems="center" sx={{ p: 1.75 }}>
          <AppIcon
            name='MemoryOutlined'
            fallback={MemoryOutlinedIcon}
            sx={{ fontSize: 18, color: 'primary.main', flexShrink: 0 }} />
          <Stack sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', color: 'text.primary' }}>{r.node}</Typography>
            <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>{r.model} · {r.uptime} uptime · {r.jobs}</Typography>
          </Stack>
          <Box sx={{ px: 1, py: 0.3, borderRadius: 1, bgcolor: alpha(r.status === 'online' ? primary : theme.palette.text.disabled, 0.12), color: r.status === 'online' ? 'primary.main' : 'text.disabled', fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.03em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
            {r.status}
          </Box>
        </Stack>
      ))}
      <Box sx={{ p: 1.75, bgcolor: alpha(primary, 0.04) }}>
        <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary', fontStyle: 'italic' }}>You serve another user’s job · they bring BYOK · Orqaly routes the handshake.</Typography>
      </Box>
    </Stack>,
    'LLM share network · 3 nodes',
    'Member compute offered to other users',
  );
}

export function MarketplaceLayerMock() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const isDark = theme.palette.mode === 'dark';
  const rows = [
    { name: 'CRM Sync Agent', category: 'Agent', installs: '128', share: '85%' },
    { name: 'Invoice Replicator', category: 'Replicator', installs: '64', share: '85%' },
    { name: 'Slack Escalation Skill', category: 'Skill', installs: '41', share: '85%' },
  ];
  return mockShell(
    theme,
    primary,
    isDark,
    <Stack divider={<Box sx={{ borderBottom: `1px solid ${theme.palette.divider}` }} />}>
      {rows.map((r) => (
        <Stack key={r.name} direction="row" spacing={1.5} alignItems="center" sx={{ p: 1.75 }}>
          <Stack sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', color: 'text.primary' }}>{r.name}</Typography>
            <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>{r.category} · {r.installs} installs</Typography>
          </Stack>
          <Box sx={{ px: 1, py: 0.3, borderRadius: 1, bgcolor: alpha(primary, 0.12), color: 'primary.main', fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.03em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
            keep {r.share}
          </Box>
        </Stack>
      ))}
    </Stack>,
    'Your listings · other users install',
    'Peer-built solutions · you keep 85%',
  );
}

export function StorageShareMock() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const isDark = theme.palette.mode === 'dark';
  const rows = [
    { pool: 'Community pool A', used: '420 GB', available: '580 GB', share: '12% of pool' },
    { pool: 'Your contribution', used: '180 GB', available: '820 GB', share: 'your 1 TB node' },
  ];
  return mockShell(
    theme,
    primary,
    isDark,
    <Stack divider={<Box sx={{ borderBottom: `1px solid ${theme.palette.divider}` }} />}>
      {rows.map((r) => (
        <Stack key={r.pool} spacing={0.5} sx={{ p: 1.75 }}>
          <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', color: 'text.primary' }}>{r.pool}</Typography>
          <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>{r.used} used · {r.available} free · {r.share}</Typography>
          <Box sx={{ mt: 1, height: 6, borderRadius: 3, bgcolor: alpha(theme.palette.text.primary, 0.08), overflow: 'hidden' }}>
            <Box sx={{ width: r.pool.includes('Your') ? '18%' : '42%', height: '100%', bgcolor: 'primary.main', borderRadius: 3 }} />
          </Box>
        </Stack>
      ))}
    </Stack>,
    'Second Brain Storage pool',
    'Your space · other members use · Orqaly meters',
  );
}

export function PointsWalletMock() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const isDark = theme.palette.mode === 'dark';
  return mockShell(
    theme,
    primary,
    isDark,
    <Stack spacing={2} sx={{ p: 2.5 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Stack>
          <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary', fontWeight: 700, letterSpacing: '0.06em' }}>Points balance</Typography>
          <Typography sx={{ fontWeight: 800, fontSize: '1.75rem', color: 'text.primary' }}>12,480</Typography>
        </Stack>
        <Box sx={{ px: 1.25, py: 0.5, borderRadius: 1.5, bgcolor: alpha(theme.palette.warning.main, 0.15), color: 'warning.main', fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          Coming soon
        </Box>
      </Stack>
      <Box sx={{ p: 2, borderRadius: 2, bgcolor: alpha(theme.palette.text.primary, 0.03), border: `1px dashed ${theme.palette.divider}` }}>
        <Typography sx={{ fontSize: '0.78rem', color: 'text.disabled', fontWeight: 600 }}>USDT equivalent</Typography>
        <Typography sx={{ fontWeight: 800, fontSize: '1.25rem', color: 'text.disabled', mt: 0.5 }}>≈ $124.80</Typography>
        <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', mt: 1 }}>On-chain ledger · convert to USDT at launch</Typography>
      </Box>
      <Stack direction="row" spacing={1} flexWrap="wrap">
        {['Marketplace', 'LLM usage', 'Storage'].map((src) => (
          <Box key={src} sx={{ px: 1, py: 0.35, borderRadius: 1, bgcolor: alpha(primary, 0.1), color: 'primary.main', fontSize: '0.65rem', fontWeight: 700 }}>
            +{src}
          </Box>
        ))}
      </Stack>
    </Stack>,
    'Points wallet',
    'Peer earnings tracked · USDT conversion planned',
  );
}

export const EARN_PILLAR_MOCKS = {
  llm: LlmShareMock,
  marketplace: MarketplaceLayerMock,
  storage: StorageShareMock,
  points: PointsWalletMock,
};
