/**
 * BYOS — Bring Your Own Storage Settings panel.
 *
 * Lets the user connect their own Supabase project as the storage backend
 * for goal deliverables (PDFs, decks, landing pages, agent avatars). When
 * connected, every artifact lands in their bucket instead of the platform's.
 *
 * Pattern mirrors the BYOK ApiKeys page so the UX is consistent.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Stack,
  Typography,
  Paper,
  Button,
  Alert,
  Chip,
  IconButton,
  CircularProgress,
  TextField,
  Tooltip,
  Divider,
  alpha,
  useTheme,
} from '@mui/material';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import RefreshIcon from '@mui/icons-material/Refresh';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import StorageRoundedIcon from '@mui/icons-material/StorageRounded';
import FormDialog from '../Common/FormDialog';
import {
  listStorageConnections,
  createStorageConnection,
  testStorageConnection,
  deleteStorageConnection,
} from '../../services/storageConnectionsService';

import AppIcon from '../icons/AppIcon';

const SUPABASE_URL_RE = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i;

export default function StorageConnections() {
  const theme = useTheme();
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [testingId, setTestingId] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listStorageConnections();
      setConnections(rows);
      setError(null);
    } catch (e) {
      setError(e.message || 'Failed to load connections');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleTest = useCallback(
    async (id) => {
      setTestingId(id);
      try {
        const r = await testStorageConnection(id);
        if (!r.ok) setError(`Connection probe failed: ${r.error || 'unknown'}`);
        else setError(null);
        await refresh();
      } finally {
        setTestingId(null);
      }
    },
    [refresh]
  );

  const handleDelete = useCallback(
    async (id) => {
      if (
        !window.confirm(
          'Disconnect this storage? Existing files in your bucket stay there; new artifacts will use platform-default storage.'
        )
      )
        return;
      try {
        await deleteStorageConnection(id);
        await refresh();
      } catch (e) {
        setError(e.message);
      }
    },
    [refresh]
  );

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Box>
          <Stack direction="row" alignItems="center" spacing={1}>
            <AppIcon name="StorageRounded" fallback={StorageRoundedIcon} color="primary" />
            <Typography variant="h6" fontWeight={700}>
              Bring Your Own Storage
            </Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Connect your own Supabase project so goal deliverables land in your bucket, not ours.
            Files are end-to-end yours: you can read, delete, and audit them at any time.
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AppIcon name="AddCircleOutline" fallback={AddCircleOutlineIcon} />}
          onClick={() => setWizardOpen(true)}
        >
          Connect storage
        </Button>
      </Stack>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={28} />
        </Box>
      ) : connections.length === 0 ? (
        <Paper
          variant="outlined"
          sx={{
            p: 3,
            textAlign: 'center',
            backgroundColor: alpha(theme.palette.primary.main, 0.04),
          }}
        >
          <Typography variant="body2" color="text.secondary">
            No storage connected yet. Goal deliverables currently land in our platform-default
            storage, subject to your storage quota (500 MB on free tier).
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            Connect your own Supabase project to remove that limit and own your files.
          </Typography>
        </Paper>
      ) : (
        <Stack spacing={1.5}>
          {connections.map((c) => (
            <ConnectionRow
              key={c.id}
              c={c}
              testing={testingId === c.id}
              onTest={() => handleTest(c.id)}
              onDelete={() => handleDelete(c.id)}
            />
          ))}
        </Stack>
      )}
      <ConnectStorageWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onSaved={async () => {
          setWizardOpen(false);
          await refresh();
        }}
      />
    </Box>
  );
}

function ConnectionRow({ c, testing, onTest, onDelete }) {
  const theme = useTheme();
  const ok = c.lastTestOk !== false;
  const meta = c.metadata || {};
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack direction="row" alignItems="center" spacing={1.5}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
            <Typography variant="subtitle1" fontWeight={600} noWrap>
              {c.label || `${c.kind} (${c.slot})`}
            </Typography>
            <Chip
              size="small"
              label={c.kind}
              variant="outlined"
              sx={{ textTransform: 'uppercase', fontSize: 11 }}
            />
            {ok ? (
              <Chip
                size="small"
                color="success"
                icon={<AppIcon name="CheckCircle" fallback={CheckCircleIcon} />}
                label="Connected"
              />
            ) : (
              <Tooltip title={c.lastTestError || 'Last probe failed'}>
                <Chip
                  size="small"
                  color="error"
                  icon={<AppIcon name="ErrorOutline" fallback={ErrorOutlineIcon} />}
                  label="Failed"
                />
              </Tooltip>
            )}
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            {meta.url ? (
              <>
                URL: <code>{meta.url}</code> ·{' '}
              </>
            ) : null}
            {meta.bucket ? (
              <>
                Bucket: <code>{meta.bucket}</code> ·{' '}
              </>
            ) : null}
            Last tested: {c.lastTestedAt ? new Date(c.lastTestedAt).toLocaleString() : 'never'}
          </Typography>
        </Box>
        <Tooltip title="Run probe upload + delete">
          <span>
            <IconButton onClick={onTest} disabled={testing}>
              {testing ? (
                <CircularProgress size={18} />
              ) : (
                <AppIcon name="Refresh" fallback={RefreshIcon} />
              )}
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Disconnect">
          <IconButton onClick={onDelete} color="error">
            <AppIcon name="DeleteOutline" fallback={DeleteOutlineIcon} />
          </IconButton>
        </Tooltip>
      </Stack>
    </Paper>
  );
}

function ConnectStorageWizard({ open, onClose, onSaved }) {
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
      await onSaved();
    } catch (e) {
      setErr(e.message || 'Failed to save connection');
    } finally {
      setSaving(false);
    }
  }, [url, serviceRoleKey, bucket, label, validation, onSaved]);

  return (
    <FormDialog
      open={open}
      onClose={close}
      title="Connect your Supabase storage"
      subtitle="Bring your own storage for goal deliverables"
      icon={StorageRoundedIcon}
      maxWidth="sm"
      primaryLabel={saving ? 'Probing & saving…' : 'Save & connect'}
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
        for Orchestratori artifacts so blast radius is minimal.
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
          helperText="Found at Supabase Dashboard → Project Settings → API"
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
          helperText="The service_role secret (NOT the anon key). Settings → API → Project API keys."
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
