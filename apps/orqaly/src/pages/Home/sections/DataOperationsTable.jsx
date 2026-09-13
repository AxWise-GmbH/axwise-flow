import { useState } from 'react';
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
  Chip,
  Skeleton,
  useTheme,
  alpha,
} from '@mui/material';
import { ActionChip } from './opsChips';
import useInView from '../../../components/Common/useInView';
import { staggerSx } from '../../../components/Common/stagger';
import KBDocumentViewDialog from '../../../components/KnowledgeBase/KBDocumentViewDialog';

/** Agent cell: "Name (position)" — clickable when the agent resolves to an id. */
function AgentCell({ row, onAgentClick }) {
  const theme = useTheme();
  const name = row.agentName || '';
  const position = row.agentPosition || '';
  if (!name) {
    return (
      <Typography variant="body2" sx={{ fontSize: '0.8rem', color: 'text.disabled' }}>
        —
      </Typography>
    );
  }
  const clickable = typeof onAgentClick === 'function' && row.agentId;
  const label = (
    <>
      {name}
      {position && (
        <Box component="span" sx={{ color: 'text.secondary', fontWeight: 400 }}>
          {' '}
          ({position})
        </Box>
      )}
    </>
  );
  if (!clickable) {
    return (
      <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 600 }}>
        {label}
      </Typography>
    );
  }
  return (
    <Box
      component="button"
      type="button"
      onClick={() => onAgentClick(row)}
      title={`View ${name}`}
      sx={{
        font: 'inherit',
        p: 0,
        border: 0,
        background: 'none',
        cursor: 'pointer',
        textAlign: 'left',
        fontSize: '0.8rem',
        fontWeight: 700,
        color: theme.palette.primary.main,
        '&:hover': { textDecoration: 'underline' },
        '&:focus-visible': {
          outline: `2px solid ${theme.palette.primary.main}`,
          outlineOffset: 2,
          borderRadius: 4,
        },
      }}
    >
      {label}
    </Box>
  );
}

/**
 * Recent knowledge-base operations. Polished, production-ready table: color-coded
 * action chips, a clickable agent (Name (position)) that opens the agent card,
 * and a horizontally scrollable layout so columns never clip.
 */
export default function DataOperationsTable({ rows = [], loading = false, onAgentClick }) {
  const theme = useTheme();
  const [bodyRef, inView] = useInView();
  // Clicking a row's Name or Type opens the full Knowledge Base document.
  const [docId, setDocId] = useState(null);
  const openDoc = (row) => {
    if (row._id) setDocId(row._id);
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, py: 0.5 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} variant="rounded" height={40} animation="wave" />
        ))}
      </Box>
    );
  }

  if (!rows.length) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
        No knowledge base operations yet.
      </Typography>
    );
  }

  const headSx = {
    fontWeight: 700,
    fontSize: '0.68rem',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: 'text.secondary',
    borderBottom: '1px solid',
    borderColor: 'divider',
    py: 1,
    bgcolor: 'background.paper',
  };

  return (
    <>
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'auto',
          '&::-webkit-scrollbar': { width: 6, height: 6 },
          '&::-webkit-scrollbar-thumb': {
            bgcolor: alpha(theme.palette.primary.main, 0.3),
            borderRadius: 3,
          },
        }}
      >
        <Table size="small" stickyHeader sx={{ minWidth: 680 }}>
          <TableHead>
            <TableRow>
              <TableCell sx={headSx}>Type</TableCell>
              <TableCell sx={headSx}>Name</TableCell>
              <TableCell sx={headSx}>Action</TableCell>
              <TableCell sx={headSx}>Agent</TableCell>
              <TableCell sx={headSx}>User</TableCell>
              <TableCell sx={{ ...headSx, whiteSpace: 'nowrap' }} align="right">
                Date
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody ref={bodyRef}>
            {rows.map((row, i) => (
              <TableRow
                key={row.id || i}
                sx={{
                  '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.04) },
                  '& td': { borderColor: 'divider' },
                  ...staggerSx(i, inView),
                }}
              >
                <TableCell>
                  <Chip
                    label={row.type || '-'}
                    size="small"
                    variant="outlined"
                    onClick={row._id ? () => openDoc(row) : undefined}
                    sx={{
                      height: 22,
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      ...(row._id && { cursor: 'pointer' }),
                    }}
                  />
                </TableCell>
                <TableCell sx={{ maxWidth: 220 }}>
                  <Typography
                    variant="body2"
                    onClick={row._id ? () => openDoc(row) : undefined}
                    sx={{
                      fontSize: '0.8rem',
                      fontWeight: 500,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      ...(row._id && {
                        cursor: 'pointer',
                        '&:hover': { color: 'primary.main', textDecoration: 'underline' },
                      }),
                    }}
                    title={row.name}
                  >
                    {row.name || '—'}
                  </Typography>
                </TableCell>
                <TableCell>
                  <ActionChip action={row.action} />
                </TableCell>
                <TableCell sx={{ maxWidth: 220 }}>
                  <AgentCell row={row} onAgentClick={onAgentClick} />
                </TableCell>
                <TableCell sx={{ maxWidth: 200 }}>
                  <Typography
                    variant="body2"
                    sx={{
                      fontSize: '0.78rem',
                      color: 'text.secondary',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={row.user}
                  >
                    {row.user || '—'}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography
                    variant="caption"
                    sx={{
                      color: 'text.secondary',
                      whiteSpace: 'pre-line',
                      fontVariantNumeric: 'tabular-nums',
                      lineHeight: 1.25,
                    }}
                  >
                    {row.date || '—'}
                  </Typography>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
      <KBDocumentViewDialog
        open={Boolean(docId)}
        doc={docId ? { id: docId } : null}
        onClose={() => setDocId(null)}
      />
    </>
  );
}
