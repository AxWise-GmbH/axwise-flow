import { useMemo, useState, useEffect } from 'react';
import { Box, Typography, Paper, useTheme, alpha } from '@mui/material';
import {
  FUNNEL_STATUSES,
  FUNNEL_STATUS_COLORS,
  FUNNEL_STATUS_COLORS_DARK,
} from '../../../utils/constants';

const ANIMATION_DURATION_MS = 800;
const STAGGER_MS = 80;

function useCountUp(end, durationMs, startDelayMs = 0, deps = []) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (end === 0) {
      setValue(0);
      return;
    }
    const startTime = Date.now() + startDelayMs;
    let raf = null;
    const tick = () => {
      const elapsed = Date.now() - startTime;
      if (elapsed <= 0) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const t = Math.min(elapsed / durationMs, 1);
      const eased = 1 - (1 - t) ** 2;
      setValue(Math.round(eased * end));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => raf && cancelAnimationFrame(raf);
  }, [end, durationMs, startDelayMs, ...deps]);
  return value;
}

export default function PartnersFunnelChart({ partners, onStageClick, selectedStage }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const funnelColors = isDark ? FUNNEL_STATUS_COLORS_DARK : FUNNEL_STATUS_COLORS;

  const stageCounts = useMemo(() => {
    const counts = {};
    FUNNEL_STATUSES.forEach((s) => {
      counts[s] = 0;
    });
    partners.forEach((p) => {
      const s = p.funnelStatus || 'Contacted';
      if (counts[s] !== undefined) counts[s] += 1;
    });
    return counts;
  }, [partners]);

  const total = useMemo(() => partners.length, [partners]);
  const maxCount = useMemo(() => Math.max(1, ...Object.values(stageCounts)), [stageCounts]);

  return (
    <Paper
      variant="outlined"
      sx={{
        overflow: 'hidden',
        borderRadius: 3,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      <Box sx={{ px: 2, pt: 2, pb: 1.5 }}>
        <Typography
          variant="overline"
          sx={{ fontWeight: 700, color: 'text.secondary', letterSpacing: '0.1em' }}
        >
          Pipeline by status
        </Typography>
      </Box>
      <Box sx={{ px: 2, pb: 2 }}>
        {/* Stacked bar: funnel flow */}
        <Box
          sx={{
            display: 'flex',
            height: 14,
            borderRadius: 2,
            overflow: 'hidden',
            bgcolor: alpha(theme.palette.divider, 0.2),
            mb: 2,
          }}
        >
          {FUNNEL_STATUSES.map((stage, i) => {
            const count = stageCounts[stage] || 0;
            const pct = total > 0 ? (count / total) * 100 : 0;
            const colors = funnelColors[stage] || {
              bg: isDark ? 'rgba(139, 148, 158, 0.22)' : '#94A3B8',
            };
            return (
              <FunnelSegment
                key={stage}
                widthPct={pct}
                color={colors.bg}
                delayMs={i * STAGGER_MS}
                durationMs={ANIMATION_DURATION_MS}
              />
            );
          })}
        </Box>

        {/* Stage pills with count and bar */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: 'repeat(2, 1fr)',
              sm: 'repeat(3, 1fr)',
              md: `repeat(${FUNNEL_STATUSES.length}, 1fr)`,
            },
            gap: 1.5,
          }}
        >
          {FUNNEL_STATUSES.map((stage, i) => (
            <StagePill
              key={stage}
              stage={stage}
              count={stageCounts[stage] || 0}
              maxCount={maxCount}
              total={total}
              selected={selectedStage === stage}
              delayMs={i * STAGGER_MS}
              funnelColors={funnelColors}
              onClick={() => onStageClick?.(stage)}
            />
          ))}
        </Box>
        {onStageClick && (
          <Typography
            variant="caption"
            sx={{ display: 'block', mt: 1.5, color: 'text.secondary', fontSize: '0.7rem' }}
          >
            Click a stage to filter the table · Click again to clear
          </Typography>
        )}
      </Box>
    </Paper>
  );
}

function FunnelSegment({ widthPct, color, delayMs, durationMs }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);
  return (
    <Box
      sx={{
        width: mounted ? `${widthPct}%` : '0%',
        height: '100%',
        bgcolor: color,
        transition: `width ${durationMs}ms cubic-bezier(0.4, 0, 0.2, 1)`,
        transitionDelay: `${delayMs}ms`,
        minWidth: widthPct > 0 ? 4 : 0,
      }}
    />
  );
}

function StagePill({ stage, count, maxCount, total, selected, delayMs, funnelColors, onClick }) {
  const theme = useTheme();
  const colors = funnelColors[stage] || {
    bg: theme.palette.mode === 'dark' ? 'rgba(139, 148, 158, 0.22)' : '#F1F5F9',
    color: theme.palette.text.secondary,
  };
  const displayCount = useCountUp(count, ANIMATION_DURATION_MS, 100 + delayMs, [count]);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);
  const barPct = maxCount > 0 ? (count / maxCount) * 100 : 0;

  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      sx={{
        display: 'block',
        textAlign: 'left',
        border: '1px solid',
        borderColor: selected ? colors.color : 'divider',
        borderRadius: 2,
        overflow: 'hidden',
        bgcolor: selected ? alpha(theme.palette.primary.main, 0.06) : 'transparent',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'border-color 0.2s, background-color 0.2s',
        '&:hover': onClick
          ? {
              bgcolor: theme.palette.action?.hover ?? alpha(theme.palette.primary.main, 0.08),
              borderColor: alpha(colors.color, 0.6),
            }
          : {},
        p: 1.25,
        minWidth: 0,
      }}
    >
      <Box
        sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.75 }}
      >
        <Typography
          variant="caption"
          sx={{
            fontWeight: 700,
            fontSize: '0.7rem',
            color: colors.color,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          {stage}
        </Typography>
        <Typography
          variant="body2"
          sx={{ fontWeight: 800, color: 'text.primary', fontSize: '0.875rem' }}
        >
          {displayCount}
        </Typography>
      </Box>
      <Box
        sx={{
          height: 6,
          borderRadius: 1,
          bgcolor: alpha(theme.palette.divider, 0.2),
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            width: mounted ? `${barPct}%` : '0%',
            height: '100%',
            bgcolor: colors.bg,
            borderRadius: 1,
            transition: `width ${ANIMATION_DURATION_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`,
            transitionDelay: `${delayMs}ms`,
          }}
        />
      </Box>
      {total > 0 && count > 0 && (
        <Typography
          variant="caption"
          sx={{ color: 'text.secondary', fontSize: '0.65rem', mt: 0.25, display: 'block' }}
        >
          {((count / total) * 100).toFixed(0)}% of total
        </Typography>
      )}
    </Box>
  );
}
