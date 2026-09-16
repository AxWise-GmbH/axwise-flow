/**
 * ByokByosCard — the Core step (first, and the activation gate). Pick the
 * assistant's Core: LLM provider, model, an API key (bring your own — reuses the
 * encrypted user_api_keys store), plus tone and creativity. This absorbs the old
 * Dashboard "Configure AI Assistant" dialog. (Bring-your-own-storage connect is
 * offered in a later phase.)
 */
import { useState } from 'react';
import { Box, MenuItem, FormControl, InputLabel, Select, Slider, Typography } from '@mui/material';
import KeyRoundedIcon from '@mui/icons-material/KeyRounded';
import { useUserApiKeys } from '../../../hooks/useUserApiKeys';
import {
  DEFAULT_ASSISTANT_MODEL,
  DEFAULT_ASSISTANT_PROVIDER,
  TONES,
} from '../../../config/assistantBrain';
import SetupCardShell from './SetupCardShell';
import LlmCoreChooser, { CORE_MODES, commitLlmCoreChoice } from './LlmCoreChooser';

export function initialCore(config) {
  // Platform credits, local environment keys, and non-Gemini providers were
  // previously accepted here, but hosted goal setup is pinned to user-scoped
  // Gemini. Guide every legacy setup to the path that can actually run goals.
  const isGeminiCore = !config?.usePlatformKey && config?.provider === DEFAULT_ASSISTANT_PROVIDER;
  return {
    mode: CORE_MODES.BYOK,
    provider: DEFAULT_ASSISTANT_PROVIDER,
    model: isGeminiCore ? config?.model || DEFAULT_ASSISTANT_MODEL : DEFAULT_ASSISTANT_MODEL,
    keyId: isGeminiCore ? config?.keyId || '' : '',
    newKey: '',
  };
}

export default function ByokByosCard({ config, onComplete, onSkip, embedded }) {
  const { keys, save: saveKey, test: testKey } = useUserApiKeys();
  const [core, setCore] = useState(() => initialCore(config));
  const [tone, setTone] = useState(config?.tone || 'friendly');
  const [temperature, setTemperature] = useState(config?.temperature ?? 0.6);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const handleSave = async () => {
    setError(null);
    setBusy(true);
    try {
      const resolved = await commitLlmCoreChoice(core, saveKey, keys);
      onComplete({ config: { ...resolved, tone, temperature } });
    } catch (err) {
      setError(err.message || 'Could not save the assistant Core.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SetupCardShell
      title="Choose the assistant's Core (BYOK)"
      icon={KeyRoundedIcon}
      embedded={embedded}
      primaryLabel="Save Core"
      onPrimary={handleSave}
      busy={busy}
      onSkip={onSkip}
      error={error}
    >
      <LlmCoreChooser value={core} onChange={setCore} keys={keys} onTestKey={testKey} />

      <FormControl size="small" fullWidth>
        <InputLabel>Tone</InputLabel>
        <Select label="Tone" value={tone} onChange={(e) => setTone(e.target.value)}>
          {TONES.map((t) => (
            <MenuItem key={t} value={t} sx={{ textTransform: 'capitalize' }}>
              {t}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <Box>
        <Typography variant="caption" color="text.secondary">
          Creativity: {temperature}
        </Typography>
        <Slider
          size="small"
          value={temperature}
          min={0}
          max={1.5}
          step={0.1}
          onChange={(_, v) => setTemperature(v)}
        />
      </Box>
    </SetupCardShell>
  );
}
