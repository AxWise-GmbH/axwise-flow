import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
  Skeleton,
  useTheme,
  useMediaQuery,
  alpha,
} from '@mui/material';
import { ActionChip, InstrumentChip } from './opsChips';
import useInView from '../../../components/Common/useInView';
import { staggerSx } from '../../../components/Common/stagger';

/** Persona cell: "Name (position)" — clickable when the actor is a resolvable agent. */
function PersonaCell({ row, onPersonaClick }) {
  const theme = useTheme();
  const name = row.personaName || '—';
  const position = row.personaPosition || '';
  const clickable = typeof onPersonaClick === 'function' && row.agentId;
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
      <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 600 }} noWrap>
        {label}
      </Typography>
    );
  }
  return (
    <Box
      component="button"
      type="button"
      onClick={() => onPersonaClick(row)}
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
 * Recent operations across instruments — Persona / Instrument / Action / Date.
 * Table on desktop, card list on phones. Real data from the activity (audit) log.
 */
export default function ActivityTable({ rows = [], loading = false, onPersonaClick }) {
  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down('sm'));
  const [bodyRef, inView] = useInView();

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
        No activity recorded yet.
      </Typography>
    );
  }

  // ── Mobile: card list ──
  if (isPhone) {
    return (
      <Box
        ref={bodyRef}
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
        }}
      >
        {rows.map((row, i) => (
          <Box
            key={row.id || i}
            sx={{
              p: 1.25,
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'divider',
              bgcolor: alpha(theme.palette.primary.main, 0.04),
              ...staggerSx(i, inView),
            }}
          >
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 1,
                mb: 0.75,
              }}
            >
              <Box sx={{ minWidth: 0 }}>
                <PersonaCell row={row} onPersonaClick={onPersonaClick} />
              </Box>
              <ActionChip action={row.action} />
            </Box>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 1,
              }}
            >
              <InstrumentChip instrument={row.instrument} />
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
            </Box>
          </Box>
        ))}
      </Box>
    );
  }

  // ── Desktop: table ──
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
      <Table size="small" stickyHeader sx={{ minWidth: 480 }}>
        <TableHead>
          <TableRow>
            <TableCell sx={headSx}>Persona</TableCell>
            <TableCell sx={headSx}>Instrument</TableCell>
            <TableCell sx={headSx}>Action</TableCell>
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
              <TableCell sx={{ maxWidth: 220 }}>
                <PersonaCell row={row} onPersonaClick={onPersonaClick} />
              </TableCell>
              <TableCell>
                <InstrumentChip instrument={row.instrument} />
              </TableCell>
              <TableCell>
                <ActionChip action={row.action} />
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
  );
}
