import { useMemo } from 'react';
import { Box, Typography, Skeleton, useTheme, alpha } from '@mui/material';

export default function FunnelChart({
  data = [],
  stageKey = 'status',
  valueKey = 'count',
  height = 280,
  loading = false,
}) {
  const theme = useTheme();

  const rows = useMemo(() => {
    if (!Array.isArray(data) || data.length === 0) return [];
    const sorted = [...data].sort(
      (a, b) => (Number(b[valueKey]) || 0) - (Number(a[valueKey]) || 0)
    );
    const max = Math.max(...sorted.map((r) => Number(r[valueKey]) || 0)) || 1;
    return sorted.map((row, idx) => {
      const value = Number(row[valueKey]) || 0;
      const widthPct = (value / max) * 100;
      const prevValue = idx > 0 ? Number(sorted[idx - 1][valueKey]) || 0 : null;
      const dropOff = prevValue && prevValue > 0 ? ((prevValue - value) / prevValue) * 100 : null;
      return { stage: row[stageKey], value, widthPct, dropOff };
    });
  }, [data, stageKey, valueKey]);

  if (loading) {
    return <Skeleton variant="rounded" height={height} animation="wave" sx={{ borderRadius: 2 }} />;
  }

  if (rows.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
        No funnel data available.
      </Typography>
    );
  }

  const COLORS = [
    theme.palette.primary.main,
    theme.palette.info.main,
    theme.palette.success.main,
    theme.palette.warning.main,
    theme.palette.error.main,
  ];

  return (
    <Box
      sx={{
        width: '100%',
        height,
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        justifyContent: 'center',
      }}
    >
      {rows.map((row, i) => {
        const color = COLORS[i % COLORS.length];
        return (
          <Box key={row.stage || i}>
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                mb: 0.25,
              }}
            >
              <Typography variant="caption" sx={{ fontWeight: 600 }}>
                {row.stage || `Stage ${i + 1}`}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                {row.dropOff != null && row.dropOff > 0 && (
                  <Typography variant="caption" sx={{ color: 'error.main', fontWeight: 600 }}>
                    -{row.dropOff.toFixed(0)}%
                  </Typography>
                )}
                <Typography variant="caption" sx={{ fontWeight: 700 }}>
                  {row.value.toLocaleString()}
                </Typography>
              </Box>
            </Box>
            <Box
              sx={{
                width: '100%',
                height: 22,
                bgcolor: alpha(theme.palette.divider, 0.3),
                borderRadius: 1,
                overflow: 'hidden',
              }}
            >
              <Box
                sx={{
                  width: `${row.widthPct}%`,
                  height: '100%',
                  bgcolor: color,
                  background: `linear-gradient(90deg, ${color} 0%, ${alpha(color, 0.7)} 100%)`,
                  borderRadius: 1,
                  transition: 'width 0.4s ease',
                }}
              />
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
