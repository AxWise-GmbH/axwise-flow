import { Button, alpha } from '@mui/material';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useTheme } from '@mui/material/styles';

import AppIcon from '../icons/AppIcon';

/**
 * Toggle button for the metrics panel. Use with useShowMetrics hook.
 */
export default function MetricsToggleButton({ showMetrics, onToggle }) {
  const theme = useTheme();
  return (
    <Button
      variant="outlined"
      size="small"
      color="inherit"
      onClick={onToggle}
      aria-expanded={showMetrics}
      startIcon={
        showMetrics ? (
          <AppIcon name="VisibilityOutlined" fallback={VisibilityOutlinedIcon} />
        ) : (
          <AppIcon
            name="VisibilityOutlined"
            fallback={VisibilityOutlinedIcon}
            sx={{ opacity: 0.5 }}
          />
        )
      }
      endIcon={
        showMetrics ? (
          <AppIcon name="ExpandLess" fallback={ExpandLessIcon} />
        ) : (
          <AppIcon name="ExpandMore" fallback={ExpandMoreIcon} />
        )
      }
      sx={{
        borderRadius: 2,
        textTransform: 'none',
        fontWeight: 600,
        borderColor: 'divider',
        color: 'text.secondary',
        '&:hover': {
          bgcolor: alpha(theme.palette.text.primary, 0.04),
          borderColor: alpha(theme.palette.text.primary, 0.2),
        },
      }}
    >
      Metrics
    </Button>
  );
}
