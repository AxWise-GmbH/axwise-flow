/**
 * Small presentational helpers shared across the Assistant Console cards.
 * Pure UI, no data fetching.
 */
import { Box, Button, Typography, alpha, useTheme } from '@mui/material';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';

import AppIcon from '../../../components/icons/AppIcon';

/** Ghost "Edit" button shown in a card header; opens the setup wizard step. */
export function EditButton({ onClick, label = 'Edit' }) {
  return (
    <Button
      size="small"
      onClick={onClick}
      startIcon={<AppIcon name="EditOutlined" fallback={EditOutlinedIcon} sx={{ fontSize: 16 }} />}
      sx={{
        textTransform: 'none',
        fontWeight: 700,
        color: 'text.secondary',
        '&:hover': { color: 'primary.main', bgcolor: 'transparent' },
      }}
    >
      {label}
    </Button>
  );
}

/** Bordered value pill used for provider / model / tone. */
export function ValueChip({ label, icon: Icon }) {
  const theme = useTheme();
  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.75,
        px: 1.25,
        py: 0.6,
        borderRadius: 1.5,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: alpha(theme.palette.primary.main, 0.06),
        fontWeight: 700,
        fontSize: '0.85rem',
        whiteSpace: 'nowrap',
      }}
    >
      {Icon && <Icon sx={{ fontSize: 18 }} />}
      {label}
    </Box>
  );
}

/** Small glowing status dot (defaults to success/green). */
export function StatusDot({ color }) {
  const theme = useTheme();
  const c = color || theme.palette.success.main;
  return (
    <Box
      component="span"
      sx={{
        width: 8,
        height: 8,
        borderRadius: '50%',
        bgcolor: c,
        flexShrink: 0,
        boxShadow: `0 0 6px ${alpha(c, 0.7)}`,
      }}
    />
  );
}

/** Uppercase micro-label above a value. */
export function SectionLabel({ children }) {
  return (
    <Typography
      variant="caption"
      sx={{
        color: 'text.secondary',
        fontWeight: 700,
        letterSpacing: 0.5,
        textTransform: 'uppercase',
        fontSize: '0.62rem',
        display: 'block',
      }}
    >
      {children}
    </Typography>
  );
}
