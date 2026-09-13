import { memo, useState, useMemo } from 'react';
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Typography,
  Chip,
  Skeleton,
  LinearProgress,
  alpha,
  useTheme,
  keyframes,
} from '@mui/material';

// Subtle pulse for the active phase segment in the phase indicator.
const phasePulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
`;

function formatCell(value) {
  if (value == null) return '-';
  if (typeof value === 'number') {
    if (Math.abs(value) >= 1000)
      return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
    if (value % 1 !== 0) return value.toFixed(1);
    return value.toString();
  }
  return String(value);
}

const STATUS_COLORS = {
  Active: 'success',
  Paused: 'warning',
  'At Risk': 'error',
  Overdue: 'error',
  Completed: 'info',
  Done: 'info',
};

function isProgressShape(val) {
  return (
    val &&
    typeof val === 'object' &&
    !Array.isArray(val) &&
    typeof val.value === 'number' &&
    typeof val.max === 'number'
  );
}

// A phase indicator: { current, total, title? } -> segmented line + "N/M".
function isPhaseShape(val) {
  return (
    val &&
    typeof val === 'object' &&
    !Array.isArray(val) &&
    typeof val.current === 'number' &&
    typeof val.total === 'number'
  );
}

function RankedTable({
  data = [],
  maxRows = 10,
  loading = false,
  onRowClick,
  rowSx,
  maxHeight = 400,
  showRank = true,
  columnMeta = {},
}) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('desc');

  // Keys starting with "_" are hidden row metadata (e.g. _id for row clicks),
  // not display columns.
  const columns =
    data && data.length > 0 ? Object.keys(data[0]).filter((k) => !k.startsWith('_')) : [];

  const sorted = useMemo(() => {
    if (!data) return [];
    const items = [...data];
    if (sortKey) {
      items.sort((a, b) => {
        const rawA = a[sortKey];
        const rawB = b[sortKey];
        const pick = (v) => (isProgressShape(v) ? v.value : isPhaseShape(v) ? v.current : v);
        const aVal = pick(rawA);
        const bVal = pick(rawB);
        if (typeof aVal === 'number' && typeof bVal === 'number')
          return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
        return sortDir === 'asc'
          ? String(aVal).localeCompare(String(bVal))
          : String(bVal).localeCompare(String(aVal));
      });
    }
    return items.slice(0, maxRows);
  }, [data, sortKey, sortDir, maxRows]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, py: 1 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} variant="rounded" height={36} animation="wave" />
        ))}
      </Box>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
        No data available.
      </Typography>
    );
  }

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const headerBg = isDark
    ? alpha(theme.palette.background.paper, 0.9)
    : theme.palette.background.paper;

  return (
    <TableContainer sx={{ maxHeight, minHeight: 0, ...(maxHeight === '100%' ? { flex: 1 } : {}) }}>
      <Table
        size="small"
        stickyHeader
        sx={Object.keys(columnMeta).length ? { tableLayout: 'fixed' } : undefined}
      >
        <TableHead>
          <TableRow>
            {showRank && (
              <TableCell
                sx={{
                  fontWeight: 700,
                  width: 40,
                  bgcolor: headerBg,
                  position: 'sticky',
                  left: 0,
                  zIndex: 3,
                }}
              >
                #
              </TableCell>
            )}
            {columns.map((col, idx) => (
              <TableCell
                key={col}
                sx={{
                  fontWeight: 700,
                  textTransform: 'capitalize',
                  bgcolor: headerBg,
                  ...(columnMeta[col]?.width != null && { width: columnMeta[col].width }),
                  ...(columnMeta[col]?.px != null && { px: columnMeta[col].px }),
                  ...(idx === 0 && {
                    position: 'sticky',
                    left: showRank ? 40 : 0,
                    zIndex: 3,
                  }),
                }}
              >
                <TableSortLabel
                  active={sortKey === col}
                  direction={sortKey === col ? sortDir : 'desc'}
                  onClick={() => handleSort(col)}
                >
                  {col.replace(/([A-Z])/g, ' $1').trim()}
                </TableSortLabel>
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {sorted.map((row, idx) => {
            const clickable = Boolean(onRowClick);
            return (
              <TableRow
                key={idx}
                hover
                onClick={clickable ? () => onRowClick(row) : undefined}
                sx={{
                  cursor: clickable ? 'pointer' : 'default',
                  '&:hover': clickable
                    ? { bgcolor: `${alpha(theme.palette.primary.main, 0.06)} !important` }
                    : {},
                  ...(rowSx ? rowSx(idx) : null),
                }}
              >
                {showRank && (
                  <TableCell
                    sx={{
                      position: 'sticky',
                      left: 0,
                      zIndex: 1,
                      bgcolor: isDark
                        ? alpha(theme.palette.background.paper, 0.92)
                        : theme.palette.background.paper,
                    }}
                  >
                    <Typography
                      variant="caption"
                      sx={{ fontWeight: 700, color: idx < 3 ? 'primary.main' : 'text.secondary' }}
                    >
                      {idx + 1}
                    </Typography>
                  </TableCell>
                )}
                {columns.map((col, colIdx) => {
                  const raw = row[col];
                  const stickyFirst = colIdx === 0;
                  const meta = columnMeta[col] || {};
                  const cellSx = {
                    ...(stickyFirst
                      ? {
                          position: 'sticky',
                          left: showRank ? 40 : 0,
                          zIndex: 1,
                          bgcolor: isDark
                            ? alpha(theme.palette.background.paper, 0.92)
                            : theme.palette.background.paper,
                        }
                      : {}),
                    ...(meta.width != null && { width: meta.width }),
                    ...(meta.whiteSpace && { whiteSpace: meta.whiteSpace }),
                    ...(meta.verticalAlign && { verticalAlign: meta.verticalAlign }),
                    ...(meta.px != null && { px: meta.px }),
                  };
                  if (col === 'status' || col === 'funnelStatus') {
                    // Status may be a plain string (mapped via STATUS_COLORS) or a
                    // { label, color } object that carries its own MUI chip color.
                    const isObj = raw && typeof raw === 'object' && !Array.isArray(raw);
                    const label = isObj ? (raw.label ?? '-') : raw || '-';
                    const color = isObj ? raw.color || 'default' : STATUS_COLORS[raw] || 'default';
                    return (
                      <TableCell key={col} sx={cellSx}>
                        <Chip
                          label={label}
                          size="small"
                          color={color}
                          variant="outlined"
                          sx={{ fontWeight: 600, fontSize: '0.7rem' }}
                        />
                      </TableCell>
                    );
                  }
                  if (isPhaseShape(raw)) {
                    // `current` = completed segments (0..total); optional `active`
                    // pulses the in-progress segment. Shows the real "done/total".
                    const total = Math.max(0, raw.total);
                    const done = Math.min(Math.max(0, raw.current), total);
                    const showActive = Boolean(raw.active) && done < total;
                    return (
                      <TableCell key={col} sx={{ minWidth: 120, ...cellSx }}>
                        <Box
                          title={raw.title || `${done} of ${total}`}
                          sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                        >
                          <Box sx={{ display: 'flex', gap: 0.5, flex: 1, minWidth: 48 }}>
                            {Array.from({ length: total }).map((_, i) => {
                              const isDone = i < done;
                              const isActive = showActive && i === done;
                              return (
                                <Box
                                  key={i}
                                  sx={{
                                    flex: 1,
                                    height: 4,
                                    minWidth: 6,
                                    borderRadius: 2,
                                    bgcolor: isDone
                                      ? 'success.main'
                                      : isActive
                                        ? 'success.light'
                                        : alpha(theme.palette.text.primary, 0.14),
                                    ...(isActive && {
                                      animation: `${phasePulse} 1.5s ease-in-out infinite`,
                                    }),
                                  }}
                                />
                              );
                            })}
                          </Box>
                          <Typography
                            variant="caption"
                            sx={{ fontWeight: 700, minWidth: 30, color: 'text.secondary' }}
                          >
                            {done}/{total}
                          </Typography>
                        </Box>
                      </TableCell>
                    );
                  }
                  if (isProgressShape(raw)) {
                    const pct = raw.max > 0 ? Math.min(100, (raw.value / raw.max) * 100) : 0;
                    return (
                      <TableCell key={col} sx={{ minWidth: 140, ...cellSx }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <LinearProgress
                            variant="determinate"
                            value={pct}
                            sx={{
                              flex: 1,
                              height: 6,
                              borderRadius: 3,
                              bgcolor: alpha(theme.palette.divider, 0.5),
                            }}
                          />
                          <Typography variant="caption" sx={{ fontWeight: 700, minWidth: 36 }}>
                            {formatCell(raw.value)}
                          </Typography>
                        </Box>
                      </TableCell>
                    );
                  }
                  return (
                    <TableCell key={col} sx={cellSx}>
                      <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                        {formatCell(raw)}
                      </Typography>
                    </TableCell>
                  );
                })}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

export default memo(RankedTable);
