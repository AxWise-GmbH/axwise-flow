import { Box, Typography, Skeleton, useTheme, alpha } from '@mui/material';

function polar(cx, cy, r, deg) {
  const rad = ((deg - 180) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx, cy, r, startDeg, endDeg) {
  const start = polar(cx, cy, r, endDeg);
  const end = polar(cx, cy, r, startDeg);
  const largeArc = endDeg - startDeg <= 180 ? 0 : 1;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}

function formatValue(value, format) {
  if (value == null || Number.isNaN(Number(value))) return '-';
  const num = Number(value);
  if (format === 'currency') {
    return `$${num.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  }
  if (format === 'percent') return `${num.toFixed(1)}%`;
  if (Math.abs(num) >= 1000) return num.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return num.toLocaleString();
}

export default function GaugeKpi({
  data = {},
  label,
  target,
  value,
  format,
  height = 180,
  loading = false,
}) {
  const theme = useTheme();
  if (loading) {
    return <Skeleton variant="rounded" height={height} animation="wave" sx={{ borderRadius: 2 }} />;
  }
  const resolved = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  const finalLabel = label || resolved.label || 'KPI';
  const finalValue = Number(value ?? resolved.value ?? 0);
  const finalTarget = Number(target ?? resolved.target ?? 0);
  const finalFormat = format || resolved.format;

  const ratio = finalTarget > 0 ? Math.max(0, Math.min(1.2, finalValue / finalTarget)) : 0;
  const sweep = Math.min(180, ratio * 180);

  const w = 220;
  const h = 130;
  const cx = w / 2;
  const cy = h - 10;
  const r = 90;

  const trackColor = alpha(theme.palette.divider, 0.6);
  const fillColor =
    ratio >= 1
      ? theme.palette.success.main
      : ratio >= 0.7
        ? theme.palette.primary.main
        : ratio >= 0.4
          ? theme.palette.warning.main
          : theme.palette.error.main;

  return (
    <Box
      sx={{
        width: '100%',
        height,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        py: 1,
      }}
    >
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        <path
          d={arcPath(cx, cy, r, 0, 180)}
          stroke={trackColor}
          strokeWidth={14}
          fill="none"
          strokeLinecap="round"
        />
        {sweep > 0 && (
          <path
            d={arcPath(cx, cy, r, 0, sweep)}
            stroke={fillColor}
            strokeWidth={14}
            fill="none"
            strokeLinecap="round"
          />
        )}
        <text
          x={cx}
          y={cy - 18}
          textAnchor="middle"
          fontSize={24}
          fontWeight={800}
          fill={theme.palette.text.primary}
        >
          {formatValue(finalValue, finalFormat)}
        </text>
        <text
          x={cx}
          y={cy + 2}
          textAnchor="middle"
          fontSize={11}
          fontWeight={600}
          fill={theme.palette.text.secondary}
        >
          {finalTarget > 0 ? `of ${formatValue(finalTarget, finalFormat)} target` : 'no target set'}
        </text>
      </svg>
      <Typography
        variant="caption"
        sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, mt: 0.5 }}
        color="text.secondary"
      >
        {finalLabel}
      </Typography>
    </Box>
  );
}
