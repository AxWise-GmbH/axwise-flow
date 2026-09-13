import { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  Chip,
  Stack,
  Menu,
  MenuItem,
  ListItemIcon,
} from '@mui/material';
import BookmarkAddOutlinedIcon from '@mui/icons-material/BookmarkAddOutlined';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import DriveFileRenameOutlineIcon from '@mui/icons-material/DriveFileRenameOutline';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';

import AppIcon from '../icons/AppIcon';

/**
 * Layout-template picker (surface agnostic): built-in presets plus the user's
 * saved templates as selectable chips, a "Save current as template" inline form,
 * and a per-template menu (rename / delete) for custom ones. Render it inside a
 * labelled tile in the host filter dialog.
 *
 * @param {object} props
 * @param {Array<{id,name,builtin?}>} props.templates - built-in + custom
 * @param {string|null} props.activeTemplateId - id of the matching template
 * @param {(tpl)=>void} props.onApply
 * @param {(name)=>Promise<any>} props.onSave
 * @param {(id,name)=>Promise<any>} props.onRename
 * @param {(id)=>void} props.onDelete
 * @param {string} [props.helperText]
 */
export default function TemplatePicker({
  templates = [],
  activeTemplateId = null,
  onApply,
  onSave,
  onRename,
  onDelete,
  helperText = 'Pick a template to apply it, or save your current block layout as a new one.',
}) {
  // form: { mode: 'create' | 'rename', id?, value } | null
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState(null); // { anchor, tpl }

  const closeMenu = () => setMenu(null);

  const submit = async () => {
    const name = (form?.value || '').trim();
    if (!name) return;
    setBusy(true);
    try {
      if (form.mode === 'rename') await onRename(form.id, name);
      else await onSave(name);
      setForm(null);
    } catch {
      /* surfaced by the dialog's data layer; keep the form open to retry */
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box>
      <Stack
        direction="row"
        spacing={0.75}
        useFlexGap
        flexWrap="wrap"
        sx={{ alignItems: 'center' }}
      >
        {templates.map((tpl) => {
          const selected = tpl.id === activeTemplateId;
          return (
            <Chip
              key={tpl.id}
              label={tpl.name}
              size="small"
              color={selected ? 'primary' : 'default'}
              variant={selected ? 'filled' : 'outlined'}
              onClick={() => onApply(tpl)}
              {...(tpl.builtin
                ? {}
                : {
                    onDelete: (e) => setMenu({ anchor: e.currentTarget, tpl }),
                    deleteIcon: (
                      <AppIcon
                        name="MoreVert"
                        fallback={MoreVertIcon}
                        aria-label={`${tpl.name} options`}
                      />
                    ),
                  })}
              sx={{ fontWeight: 700, borderRadius: 1.5 }}
            />
          );
        })}
        <Button
          size="small"
          startIcon={
            <AppIcon
              name="BookmarkAddOutlined"
              fallback={BookmarkAddOutlinedIcon}
              fontSize="small"
            />
          }
          onClick={() => setForm({ mode: 'create', value: '' })}
          sx={{ textTransform: 'none', fontWeight: 700 }}
        >
          Save current
        </Button>
      </Stack>
      {form && (
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 1.25 }}>
          <TextField
            size="small"
            autoFocus
            placeholder={form.mode === 'rename' ? 'New name' : 'Template name'}
            value={form.value}
            onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
              if (e.key === 'Escape') setForm(null);
            }}
            slotProps={{ htmlInput: { maxLength: 80 } }}
            sx={{ flex: 1 }}
          />
          <Button
            variant="contained"
            size="small"
            disabled={busy || !form.value.trim()}
            onClick={submit}
            sx={{ textTransform: 'none', fontWeight: 700 }}
          >
            {form.mode === 'rename' ? 'Rename' : 'Save'}
          </Button>
          <Button
            size="small"
            disabled={busy}
            onClick={() => setForm(null)}
            sx={{ textTransform: 'none', fontWeight: 700 }}
          >
            Cancel
          </Button>
        </Box>
      )}
      {helperText && (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
          {helperText}
        </Typography>
      )}
      <Menu anchorEl={menu?.anchor} open={Boolean(menu)} onClose={closeMenu}>
        <MenuItem
          onClick={() => {
            setForm({ mode: 'rename', id: menu.tpl.id, value: menu.tpl.name });
            closeMenu();
          }}
        >
          <ListItemIcon>
            <AppIcon
              name="DriveFileRenameOutline"
              fallback={DriveFileRenameOutlineIcon}
              fontSize="small"
            />
          </ListItemIcon>
          Rename
        </MenuItem>
        <MenuItem
          onClick={() => {
            const id = menu.tpl.id;
            closeMenu();
            onDelete(id);
          }}
          sx={{ color: 'error.main' }}
        >
          <ListItemIcon>
            <AppIcon
              name="DeleteOutline"
              fallback={DeleteOutlineIcon}
              fontSize="small"
              color="error"
            />
          </ListItemIcon>
          Delete
        </MenuItem>
      </Menu>
    </Box>
  );
}
