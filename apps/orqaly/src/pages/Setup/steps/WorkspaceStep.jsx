import { useEffect, useState } from 'react';
import { Box, TextField, Button, Alert } from '@mui/material';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { createOrganization, updateOrganization } from '../../../services/organizationService';
import StepShell from './StepShell';

import AppIcon from '../../../components/icons/AppIcon';

/**
 * Step 1 - Workspace. A name field + Create button. The workspace IS the user's
 * top-level organization, so this creates/renames orgs[0].
 */
export default function WorkspaceStep({ progress }) {
  const orgs = progress.workspace.orgs || [];
  const primary = orgs[0] || null;
  const [name, setName] = useState(primary?.name || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setName(primary?.name || '');
  }, [primary?.id, primary?.name]);

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    setError(null);
    try {
      if (primary?.id) await updateOrganization(primary.id, { name: trimmed });
      else await createOrganization({ name: trimmed });
      await progress.workspace.refresh();
    } catch (e) {
      setError(e.message || 'Failed to save workspace');
    } finally {
      setSaving(false);
    }
  };

  return (
    <StepShell
      topic="Workspace"
      title="Create a workspace"
      done={progress.workspace.done}
      description="Your workspace is your top-level organization. We use this name across invoices, exports and any teammates you invite."
    >
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
        <TextField
          label="Workspace name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Acme Inc."
          size="small"
          sx={{ flex: 1, minWidth: 240 }}
          disabled={saving}
          inputProps={{ maxLength: 80 }}
        />
        <Button
          variant="contained"
          onClick={handleCreate}
          disabled={!name.trim() || saving}
          endIcon={<AppIcon name="ArrowForwardRounded" fallback={ArrowForwardRoundedIcon} />}
          sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2 }}
        >
          {saving ? 'Saving…' : primary?.id ? 'Save' : 'Create'}
        </Button>
      </Box>
      {error && (
        <Alert severity="error" sx={{ mt: 1.5 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
    </StepShell>
  );
}
