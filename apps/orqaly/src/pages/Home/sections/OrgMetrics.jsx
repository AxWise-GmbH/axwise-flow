import { Box, Typography, Skeleton, useTheme, alpha } from '@mui/material';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import GavelOutlinedIcon from '@mui/icons-material/GavelOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import BuildOutlinedIcon from '@mui/icons-material/BuildOutlined';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import useCountUp from '../../Reports/hooks/useCountUp';
import { formatValue } from '../../Reports/components/KpiGrid';
import useInView from '../../../components/Common/useInView';
import { staggerSx } from '../../../components/Common/stagger';
import { createHoverGlowShadow } from '../../../theme/hoverGlow';

import AppIcon from '../../../components/icons/AppIcon';

const METRICS = [
  { key: 'units', label: 'Units', icon: AccountTreeOutlinedIcon, format: 'number' },
  { key: 'teams', label: 'Teams', icon: GroupsOutlinedIcon, format: 'number' },
  { key: 'consilium', label: 'Consilium', icon: GavelOutlinedIcon, format: 'number' },
  { key: 'agents', label: 'Agents', icon: SmartToyOutlinedIcon, format: 'number' },
  { key: 'tools', label: 'Tools', icon: BuildOutlinedIcon, format: 'number' },
  { key: 'tasks', label: 'Tasks', icon: AssignmentOutlinedIcon, format: 'number' },
];

const GRID_COLUMNS = {
  xs: '1fr',
  md: 'repeat(2, minmax(0, 1fr))',
};

/**
 * One metric rendered as a horizontal comparison bar: icon + label, an animated
 * fill proportional to the largest metric, and the count. The whole row is the
 * click target (drill into that instrument for the selected org).
 */
function MetricBar({ iconNode, label, value, format, max, onClick, inView, index }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const color = theme.palette.primary.main;
  const animated = useCountUp(Number(value) || 0);
  const interactive = typeof onClick === 'function';
  const count = Number(value) || 0;
  // Fill grows from 0 once the row scrolls into view; the largest metric fills
  // the track fully so bars read as a comparison even with mostly-zero data.
  const pct = inView && max > 0 ? Math.max(count > 0 ? 4 : 0, (count / max) * 100) : 0;

  return (
    <Box
      component={interactive ? 'button' : 'div'}
      type={interactive ? 'button' : undefined}
      onClick={onClick}
      role={interactive ? undefined : 'group'}
      aria-label={
        interactive
          ? `Open ${label} for the selected organization`
          : `${label}: ${formatValue(count, format)}`
      }
      sx={{
        font: 'inherit',
        color: 'inherit',
        textAlign: 'left',
        width: '100%',
        p: 1.25,
        borderRadius: 2.5,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: isDark
          ? alpha(theme.palette.background.paper, 0.5)
          : theme.palette.background.paper,
        display: 'flex',
        flexDirection: 'column',
        gap: 0.75,
        cursor: interactive ? 'pointer' : 'default',
        transition: 'border-color 0.2s, box-shadow 0.2s, transform 0.15s',
        '&:hover': interactive
          ? {
              borderColor: alpha(color, 0.5),
              transform: 'translateY(-2px)',
              boxShadow: createHoverGlowShadow(theme),
            }
          : { borderColor: alpha(color, 0.4) },
        '&:focus-visible': interactive
          ? { outline: `2px solid ${color}`, outlineOffset: 2 }
          : undefined,
        ...staggerSx(index, inView),
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
        <Box
          sx={{
            width: 22,
            height: 22,
            borderRadius: 1.5,
            bgcolor: alpha(color, 0.14),
            color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {iconNode}
        </Box>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, flexGrow: 1 }}
        >
          {label}
        </Typography>
        <Typography variant="h6" sx={{ fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1 }}>
          {formatValue(animated, format)}
        </Typography>
      </Box>
      <Box
        sx={{
          height: 6,
          borderRadius: 3,
          bgcolor: alpha(theme.palette.divider, 0.6),
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            height: '100%',
            width: `${pct}%`,
            borderRadius: 3,
            background: `linear-gradient(90deg, ${alpha(color, 0.7)}, ${color})`,
            transition: 'width 0.9s cubic-bezier(0.22, 1, 0.36, 1)',
            transitionDelay: `${index * 60}ms`,
          }}
        />
      </Box>
    </Box>
  );
}

/**
 * Six org metrics for the selected organization, rendered as animated
 * comparison bars (each bar is proportional to the largest metric). Replaces the
 * flat icon+number tile strip. Bars fill and counts count up when scrolled into
 * view and when the selected org changes.
 */
export default function OrgMetrics({ metrics, loading = false, onMetricClick }) {
  const [gridRef, inView] = useInView();
  if (loading) {
    return (
      <Box sx={{ display: 'grid', gap: 1.25, gridTemplateColumns: GRID_COLUMNS }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton
            key={i}
            variant="rounded"
            height={64}
            animation="wave"
            sx={{ borderRadius: 2.5 }}
          />
        ))}
      </Box>
    );
  }

  const m = metrics || {};
  const max = Math.max(1, ...METRICS.map((def) => Number(m[def.key]) || 0));
  return (
    <Box ref={gridRef} sx={{ display: 'grid', gap: 1.25, gridTemplateColumns: GRID_COLUMNS }}>
      {METRICS.map((def, i) => {
        const Icon = def.icon;
        return (
          <MetricBar
            key={def.key}
            index={i}
            inView={inView}
            iconNode={<AppIcon fallback={Icon} sx={{ fontSize: 14 }} />}
            label={def.label}
            value={m[def.key] ?? 0}
            format={def.format}
            max={max}
            onClick={onMetricClick ? () => onMetricClick(def.key) : undefined}
          />
        );
      })}
    </Box>
  );
}
