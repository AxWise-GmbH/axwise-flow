import { Typography } from '@mui/material';

/**
 * Derives a human-friendly message from (status, elapsedMs). Pure; no effects.
 * Used by ReplicatorPhaseCard to show what the request is doing right now.
 */
export function tickerMessage(status, elapsedMs) {
  if (status === 'idle') return '';
  if (status === 'validating') return 'Validating input…';
  if (status === 'in_flight') {
    if (elapsedMs < 200) return 'Sending request…';
    if (elapsedMs < 800) return 'Waiting on response…';
    return `Waiting on response… (${(elapsedMs / 1000).toFixed(1)}s)`;
  }
  if (status === 'success') return 'Received response - rendering result.';
  if (status === 'timeout') return 'Timed out before the server responded.';
  if (status === 'cancelled') return 'Cancelled.';
  if (status === 'error') return 'Request failed.';
  return '';
}

export default function PhaseStatusTicker({ status, elapsedMs = 0 }) {
  const msg = tickerMessage(status, elapsedMs);
  if (!msg) return null;
  const color =
    status === 'error' || status === 'timeout'
      ? 'error.main'
      : status === 'cancelled'
        ? 'text.secondary'
        : 'text.secondary';
  return (
    <Typography variant="caption" sx={{ color, fontStyle: 'italic' }}>
      {msg}
    </Typography>
  );
}
