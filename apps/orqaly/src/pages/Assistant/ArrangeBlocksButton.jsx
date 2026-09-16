import { useState } from 'react';
import { Box, Button, Popover } from '@mui/material';
import DashboardCustomizeOutlinedIcon from '@mui/icons-material/DashboardCustomizeOutlined';
import { SettingsBlockOptionsList } from '../Settings/SettingsViewOptions';

import AppIcon from '../../components/icons/AppIcon';

/**
 * "Arrange" control for the Assistant Console. Opens a popover with the shared
 * drag-to-reorder + show/hide list (SettingsBlockOptionsList), driven by a
 * useSettingsBlockLayout instance passed in as `layout`. Order and visibility
 * persist to localStorage via that hook.
 */
export default function ArrangeBlocksButton({ layout }) {
  const [anchor, setAnchor] = useState(null);
  const open = Boolean(anchor);
  const hiddenCount = layout.hiddenSections.size;

  return (
    <>
      <Button
        size="small"
        variant="outlined"
        startIcon={
          <AppIcon
            name="DashboardCustomizeOutlined"
            fallback={DashboardCustomizeOutlinedIcon}
            fontSize="small"
          />
        }
        onClick={(e) => setAnchor(e.currentTarget)}
        aria-haspopup="dialog"
        aria-expanded={open}
        sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2 }}
      >
        Arrange{hiddenCount > 0 ? ` · ${hiddenCount} hidden` : ''}
      </Button>
      <Popover
        open={open}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: {
            sx: {
              mt: 1,
              width: { xs: 'calc(100vw - 32px)', sm: 380 },
              maxWidth: 'calc(100vw - 32px)',
              borderRadius: 2,
              boxShadow: 6,
              overflow: 'hidden',
            },
          },
        }}
      >
        <Box sx={{ px: 1, pt: 1 }}>
          <SettingsBlockOptionsList
            title="Assistant blocks"
            pinnedId={null}
            sortableKeys={layout.sortableKeys}
            labels={layout.labels}
            hiddenSections={layout.hiddenSections}
            sectionOrder={layout.sectionOrder}
            onToggle={layout.toggleSection}
            onReorder={layout.reorderSections}
            onShowAll={layout.showAllSections}
            onHideAll={layout.hideAllSections}
            onReset={layout.resetLayout}
          />
        </Box>
      </Popover>
    </>
  );
}
