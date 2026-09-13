/**
 * IconTile — generic preview tile used when a deliverable has no real
 * image thumbnail (PDFs, markdown docs, code repos, fallback from a
 * failed screenshot load).
 *
 * Renders a large emoji centered on a tinted background, with an
 * optional uppercase label below.
 */
import { Box, Typography, alpha } from '@mui/material';

export default function IconTile({ emoji, label, G }) {
  return (
    <Box
      sx={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 0.3,
        bgcolor: alpha(G, 0.08),
      }}
    >
      <Box sx={{ fontSize: '1.8rem', lineHeight: 1 }}>{emoji}</Box>
      {label && (
        <Typography
          sx={{
            fontSize: '0.55rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: alpha(G, 0.7),
          }}
        >
          {label}
        </Typography>
      )}
    </Box>
  );
}
