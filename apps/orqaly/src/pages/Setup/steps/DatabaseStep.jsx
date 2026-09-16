import { useState } from 'react';
import { Box, TextField, Button, Alert, Stack, Typography, useTheme, alpha } from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { saveUserKey } from '../../../services/userKeysService';
import StepShell from './StepShell';

import AppIcon from '../../../components/icons/AppIcon';

const SUPABASE_URL_RE = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i;

/**
 * Step 2 - Database. Explains the data split (platform Supabase keeps only auth;
 * the user's data lives in their own Supabase) and securely stores the user's
 * Supabase credentials (encrypted, in the key vault). Live data routing rolls
 * out later; this just captures the connection.
 */
export default function DatabaseStep({ progress }) {
  const theme = useTheme();
  const tint = theme.palette.primary.main;
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const valid = SUPABASE_URL_RE.test(url.trim()) && key.trim().length >= 30;

  const handleConnect = async () => {
    if (!valid || saving) return;
    setSaving(true);
    setError(null);
    try {
      await saveUserKey({
        provider: 'database:supabase',
        apiKey: JSON.stringify({ url: url.trim().replace(/\/$/, ''), serviceRoleKey: key.trim() }),
        skipProbe: true,
      });
      setUrl('');
      setKey('');
      await progress.database.refresh();
    } catch (e) {
      setError(e.message || 'Failed to save database connection');
    } finally {
      setSaving(false);
    }
  };

  return (
    <StepShell
      topic="Database"
      title="Connect Database"
      done={progress.database.done}
      description="Keep your data in your own Supabase. We store only what we must."
    >
      <Box
        sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5, mb: 2 }}
      >
        <Box sx={{ p: 1.5, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            Platform Supabase
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Only auth - your login, password and system records. No personal data.
          </Typography>
        </Box>
        <Box
          sx={{
            p: 1.5,
            borderRadius: 2,
            border: '1px solid',
            borderColor: alpha(tint, 0.3),
            bgcolor: alpha(tint, 0.05),
          }}
        >
          <Typography variant="subtitle2" sx={{ fontWeight: 700, color: tint }}>
            Your Supabase
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Your application data and backups live here, fully under your control.
          </Typography>
        </Box>
      </Box>
      {progress.database.done ? (
        <Alert severity="success">
          Your database is connected. We'll route your data here as this rolls out.
        </Alert>
      ) : (
        <Stack spacing={1.5}>
          <Alert
            severity="info"
            icon={<AppIcon name="LockOutlined" fallback={LockOutlinedIcon} fontSize="small" />}
          >
            We encrypt your service-role key (AES-256-GCM). Live data routing rolls out next - for
            now we securely store the connection.
          </Alert>
          <TextField
            label="Supabase Project URL"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://xxxx.supabase.co"
            size="small"
            fullWidth
            helperText="Settings -> API -> Project URL"
          />
          <TextField
            label="Service-role key"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="eyJhbGciOiJI..."
            type="password"
            size="small"
            fullWidth
            autoComplete="new-password"
            helperText="The service_role secret (not the anon key)."
          />
          <Box>
            <Button
              variant="contained"
              onClick={handleConnect}
              disabled={!valid || saving}
              sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2 }}
            >
              {saving ? 'Saving…' : 'Connect my database'}
            </Button>
          </Box>
          {error && (
            <Alert severity="error" onClose={() => setError(null)}>
              {error}
            </Alert>
          )}
        </Stack>
      )}
    </StepShell>
  );
}
