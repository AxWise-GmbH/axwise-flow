import {
  Box,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Button,
  Switch,
  FormControlLabel,
  Divider,
  useTheme,
  alpha,
} from '@mui/material';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import CloseIcon from '@mui/icons-material/Close';
import { SettingsBlockOptionsList } from '../Settings/SettingsViewOptions';
import TemplatePicker from '../../components/Common/TemplatePicker';

import AppIcon from '../../components/icons/AppIcon';

/** A labelled section card inside the filter dialog. */
function Tile({ label, children }) {
  const theme = useTheme();
  return (
    <Box
      sx={{
        border: '1px solid',
        borderColor: alpha(theme.palette.divider, 0.9),
        borderRadius: 2,
        p: 1.5,
      }}
    >
      <Typography
        variant="overline"
        sx={{ fontWeight: 800, color: 'text.secondary', letterSpacing: 0.6 }}
      >
        {label}
      </Typography>
      <Box sx={{ mt: 0.5 }}>{children}</Box>
    </Box>
  );
}

/**
 * Consolidated filter/options popup for the Assistant Console - mirrors the Home
 * Metrics filter. Holds the demo-data toggle and the block arrange (show/hide +
 * drag-to-reorder) controls, so the page header only needs a single filter icon.
 */
export default function AssistantFilterDialog({
  open,
  onClose,
  demo,
  onDemoChange,
  layout,
  templates = [],
  activeTemplateId = null,
  onApplyTemplate,
  onSaveTemplate,
  onRenameTemplate,
  onDeleteTemplate,
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      PaperProps={{ sx: { borderRadius: 3, maxHeight: '88vh' } }}
    >
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
          fontWeight: 800,
          fontSize: '1.05rem',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AppIcon name="TuneRounded" fallback={TuneRoundedIcon} fontSize="small" /> Filters &amp;
          options
        </Box>
        <IconButton size="small" onClick={onClose} aria-label="Close filters">
          <AppIcon name="Close" fallback={CloseIcon} fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, py: 2 }}>
        {onApplyTemplate && (
          <Tile label="Layout template">
            <TemplatePicker
              templates={templates}
              activeTemplateId={activeTemplateId}
              onApply={onApplyTemplate}
              onSave={onSaveTemplate}
              onRename={onRenameTemplate}
              onDelete={onDeleteTemplate}
              helperText="Beginner is the default layout. Save your current block arrangement to reuse it later."
            />
          </Tile>
        )}

        <Tile label="Data source">
          <FormControlLabel
            sx={{ m: 0 }}
            control={
              <Switch
                size="small"
                checked={demo}
                onChange={(e) => onDemoChange(e.target.checked)}
                inputProps={{ 'aria-label': 'Toggle demo data' }}
              />
            }
            label={
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                Show demo data
              </Typography>
            }
          />
        </Tile>

        <Divider flexItem />

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
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button
          onClick={onClose}
          variant="contained"
          sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2 }}
        >
          Done
        </Button>
      </DialogActions>
    </Dialog>
  );
}
