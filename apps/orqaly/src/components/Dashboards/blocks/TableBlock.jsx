import { Box, Typography, alpha, useTheme } from '@mui/material';
import BlockShell from '../BlockShell';

function formatVal(v) {
  if (v == null) return '—';
  if (Number.isFinite(Number(v))) {
    const n = Number(v);
    if (Math.abs(n) >= 1000) return n.toLocaleString();
    return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  return String(v);
}

export default function TableBlock({ block, data, onRowClick, ...shellProps }) {
  const theme = useTheme();
  const rows = data?.rows || [];

  if (!rows.length) {
    return (
      <BlockShell title={block?.title || 'Table'} {...shellProps}>
        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Typography variant="caption" color="text.secondary">
            No data for current filters.
          </Typography>
        </Box>
      </BlockShell>
    );
  }

  return (
    <BlockShell title={block?.title || 'Table'} {...shellProps}>
      <Box sx={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
        <Box
          component="table"
          sx={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: 12,
          }}
        >
          <Box component="thead" sx={{ position: 'sticky', top: 0, bgcolor: 'background.paper' }}>
            <tr>
              <Th>{block?.data?.group_by?.field || 'Group'}</Th>
              <Th align="right">{block?.data?.measure?.agg || 'value'}</Th>
              <Th align="right">count</Th>
            </tr>
          </Box>
          <tbody>
            {rows.slice(0, block?.data?.limit || 100).map((r) => (
              <Box
                component="tr"
                key={String(r.group)}
                onClick={() =>
                  onRowClick && onRowClick({ dim: block?.data?.group_by?.field, value: r.group })
                }
                sx={{
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                  cursor: onRowClick ? 'pointer' : 'default',
                  '&:hover': onRowClick
                    ? { bgcolor: alpha(theme.palette.primary.main, 0.04) }
                    : undefined,
                }}
              >
                <Td>{String(r.group)}</Td>
                <Td align="right">{formatVal(r.value)}</Td>
                <Td align="right">{formatVal(r.count)}</Td>
              </Box>
            ))}
          </tbody>
        </Box>
      </Box>
    </BlockShell>
  );
}

function Th({ children, align = 'left' }) {
  return (
    <Box
      component="th"
      sx={{
        textAlign: align,
        fontWeight: 700,
        fontSize: 10,
        textTransform: 'uppercase',
        letterSpacing: 0.4,
        color: 'text.secondary',
        py: 0.75,
        px: 1,
        borderBottom: '1px solid',
        borderColor: 'divider',
      }}
    >
      {children}
    </Box>
  );
}

function Td({ children, align = 'left' }) {
  return (
    <Box component="td" sx={{ textAlign: align, py: 0.75, px: 1, color: 'text.primary' }}>
      {children}
    </Box>
  );
}
