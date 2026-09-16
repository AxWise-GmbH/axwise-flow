import { Box, Button, Grid, Stack, Typography, alpha, useTheme } from '@mui/material';
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import RemoveIcon from '@mui/icons-material/Remove';
import LandingGlassIcon from '../../Landing/sections/LandingGlassIcon';
import { createHoverGlowShadow } from '../../../theme/hoverGlow';
import {
  STATS,
  COMPETITORS,
  COMPARISON_ROWS,
  MARKET,
  TRACTION,
  MOAT,
  BUSINESS_MODEL,
  WHY_NOW,
  ROADMAP,
  ASK,
  INVESTOR_EMAIL,
  MAILTO_HREF,
} from '../../Landing/data/investor';

import AppIcon from '../../../components/icons/AppIcon';

export function Eyebrow({ children }) {
  return (
    <Typography
      sx={{
        fontSize: '0.78rem',
        fontWeight: 800,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: 'primary.main',
      }}
    >
      {children}
    </Typography>
  );
}

export function SectionHeading({ children, component = 'h3' }) {
  return (
    <Typography
      component={component}
      sx={{
        fontWeight: 800,
        fontSize: { xs: '1.35rem', md: '1.65rem' },
        color: 'text.primary',
        letterSpacing: '-0.01em',
        mb: 2,
      }}
    >
      {children}
    </Typography>
  );
}

export function RaisingPill() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={1}
      sx={{
        display: 'inline-flex',
        bgcolor: alpha(primary, 0.12),
        color: 'primary.main',
        px: 1.75,
        py: 0.6,
        borderRadius: 999,
        fontWeight: 700,
        fontSize: '0.82rem',
        border: `1px solid ${alpha(primary, 0.35)}`,
      }}
    >
      <Box
        sx={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          bgcolor: 'primary.main',
          '@keyframes raisingPulse': {
            '0%, 100%': { transform: 'scale(1)', opacity: 1 },
            '50%': { transform: 'scale(1.4)', opacity: 0.7 },
          },
          animation: 'raisingPulse 1.6s ease-in-out infinite',
          '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
        }}
      />
      {ASK.pill}
    </Stack>
  );
}

export function EmailButton({ variant = 'contained', size = 'large', sx }) {
  const theme = useTheme();
  return (
    <Button
      component="a"
      href={MAILTO_HREF}
      variant={variant}
      size={size}
      disableElevation
      startIcon={<AppIcon name='MailOutline' fallback={MailOutlineIcon} />}
      sx={{
        fontWeight: 700,
        borderRadius: 2,
        textTransform: 'none',
        px: 3,
        py: 1.25,
        transition: 'box-shadow 220ms ease, transform 220ms ease',
        '&:hover': { boxShadow: createHoverGlowShadow(theme), transform: 'translateY(-1px)' },
        ...sx,
      }}
    >
      {INVESTOR_EMAIL}
    </Button>
  );
}

export function StatsStrip() {
  const theme = useTheme();
  return (
    <Grid container spacing={{ xs: 2, md: 3 }}>
      {STATS.map((s) => (
        <Grid key={s.label} size={{ xs: 6, md: 3 }}>
          <Stack
            spacing={0.5}
            sx={{
              p: { xs: 2.25, md: 3 },
              height: '100%',
              borderRadius: 3,
              bgcolor: 'background.paper',
              border: `1px solid ${theme.palette.divider}`,
            }}
          >
            <Typography
              sx={{
                fontWeight: 800,
                fontSize: { xs: '2rem', md: '3rem' },
                lineHeight: 1.05,
                color: 'primary.main',
                letterSpacing: '-0.02em',
              }}
            >
              {s.value}
            </Typography>
            <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', color: 'text.primary' }}>
              {s.label}
            </Typography>
            <Typography sx={{ fontSize: '0.82rem', color: 'text.secondary', lineHeight: 1.5 }}>
              {s.sub}
            </Typography>
          </Stack>
        </Grid>
      ))}
    </Grid>
  );
}

function CompetitiveCellIcon({ value }) {
  const theme = useTheme();
  if (value === true) {
    return (
      <AppIcon
        name='Check'
        fallback={CheckIcon}
        sx={{ color: 'primary.main', fontSize: 22 }}
        aria-label="Yes" />
    );
  }
  if (value === 'partial') {
    return (
      <AppIcon
        name='Remove'
        fallback={RemoveIcon}
        sx={{ color: theme.palette.warning.main, fontSize: 22 }}
        aria-label="Partial" />
    );
  }
  return (
    <AppIcon
      name='Close'
      fallback={CloseIcon}
      sx={{ color: alpha(theme.palette.error.main, 0.7), fontSize: 20 }}
      aria-label="No" />
  );
}

export function CompetitiveGrid() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  return (
    <Box sx={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <Box
        component="table"
        aria-label="Orqaly vs alternatives"
        sx={{
          width: '100%',
          minWidth: 640,
          borderCollapse: 'separate',
          borderSpacing: 0,
          '& th, & td': {
            borderBottom: `1px solid ${theme.palette.divider}`,
            px: 2,
            py: 1.75,
            textAlign: 'left',
            fontSize: '0.92rem',
            verticalAlign: 'middle',
          },
          '& thead th': {
            fontWeight: 700,
            fontSize: '0.85rem',
            color: 'text.secondary',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            borderTop: `1px solid ${theme.palette.divider}`,
          },
          '& tbody td': { color: 'text.primary' },
          '& tbody td:first-of-type': { fontWeight: 600, color: 'text.primary' },
        }}
      >
        <caption style={{ position: 'absolute', left: -10000, top: 'auto' }}>
          How Orqaly compares to other agent / workflow platforms
        </caption>
        <thead>
          <tr>
            <th scope="col">Capability</th>
            {COMPETITORS.map((c) => {
              const isOrqaly = c.id === 'orqaly';
              return (
                <th
                  key={c.id}
                  scope="col"
                  style={{
                    textAlign: 'center',
                    backgroundColor: isOrqaly ? alpha(primary, 0.08) : 'transparent',
                    color: isOrqaly ? primary : undefined,
                    borderLeft: isOrqaly ? `1px solid ${alpha(primary, 0.5)}` : undefined,
                    borderRight: isOrqaly ? `1px solid ${alpha(primary, 0.5)}` : undefined,
                  }}
                >
                  {c.label}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {COMPARISON_ROWS.map((row, idx) => (
            <tr key={idx}>
              <td>{row.capability}</td>
              {COMPETITORS.map((c) => {
                const isOrqaly = c.id === 'orqaly';
                const value = row.values[c.id];
                return (
                  <td
                    key={c.id}
                    style={{
                      textAlign: 'center',
                      backgroundColor: isOrqaly ? alpha(primary, 0.06) : 'transparent',
                      borderLeft: isOrqaly ? `1px solid ${alpha(primary, 0.5)}` : undefined,
                      borderRight: isOrqaly ? `1px solid ${alpha(primary, 0.5)}` : undefined,
                    }}
                  >
                    <CompetitiveCellIcon value={value} />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </Box>
      <Stack direction="row" spacing={2.5} sx={{ mt: 2, flexWrap: 'wrap', color: 'text.secondary', fontSize: '0.78rem' }}>
        <Stack direction="row" spacing={0.75} alignItems="center">
          <AppIcon
            name='Check'
            fallback={CheckIcon}
            sx={{ fontSize: 14, color: 'primary.main' }} /> Yes
        </Stack>
        <Stack direction="row" spacing={0.75} alignItems="center">
          <AppIcon
            name='Remove'
            fallback={RemoveIcon}
            sx={{ fontSize: 14, color: theme.palette.warning.main }} /> Partial
        </Stack>
        <Stack direction="row" spacing={0.75} alignItems="center">
          <AppIcon
            name='Close'
            fallback={CloseIcon}
            sx={{ fontSize: 14, color: alpha(theme.palette.error.main, 0.7) }} /> No
        </Stack>
      </Stack>
    </Box>
  );
}

export function MarketViz() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  return (
    <Stack spacing={1.5}>
      {MARKET.segments.map((seg, i) => {
        const tint = i === 0 ? primary : i === 1 ? alpha(primary, 0.65) : alpha(primary, 0.35);
        return (
          <Box key={seg.label}>
            <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 0.5 }}>
              <Typography sx={{ fontWeight: 800, fontSize: '0.85rem', color: 'primary.main', letterSpacing: '0.06em' }}>
                {seg.label}
              </Typography>
              <Typography sx={{ fontSize: '0.85rem', color: 'text.secondary' }}>{seg.sub}</Typography>
            </Stack>
            <Box sx={{ position: 'relative', height: 32, borderRadius: 1.5, bgcolor: alpha(primary, 0.06), overflow: 'hidden' }}>
              <Box
                sx={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  bottom: 0,
                  width: `${seg.pct}%`,
                  bgcolor: tint,
                  display: 'flex',
                  alignItems: 'center',
                  px: 1.5,
                  color: '#0a0a0a',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  transition: 'width 600ms ease',
                }}
              >
                {seg.value}
              </Box>
            </Box>
          </Box>
        );
      })}
    </Stack>
  );
}

export function MoatChips() {
  const theme = useTheme();
  return (
    <Grid container spacing={2}>
      {MOAT.map((m) => (
        <Grid key={m.title} size={{ xs: 12, sm: 6 }}>
          <Stack
            direction="row"
            spacing={2}
            sx={{
              p: 2.5,
              height: '100%',
              borderRadius: 2.5,
              border: `1px solid ${theme.palette.divider}`,
              bgcolor: 'background.paper',
              alignItems: 'flex-start',
            }}
          >
            <LandingGlassIcon name={m.iconName} size={22} tone="brand" />
            <Stack spacing={0.5}>
              <Typography sx={{ fontWeight: 800, fontSize: '0.98rem', color: 'text.primary' }}>
                {m.title}
              </Typography>
              <Typography sx={{ fontSize: '0.88rem', color: 'text.secondary', lineHeight: 1.55 }}>
                {m.body}
              </Typography>
            </Stack>
          </Stack>
        </Grid>
      ))}
    </Grid>
  );
}

export function RoadmapColumns() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  return (
    <Grid container spacing={2.5}>
      {ROADMAP.map((col) => (
        <Grid key={col.period} size={{ xs: 12, md: 4 }}>
          <Stack
            spacing={1.5}
            sx={{
              height: '100%',
              p: 2.75,
              borderRadius: 2.5,
              bgcolor: 'background.paper',
              border: `1px solid ${theme.palette.divider}`,
              borderLeft: `3px solid ${primary}`,
            }}
          >
            <Stack direction="row" alignItems="baseline" spacing={1.25}>
              <Typography sx={{ fontWeight: 800, fontSize: '1.05rem', color: 'text.primary' }}>
                {col.period}
              </Typography>
              <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>{col.window}</Typography>
            </Stack>
            <Stack component="ul" spacing={1} sx={{ pl: 2.5, m: 0 }}>
              {col.items.map((item) => (
                <Typography
                  key={item}
                  component="li"
                  sx={{ fontSize: '0.9rem', color: 'text.primary', lineHeight: 1.55 }}
                >
                  {item}
                </Typography>
              ))}
            </Stack>
          </Stack>
        </Grid>
      ))}
    </Grid>
  );
}

export function TractionGrid() {
  const theme = useTheme();
  return (
    <Grid container spacing={2.5}>
      {TRACTION.map((t) => (
        <Grid key={t.title} size={{ xs: 12, md: 4 }}>
          <Stack
            spacing={1}
            sx={{
              height: '100%',
              p: 2.75,
              borderRadius: 2.5,
              border: `1px solid ${theme.palette.divider}`,
              bgcolor: 'background.paper',
            }}
          >
            <Typography sx={{ fontWeight: 800, fontSize: '1rem', color: 'text.primary' }}>
              {t.title}
            </Typography>
            <Typography sx={{ fontSize: '0.9rem', color: 'text.secondary', lineHeight: 1.6 }}>
              {t.body}
            </Typography>
          </Stack>
        </Grid>
      ))}
    </Grid>
  );
}

export function WhyNowSection() {
  const theme = useTheme();
  return (
    <Grid container spacing={{ xs: 4, md: 6 }}>
      <Grid size={{ xs: 12, md: 6 }}>
        <Eyebrow>Why now</Eyebrow>
        <SectionHeading>The orchestration layer is the new bottleneck.</SectionHeading>
        <Typography sx={{ fontSize: '1rem', color: 'text.primary', lineHeight: 1.7 }}>
          {WHY_NOW.prose}
        </Typography>
      </Grid>
      <Grid size={{ xs: 12, md: 6 }}>
        <Stack spacing={2}>
          {WHY_NOW.bullets.map((b) => (
            <Box
              key={b.title}
              sx={{
                p: 2.5,
                borderRadius: 2.5,
                border: `1px solid ${theme.palette.divider}`,
                bgcolor: 'background.paper',
              }}
            >
              <Typography sx={{ fontWeight: 800, fontSize: '0.98rem', color: 'text.primary', mb: 0.5 }}>
                {b.title}
              </Typography>
              <Typography sx={{ fontSize: '0.9rem', color: 'text.secondary', lineHeight: 1.6 }}>
                {b.body}
              </Typography>
            </Box>
          ))}
        </Stack>
      </Grid>
    </Grid>
  );
}

const REVENUE_BARS = [
  { label: 'Subscriptions', pct: 72, sub: 'Workspace SaaS' },
  { label: '15% marketplace take', pct: 88, sub: 'Install GMV' },
  { label: 'Enterprise', pct: 42, sub: 'On roadmap' },
];

export function RevenueStreamsMock() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  return (
    <Stack spacing={2}>
      {REVENUE_BARS.map((bar, i) => (
        <Box key={bar.label}>
          <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 0.5 }}>
            <Typography sx={{ fontWeight: 800, fontSize: '0.9rem', color: 'text.primary' }}>
              {bar.label}
            </Typography>
            <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>{bar.sub}</Typography>
          </Stack>
          <Box sx={{ position: 'relative', height: 28, borderRadius: 1.5, bgcolor: alpha(primary, 0.06), overflow: 'hidden' }}>
            <Box
              sx={{
                position: 'absolute',
                top: 0,
                left: 0,
                bottom: 0,
                width: `${bar.pct}%`,
                bgcolor: i === 0 ? primary : i === 1 ? alpha(primary, 0.75) : alpha(primary, 0.45),
                borderRadius: 1.5,
              }}
            />
          </Box>
        </Box>
      ))}
      <Stack spacing={1} sx={{ pt: 1 }}>
        {BUSINESS_MODEL.streams.map((s) => (
          <Typography key={s.title} sx={{ fontSize: '0.82rem', color: 'text.secondary', lineHeight: 1.5 }}>
            <Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>
              {s.title}:
            </Box>{' '}
            {s.body}
          </Typography>
        ))}
      </Stack>
    </Stack>
  );
}

export function BusinessModelNotes() {
  return (
    <Stack component="ul" spacing={1.25} sx={{ pl: 2.5, m: 0 }}>
      {BUSINESS_MODEL.notes.map((n) => (
        <Typography
          key={n}
          component="li"
          sx={{ fontSize: '0.95rem', color: 'text.primary', lineHeight: 1.65 }}
        >
          {n}
        </Typography>
      ))}
    </Stack>
  );
}

export function ChannelRowMock() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const isDark = theme.palette.mode === 'dark';
  const channels = ['Voice', 'Telegram', 'Chat', 'Email'];
  return (
    <Box
      sx={{
        borderRadius: 4,
        overflow: 'hidden',
        bgcolor: isDark ? alpha('#fff', 0.025) : '#fff',
        border: `1px solid ${theme.palette.divider}`,
        boxShadow: `0 20px 50px ${alpha(primary, 0.18)}`,
        p: { xs: 2.5, md: 3 },
      }}
    >
      <Typography sx={{ fontWeight: 800, fontSize: '0.72rem', color: 'text.secondary', letterSpacing: '0.08em', textTransform: 'uppercase', mb: 2 }}>
        Same agent · every channel
      </Typography>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        {channels.map((ch) => (
          <Box
            key={ch}
            sx={{
              px: 1.75,
              py: 0.75,
              borderRadius: 999,
              bgcolor: alpha(primary, 0.1),
              border: `1px solid ${alpha(primary, 0.25)}`,
              color: 'primary.main',
              fontSize: '0.82rem',
              fontWeight: 700,
            }}
          >
            {ch}
          </Box>
        ))}
      </Stack>
      <Typography sx={{ mt: 2, fontSize: '0.88rem', color: 'text.secondary', lineHeight: 1.55 }}>
        One memory, one audit trail - customers reach your agents wherever they already work.
      </Typography>
    </Box>
  );
}

export function InvestorSection({ children, sx }) {
  const theme = useTheme();
  return (
    <Box
      component="section"
      sx={{
        py: { xs: 5, md: 7 },
        ...sx,
      }}
    >
      <Box sx={{ maxWidth: 1200, mx: 'auto', px: { xs: 2, sm: 3 } }}>
        {children}
      </Box>
    </Box>
  );
}
