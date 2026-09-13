/**
 * TeamEditDialog - compact editor for a concilium team, opened from a graph node.
 * Teams have no rich standalone dialog, so this fills the gap: name / description /
 * active. onSave receives { name, description, isActive } for editTeam().
 */
import { useState, useEffect } from 'react';
import { TextField, FormControlLabel, Switch, Stack } from '@mui/material';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';

import FormDialog from '../../Common/FormDialog';

export default function TeamEditDialog({ open, team, onClose, onSave, saving = false }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (!open) return;
    setName(team?.name || '');
    setDescription(team?.description || '');
    setIsActive(team?.isActive !== false);
  }, [open, team]);

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({ name: name.trim(), description, isActive });
  };

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title="Edit Team"
      subtitle={team?.id ? `ID: ${team.id}` : undefined}
      icon={GroupsOutlinedIcon}
      maxWidth="xs"
      primaryLabel="Save"
      onPrimary={handleSave}
      primaryDisabled={!name.trim() || saving}
      primaryLoading={saving}
    >
      <Stack spacing={2} sx={{ pt: 0.5 }}>
        <TextField
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          fullWidth
          size="small"
          required
          autoFocus
        />
        <TextField
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          fullWidth
          size="small"
          multiline
          minRows={2}
        />
        <FormControlLabel
          control={<Switch checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />}
          label="Active"
        />
      </Stack>
    </FormDialog>
  );
}
