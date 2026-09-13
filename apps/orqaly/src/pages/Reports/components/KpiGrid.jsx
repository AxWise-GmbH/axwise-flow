import { memo } from 'react';
import { Box, Typography, Tooltip, Skeleton, alpha, useTheme } from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import TrendingFlatIcon from '@mui/icons-material/TrendingFlat';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { ResponsiveContainer, LineChart, Line } from 'recharts';
import { createHoverGlowShadow } from '../../../theme/hoverGlow';
import useCountUp from '../hooks/useCountUp';
import useInView from '../../../components/Common/useInView';
import { staggerSx } from '../../../components/Common/stagger';

import AppIcon from '../../../components/icons/AppIcon';

/** Compact magnitude string: 24800000 -> "24.8M", 45678 -> "45.7k". */
function compactNumber(num) {
  const abs = Math.abs(num);
  if (abs >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(num / 1_000).toFixed(1)}k`;
  return num % 1 !== 0 ? num.toFixed(1) : String(num);
}

export function formatValue(value, format) {
  if (value == null || Number.isNaN(value)) return '-';
  const num = Number(value);
  if (Number.isNaN(num)) return String(value);
  if (format === 'currency') {
    return `$${num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  }
  if (format === 'currencyCompact') return `$${compactNumber(num)}`;
  if (format === 'compact') return compactNumber(num);
  if (format === 'percent') return `${num.toFixed(1)}%`;
  if (Math.abs(num) >= 1000) {
    return num.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }
  if (num % 1 !== 0) return num.toFixed(1);
  return num.toLocaleString();
}

function Sparkline({ series, color, animate = false, height = 36 }) {
  if (!Array.isArray(series) || series.length < 2) return null;
  const data = series.map((value, index) => ({ index, value: Number(value) || 0 }));
  return (
    <Box sx={{ width: '100%', height, mt: 1, opacity: 0.85 }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.75}
            dot={false}
            isAnimationActive={animate}
            animationDuration={900}
            animationEasing="ease-out"
          />
        </LineChart>
      </ResponsiveContainer>
    </Box>
  );
}

function AnimatedNumber({ value, format }) {
  const animated = useCountUp(value);
  return <>{formatValue(animated, format)}</>;
}

function DeltaChip({ change }) {
  const theme = useTheme();
  if (change == null || Number.isNaN(Number(change))) return null;
  const numeric = Number(change);
  const isFlat = Math.abs(numeric) < 0.05;
  const isUp = numeric > 0;
  const color = isFlat
    ? theme.palette.text.secondary
    : isUp
      ? theme.palette.success.main
      : theme.palette.error.main;
  const Icon = isFlat ? TrendingFlatIcon : isUp ? TrendingUpIcon : TrendingDownIcon;
  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.25,
        px: 0.75,
        py: 0.1,
        borderRadius: 1,
        bgcolor: alpha(color, 0.12),
        color,
      }}
    >
      <AppIcon fallback={Icon} sx={{ fontSize: 13 }} />
      <Typography variant="caption" sx={{ fontWeight: 700, color: 'inherit', lineHeight: 1 }}>
        {isUp ? '+' : ''}
        {numeric.toFixed(1)}%
      </Typography>
    </Box>
  );
}

function KpiGrid({
  data = [],
  loading = false,
  onDrill,
  animateSparkline = false,
  staggerCards = false,
  size = 'md',
  columns,
  fillHeight = false,
}) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [gridRef, inView] = useInView();

  // `size="lg"` scales up the cards (padding, value type, sparkline) for
  // prominent dashboards; default `md` keeps the compact Reports look.
  const lg = size === 'lg';
  const cardPad = lg ? 2.5 : 2;
  const cardGap = lg ? 2 : 1.5;
  const valueVariant = lg ? 'h4' : 'h5';
  const sparkHeight = lg ? 52 : 36;
  const skeletonHeight = lg ? 140 : 108;

  // Optional `columns` caps the grid (e.g. 3-up beside another block); otherwise
  // it fills up to 6 across on desktop.
  const mdCols = columns || Math.min(Math.max(data.length, 1), 6);
  const smCols = columns ? Math.min(columns, 3) : 3;
  const gridTemplateColumns = {
    xs: 'repeat(2, 1fr)',
    sm: `repeat(${smCols}, 1fr)`,
    md: `repeat(${mdCols}, 1fr)`,
  };

  // When `fillHeight`, the grid stretches to its container and the rows split the
  // height evenly so the cards grow to fill (used beside the taller LLM Usage donut).
  const fillSx = fillHeight ? { height: '100%', gridAutoRows: '1fr' } : null;

  if (loading) {
    return (
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns,
          gap: cardGap,
          ...fillSx,
        }}
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton
            key={i}
            variant="rounded"
            height={skeletonHeight}
            sx={{ borderRadius: 2.5 }}
            animation="wave"
          />
        ))}
      </Box>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
        No KPI data available.
      </Typography>
    );
  }

  return (
    <Box
      ref={gridRef}
      sx={{
        display: 'grid',
        gridTemplateColumns,
        gap: cardGap,
        ...fillSx,
      }}
    >
      {data.map((kpi, i) => {
        const isNegative = Number(kpi.value) < 0;
        const clickable = Boolean(kpi.drillKey && onDrill);
        const sparkColor = isNegative ? theme.palette.error.main : theme.palette.primary.main;

        return (
          <Box
            key={kpi.label || i}
            role={clickable ? 'button' : undefined}
            tabIndex={clickable ? 0 : undefined}
            onClick={clickable ? () => onDrill(kpi) : undefined}
            onKeyDown={
              clickable
                ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onDrill(kpi);
                    }
                  }
                : undefined
            }
            sx={{
              p: cardPad,
              borderRadius: 2.5,
              border: '1px solid',
              borderColor: 'divider',
              bgcolor: isDark
                ? alpha(theme.palette.background.paper, 0.5)
                : theme.palette.background.paper,
              cursor: clickable ? 'pointer' : 'default',
              transition: 'border-color 0.2s, box-shadow 0.2s, transform 0.15s',
              '&:hover': {
                borderColor: alpha(theme.palette.primary.main, 0.3),
                boxShadow: createHoverGlowShadow(theme),
                transform: clickable ? 'translateY(-1px)' : 'none',
              },
              '&:focus-visible': {
                outline: `2px solid ${theme.palette.primary.main}`,
                outlineOffset: 2,
              },
              ...(staggerCards ? staggerSx(i, inView) : null),
              ...(fillHeight
                ? { display: 'flex', flexDirection: 'column', justifyContent: 'center' }
                : null),
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}
              >
                {kpi.label}
              </Typography>
              {kpi.tooltip && (
                <Tooltip title={kpi.tooltip} arrow placement="top">
                  <AppIcon
                    name="InfoOutlined"
                    fallback={InfoOutlinedIcon}
                    sx={{
                      fontSize: 13,
                      color: 'text.secondary',
                      opacity: 0.6,
                      '&:hover': { opacity: 1 },
                    }}
                  />
                </Tooltip>
              )}
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, mt: 0.5 }}>
              <Typography
                variant={valueVariant}
                sx={{
                  fontWeight: 800,
                  letterSpacing: '-0.02em',
                  color: isNegative ? 'error.main' : 'text.primary',
                }}
              >
                <AnimatedNumber value={kpi.value} format={kpi.format} />
              </Typography>
              <DeltaChip change={kpi.change} />
            </Box>
            {Array.isArray(kpi.series) && kpi.series.length >= 2 && (!staggerCards || inView) && (
              <Sparkline
                series={kpi.series}
                color={sparkColor}
                animate={animateSparkline}
                height={sparkHeight}
              />
            )}
          </Box>
        );
      })}
    </Box>
  );
}

export default memo(KpiGrid);
