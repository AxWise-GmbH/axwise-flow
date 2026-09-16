/**
 * GroupHeader — tiny uppercase label + icon used at the top of every
 * deliverable group. Optional "· N items" suffix when count > 1.
 *
 * Supports both:
 *   glassIconName — string name for GlassIcon (preferred, glassmorphism).
 *   icon — legacy emoji string or React node (fallback).
 */
import { Box, Typography, alpha } from '@mui/material';
import GlassIcon from '../../icons/GlassIcon';

export default function GroupHeader({ icon, label, count, G, glassIconName }) {
  const iconElement = glassIconName ? (
    <GlassIcon name={glassIconName} size={14} tone="brand" />
  ) : icon ? (
    <Box component="span" sx={{ fontSize: '0.85rem' }}>
      {icon}
    </Box>
  ) : null;

  return (
    <Typography
      sx={{
        fontSize: '0.62rem',
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: alpha(G, 0.75),
        mb: 0.5,
        display: 'flex',
        alignItems: 'center',
        gap: 0.75,
      }}
    >
      {iconElement}
      {label}
      {typeof count === 'number' && count > 1 && (
        <Box component="span" sx={{ color: alpha(G, 0.5), fontWeight: 500 }}>
          · {count} items
        </Box>
      )}
    </Typography>
  );
}
