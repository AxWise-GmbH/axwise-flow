import {
  Table,
  TableBody,
  TableContainer,
  TableCell,
  TableHead,
  TableRow,
  useTheme,
} from '@mui/material';
import { alpha } from '@mui/material/styles';

/**
 * Consistent table shell for documentation data.
 *   head     - array of column labels (string) or { label, align }.
 *   children - the TableRow elements that make up the body.
 * The header style lives here once, so sections never re-declare headerCellSx.
 */
export default function DocTable({ head = [], children, minWidth, size = 'small' }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const headerCellSx = {
    fontWeight: 700,
    fontSize: '0.72rem',
    letterSpacing: '0.03em',
    textTransform: 'uppercase',
    bgcolor: isDark ? alpha(theme.palette.background.default, 0.8) : 'action.hover',
    borderBottom: '1px solid',
    borderColor: 'divider',
    py: 1,
    whiteSpace: 'nowrap',
  };
  return (
    <TableContainer sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
      <Table size={size} sx={minWidth ? { minWidth } : undefined}>
        <TableHead>
          <TableRow>
            {head.map((h, i) => {
              const label = typeof h === 'string' ? h : h.label;
              const align = typeof h === 'object' ? h.align : undefined;
              return (
                <TableCell key={i} align={align} sx={headerCellSx}>
                  {label}
                </TableCell>
              );
            })}
          </TableRow>
        </TableHead>
        <TableBody>{children}</TableBody>
      </Table>
    </TableContainer>
  );
}
