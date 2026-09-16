import { Box } from '@mui/material';

/**
 * Bar chart icon for priority indication (high/medium/low bars).
 */
export default function PriorityBarsIcon({ color = '#64748B', sx = {} }) {
  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'flex-end', gap: '1px', mr: 0.35, ...sx }}>
      <Box sx={{ width: 2, height: 5, borderRadius: 0.25, bgcolor: color, opacity: 0.75 }} />
      <Box sx={{ width: 2, height: 7, borderRadius: 0.25, bgcolor: color, opacity: 0.9 }} />
      <Box sx={{ width: 2, height: 9, borderRadius: 0.25, bgcolor: color }} />
    </Box>
  );
}
