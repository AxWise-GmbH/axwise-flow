import { useState } from 'react';
import {
  Box,
  Button,
  Stack,
  Chip,
  Alert,
  Typography,
  TextField,
  Collapse,
  useTheme,
  alpha,
} from '@mui/material';
import { createStorageConnection } from '../../../services/storageConnectionsService';
import ConnectStorageWizard from '../../../components/Setup/ConnectStorageWizard';
import StepShell from './StepShell';

function OptionTile({ tint, title, sub, action, onAction, selected, disabled }) {
  return (
    <Box
      sx={{
        p: 1.75,
        borderRadius: 2,
        border: '1px solid',
        borderColor: selected ? tint : 'divider',
        bgcolor: selected ? alpha(tint, 0.06) : 'transparent',
        opacity: disabled ? 0.55 : 1,
        display: 'flex',
        flexDirection: 'column',
        gap: 0.75,
      }}
    >
      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
        {title}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
        {sub}
      </Typography>
      {selected ? (
        <Chip size="small" color="success" label="Selected" sx={{ alignSelf: 'flex-start' }} />
      ) : action ? (
        <Button
          size="small"
          variant="outlined"
          onClick={onAction}
          disabled={disabled}
          sx={{ alignSelf: 'flex-start', textTransform: 'none', fontWeight: 700, borderRadius: 2 }}
        >
          {action}
        </Button>
      ) : null}
    </Box>
  );
}

/**
 * Step 4 - Bring Your Own Storage. Platform storage, Supabase (existing wizard),
 * a real Amazon S3 connect form, and Cloudflare R2 as "coming soon".
 */
export default function StorageStep({ progress }) {
  const theme = useTheme();
  const tint = theme.palette.primary.main;

  const [supaOpen, setSupaOpen] = useState(false);
  const [s3Open, setS3Open] = useState(false);
  const [region, setRegion] = useState('');
  const [bucket, setBucket] = useState('');
  const [accessKeyId, setAccessKeyId] = useState('');
  const [secretAccessKey, setSecretAccessKey] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const connections = progress.storage.connections || [];
  const s3Valid =
    region.trim() && bucket.trim() && accessKeyId.trim() && secretAccessKey.trim().length >= 10;

  const handleS3 = async () => {
    if (!s3Valid || saving) return;
    setSaving(true);
    setError(null);
    try {
      const cred = {
        region: region.trim(),
        bucket: bucket.trim(),
        accessKeyId: accessKeyId.trim(),
        secretAccessKey: secretAccessKey.trim(),
      };
      if (endpoint.trim()) cred.endpoint = endpoint.trim();
      await createStorageConnection({
        kind: 's3',
        slot: 'primary',
        label: `S3 ${bucket.trim()}`,
        metadata: {
          region: region.trim(),
          bucket: bucket.trim(),
          endpoint: endpoint.trim() || null,
        },
        credential: JSON.stringify(cred),
      });
      setS3Open(false);
      setRegion('');
      setBucket('');
      setAccessKeyId('');
      setSecretAccessKey('');
      setEndpoint('');
      await progress.storage.refresh();
    } catch (e) {
      setError(e.message || 'Failed to connect S3');
    } finally {
      setSaving(false);
    }
  };

  return (
    <StepShell
      topic="Storage"
      title="Bring Your Own Storage"
      done={progress.storage.done}
      description="Where should deliverables land - PDFs, decks, landing pages, agent avatars. Use ours or bring your own bucket."
    >
      {connections.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 2 }}>
          {connections.map((c) => (
            <Chip
              key={c.id}
              size="small"
              color="success"
              variant="outlined"
              label={`${c.kind}${c.metadata?.bucket ? ` · ${c.metadata.bucket}` : ''}`}
            />
          ))}
        </Box>
      )}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
        <OptionTile
          tint={tint}
          selected={progress.storage.choice === 'platform'}
          title="Use ours"
          sub="No setup. Platform-managed storage."
          action="Use platform"
          onAction={() => progress.storage.choosePlatform()}
        />
        <OptionTile
          tint={tint}
          title="Your Supabase"
          sub="Bring your own bucket. Files are end-to-end yours."
          action="Connect"
          onAction={() => setSupaOpen(true)}
        />
        <OptionTile
          tint={tint}
          title="Amazon S3"
          sub="Connect an S3 bucket (or S3-compatible)."
          action={s3Open ? 'Close' : 'Connect'}
          onAction={() => setS3Open((o) => !o)}
        />
        <OptionTile tint={tint} disabled title="Cloudflare R2" sub="Coming soon." />
      </Box>

      <Collapse in={s3Open} unmountOnExit>
        <Stack
          spacing={1.5}
          sx={{ mt: 2, p: 2, borderRadius: 2, border: '1px solid', borderColor: alpha(tint, 0.2) }}
        >
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            Connect Amazon S3
          </Typography>
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
            <TextField
              label="Region"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder="us-east-1"
              size="small"
              sx={{ flex: 1, minWidth: 140 }}
            />
            <TextField
              label="Bucket"
              value={bucket}
              onChange={(e) => setBucket(e.target.value)}
              placeholder="my-bucket"
              size="small"
              sx={{ flex: 1, minWidth: 140 }}
            />
          </Box>
          <TextField
            label="Access key ID"
            value={accessKeyId}
            onChange={(e) => setAccessKeyId(e.target.value)}
            size="small"
            fullWidth
          />
          <TextField
            label="Secret access key"
            value={secretAccessKey}
            onChange={(e) => setSecretAccessKey(e.target.value)}
            type="password"
            size="small"
            fullWidth
            autoComplete="new-password"
          />
          <TextField
            label="Endpoint (optional, for S3-compatible)"
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
            placeholder="https://..."
            size="small"
            fullWidth
          />
          <Box>
            <Button
              variant="contained"
              onClick={handleS3}
              disabled={!s3Valid || saving}
              sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2 }}
            >
              {saving ? 'Probing & saving…' : 'Connect S3'}
            </Button>
          </Box>
          {error && (
            <Alert severity="error" onClose={() => setError(null)}>
              {error}
            </Alert>
          )}
        </Stack>
      </Collapse>

      <ConnectStorageWizard
        open={supaOpen}
        onClose={() => setSupaOpen(false)}
        onSaved={async () => {
          setSupaOpen(false);
          await progress.storage.refresh();
        }}
      />
    </StepShell>
  );
}
