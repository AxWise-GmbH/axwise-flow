import { useMemo, useState } from 'react';
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  CircularProgress,
} from '@mui/material';

// Generic event table for the observability console. `columns` is a descriptor
// list [{ key, label, render?(row), width? }]; rows are raw source objects.
// Client-side search matches across the whole row (cheap, robust for v1).
export default function EventTable({
  columns,
  rows,
  loading,
  onRowClick,
  emptyText = 'No events',
}) {
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const list = Array.isArray(rows) ? rows : [];
    if (!q.trim()) return list;
    const needle = q.toLowerCase();
    return list.filter((r) => {
      try {
        return JSON.stringify(r).toLowerCase().includes(needle);
      } catch {
        return false;
      }
    });
  }, [rows, q]);

  return (
    <Box>
      <TextField
        size="small"
        fullWidth
        placeholder="Search this tab…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        sx={{ mb: 1 }}
      />
      <TableContainer sx={{ maxHeight: 560 }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              {columns.map((c) => (
                <TableCell
                  key={c.key}
                  sx={{ width: c.width, fontWeight: 700, whiteSpace: 'nowrap' }}
                >
                  {c.label}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={columns.length} align="center" sx={{ py: 3 }}>
                  <CircularProgress size={22} />
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} sx={{ color: 'text.secondary', py: 3 }}>
                  {emptyText}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r, i) => (
                <TableRow
                  key={r.id || i}
                  hover
                  onClick={() => onRowClick?.(r)}
                  sx={{ cursor: onRowClick ? 'pointer' : 'default' }}
                >
                  {columns.map((c) => (
                    <TableCell
                      key={c.key}
                      sx={{
                        whiteSpace: 'nowrap',
                        maxWidth: 320,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {c.render ? c.render(r) : (r[c.key] ?? '—')}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
      {!loading && (
        <Typography variant="caption" sx={{ color: 'text.secondary', mt: 0.5, display: 'block' }}>
          {filtered.length} of {Array.isArray(rows) ? rows.length : 0}
        </Typography>
      )}
    </Box>
  );
}
