import { useState } from 'react';
import { Box, Typography, Checkbox, TextField, MenuItem, IconButton, Button } from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import AppIcon from '../../components/icons/AppIcon';
import {
  DEPARTMENTS,
  STAKES,
  isCustomDepartment,
  customDepartmentId,
} from '../../config/departments';

/**
 * The department picker grid — the six built-ins plus any the company adds in
 * its own words (a name and a one-line "what they do"). Controlled: state lives
 * in the caller (the guide's Departments step).
 *
 * `rows` is keyed by department id. Custom ids start with 'custom:' and carry
 * `label` + `description`; a removed custom row stays in the map as
 * `{ enabled: false, removed: true }` so saving can switch it off server-side.
 */
export default function DepartmentGrid({ rows, onPatch, onAddCustom, onRemoveCustom }) {
  const [draft, setDraft] = useState({ label: '', description: '' });

  const customIds = Object.keys(rows).filter((id) => isCustomDepartment(id) && !rows[id]?.removed);

  const addCustom = () => {
    const label = draft.label.trim();
    if (!label) return;
    onAddCustom?.({
      id: customDepartmentId(label),
      label,
      description: draft.description.trim(),
    });
    setDraft({ label: '', description: '' });
  };

  const renderRow = (id, label, description, isCustom) => (
    <Box key={id} sx={{ display: 'contents' }}>
      <Checkbox
        size="small"
        checked={!!rows[id]?.enabled}
        onChange={(e) => onPatch(id, { enabled: e.target.checked })}
        inputProps={{ 'aria-label': label }}
      />
      <Box sx={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>
            {label}
          </Typography>
          {description && (
            <Typography variant="caption" color="text.disabled" noWrap sx={{ display: 'block' }}>
              {description}
            </Typography>
          )}
        </Box>
        {isCustom && (
          <IconButton
            size="small"
            aria-label={`Remove ${label}`}
            onClick={() => onRemoveCustom?.(id)}
          >
            <AppIcon name="CloseRounded" fallback={CloseRoundedIcon} sx={{ fontSize: 16 }} />
          </IconButton>
        )}
      </Box>
      <TextField
        select
        size="small"
        value={rows[id]?.stakes || 'medium'}
        onChange={(e) => onPatch(id, { stakes: e.target.value })}
        disabled={!rows[id]?.enabled}
        inputProps={{ 'aria-label': `${label} stakes` }}
      >
        {STAKES.map((s) => (
          <MenuItem key={s} value={s}>
            {s}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        size="small"
        type="number"
        value={rows[id]?.monthly_volume ?? ''}
        onChange={(e) => onPatch(id, { monthly_volume: e.target.value })}
        disabled={!rows[id]?.enabled}
        inputProps={{ 'aria-label': `${label} jobs per month`, min: 0 }}
      />
    </Box>
  );

  return (
    <Box>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'auto 1fr 120px 110px',
          gap: 1,
          alignItems: 'center',
        }}
      >
        <Box />
        <Box />
        <Typography variant="caption" color="text.disabled" sx={{ fontWeight: 700 }}>
          stakes
        </Typography>
        <Typography variant="caption" color="text.disabled" sx={{ fontWeight: 700 }}>
          jobs / month
        </Typography>

        {DEPARTMENTS.map((d) => renderRow(d.id, d.label, d.description, false))}
        {customIds.map((id) => renderRow(id, rows[id].label, rows[id].description, true))}
      </Box>

      {/* Your own department: a name and, if it helps, what they do. */}
      <Box
        sx={{
          mt: 1.5,
          pt: 1.5,
          borderTop: '1px dashed',
          borderColor: 'divider',
          display: 'flex',
          gap: 1,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <TextField
          size="small"
          placeholder="Your own team, e.g. Growth Pod"
          value={draft.label}
          onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addCustom();
            }
          }}
          inputProps={{ 'aria-label': 'Custom department name' }}
          sx={{ minWidth: 200, flex: 1 }}
        />
        <TextField
          size="small"
          placeholder="What they do (optional)"
          value={draft.description}
          onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
          inputProps={{ 'aria-label': 'Custom department description' }}
          sx={{ minWidth: 220, flex: 2 }}
        />
        <Button
          size="small"
          onClick={addCustom}
          disabled={!draft.label.trim()}
          startIcon={<AppIcon name="AddRounded" fallback={AddRoundedIcon} />}
          sx={{ textTransform: 'none', fontWeight: 700 }}
        >
          Add
        </Button>
      </Box>
    </Box>
  );
}
