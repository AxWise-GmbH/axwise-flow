import { useMemo, useState } from 'react';
import { Box, TextField, Button, Stack, Chip, Alert, Divider, Typography } from '@mui/material';
import { saveUserKey, testUserKey } from '../../../services/userKeysService';
import StepShell from './StepShell';
import LlmCoreChooser, {
  commitLlmCoreChoice,
} from '../../../components/Assistant/cards/LlmCoreChooser';

const isGeminiKey = (provider) => provider === 'llm:gemini';

/**
 * Step 3 - Bring Your Own Keys. Leads with the shared provider-key chooser
 * for the LLM Core, then keeps a
 * free-text "add another provider key" fallback below for tool/service
 * credentials (e.g. tool:tool-analytics) that fall outside that framing.
 */
export default function KeysStep({ progress }) {
  const [core, setCore] = useState({
    mode: 'byok',
    provider: 'gemini',
    model: '',
    keyId: '',
    newKey: '',
  });
  const [coreBusy, setCoreBusy] = useState(false);
  const [coreError, setCoreError] = useState(null);
  const [coreSaved, setCoreSaved] = useState(false);

  const [provider, setProvider] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const geminiKeys = useMemo(
    () => (progress.keys.keys || []).filter((key) => isGeminiKey(key.provider)),
    [progress.keys.keys]
  );
  const canSubmit = provider.trim() && apiKey.trim().length >= 8;
  const normProvider = () => {
    const p = provider.trim().toLowerCase();
    return p.includes(':') ? p : `llm:${p}`;
  };

  const handleSaveCore = async () => {
    setCoreError(null);
    setCoreBusy(true);
    try {
      await commitLlmCoreChoice(core, (input) => saveUserKey(input), progress.keys.keys || []);
      setCoreSaved(true);
      await progress.keys.refresh();
    } catch (e) {
      setCoreError(e.message || 'Could not save the AI Core.');
    } finally {
      setCoreBusy(false);
    }
  };

  const handleTest = async () => {
    if (!canSubmit || testing) return;
    setTesting(true);
    setError(null);
    setNotice(null);
    try {
      const res = await testUserKey({ provider: normProvider(), apiKey: apiKey.trim() });
      setNotice(
        res?.ok === false ? `Key looks invalid: ${res?.error || 'failed'}` : 'Key looks valid.'
      );
    } catch (e) {
      setError(e.message || 'Test failed');
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!canSubmit || saving) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await saveUserKey({
        provider: normProvider(),
        apiKey: apiKey.trim(),
        label: label.trim() || null,
        skipProbe: true,
      });
      setProvider('');
      setApiKey('');
      setLabel('');
      await progress.keys.refresh();
    } catch (e) {
      setError(e.message || 'Failed to save key');
    } finally {
      setSaving(false);
    }
  };

  return (
    <StepShell
      topic="Keys"
      title="Bring Your Own Keys"
      done={progress.keys.done}
      description="Connect Google Gemini, the provider used to run goals in this release. You can store other tool or provider keys below, but they do not complete goal setup. We encrypt every saved key."
    >
      {geminiKeys.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 2 }}>
          {geminiKeys.map((k) => (
            <Chip
              key={k.id}
              size="small"
              color="success"
              variant="outlined"
              // The API returns camelCase (user-api-keys.js:83). Reading
              // masked_preview meant every preview was silently blank.
              label={`${k.label || k.provider}${k.maskedPreview ? ` (${k.maskedPreview})` : ''}`}
            />
          ))}
        </Box>
      )}

      <LlmCoreChooser
        value={core}
        onChange={setCore}
        keys={progress.keys.keys || []}
        onTestKey={testUserKey}
      />
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 1.5 }}>
        <Button
          variant="contained"
          onClick={handleSaveCore}
          disabled={coreBusy}
          sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2 }}
        >
          {coreBusy ? 'Saving…' : 'Save AI Core'}
        </Button>
        {coreSaved && (
          <Typography variant="caption" color="success.main">
            Saved.
          </Typography>
        )}
      </Box>
      {coreError && (
        <Alert severity="error" sx={{ mt: 1 }} onClose={() => setCoreError(null)}>
          {coreError}
        </Alert>
      )}

      <Divider sx={{ my: 2.5 }} />
      <Typography variant="body2" sx={{ fontWeight: 700, mb: 1 }}>
        + Add another provider key
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
        For optional tools and services outside the Gemini goal Core (e.g. tool:tool-analytics).
        These keys do not make goal setup ready.
      </Typography>

      <Stack spacing={1.5}>
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
          <TextField
            label="Provider ID"
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            placeholder="e.g. tool:tool-analytics, comm:slack"
            size="small"
            sx={{ flex: 1, minWidth: 200 }}
          />
          <TextField
            label="Label (optional)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Prod key"
            size="small"
            sx={{ flex: 1, minWidth: 160 }}
          />
        </Box>
        <TextField
          label="Provider key"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="Paste your API key"
          type="password"
          size="small"
          fullWidth
          autoComplete="new-password"
        />
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={!canSubmit || saving}
            sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2 }}
          >
            {saving ? 'Saving…' : 'Save key'}
          </Button>
          <Button
            variant="text"
            onClick={handleTest}
            disabled={!canSubmit || testing}
            sx={{ textTransform: 'none', fontWeight: 600 }}
          >
            {testing ? 'Testing…' : 'Test key'}
          </Button>
        </Box>
        {notice && (
          <Alert severity="info" onClose={() => setNotice(null)}>
            {notice}
          </Alert>
        )}
        {error && (
          <Alert severity="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
      </Stack>
    </StepShell>
  );
}
