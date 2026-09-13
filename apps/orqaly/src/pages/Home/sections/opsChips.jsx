import { Chip, useTheme, alpha } from '@mui/material';

// Action -> theme palette key (color-coded chips), shared by Data Operations + Activity.
const ACTION_PALETTE = {
  create: 'success',
  write: 'info',
  read: 'secondary',
  delete: 'error',
};

export function ActionChip({ action }) {
  const theme = useTheme();
  const key = ACTION_PALETTE[String(action || '').toLowerCase()] || 'secondary';
  const base = theme.palette[key]?.main || theme.palette.text.secondary;
  return (
    <Chip
      label={action || '-'}
      size="small"
      sx={{
        height: 22,
        fontSize: '0.68rem',
        fontWeight: 700,
        textTransform: 'capitalize',
        color: base,
        bgcolor: alpha(base, 0.14),
        border: '1px solid',
        borderColor: alpha(base, 0.3),
      }}
    />
  );
}

// Instrument -> theme palette key (subtle outlined chip).
const INSTRUMENT_PALETTE = {
  Knowledge: 'primary',
  Workflow: 'info',
  Tasks: 'warning',
  Projects: 'secondary',
  Reports: 'success',
};

export function InstrumentChip({ instrument }) {
  const theme = useTheme();
  const key = INSTRUMENT_PALETTE[instrument] || 'secondary';
  const base = theme.palette[key]?.main || theme.palette.text.secondary;
  return (
    <Chip
      label={instrument || '-'}
      size="small"
      variant="outlined"
      sx={{
        height: 22,
        fontSize: '0.7rem',
        fontWeight: 600,
        color: base,
        borderColor: alpha(base, 0.4),
        bgcolor: alpha(base, 0.06),
      }}
    />
  );
}
