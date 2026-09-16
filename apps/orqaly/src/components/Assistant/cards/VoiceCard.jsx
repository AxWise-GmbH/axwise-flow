/**
 * VoiceCard - opt-in "Voice" step. Lets the user talk to the assistant and hear
 * a human-like reply. Two providers:
 *
 *  - Voicebox: a free local desktop app (https://voicebox.sh) running on the
 *    user's machine. Highest quality + private, but only works on that machine
 *    and requires a one-time CORS allow-list (see VoiceboxInstructionsDialog).
 *  - Built-in: the existing ElevenLabs / browser voice - works everywhere, no setup.
 *
 * Saved into assistant_setup.config.voice via the shared onComplete(patch)
 * contract. No secret is stored (Voicebox needs none), just the local URL +
 * chosen profile, so this does NOT touch user_api_keys.
 */
import { useState } from 'react';
import {
  Box,
  Stack,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  ToggleButton,
  ToggleButtonGroup,
  Button,
  Alert,
  Typography,
  Link,
} from '@mui/material';
import GraphicEqRoundedIcon from '@mui/icons-material/GraphicEqRounded';
import SetupCardShell from './SetupCardShell';
import VoiceboxInstructionsDialog from '../../Setup/VoiceboxInstructionsDialog';
import {
  isAvailable,
  listProfiles,
  clearAvailabilityCache,
  DEFAULT_BASE_URL,
  DEFAULT_CLIENT_ID,
} from '../../../services/voiceboxService';

export default function VoiceCard({ config, onComplete, onSkip, embedded }) {
  const initial = config?.voice || {};
  const [provider, setProvider] = useState(initial.provider || 'voicebox');
  const [baseUrl, setBaseUrl] = useState(initial.baseUrl || DEFAULT_BASE_URL);
  const [clientId] = useState(initial.clientId || DEFAULT_CLIENT_ID);
  const [profileId, setProfileId] = useState(initial.profileId || '');
  const [profiles, setProfiles] = useState([]);
  const [testState, setTestState] = useState('idle'); // idle | testing | ok | fail
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  // A changed URL invalidates the previous probe + profile list.
  const handleUrlChange = (e) => {
    setBaseUrl(e.target.value);
    setTestState('idle');
    setProfiles([]);
  };

  const handleTest = async () => {
    setError(null);
    setTestState('testing');
    clearAvailabilityCache();
    const avail = await isAvailable({ baseUrl, timeoutMs: 2500 });
    if (!avail.ok) {
      setTestState('fail');
      setError(
        'Voicebox is not reachable. Make sure it is running and that this site is listed in ' +
          'VOICEBOX_CORS_ORIGINS, then test again. See the setup guide below.'
      );
      return;
    }
    try {
      const list = await listProfiles({ baseUrl });
      setProfiles(list);
      if (list.length && !list.some((p) => p.id === profileId)) {
        setProfileId(list[0].id);
      }
      setTestState('ok');
    } catch {
      // Reachable but couldn't read profiles - still usable with the default voice.
      setProfiles([]);
      setTestState('ok');
    }
  };

  const handleSave = () => {
    setBusy(true);
    const voice =
      provider === 'voicebox'
        ? { provider: 'voicebox', baseUrl: baseUrl.trim(), profileId: profileId || null, clientId }
        : { provider: 'builtin' };
    onComplete({ config: { voice } });
    setBusy(false);
  };

  return (
    <SetupCardShell
      title="Voice - talk &amp; listen"
      icon={GraphicEqRoundedIcon}
      embedded={embedded}
      primaryLabel="Save voice"
      onPrimary={handleSave}
      busy={busy}
      onSkip={onSkip}
      error={error}
    >
      <Typography variant="body2" color="text.secondary">
        Press the mic and talk to your assistant, then hear it reply.
      </Typography>

      <ToggleButtonGroup
        size="small"
        exclusive
        value={provider}
        onChange={(_e, v) => {
          if (v) {
            setProvider(v);
            setError(null);
          }
        }}
        aria-label="Voice provider"
        sx={{
          '& .MuiToggleButton-root': {
            textTransform: 'none',
            fontWeight: 600,
            borderRadius: 2,
            px: 1.75,
          },
        }}
      >
        <ToggleButton value="voicebox">Voicebox (local, human-like)</ToggleButton>
        <ToggleButton value="builtin">Built-in voice</ToggleButton>
      </ToggleButtonGroup>

      {provider === 'voicebox' ? (
        <>
          <TextField
            size="small"
            fullWidth
            label="Voicebox URL"
            value={baseUrl}
            onChange={handleUrlChange}
            placeholder={DEFAULT_BASE_URL}
          />

          <Stack direction="row" spacing={1} alignItems="center">
            <Button
              size="small"
              variant="outlined"
              onClick={handleTest}
              disabled={testState === 'testing'}
              sx={{ textTransform: 'none', borderRadius: 2, fontWeight: 700 }}
            >
              {testState === 'testing' ? 'Testing…' : 'Test connection'}
            </Button>
            {testState === 'ok' && (
              <Typography variant="caption" color="success.main">
                Connected
                {profiles.length
                  ? ` - ${profiles.length} voice${profiles.length === 1 ? '' : 's'}`
                  : ''}
              </Typography>
            )}
          </Stack>

          {testState === 'ok' && profiles.length > 0 && (
            <FormControl size="small" fullWidth>
              <InputLabel>Voice profile</InputLabel>
              <Select
                label="Voice profile"
                value={profileId}
                onChange={(e) => setProfileId(e.target.value)}
              >
                {profiles.map((p) => (
                  <MenuItem key={p.id} value={p.id}>
                    {p.name || p.id}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          <Box>
            <Link
              component="button"
              type="button"
              variant="caption"
              onClick={() => setHelpOpen(true)}
            >
              How to set up Voicebox?
            </Link>
          </Box>

          {testState === 'ok' && (
            <Alert severity="success" sx={{ py: 0 }}>
              Voicebox is ready. Press <strong>Save voice</strong>, then use the mic in chat.
            </Alert>
          )}
        </>
      ) : (
        <Alert severity="info" sx={{ py: 0 }}>
          Uses the built-in cloud/browser voice - no setup needed. Works on any device.
        </Alert>
      )}

      <VoiceboxInstructionsDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
    </SetupCardShell>
  );
}
