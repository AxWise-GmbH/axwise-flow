import { Typography } from '@mui/material';

/** The uppercase strip label the platform puts above a list or table. */
export default function ArenaSectionLabel({ children, sx }) {
  return (
    <Typography
      variant="caption"
      sx={{
        fontWeight: 800,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'text.secondary',
        display: 'block',
        ...sx,
      }}
    >
      {children}
    </Typography>
  );
}
