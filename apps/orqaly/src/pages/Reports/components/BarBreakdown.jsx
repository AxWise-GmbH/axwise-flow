import { useMemo, useState } from 'react';
import {
  Box,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
  Skeleton,
  useTheme,
  alpha,
} from '@mui/material';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

export default function BarBreakdown({
  data = [],
  xKey,
  bars = [],
  height = 280,
  stacked = false,
  loading = false,
}) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [sortMode, setSortMode] = useState('value-desc');
  const [showPercent, setShowPercent] = useState(false);

  const hasData = Array.isArray(data) && data.length > 0;

  const autoXKey = hasData
    ? xKey ||
      Object.keys(data[0]).find((k) => typeof data[0][k] === 'string') ||
      Object.keys(data[0])[0]
    : null;
  const numericKeys = hasData
    ? Object.keys(data[0]).filter((k) => k !== autoXKey && typeof data[0][k] === 'number')
    : [];
  const autoBars = bars.length > 0 ? bars : numericKeys.slice(0, 4);
  const primaryKey = autoBars[0];

  const transformed = useMemo(() => {
    if (!hasData) return [];
    let arr = [...data];
    arr.sort((a, b) => {
      if (sortMode === 'value-desc') return (b[primaryKey] || 0) - (a[primaryKey] || 0);
      if (sortMode === 'value-asc') return (a[primaryKey] || 0) - (b[primaryKey] || 0);
      return String(a[autoXKey]).localeCompare(String(b[autoXKey]));
    });
    if (showPercent) {
      const totals = {};
      autoBars.forEach((key) => {
        totals[key] = arr.reduce((sum, row) => sum + (Number(row[key]) || 0), 0);
      });
      arr = arr.map((row) => {
        const copy = { ...row };
        autoBars.forEach((key) => {
          const total = totals[key];
          copy[key] = total > 0 ? Number((((row[key] || 0) / total) * 100).toFixed(1)) : 0;
        });
        return copy;
      });
    }
    return arr;
  }, [data, sortMode, showPercent, autoBars, primaryKey, autoXKey, hasData]);

  if (loading) {
    return <Skeleton variant="rounded" height={height} animation="wave" sx={{ borderRadius: 2 }} />;
  }

  if (!hasData) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
        No breakdown data available.
      </Typography>
    );
  }

  const COLORS = [
    theme.palette.primary.main,
    theme.palette.success.main,
    theme.palette.warning.main,
    theme.palette.error.main,
    theme.palette.info.main,
  ];

  const tooltipFormatter = (value, name) => {
    if (showPercent) return [`${value}%`, name];
    return [value, name];
  };

  return (
    <Box sx={{ width: '100%' }}>
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 1,
          mb: 1,
          justifyContent: 'flex-end',
        }}
      >
        <ToggleButtonGroup
          size="small"
          exclusive
          value={sortMode}
          onChange={(_, v) => v && setSortMode(v)}
          sx={{ '& .MuiToggleButton-root': { px: 1, py: 0.25, fontSize: 11, fontWeight: 600 } }}
        >
          <ToggleButton value="value-desc">High</ToggleButton>
          <ToggleButton value="value-asc">Low</ToggleButton>
          <ToggleButton value="alpha">A-Z</ToggleButton>
        </ToggleButtonGroup>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={showPercent ? 'percent' : 'absolute'}
          onChange={(_, v) => v && setShowPercent(v === 'percent')}
          sx={{ '& .MuiToggleButton-root': { px: 1, py: 0.25, fontSize: 11, fontWeight: 600 } }}
        >
          <ToggleButton value="absolute">#</ToggleButton>
          <ToggleButton value="percent">%</ToggleButton>
        </ToggleButtonGroup>
      </Box>
      <Box sx={{ width: '100%', height }}>
        <ResponsiveContainer>
          <BarChart data={transformed} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={alpha(theme.palette.divider, 0.5)} />
            <XAxis
              dataKey={autoXKey}
              tick={{ fontSize: 11, fill: theme.palette.text.secondary }}
              tickLine={false}
              axisLine={{ stroke: theme.palette.divider }}
              interval={0}
              angle={transformed.length > 8 ? -30 : 0}
              textAnchor={transformed.length > 8 ? 'end' : 'middle'}
            />
            <YAxis
              tick={{ fontSize: 12, fill: theme.palette.text.secondary }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) =>
                showPercent ? `${v}%` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v
              }
            />
            <Tooltip
              contentStyle={{
                backgroundColor: isDark ? '#1a1a2e' : '#fff',
                border: `1px solid ${theme.palette.divider}`,
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={tooltipFormatter}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {autoBars.map((key, i) => (
              <Bar
                key={key}
                dataKey={key}
                fill={COLORS[i % COLORS.length]}
                radius={[4, 4, 0, 0]}
                stackId={stacked ? 'stack' : undefined}
                fillOpacity={0.85}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </Box>
    </Box>
  );
}
