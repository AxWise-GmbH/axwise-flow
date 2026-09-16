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
  ToggleButton,
  ToggleButtonGroup,
  TextField,
  Divider,
  Select,
  MenuItem,
  useTheme,
  alpha,
} from '@mui/material';
import CorporateFareOutlinedIcon from '@mui/icons-material/CorporateFareOutlined';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import CloseIcon from '@mui/icons-material/Close';
import { SettingsBlockOptionsList } from '../../Settings/SettingsViewOptions';
import TemplatePicker from '../../../components/Common/TemplatePicker';

import AppIcon from '../../../components/icons/AppIcon';

const WINDOW_PRESETS = [
  { id: 7, label: '7d' },
  { id: 30, label: '30d' },
  { id: 90, label: '90d' },
];

/** A labelled section card inside the filter dialog. */
function Tile({ label, children, disabled }) {
  const theme = useTheme();
  return (
    <Box
      sx={{
        p: 1.5,
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: alpha(theme.palette.background.default, 0.4),
        opacity: disabled ? 0.5 : 1,
        pointerEvents: disabled ? 'none' : 'auto',
      }}
    >
      <Typography
        variant="caption"
        sx={{
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: 0.4,
          color: 'text.secondary',
          display: 'block',
          mb: 1,
        }}
      >
        {label}
      </Typography>
      {children}
    </Box>
  );
}

/**
 * One popup for the Home Metrics tab gathering every control: layout templates,
 * demo data, the 7/30/90 window preset, an explicit From-To date range, and the
 * block reorder/hide list.
 */
export default function MetricsFilterDialog({
  open,
  onClose,
  demo,
  onDemoChange,
  windowDays,
  onWindowChange,
  from,
  to,
  onFromChange,
  onToChange,
  onResetAll,
  orgs = [],
  selectedOrgId = null,
  onOrgChange,
  layout,
  templates = [],
  activeTemplateId = null,
  onApplyTemplate,
  onSaveTemplate,
  onRenameTemplate,
  onDeleteTemplate,
}) {
  const customActive = Boolean(from && to);
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
          Layout
        </Box>
        <IconButton size="small" onClick={onClose} aria-label="Close filters">
          <AppIcon name="Close" fallback={CloseIcon} fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, py: 2 }}>
        {onApplyTemplate && (
          <Tile label="Template">
            <TemplatePicker
              templates={templates}
              activeTemplateId={activeTemplateId}
              onApply={onApplyTemplate}
              onSave={onSaveTemplate}
              onRename={onRenameTemplate}
              onDelete={onDeleteTemplate}
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

        {onOrgChange && orgs.length > 1 && (
          <Tile label="Organization">
            <Select
              size="small"
              fullWidth
              value={orgs.some((o) => o.id === selectedOrgId) ? selectedOrgId : (orgs[0]?.id ?? '')}
              onChange={(e) => onOrgChange(e.target.value)}
              startAdornment={
                <AppIcon
                  name="CorporateFareOutlined"
                  fallback={CorporateFareOutlinedIcon}
                  sx={{ fontSize: 18, mr: 1, color: 'text.secondary' }}
                />
              }
              inputProps={{ 'aria-label': 'Select organization' }}
              sx={{
                borderRadius: 2,
                '& .MuiSelect-select': { display: 'flex', alignItems: 'center', fontWeight: 600 },
              }}
            >
              {orgs.map((o) => (
                <MenuItem key={o.id} value={o.id}>
                  {o.name}
                </MenuItem>
              ))}
            </Select>
          </Tile>
        )}

        <Tile label="Time window" disabled={demo}>
          <ToggleButtonGroup
            value={customActive ? null : windowDays}
            exclusive
            size="small"
            onChange={(_, v) => v && onWindowChange(v)}
            aria-label="Time window"
            sx={{
              '& .MuiToggleButton-root': {
                textTransform: 'none',
                fontWeight: 700,
                px: 1.5,
                py: 0.4,
                borderRadius: '8px !important',
              },
            }}
          >
            {WINDOW_PRESETS.map((p) => (
              <ToggleButton key={p.id} value={p.id} aria-label={`Last ${p.label}`}>
                {p.label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Tile>

        <Tile label="Date range" disabled={demo}>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <TextField
              type="date"
              size="small"
              label="From"
              value={from || ''}
              onChange={(e) => onFromChange(e.target.value)}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: to || undefined } }}
              sx={{ flex: 1, minWidth: 150 }}
            />
            <TextField
              type="date"
              size="small"
              label="To"
              value={to || ''}
              onChange={(e) => onToChange(e.target.value)}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: from || undefined } }}
              sx={{ flex: 1, minWidth: 150 }}
            />
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.75, display: 'block' }}>
            {customActive
              ? 'Using a custom range (overrides the preset).'
              : 'Set both dates to override the preset above.'}
          </Typography>
        </Tile>

        <Divider flexItem />

        <SettingsBlockOptionsList
          title="Blocks"
          pinnedId={null}
          pinnedLabel={null}
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
      <DialogActions sx={{ px: 3, py: 1.5, justifyContent: 'space-between' }}>
        <Button
          size="small"
          variant="text"
          onClick={onResetAll}
          sx={{ textTransform: 'none', fontWeight: 700 }}
        >
          Reset all
        </Button>
        <Button
          variant="contained"
          size="small"
          onClick={onClose}
          sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2, px: 3 }}
        >
          Done
        </Button>
      </DialogActions>
    </Dialog>
  );
}
