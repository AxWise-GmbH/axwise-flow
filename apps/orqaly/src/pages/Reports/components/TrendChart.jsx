import { memo, useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Chip,
  Skeleton,
  Switch,
  FormControlLabel,
  useTheme,
  alpha,
} from '@mui/material';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

const COMPARE_KEY_SUFFIX = '__prev';

function CustomTooltip({ active, payload, label, theme, isDark }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <Box
      sx={{
        bgcolor: isDark ? alpha('#0b0b18', 0.96) : '#fff',
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: 1.5,
        boxShadow: theme.shadows[3],
        px: 1.5,
        py: 1,
        minWidth: 140,
      }}
    >
      <Typography
        variant="caption"
        sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 0.5 }}
      >
        {label}
      </Typography>
      {payload.map((entry) => {
        const isCompare = entry.dataKey?.endsWith(COMPARE_KEY_SUFFIX);
        const displayName = isCompare
          ? `${entry.dataKey.slice(0, -COMPARE_KEY_SUFFIX.length)} (prev)`
          : entry.name;
        return (
          <Box
            key={entry.dataKey}
            sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: 12, mt: 0.25 }}
          >
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                bgcolor: entry.color,
                opacity: isCompare ? 0.5 : 1,
              }}
            />
            <Typography variant="caption" sx={{ flex: 1, color: 'text.secondary' }}>
              {displayName}
            </Typography>
            <Typography variant="caption" sx={{ fontWeight: 700 }}>
              {typeof entry.value === 'number'
                ? entry.value >= 1000
                  ? entry.value.toLocaleString(undefined, { maximumFractionDigits: 0 })
                  : entry.value.toFixed(entry.value % 1 === 0 ? 0 : 1)
                : entry.value}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}

function EmptyState() {
  return (
    <Box sx={{ py: 4, textAlign: 'center' }}>
      <Typography variant="body2" color="text.secondary">
        Not enough history yet to draw a trend.
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
        A daily snapshot is recorded each night - the chart will fill in over the next few days.
      </Typography>
    </Box>
  );
}

function TrendChart({
  data = [],
  xKey,
  lines = [],
  bars = [],
  height = 300,
  loading = false,
  compare = false,
  showLegendToggle = true,
}) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [hidden, setHidden] = useState({});
  const [compareOn, setCompareOn] = useState(compare);

  const hasData = Array.isArray(data) && data.length > 0;

  const autoXKey = hasData
    ? xKey ||
      Object.keys(data[0]).find((k) => typeof data[0][k] === 'string') ||
      Object.keys(data[0])[0]
    : null;
  const numericKeys = hasData
    ? Object.keys(data[0]).filter((k) => k !== autoXKey && typeof data[0][k] === 'number')
    : [];
  const autoLines = lines.length > 0 ? lines : numericKeys.slice(0, 4);

  const enrichedData = useMemo(() => {
    if (!hasData || !compareOn) return data;
    const half = Math.floor(data.length / 2);
    if (half < 2) return data;
    return data.map((row, idx) => {
      const prevIdx = idx + half;
      const prev = data[prevIdx < data.length ? prevIdx : idx % half];
      const extra = {};
      autoLines.forEach((key) => {
        extra[`${key}${COMPARE_KEY_SUFFIX}`] = prev ? prev[key] : null;
      });
      return { ...row, ...extra };
    });
  }, [data, compareOn, autoLines, hasData]);

  if (loading) {
    return <Skeleton variant="rounded" height={height} animation="wave" sx={{ borderRadius: 2 }} />;
  }

  if (!hasData) {
    return <EmptyState />;
  }

  const COLORS = [
    theme.palette.primary.main,
    theme.palette.success.main,
    theme.palette.warning.main,
    theme.palette.error.main,
    theme.palette.info.main,
  ];

  const toggleSeries = (key) => {
    setHidden((h) => ({ ...h, [key]: !h[key] }));
  };

  return (
    <Box sx={{ width: '100%' }}>
      {showLegendToggle && (
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 1,
            mb: 1,
            justifyContent: 'space-between',
          }}
        >
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
            {autoLines.map((key, i) => {
              const color = COLORS[i % COLORS.length];
              const off = hidden[key];
              return (
                <Chip
                  key={key}
                  size="small"
                  label={key}
                  onClick={() => toggleSeries(key)}
                  sx={{
                    fontWeight: 600,
                    bgcolor: off ? 'transparent' : alpha(color, 0.12),
                    color: off ? 'text.disabled' : color,
                    border: `1px solid ${alpha(color, off ? 0.2 : 0.4)}`,
                    cursor: 'pointer',
                    textDecoration: off ? 'line-through' : 'none',
                  }}
                />
              );
            })}
          </Box>
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={compareOn}
                onChange={(e) => setCompareOn(e.target.checked)}
              />
            }
            label={
              <Typography variant="caption" sx={{ fontWeight: 600 }}>
                Compare prev
              </Typography>
            }
            sx={{ m: 0 }}
          />
        </Box>
      )}
      <Box sx={{ width: '100%', height }}>
        <ResponsiveContainer>
          <ComposedChart data={enrichedData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={alpha(theme.palette.divider, 0.5)} />
            <XAxis
              dataKey={autoXKey}
              tick={{ fontSize: 12, fill: theme.palette.text.secondary }}
              tickLine={false}
              axisLine={{ stroke: theme.palette.divider }}
            />
            <YAxis
              tick={{ fontSize: 12, fill: theme.palette.text.secondary }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)}
            />
            <Tooltip
              cursor={{ stroke: theme.palette.primary.main, strokeOpacity: 0.2, strokeWidth: 1 }}
              content={<CustomTooltip theme={theme} isDark={isDark} />}
            />
            <Legend wrapperStyle={{ display: 'none' }} />
            {bars.map((key, i) => (
              <Bar
                key={key}
                dataKey={key}
                fill={alpha(COLORS[i % COLORS.length], 0.3)}
                radius={[4, 4, 0, 0]}
                hide={hidden[key]}
                animationDuration={900}
                animationEasing="ease-out"
              />
            ))}
            {compareOn &&
              autoLines.map((key, i) => (
                <Line
                  key={`${key}${COMPARE_KEY_SUFFIX}`}
                  type="monotone"
                  dataKey={`${key}${COMPARE_KEY_SUFFIX}`}
                  stroke={COLORS[i % COLORS.length]}
                  strokeOpacity={0.45}
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                  isAnimationActive={false}
                  hide={hidden[key]}
                />
              ))}
            {autoLines.map((key, i) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={COLORS[i % COLORS.length]}
                strokeWidth={2}
                dot={{ r: 3, fill: COLORS[i % COLORS.length] }}
                activeDot={{ r: 5 }}
                hide={hidden[key]}
                animationDuration={900}
                animationEasing="ease-out"
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </Box>
    </Box>
  );
}

export default memo(TrendChart);
