import { Box, IconButton, Tooltip } from '@mui/material';
import HelpOutlineRoundedIcon from '@mui/icons-material/HelpOutlineRounded';
import FilterButton from '../../../components/Common/FilterButton';

import AppIcon from '../../../components/icons/AppIcon';

/**
 * Home header: the filter (left) and an icon-only "Explain?" trigger (right).
 * Rendered into PageLayout's `action` slot. The filter opens the consolidated
 * Filters & Layout dialog; the (?) launches the in-page guided tour.
 */
export default function HomeHeader({ onOpenFilters, onExplain, activeFilterCount = 0 }) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 1.25,
        width: '100%',
      }}
    >
      <FilterButton onClick={onOpenFilters} count={activeFilterCount} tooltip="Filters & layout" />
      {onExplain && (
        <Tooltip title="Explain" arrow>
          <IconButton
            onClick={onExplain}
            aria-label="Explain"
            sx={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              border: '1px solid',
              borderColor: 'divider',
              color: 'text.secondary',
              '&:hover': { borderColor: 'primary.main', color: 'primary.main' },
            }}
          >
            <AppIcon
              name="HelpOutlineRounded"
              fallback={HelpOutlineRoundedIcon}
              sx={{ fontSize: 18 }}
            />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
}
