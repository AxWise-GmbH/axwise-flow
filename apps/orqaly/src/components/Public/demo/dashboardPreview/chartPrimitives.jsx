import { Box, Stack, Typography, alpha, useTheme } from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';

import AppIcon from '../../../icons/AppIcon';

let gradientCounter = 0;

function nextGradId() {
  gradientCounter += 1;
  return `dash-preview-grad-${gradientCounter}`;
}

export function PreviewShell({ category, children }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  return (
    <Box
      sx={{
        borderRadius: 4,
        overflow: 'hidden',
        border: `1px solid ${alpha(category.tint, 0.35)}`,
        bgcolor: isDark ? alpha('#fff', 0.025) : '#fff',
        boxShadow: `0 20px 50px ${alpha(category.tint, 0.12)}`,
        minHeight: { xs: 280, md: 320 },
      }}
    >
      <Box
        sx={{
          p: 2,
          borderBottom: `1px solid ${theme.palette.divider}`,
          background: `linear-gradient(135deg, ${alpha(category.tint, 0.14)} 0%, transparent 100%)`,
        }}
      >
        <Typography sx={{ fontWeight: 800, fontSize: '1rem' }}>{category.title} dashboard</Typography>
        <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>{category.blurb}</Typography>
      </Box>
      <Box sx={{ p: 2 }}>{children}</Box>
    </Box>
  );
}

export function KpiRow({ kpis, tint, columns = 3 }) {
  const theme = useTheme();
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: `repeat(${Math.min(kpis.length, columns)}, 1fr)`,
        gap: 0,
        mb: 2,
        borderRadius: 2,
        overflow: 'hidden',
        border: `1px solid ${theme.palette.divider}`,
      }}
    >
      {kpis.map((k, i) => (
        <Stack
          key={k.label}
          spacing={0.35}
          sx={{
            p: 1.5,
            borderRight: i < kpis.length - 1 ? `1px solid ${theme.palette.divider}` : 'none',
            bgcolor: alpha(tint, 0.04),
          }}
        >
          <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary', fontWeight: 600 }}>{k.label}</Typography>
          <Typography sx={{ fontWeight: 800, fontSize: { xs: '1rem', md: '1.15rem' }, color: tint, lineHeight: 1.1 }}>
            {k.value}
          </Typography>
          {k.delta != null && (
            <Stack direction="row" spacing={0.35} alignItems="center" sx={{ color: k.up === false ? 'warning.main' : 'primary.main' }}>
              {k.up === true && <AppIcon name='TrendingUp' fallback={TrendingUpIcon} sx={{ fontSize: 12 }} />}
              {k.up === false && <AppIcon name='TrendingDown' fallback={TrendingDownIcon} sx={{ fontSize: 12 }} />}
              <Typography sx={{ fontSize: '0.65rem', fontWeight: 700 }}>{k.delta}</Typography>
            </Stack>
          )}
        </Stack>
      ))}
    </Box>
  );
}

export function ChartCard({ title, tint, children, sx }) {
  const theme = useTheme();
  return (
    <Box
      sx={{
        p: 1.5,
        borderRadius: 2.5,
        border: `1px solid ${theme.palette.divider}`,
        bgcolor: alpha(tint, 0.03),
        height: '100%',
        minHeight: 0,
        ...sx,
      }}
    >
      <Typography sx={{ fontWeight: 700, fontSize: '0.78rem', color: 'text.primary', mb: 1 }}>{title}</Typography>
      {children}
    </Box>
  );
}

export function MiniLineChart({ points, tint, height = 56 }) {
  const gradId = nextGradId();
  const max = Math.max(...points, 1);
  const w = 200;
  const h = height;
  const stepX = w / (points.length - 1);
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${i * stepX},${h - (p / max) * h * 0.85}`).join(' ');
  const area = `${path} L ${w},${h} L 0,${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} role="img" aria-hidden>
      <defs>
        <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={tint} stopOpacity="0.35" />
          <stop offset="100%" stopColor={tint} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradId})`} />
      <path d={path} fill="none" stroke={tint} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MiniBarChart({ bars, tint, horizontal = false }) {
  const max = Math.max(...bars.map((b) => b.value), 1);
  if (horizontal) {
    return (
      <Stack spacing={0.75}>
        {bars.map((b) => (
          <Stack key={b.label} direction="row" alignItems="center" spacing={1}>
            <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary', minWidth: 72, flexShrink: 0 }}>{b.label}</Typography>
            <Box sx={{ flex: 1, height: 8, borderRadius: 1, bgcolor: alpha(tint, 0.1), overflow: 'hidden' }}>
              <Box sx={{ width: `${(b.value / max) * 100}%`, height: '100%', bgcolor: tint, borderRadius: 1 }} />
            </Box>
            <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: tint, minWidth: 28 }}>{b.value}%</Typography>
          </Stack>
        ))}
      </Stack>
    );
  }
  return (
    <Stack direction="row" alignItems="flex-end" spacing={0.75} sx={{ height: 72, pt: 0.5 }}>
      {bars.map((b) => (
        <Stack key={b.label} alignItems="center" spacing={0.5} sx={{ flex: 1, minWidth: 0 }}>
          <Box
            sx={{
              width: '100%',
              maxWidth: 36,
              height: `${(b.value / max) * 100}%`,
              minHeight: 8,
              bgcolor: tint,
              borderRadius: '4px 4px 0 0',
              opacity: 0.9,
            }}
          />
          <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary', textAlign: 'center', lineHeight: 1.2 }} noWrap>
            {b.label}
          </Typography>
        </Stack>
      ))}
    </Stack>
  );
}

export function MiniFunnel({ stages, tint }) {
  return (
    <Stack spacing={0.5}>
      {stages.map((s, i) => (
        <Box
          key={s.label}
          sx={{
            mx: 'auto',
            width: `${s.pct}%`,
            minWidth: '40%',
            py: 0.75,
            px: 1.25,
            borderRadius: 1.5,
            bgcolor: alpha(tint, 0.08 + i * 0.04),
            border: `1px solid ${alpha(tint, 0.2 + i * 0.05)}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: 'text.primary' }}>{s.label}</Typography>
          <Typography sx={{ fontSize: '0.72rem', fontWeight: 800, color: tint }}>{s.value}</Typography>
        </Box>
      ))}
      <Typography sx={{ fontSize: '0.62rem', color: 'text.disabled', textAlign: 'center', mt: 0.25 }}>
        {stages[0]?.label} → {stages[stages.length - 1]?.label}
      </Typography>
    </Stack>
  );
}

export function MiniDualBar({ rows, tint }) {
  const theme = useTheme();
  const max = Math.max(...rows.flatMap((r) => [r.revenue, r.expense]), 1);
  return (
    <Stack direction="row" alignItems="flex-end" spacing={1} sx={{ height: 80 }}>
      {rows.map((r) => (
        <Stack key={r.label} alignItems="center" spacing={0.5} sx={{ flex: 1 }}>
          <Stack direction="row" spacing={0.35} alignItems="flex-end" sx={{ height: 64 }}>
            <Box sx={{ width: 10, height: `${(r.revenue / max) * 100}%`, minHeight: 6, bgcolor: tint, borderRadius: '3px 3px 0 0' }} />
            <Box sx={{ width: 10, height: `${(r.expense / max) * 100}%`, minHeight: 6, bgcolor: alpha(theme.palette.text.primary, 0.25), borderRadius: '3px 3px 0 0' }} />
          </Stack>
          <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary' }}>{r.label}</Typography>
        </Stack>
      ))}
    </Stack>
  );
}

export function SplitBar({ creator, platform, tint, amount }) {
  const theme = useTheme();
  return (
    <Stack spacing={1}>
      <Box sx={{ display: 'flex', height: 12, borderRadius: 1, overflow: 'hidden' }}>
        <Box sx={{ width: `${creator}%`, bgcolor: tint }} />
        <Box sx={{ width: `${platform}%`, bgcolor: alpha(theme.palette.text.primary, 0.2) }} />
      </Box>
      <Stack direction="row" justifyContent="space-between">
        <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary' }}>
          Creators <Box component="span" sx={{ fontWeight: 800, color: tint }}>{creator}%</Box>
        </Typography>
        <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary' }}>
          Platform <Box component="span" sx={{ fontWeight: 700 }}>{platform}%</Box>
        </Typography>
      </Stack>
      {amount && (
        <Typography sx={{ fontSize: '0.78rem', fontWeight: 800, color: tint }}>{amount} this month</Typography>
      )}
    </Stack>
  );
}

export function StatusChips({ statuses, tint }) {
  const theme = useTheme();
  const tones = {
    ok: theme.palette.success.main,
    warn: theme.palette.warning.main,
    bad: theme.palette.error.main,
  };
  return (
    <Stack direction="row" useFlexGap flexWrap="wrap" spacing={1}>
      {statuses.map((s) => {
        const color = tones[s.tone] || tint;
        return (
          <Box
            key={s.label}
            sx={{
              flex: '1 1 90px',
              p: 1.25,
              borderRadius: 2,
              border: `1px solid ${alpha(color, 0.35)}`,
              bgcolor: alpha(color, 0.08),
              textAlign: 'center',
            }}
          >
            <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary', fontWeight: 600 }}>{s.label}</Typography>
            <Typography sx={{ fontWeight: 800, fontSize: '1.25rem', color }}>{s.count}</Typography>
          </Box>
        );
      })}
    </Stack>
  );
}

export function PipelineColumns({ columns, tint }) {
  return (
    <Stack direction="row" spacing={1} sx={{ height: '100%' }}>
      {columns.map((col) => (
        <Box
          key={col.label}
          sx={{
            flex: 1,
            p: 1.25,
            borderRadius: 2,
            border: `1px solid ${alpha(tint, 0.25)}`,
            bgcolor: alpha(tint, 0.06),
            textAlign: 'center',
          }}
        >
          <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {col.label}
          </Typography>
          <Typography sx={{ fontWeight: 800, fontSize: '1.5rem', color: tint, mt: 0.5 }}>{col.count}</Typography>
        </Box>
      ))}
    </Stack>
  );
}

export function PartnerRankList({ partners, tint }) {
  const max = Math.max(...partners.map((p) => p.value), 1);
  return (
    <Stack spacing={1}>
      {partners.map((p, i) => (
        <Stack key={p.name} direction="row" alignItems="center" spacing={1}>
          <Typography sx={{ fontSize: '0.68rem', fontWeight: 800, color: 'text.disabled', width: 14 }}>{i + 1}</Typography>
          <Stack sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }} noWrap>{p.name}</Typography>
            <Box sx={{ height: 6, borderRadius: 1, bgcolor: alpha(tint, 0.12), mt: 0.35, overflow: 'hidden' }}>
              <Box sx={{ width: `${(p.value / max) * 100}%`, height: '100%', bgcolor: tint }} />
            </Box>
          </Stack>
        </Stack>
      ))}
    </Stack>
  );
}
