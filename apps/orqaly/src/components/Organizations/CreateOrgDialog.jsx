import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Stack,
  TextField,
  MenuItem,
  Button,
  Typography,
} from '@mui/material';
import { createOrganization } from '../../services/organizationService';
import { ORG_TYPES } from '../../pages/Organizations/orgTypes';

/**
 * Minimal create-org dialog - just enough to add the record. Power users still get the full form in
 * advanced mode (KYB, parent_id, etc.). Shared by SimpleOrganizations and the Welcome Guide
 * quick-action host. Props: open, onClose, onCreated(org), onError(message).
 */
export default function CreateOrgDialog({ open, onClose, onCreated, onError }) {
  const [name, setName] = useState('');
  const [orgType, setOrgType] = useState('virtual');
  const [industry, setIndustry] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Reset on open
  useEffect(() => {
    if (open) {
      setName('');
      setOrgType('virtual');
      setIndustry('');
      setError('');
      setSaving(false);
    }
  }, [open]);

  const canSubmit = name.trim().length > 0 && !saving;

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (!canSubmit) return;
    setSaving(true);
    setError('');
    try {
      const created = await createOrganization({
        name: name.trim(),
        org_type: orgType,
        industry: industry.trim(),
        kyb_level: 'basic',
        kyb_status: 'draft',
      });
      onCreated?.(created || { name: name.trim() });
    } catch (err) {
      const msg = err?.message || 'Failed to create organization.';
      setError(msg);
      onError?.(`Create failed: ${msg}`);
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={saving ? undefined : onClose}
      fullWidth
      maxWidth="xs"
      slotProps={{ paper: { sx: { borderRadius: 3 } } }}
    >
      <form onSubmit={handleSubmit}>
        <DialogTitle sx={{ fontWeight: 800 }}>New organization</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <TextField
              label="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
              fullWidth
              disabled={saving}
            />
            <TextField
              label="Type"
              select
              value={orgType}
              onChange={(e) => setOrgType(e.target.value)}
              fullWidth
              disabled={saving}
            >
              {ORG_TYPES.map((t) => (
                <MenuItem key={t.value} value={t.value}>
                  {t.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Industry (optional)"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              placeholder="e.g. Technology, Finance, Healthcare"
              fullWidth
              disabled={saving}
            />
            {error && (
              <Typography variant="body2" color="error">
                {error}
              </Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={onClose} disabled={saving} sx={{ textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={!canSubmit}
            sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2, px: 3 }}
          >
            {saving ? 'Creating…' : 'Create'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
