/**
 * ActivityChart - compact daily "sensed messages" column chart with a 7/30/90
 * day range toggle. Used at the bottom of the Profile & Brain, Channels and
 * Voice cards. Presentational: it just slices and renders the activity series
 * built by format.buildActivitySeries (or the Demo fixture).
 */
import { useMemo, useState } from 'react';
import { Box, ToggleButton, ToggleButtonGroup, Typography, alpha, useTheme } from '@mui/material';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Cell,
} from 'recharts';
import { SectionLabel } from './_shared';

const RANGES = [7, 30, 90];

/** "2026-06-28" -> "28.06" for the axis / tooltip. */
function shortDate(iso) {
  const [, m, d] = String(iso || '').split('-');
  return m && d ? `${d}.${m}` : iso;
}

export default function ActivityChart({
  activity = [],
  title = 'Activity (messages/day)',
  height = 120,
}) {
  const theme = useTheme();
  const [range, setRange] = useState(30);

  const data = useMemo(() => {
    const series = Array.isArray(activity) ? activity : [];
    return series.slice(-range).map((p) => ({ date: p.date, count: Number(p.count || 0) }));
  }, [activity, range]);

  const accent = theme.palette.primary.main;
  const hasData = data.some((p) => p.count > 0);

  return (
    <Box sx={{ mt: 1.5 }} data-testid="assistant-activity">
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
        <SectionLabel>{title}</SectionLabel>
        <Box sx={{ flex: 1 }} />
        <ToggleButtonGroup
          value={range}
          exclusive
          size="small"
          onChange={(_e, v) => v && setRange(v)}
          aria-label="Activity range"
          sx={{
            '& .MuiToggleButton-root': {
              textTransform: 'none',
              fontWeight: 700,
              fontSize: '0.68rem',
              px: 1,
              py: 0.1,
              border: 'none',
              color: 'text.secondary',
              borderRadius: '8px !important',
              '&.Mui-selected': { color: 'primary.main', bgcolor: alpha(accent, 0.12) },
            },
          }}
        >
          {RANGES.map((r) => (
            <ToggleButton key={r} value={r} aria-label={`${r} days`}>{`${r}D`}</ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>

      {hasData ? (
        <Box sx={{ width: '100%', height }}>
          <ResponsiveContainer>
            <BarChart data={data} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={alpha(theme.palette.divider, 0.5)}
                vertical={false}
              />
              <XAxis
                dataKey="date"
                tickFormatter={shortDate}
                interval="preserveStartEnd"
                minTickGap={24}
                tick={{ fontSize: 10, fill: theme.palette.text.secondary }}
                tickLine={false}
                axisLine={{ stroke: theme.palette.divider }}
              />
              <YAxis
                allowDecimals={false}
                width={32}
                tick={{ fontSize: 10, fill: theme.palette.text.secondary }}
                tickLine={false}
                axisLine={false}
              />
              <RechartsTooltip
                cursor={{ fill: alpha(accent, 0.08) }}
                labelFormatter={shortDate}
                formatter={(value) => [value, 'Messages']}
              />
              <Bar dataKey="count" radius={[3, 3, 0, 0]} fill={accent} maxBarSize={18}>
                {data.map((entry) => (
                  <Cell key={entry.date} fill={alpha(accent, 0.85)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Box>
      ) : (
        <Box sx={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Typography variant="caption" color="text.secondary">
            No activity yet.
          </Typography>
        </Box>
      )}
    </Box>
  );
}
