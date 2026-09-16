import {
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Box,
  Stack,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  alpha,
  useTheme,
} from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { AxwiseCallSections } from '../Layout/AxwiseCallDetail';

const SOURCE_TITLE = {
  axwise: 'AxWise call',
  llm: 'LLM call',
  goals: 'Goal event',
  consilium: 'Consilium evaluation',
};

function humanize(k) {
  return k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
function scalar(v) {
  if (v == null) return '—';
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (typeof v === 'number') return String(v);
  return String(v);
}

// Flat key/value list for the scalar (non-object) fields of a row.
function KeyValues({ row }) {
  const entries = Object.entries(row).filter(([, v]) => v == null || typeof v !== 'object');
  return (
    <Box>
      {entries.map(([k, v]) => (
        <Stack key={k} direction="row" spacing={1} sx={{ py: 0.3 }}>
          <Typography
            variant="caption"
            sx={{ minWidth: 150, fontWeight: 700, color: 'text.secondary', flexShrink: 0 }}
          >
            {humanize(k)}
          </Typography>
          <Typography variant="caption" sx={{ wordBreak: 'break-word' }}>
            {scalar(v)}
          </Typography>
        </Stack>
      ))}
    </Box>
  );
}

// Per-member votes table for a Consilium evaluation's member_responses.
function ConsiliumMembers({ members }) {
  if (!Array.isArray(members) || members.length === 0) return null;
  return (
    <Box sx={{ mt: 1.5 }}>
      <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
        Member votes
      </Typography>
      <Table size="small">
        <TableHead>
          <TableRow>
            {['Member', 'Role', 'Model', 'Score', 'Approved', 'Feedback'].map((h) => (
              <TableCell key={h} sx={{ fontWeight: 700 }}>
                {h}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {members.map((m, i) => (
            <TableRow key={m.memberId || i}>
              <TableCell>{m.memberName ?? '—'}</TableCell>
              <TableCell>{m.role ?? '—'}</TableCell>
              <TableCell>{m.model ?? '—'}</TableCell>
              <TableCell>{m.overallScore ?? m.score ?? '—'}</TableCell>
              <TableCell>{m.approved == null ? '—' : m.approved ? 'yes' : 'no'}</TableCell>
              <TableCell sx={{ maxWidth: 280, whiteSpace: 'normal' }}>
                {m.feedback ?? m.summary ?? '—'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}

// Per-row detail dialog for any observability source. AxWise gets the curated
// Endpoint/Request/Response/Applied/Meta sections; other sources get a humanized
// key/value list (+ Consilium member votes) and a raw-JSON snapshot.
export default function EventDetail({ source, row, onClose }) {
  const theme = useTheme();
  const codeSx = {
    mt: 1.5,
    p: 1.5,
    borderRadius: 1,
    bgcolor: alpha(theme.palette.common.black, 0.35),
    fontFamily: 'monospace',
    fontSize: '0.72rem',
    whiteSpace: 'pre-wrap',
    maxHeight: 340,
    overflow: 'auto',
  };

  return (
    <Dialog open={!!row} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>{SOURCE_TITLE[source] || 'Event'} detail</span>
        <IconButton onClick={onClose} size="small" aria-label="Close">
          <CloseRoundedIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {!row ? null : source === 'axwise' ? (
          <AxwiseCallSections row={row} />
        ) : (
          <>
            <KeyValues row={row} />
            {source === 'consilium' && <ConsiliumMembers members={row.member_responses} />}
            <Box sx={codeSx}>{JSON.stringify(row, null, 2)}</Box>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
