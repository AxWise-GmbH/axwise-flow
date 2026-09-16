import { useCallback, useMemo, useState } from 'react';
import {
  Box,
  Stack,
  Typography,
  Button,
  Alert,
  TextField,
  Divider,
  CircularProgress,
} from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import StorageRoundedIcon from '@mui/icons-material/StorageRounded';
import FormDialog from '../Common/FormDialog';
import { createStorageConnection } from '../../services/storageConnectionsService';

import AppIcon from '../icons/AppIcon';

const SUPABASE_URL_RE = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i;

/**
 * BYO storage wizard. Lifted from src/components/Settings/StorageConnections.jsx
 * so /setup and any future caller can open it directly without dragging the
 * old Settings list component along.
 */
export default function ConnectStorageWizard({ open, onClose, onSaved }) {
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [serviceRoleKey, setServiceRoleKey] = useState('');
  const [bucket, setBucket] = useState('goal-deliverables');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const reset = useCallback(() => {
    setLabel('');
    setUrl('');
    setServiceRoleKey('');
    setBucket('goal-deliverables');
    setSaving(false);
    setErr(null);
  }, []);

  const close = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  const validation = useMemo(() => {
    if (!url) return 'Supabase project URL required';
    if (!SUPABASE_URL_RE.test(url.trim())) return 'URL must look like https://xxxx.supabase.co';
    if (!serviceRoleKey) return 'Service role key required';
    if (serviceRoleKey.length < 30) return 'Service role key looks too short';
    if (!bucket) return 'Bucket name required';
    return null;
  }, [url, serviceRoleKey, bucket]);

  const handleSave = useCallback(async () => {
    if (validation) {
      setErr(validation);
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const credential = JSON.stringify({
        url: url.trim().replace(/\/$/, ''),
        serviceRoleKey: serviceRoleKey.trim(),
        bucket: bucket.trim(),
      });
      await createStorageConnection({
        kind: 'supabase',
        label: label.trim() || null,
        slot: 'primary',
        metadata: { url: url.trim().replace(/\/$/, ''), bucket: bucket.trim() },
        credential,
      });
      reset();
      await onSaved?.();
    } catch (e) {
      setErr(e.message || 'Failed to save connection');
    } finally {
      setSaving(false);
    }
  }, [url, serviceRoleKey, bucket, label, validation, onSaved, reset]);

  return (
    <FormDialog
      open={open}
      onClose={close}
      title="Connect your Supabase storage"
      subtitle="Bring your own storage for goal deliverables"
      icon={StorageRoundedIcon}
      maxWidth="sm"
      primaryLabel={saving ? 'Probing & saving...' : 'Save & connect'}
      onPrimary={handleSave}
      primaryDisabled={saving || !!validation}
      primaryLoading={saving}
    >
      <Alert
        severity="info"
        icon={<AppIcon name="LockOutlined" fallback={LockOutlinedIcon} fontSize="small" />}
        sx={{ mb: 2 }}
      >
        We encrypt the service-role key with AES-256-GCM before storing it. The key never leaves our
        servers in plaintext, and our database backups can't decrypt it. We recommend using a{' '}
        <strong>dedicated Supabase project</strong>
        for Orqaly artifacts so blast radius is minimal.
      </Alert>
      <Stack spacing={2}>
        <TextField
          label="Label (optional)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder='e.g. "Acme Marketing Project"'
          fullWidth
          inputProps={{ maxLength: 100 }}
        />
        <TextField
          label="Supabase Project URL"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://xxxx.supabase.co"
          fullWidth
          required
          helperText="Found at Supabase Dashboard -> Project Settings -> API"
        />
        <TextField
          label="Service-role key"
          value={serviceRoleKey}
          onChange={(e) => setServiceRoleKey(e.target.value)}
          placeholder="eyJhbGciOiJI..."
          fullWidth
          required
          type="password"
          autoComplete="new-password"
          helperText="The service_role secret (NOT the anon key). Settings -> API -> Project API keys."
        />
        <TextField
          label="Bucket name"
          value={bucket}
          onChange={(e) => setBucket(e.target.value)}
          fullWidth
          required
          helperText="Create this bucket in your Supabase Storage first. We'll write to it."
        />

        <Divider />
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
            When you click Save, we'll:
          </Typography>
          <ol
            style={{
              marginTop: 4,
              marginBottom: 0,
              paddingLeft: 18,
              fontSize: 13,
              color: 'rgba(0,0,0,0.6)',
            }}
          >
            <li>Encrypt your key with our envelope-crypto KEK</li>
            <li>Probe-upload a 32-byte test file to your bucket</li>
            <li>Probe-delete it</li>
            <li>Save the connection only if the probe succeeds</li>
          </ol>
        </Box>

        {err && (
          <Alert severity="error" onClose={() => setErr(null)}>
            {err}
          </Alert>
        )}
      </Stack>
    </FormDialog>
  );
}
