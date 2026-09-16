import { useState } from 'react';
import {
  Box,
  Button,
  Stack,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  useTheme,
} from '@mui/material';
import { saveUserKey } from '../../../services/userKeysService';
import LocalLlmInstructionsDialog from '../../../components/Setup/LocalLlmInstructionsDialog';
import StepShell from './StepShell';

/**
 * Step 5 - Local LLM. Pick an engine (Ollama / LM Studio), set the base URL and
 * save. "How to set up?" opens the existing install instructions.
 */
export default function LocalLlmStep({ progress }) {
  const theme = useTheme();
  const tint = theme.palette.primary.main;
  const [engine, setEngine] = useState('llm:ollama');
  const [url, setUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [instr, setInstr] = useState(false);

  const handleSave = async () => {
    if (saving) return;
    const base =
      url.trim() ||
      (engine === 'llm:ollama' ? 'http://localhost:11434' : 'http://localhost:1234/v1');
    setSaving(true);
    setError(null);
    try {
      await saveUserKey({ provider: engine, apiKey: base, skipProbe: true });
      await progress.localLlm.refresh();
    } catch (e) {
      setError(e.message || 'Failed to connect local LLM');
    } finally {
      setSaving(false);
    }
  };

  return (
    <StepShell
      topic="Local LLM"
      title="Download and Use"
      done={progress.localLlm.done}
      description="Run models on your own machine with Ollama or LM Studio. Stay private and cut the cost of paid models."
    >
      <Stack spacing={1.5}>
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel id="local-engine">Engine</InputLabel>
            <Select
              labelId="local-engine"
              label="Engine"
              value={engine}
              onChange={(e) => {
                setEngine(e.target.value);
                setUrl('');
              }}
            >
              <MenuItem value="llm:ollama">Ollama</MenuItem>
              <MenuItem value="llm:local-openai">LM Studio / Compatible</MenuItem>
            </Select>
          </FormControl>
          <TextField
            label="Base URL"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={
              engine === 'llm:ollama' ? 'http://localhost:11434' : 'http://localhost:1234/v1'
            }
            size="small"
            sx={{ flex: 1, minWidth: 220 }}
          />
        </Box>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving}
            sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2 }}
          >
            {saving ? 'Saving…' : 'Save & use'}
          </Button>
          <Button
            variant="text"
            onClick={() => setInstr(true)}
            sx={{ textTransform: 'none', fontWeight: 600, color: tint }}
          >
            How to set up?
          </Button>
        </Box>
        {progress.localLlm.done && <Alert severity="success">Local LLM connected.</Alert>}
        {error && (
          <Alert severity="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
      </Stack>
      <LocalLlmInstructionsDialog open={instr} onClose={() => setInstr(false)} />
    </StepShell>
  );
}
