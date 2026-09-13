import { Button } from '@mui/material';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';

import AppIcon from '../../../components/icons/AppIcon';

/** Compact "View all (N)" link used in panel headers. */
export default function ViewAllButton({ count, onClick, label = 'View all' }) {
  return (
    <Button
      size="small"
      onClick={onClick}
      endIcon={<AppIcon name="ArrowForward" fallback={ArrowForwardIcon} sx={{ fontSize: 14 }} />}
      sx={{ fontSize: '0.72rem', fontWeight: 700, px: 1, py: 0.25, minWidth: 0 }}
    >
      {count != null ? `${label} (${count})` : label}
    </Button>
  );
}
