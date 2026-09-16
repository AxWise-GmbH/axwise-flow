import { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Chip,
  TextField,
  MenuItem,
  Button,
  IconButton,
  FormControlLabel,
  Checkbox,
  Stack,
  Divider,
  alpha,
  useTheme,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';

const FIELD_TYPES = [
  'text', 'number', 'currency', 'percent', 'select', 'multiselect',
  'country', 'date', 'boolean', 'email', 'phone', 'url', 'tags',
];
const OPTION_TYPES = new Set(['select', 'multiselect']);
const FILTERABLE_KINDS = { select: 'select', multiselect: 'multiselect', country: 'country' };

function slugKey(label) {
  const camel = String(label)
    .trim()
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .split(/\s+/)
    .map((w, i) => (i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join('');
  return camel || `field${Date.now()}`;
}

/** Derive filter defs from the fields flagged filterable. */
function deriveFilters(fields) {
  return fields
    .filter((f) => f.filterable && (FILTERABLE_KINDS[f.type] || f.type === 'country'))
    .map((f) => ({
      key: f.key,
      label: f.label,
      field: f.key,
      kind: f.type === 'country' ? 'country' : FILTERABLE_KINDS[f.type],
    }));
}

/**
 * Per-type field editor — add/remove personalized parameters. Saving persists
 * the whole type config (fields + derived filters) via onSave.
 */
export default function TypeConfigEditor({ type, onSave, saving }) {
  const theme = useTheme();
  const color = type.color || theme.palette.primary.main;
  const [fields, setFields] = useState(type.fields || []);
  const [draft, setDraft] = useState({
    label: '',
    type: 'text',
    options: '',
    showInTable: true,
    filterable: false,
  });
  const [dirty, setDirty] = useState(false);

  const addField = () => {
    if (!draft.label.trim()) return;
    const field = {
      key: slugKey(draft.label),
      label: draft.label.trim(),
      type: draft.type,
      showInTable: draft.showInTable,
      filterable: draft.filterable,
    };
    if (OPTION_TYPES.has(draft.type) && draft.options.trim()) {
      field.options = draft.options.split(',').map((s) => s.trim()).filter(Boolean);
    }
    setFields((f) => [...f, field]);
    setDraft({ label: '', type: 'text', options: '', showInTable: true, filterable: false });
    setDirty(true);
  };

  const removeField = (key) => {
    setFields((f) => f.filter((x) => x.key !== key));
    setDirty(true);
  };

  const save = () => {
    onSave({ ...type, fields, filters: deriveFilters(fields) });
    setDirty(false);
  };

  return (
    <Paper
      elevation={0}
      sx={{ p: 2, borderRadius: 2.5, border: '1px solid', borderColor: alpha(color, 0.22) }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
        <Typography sx={{ fontWeight: 700, color }}>{type.label}</Typography>
        <Button
          size="small"
          variant="contained"
          disabled={!dirty || saving}
          onClick={save}
          sx={{ textTransform: 'none', borderRadius: 2, bgcolor: color, '&:hover': { bgcolor: color } }}
        >
          Save
        </Button>
      </Box>

      <Stack spacing={0.75} sx={{ mb: 2 }}>
        {fields.map((f) => (
          <Box
            key={f.key}
            sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}
          >
            <Typography sx={{ fontWeight: 600, minWidth: 160 }}>{f.label}</Typography>
            <Chip label={f.type} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.65rem' }} />
            {f.showInTable && (
              <Chip label="table" size="small" sx={{ height: 20, fontSize: '0.6rem' }} />
            )}
            {f.filterable && (
              <Chip label="filter" size="small" sx={{ height: 20, fontSize: '0.6rem' }} />
            )}
            <Box sx={{ flex: 1 }} />
            <IconButton size="small" onClick={() => removeField(f.key)} aria-label={`Remove ${f.label}`}>
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </Box>
        ))}
      </Stack>

      <Divider sx={{ mb: 1.5 }} />

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField
          size="small"
          label="Field label"
          value={draft.label}
          onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
          sx={{ minWidth: 160 }}
        />
        <TextField
          size="small"
          select
          label="Type"
          value={draft.type}
          onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value }))}
          sx={{ minWidth: 130 }}
        >
          {FIELD_TYPES.map((t) => (
            <MenuItem key={t} value={t}>
              {t}
            </MenuItem>
          ))}
        </TextField>
        {OPTION_TYPES.has(draft.type) && (
          <TextField
            size="small"
            label="Options (comma-separated)"
            value={draft.options}
            onChange={(e) => setDraft((d) => ({ ...d, options: e.target.value }))}
            sx={{ minWidth: 200 }}
          />
        )}
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={draft.showInTable}
              onChange={(e) => setDraft((d) => ({ ...d, showInTable: e.target.checked }))}
            />
          }
          label="Table"
        />
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={draft.filterable}
              onChange={(e) => setDraft((d) => ({ ...d, filterable: e.target.checked }))}
            />
          }
          label="Filter"
        />
        <Button
          size="small"
          startIcon={<AddIcon />}
          onClick={addField}
          disabled={!draft.label.trim()}
          sx={{ textTransform: 'none' }}
        >
          Add field
        </Button>
      </Box>
    </Paper>
  );
}
