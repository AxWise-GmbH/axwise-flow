import { Paper, Typography, Box, alpha } from '@mui/material';

/**
 * Clickable metric launcher tile — count + label, navigates via onClick.
 */
export default function OrgMetricTile({ label, value, color, icon: Icon, onClick }) {
  return (
    <Paper
      elevation={0}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      sx={{
        p: 1.25,
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'divider',
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        cursor: onClick ? 'pointer' : 'default',
        '&:hover': onClick ? { borderColor: alpha(color, 0.4) } : undefined,
      }}
    >
      {Icon && <Icon sx={{ fontSize: 18, color }} />}
      <Box>
        <Typography sx={{ fontSize: '0.75rem', fontWeight: 600 }}>{label}</Typography>
        <Typography sx={{ fontSize: '0.85rem', fontWeight: 800, color }}>{value}</Typography>
      </Box>
    </Paper>
  );
}
