import { useMemo } from 'react';
import { Box, Typography, Tooltip, Skeleton, useTheme, alpha } from '@mui/material';

const WEEKS = 14;
const DAYS = 7;
const DAY_LABELS = ['Mon', '', 'Wed', '', 'Fri', '', ''];

function toDayKey(date) {
  return date.toISOString().slice(0, 10);
}

function startOfWeek(date) {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

export default function HeatmapCalendar({
  data = [],
  dateKey = 'date',
  valueKey,
  weeks = WEEKS,
  loading = false,
}) {
  const theme = useTheme();

  const { grid, max } = useMemo(() => {
    const map = new Map();
    let resolvedValueKey = valueKey;
    if (!resolvedValueKey && data.length > 0) {
      resolvedValueKey = Object.keys(data[0]).find(
        (k) => k !== dateKey && typeof data[0][k] === 'number'
      );
    }
    data.forEach((row) => {
      const d = row[dateKey];
      if (!d) return;
      const key = String(d).slice(0, 10);
      map.set(key, (map.get(key) || 0) + (Number(row[resolvedValueKey]) || 0));
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = startOfWeek(today);
    start.setDate(start.getDate() - (weeks - 1) * 7);

    const cells = [];
    let maxVal = 0;
    for (let w = 0; w < weeks; w += 1) {
      const week = [];
      for (let d = 0; d < DAYS; d += 1) {
        const cell = new Date(start);
        cell.setDate(cell.getDate() + w * 7 + d);
        const key = toDayKey(cell);
        const value = map.get(key) || 0;
        if (value > maxVal) maxVal = value;
        week.push({ date: cell, key, value });
      }
      cells.push(week);
    }
    return { grid: cells, max: maxVal };
  }, [data, dateKey, valueKey, weeks]);

  const colorForValue = (value) => {
    if (max === 0 || value === 0) return alpha(theme.palette.divider, 0.4);
    const intensity = Math.min(1, value / max);
    return alpha(theme.palette.primary.main, 0.2 + intensity * 0.8);
  };

  if (loading) {
    return <Skeleton variant="rounded" height={120} animation="wave" sx={{ borderRadius: 2 }} />;
  }

  if (max === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
        No activity recorded in this period.
      </Typography>
    );
  }

  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, overflowX: 'auto', py: 1 }}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateRows: 'repeat(7, 14px)',
          gap: 0.4,
          mr: 0.5,
          flexShrink: 0,
        }}
      >
        {DAY_LABELS.map((label, i) => (
          <Typography
            key={i}
            variant="caption"
            sx={{
              fontSize: 10,
              color: 'text.secondary',
              lineHeight: '14px',
              minWidth: 22,
              textAlign: 'right',
            }}
          >
            {label}
          </Typography>
        ))}
      </Box>
      <Box sx={{ display: 'flex', gap: 0.4 }}>
        {grid.map((week, wi) => (
          <Box key={wi} sx={{ display: 'grid', gridTemplateRows: 'repeat(7, 14px)', gap: 0.4 }}>
            {week.map((cell) => (
              <Tooltip
                key={cell.key}
                title={`${cell.key}: ${cell.value.toLocaleString()}`}
                arrow
                placement="top"
              >
                <Box
                  sx={{
                    width: 14,
                    height: 14,
                    borderRadius: 0.5,
                    bgcolor: colorForValue(cell.value),
                    transition: 'transform 0.15s',
                    cursor: 'default',
                    '&:hover': { transform: 'scale(1.2)' },
                  }}
                />
              </Tooltip>
            ))}
          </Box>
        ))}
      </Box>
      <Box
        sx={{
          ml: 'auto',
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          flexShrink: 0,
          alignSelf: 'flex-end',
        }}
      >
        <Typography variant="caption" sx={{ fontSize: 10, color: 'text.secondary' }}>
          Less
        </Typography>
        {[0, 0.25, 0.5, 0.75, 1].map((step) => (
          <Box
            key={step}
            sx={{
              width: 12,
              height: 12,
              borderRadius: 0.5,
              bgcolor:
                step === 0
                  ? alpha(theme.palette.divider, 0.4)
                  : alpha(theme.palette.primary.main, 0.2 + step * 0.8),
            }}
          />
        ))}
        <Typography variant="caption" sx={{ fontSize: 10, color: 'text.secondary' }}>
          More
        </Typography>
      </Box>
    </Box>
  );
}
