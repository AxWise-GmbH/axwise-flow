import { useState } from 'react';
import {
  Box,
  Stack,
  TextField,
  MenuItem,
  IconButton,
  Button,
  Typography,
  Paper,
  Chip,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';

import AppIcon from '../icons/AppIcon';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

export default function ManualEndpointEditor({ rows, onChange }) {
  const [draft, setDraft] = useState({
    method: 'GET',
    path: '',
    name: '',
    category: 'General',
    description: '',
  });

  const update = (idx, patch) => {
    const next = rows.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    onChange(next);
  };

  const remove = (idx) => onChange(rows.filter((_, i) => i !== idx));

  const add = () => {
    if (!draft.path.trim()) return;
    onChange([...rows, { ...draft, id: `${draft.method}_${draft.path}_${Date.now()}` }]);
    setDraft({ method: 'GET', path: '', name: '', category: 'General', description: '' });
  };

  return (
    <Stack spacing={1.5}>
      <Typography variant="body2" color="text.secondary">
        Add HTTP endpoints one at a time. Use <code>{'{paramName}'}</code> syntax for path
        parameters.
      </Typography>
      {rows.length > 0 ? (
        <Stack spacing={1}>
          {rows.map((r, idx) => (
            <Paper key={r.id || `${r.method}_${r.path}_${idx}`} variant="outlined" sx={{ p: 1.25 }}>
              <Stack direction="row" spacing={1} alignItems="center">
                <TextField
                  select
                  size="small"
                  label="Method"
                  value={r.method}
                  onChange={(e) => update(idx, { method: e.target.value })}
                  sx={{ width: 110 }}
                >
                  {METHODS.map((m) => (
                    <MenuItem key={m} value={m}>
                      {m}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  size="small"
                  label="Path"
                  value={r.path}
                  onChange={(e) => update(idx, { path: e.target.value })}
                  placeholder="/users/{id}"
                  sx={{ flex: 1 }}
                />
                <TextField
                  size="small"
                  label="Category"
                  value={r.category || 'General'}
                  onChange={(e) => update(idx, { category: e.target.value })}
                  sx={{ width: 160 }}
                />
                <IconButton size="small" onClick={() => remove(idx)}>
                  <AppIcon name="DeleteOutline" fallback={DeleteOutlineIcon} fontSize="small" />
                </IconButton>
              </Stack>
              <TextField
                size="small"
                label="Name (optional)"
                value={r.name || ''}
                onChange={(e) => update(idx, { name: e.target.value })}
                sx={{ mt: 1, width: '100%' }}
              />
            </Paper>
          ))}
        </Stack>
      ) : (
        <Chip size="small" label="No endpoints yet" variant="outlined" />
      )}
      <Paper variant="outlined" sx={{ p: 1.25, borderStyle: 'dashed' }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <TextField
            select
            size="small"
            label="Method"
            value={draft.method}
            onChange={(e) => setDraft({ ...draft, method: e.target.value })}
            sx={{ width: 110 }}
          >
            {METHODS.map((m) => (
              <MenuItem key={m} value={m}>
                {m}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            size="small"
            label="Path"
            value={draft.path}
            onChange={(e) => setDraft({ ...draft, path: e.target.value })}
            placeholder="/users/{id}"
            sx={{ flex: 1 }}
          />
          <TextField
            size="small"
            label="Category"
            value={draft.category}
            onChange={(e) => setDraft({ ...draft, category: e.target.value })}
            sx={{ width: 160 }}
          />
          <Button
            size="small"
            variant="contained"
            startIcon={<AppIcon name="Add" fallback={AddIcon} />}
            onClick={add}
            disabled={!draft.path.trim()}
          >
            Add
          </Button>
        </Stack>
      </Paper>
      <Box>
        <Chip
          size="small"
          label={`${rows.length} endpoint${rows.length === 1 ? '' : 's'} defined`}
          variant="outlined"
        />
      </Box>
    </Stack>
  );
}
