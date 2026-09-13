import { useMemo } from 'react';
import { Box, Typography, Skeleton, useTheme, alpha } from '@mui/material';
import { ResponsiveContainer, Treemap as RechartsTreemap, Tooltip } from 'recharts';

function CustomContent(props) {
  const { x, y, width, height, name, value, color, label } = props;
  if (width < 4 || height < 4) return null;
  const showLabel = width > 60 && height > 32;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={color}
        stroke="#fff"
        strokeOpacity={0.4}
        strokeWidth={1}
        rx={3}
      />
      {showLabel && (
        <>
          <text
            x={x + 8}
            y={y + 18}
            fill="#fff"
            fontSize={12}
            fontWeight={700}
            style={{ pointerEvents: 'none' }}
          >
            {name}
          </text>
          <text
            x={x + 8}
            y={y + 34}
            fill="#fff"
            fontSize={11}
            fontWeight={600}
            opacity={0.85}
            style={{ pointerEvents: 'none' }}
          >
            {label || value}
          </text>
        </>
      )}
    </g>
  );
}

function CustomTooltip({ active, payload, theme }) {
  if (!active || !payload || payload.length === 0) return null;
  const entry = payload[0].payload;
  return (
    <Box
      sx={{
        bgcolor: theme.palette.mode === 'dark' ? '#0b0b18' : '#fff',
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: 1.5,
        boxShadow: theme.shadows[3],
        px: 1.5,
        py: 1,
      }}
    >
      <Typography variant="caption" sx={{ fontWeight: 700, display: 'block' }}>
        {entry.name}
      </Typography>
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {entry.label || entry.value?.toLocaleString()}
      </Typography>
    </Box>
  );
}

export default function Treemap({
  data = [],
  nameKey,
  valueKey,
  height = 280,
  format = 'number',
  loading = false,
}) {
  const theme = useTheme();

  const items = useMemo(() => {
    if (!Array.isArray(data) || data.length === 0) return [];
    const autoName =
      nameKey ||
      (data[0] && Object.keys(data[0]).find((k) => typeof data[0][k] === 'string')) ||
      'name';
    const autoValue =
      valueKey ||
      (data[0] && Object.keys(data[0]).find((k) => typeof data[0][k] === 'number')) ||
      'value';

    const palette = [
      theme.palette.primary.main,
      theme.palette.success.main,
      theme.palette.info.main,
      theme.palette.warning.main,
      theme.palette.error.main,
    ];

    return data
      .map((row, i) => {
        const value = Number(row[autoValue]) || 0;
        let label = value.toLocaleString();
        if (format === 'currency') {
          label = `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
        } else if (format === 'percent') {
          label = `${value.toFixed(1)}%`;
        }
        return {
          name: row[autoName] || `Item ${i + 1}`,
          value,
          color: alpha(palette[i % palette.length], 0.9),
          label,
        };
      })
      .filter((r) => r.value > 0);
  }, [data, nameKey, valueKey, theme, format]);

  if (loading) {
    return <Skeleton variant="rounded" height={height} animation="wave" sx={{ borderRadius: 2 }} />;
  }

  if (items.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
        No data available.
      </Typography>
    );
  }

  return (
    <Box sx={{ width: '100%', height }}>
      <ResponsiveContainer>
        <RechartsTreemap
          data={items}
          dataKey="value"
          stroke="#fff"
          content={<CustomContent />}
          isAnimationActive={false}
        >
          <Tooltip content={<CustomTooltip theme={theme} />} />
        </RechartsTreemap>
      </ResponsiveContainer>
    </Box>
  );
}
