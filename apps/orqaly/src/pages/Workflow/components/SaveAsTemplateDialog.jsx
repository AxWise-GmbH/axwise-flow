import { useState, useEffect } from 'react';
import { Button, TextField, MenuItem, Typography, Box } from '@mui/material';
import SaveAsOutlinedIcon from '@mui/icons-material/SaveAsOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import FormDialog, { FORM_FIELD_SX } from '../../../components/Common/FormDialog';
import { stripPersistedCredentials } from '../../../services/persistedCredentialSanitizer';
import { TEMPLATE_CATEGORIES } from '../visual/workflowTemplates';

const STORAGE_KEY = 'orch_custom_templates';

/** Load custom (user-saved) templates from localStorage. */
export function loadCustomTemplates() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    const clean = stripPersistedCredentials(parsed);
    if (JSON.stringify(clean) !== JSON.stringify(parsed)) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
    }
    return clean;
  } catch {
    return [];
  }
}

/** Save a new custom template. */
export function saveCustomTemplate(template) {
  const list = loadCustomTemplates();
  list.push(stripPersistedCredentials(template));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stripPersistedCredentials(list)));
  return list;
}

/** Update an existing custom template by id. */
export function updateCustomTemplate(template) {
  const list = loadCustomTemplates();
  const idx = list.findIndex((t) => t.id === template.id);
  if (idx === -1) return list;
  const next = [...list];
  next[idx] = stripPersistedCredentials({ ...template, isCustom: true });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stripPersistedCredentials(next)));
  return next;
}

/** Delete a custom template by id. */
export function deleteCustomTemplate(id) {
  const list = loadCustomTemplates().filter((t) => t.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stripPersistedCredentials(list)));
  return list;
}

export default function SaveAsTemplateDialog({ open, onClose, nodes, edges, onSaved }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('marketing');

  const handleSave = () => {
    const trimmedName = name.trim() || 'Untitled Template';
    // Strip non-serializable data (functions) from nodes
    const cleanNodes = (nodes || []).map((n) => ({
      ...n,
      data: n.data
        ? Object.fromEntries(Object.entries(n.data).filter(([, v]) => typeof v !== 'function'))
        : {},
    }));

    const template = stripPersistedCredentials({
      id: `custom-tpl-${Date.now()}`,
      name: trimmedName,
      description: description.trim() || `Custom template: ${trimmedName}`,
      category,
      blockCount: cleanNodes.length,
      nodes: cleanNodes,
      edges: edges || [],
      isCustom: true,
      createdAt: new Date().toISOString(),
    });

    saveCustomTemplate(template);
    onSaved?.(template);
    setName('');
    setDescription('');
    setCategory('marketing');
    onClose();
  };

  const handleClose = () => {
    setName('');
    setDescription('');
    setCategory('marketing');
    onClose();
  };

  const nodeCount = (nodes || []).length;
  const edgeCount = (edges || []).length;

  return (
    <FormDialog
      open={open}
      onClose={handleClose}
      title="Save as Template"
      icon={SaveAsOutlinedIcon}
      primaryLabel="Save template"
      onPrimary={handleSave}
      primaryDisabled={nodeCount === 0}
    >
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Save this workflow as a reusable template. It will appear in your Templates tab for quick
        access later.
      </Typography>

      <Box
        sx={{
          p: 1.5,
          mb: 2,
          borderRadius: 2,
          bgcolor: 'action.hover',
          border: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Typography variant="caption" color="text.secondary">
          This template will include{' '}
          <strong>
            {nodeCount} block{nodeCount !== 1 ? 's' : ''}
          </strong>{' '}
          and{' '}
          <strong>
            {edgeCount} connection{edgeCount !== 1 ? 's' : ''}
          </strong>
          .
        </Typography>
      </Box>

      <TextField
        autoFocus
        label="Template name"
        fullWidth
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. My Lead Gen Flow"
        sx={{ mb: 2, ...FORM_FIELD_SX }}
        onKeyDown={(e) => e.key === 'Enter' && nodeCount > 0 && handleSave()}
      />

      <TextField
        label="Description"
        fullWidth
        multiline
        rows={2}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="What does this workflow do?"
        sx={{ mb: 2, ...FORM_FIELD_SX }}
      />

      <TextField
        select
        label="Category"
        fullWidth
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        sx={FORM_FIELD_SX}
      >
        {TEMPLATE_CATEGORIES.map((cat) => (
          <MenuItem key={cat.id} value={cat.id}>
            {cat.label}
          </MenuItem>
        ))}
      </TextField>
    </FormDialog>
  );
}

/** Edit existing custom template (name, description, category only). */
export function EditTemplateDialog({ open, onClose, template, onSaved }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('marketing');

  useEffect(() => {
    if (open && template) {
      setName(template.name || '');
      setDescription(template.description || '');
      setCategory(template.category || 'marketing');
    }
  }, [open, template]);

  const handleSave = () => {
    const trimmedName = (name || '').trim() || 'Untitled Template';
    const updated = {
      ...template,
      name: trimmedName,
      description: (description || '').trim() || `Custom template: ${trimmedName}`,
      category: category || 'marketing',
    };
    updateCustomTemplate(updated);
    onSaved?.(updated);
    onClose();
  };

  const handleClose = () => onClose();

  return (
    <FormDialog
      open={open}
      onClose={handleClose}
      title="Edit template"
      icon={EditOutlinedIcon}
      primaryLabel="Save"
      onPrimary={handleSave}
      primaryDisabled={!name?.trim()}
    >
      <TextField
        autoFocus
        label="Template name"
        fullWidth
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. My Lead Gen Flow"
        sx={{ mb: 2, ...FORM_FIELD_SX }}
      />
      <TextField
        label="Description"
        fullWidth
        multiline
        rows={2}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="What does this workflow do?"
        sx={{ mb: 2, ...FORM_FIELD_SX }}
      />
      <TextField
        select
        label="Category"
        fullWidth
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        sx={FORM_FIELD_SX}
      >
        {TEMPLATE_CATEGORIES.map((cat) => (
          <MenuItem key={cat.id} value={cat.id}>
            {cat.label}
          </MenuItem>
        ))}
      </TextField>
    </FormDialog>
  );
}
