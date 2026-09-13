import { Box, Typography, Button, Chip, alpha } from '@mui/material';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';

import AppIcon from '../../icons/AppIcon';

/**
 * Stacked section inside the Operations tab: title, count chip, preview, view-all link.
 */
export default function OrgOperationsSection({
  title,
  count,
  countLabel,
  onViewAll,
  emptyMessage = 'Nothing here yet',
  children,
}) {
  return (
    <Box sx={{ mb: 3 }}>
      <Box
        sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.25 }}
      >
        <Typography
          variant="caption"
          sx={{
            fontWeight: 800,
            color: 'text.secondary',
            textTransform: 'uppercase',
            letterSpacing: 0.6,
            fontSize: '0.68rem',
          }}
        >
          {title}
        </Typography>
        {onViewAll && (
          <Button
            size="small"
            endIcon={
              <AppIcon name="ArrowForward" fallback={ArrowForwardIcon} sx={{ fontSize: 14 }} />
            }
            onClick={onViewAll}
            sx={{
              textTransform: 'none',
              fontWeight: 700,
              fontSize: '0.72rem',
              minWidth: 0,
              py: 0.25,
            }}
          >
            View all
          </Button>
        )}
      </Box>
      {count != null && (
        <Chip
          label={`${count} ${countLabel || title.toLowerCase()}`}
          size="small"
          sx={{
            mb: 1.25,
            fontWeight: 700,
            fontSize: '0.68rem',
            bgcolor: (t) => alpha(t.palette.primary.main, 0.08),
          }}
        />
      )}
      {children || (
        <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
          {emptyMessage}
        </Typography>
      )}
    </Box>
  );
}
