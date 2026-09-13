import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Stack,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Switch,
  Typography,
  LinearProgress,
  Box,
  Alert,
} from '@mui/material';
import { materializeImportedAgents } from '../../services/agentImportMaterializer';
import { DEFAULT_LLM_MODEL, DEFAULT_LLM_PROVIDER } from '../../config/assistantBrain';

// Kept local (not imported from AgentHub.jsx) so this dialog doesn't pull the
// ~10k-line lazy-loaded Agent Hub page into the Marketplace bundle.
const PROVIDER_OPTIONS = [
  { id: DEFAULT_LLM_PROVIDER, label: 'Google Gemini', models: [DEFAULT_LLM_MODEL] },
  { id: 'glm', label: 'GLM', models: ['glm-5.1', 'glm-4.6', 'glm-4-plus'] },
  { id: 'groq', label: 'Groq', models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'] },
  { id: 'openai', label: 'OpenAI', models: ['gpt-4o', 'gpt-4o-mini'] },
  {
    id: 'anthropic',
    label: 'Anthropic',
    models: ['claude-sonnet-5', 'claude-haiku-4-5'],
  },
  { id: 'deepseek', label: 'DeepSeek', models: ['deepseek-chat', 'deepseek-reasoner'] },
];

export default function BulkActivateAgentsDialog({ open, onClose, agents, onComplete }) {
  const [provider, setProvider] = useState(DEFAULT_LLM_PROVIDER);
  const [model, setModel] = useState(DEFAULT_LLM_MODEL);
  const [generatePhotos, setGeneratePhotos] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, photosDone: 0 });
  const [result, setResult] = useState(null);

  const total = agents?.length || 0;
  const models = PROVIDER_OPTIONS.find((p) => p.id === provider)?.models || [];

  const handleProviderChange = (e) => {
    const next = e.target.value;
    const nextModels = PROVIDER_OPTIONS.find((p) => p.id === next)?.models || [];
    setProvider(next);
    setModel(nextModels[0] || '');
  };

  const reset = () => {
    setResult(null);
    setProgress({ done: 0, photosDone: 0 });
  };

  const handleClose = () => {
    if (running) return;
    reset();
    onClose?.();
  };

  const handleActivate = async () => {
    setRunning(true);
    setResult(null);
    let done = 0;
    let photosDone = 0;
    try {
      const res = await materializeImportedAgents(agents, {
        provider,
        model,
        generatePhotos,
        onProgress: (evt) => {
          if (evt.type === 'created' || evt.type === 'skipped') {
            done += 1;
            setProgress((p) => ({ ...p, done }));
          } else if (evt.type === 'photo-done' || evt.type === 'photo-error') {
            photosDone += 1;
            setProgress((p) => ({ ...p, photosDone }));
          }
        },
      });
      setResult(res);
      onComplete?.(res);
    } catch (err) {
      setResult({ error: err.message || 'Activation failed' });
    } finally {
      setRunning(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
      <DialogTitle>
        Activate {total} agent{total === 1 ? '' : 's'}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Each selected persona becomes a live Agent Hub agent with this LLM assigned and its
            profile filled in automatically.
          </Typography>
          <FormControl size="small" fullWidth disabled={running || !!result}>
            <InputLabel>Provider</InputLabel>
            <Select label="Provider" value={provider} onChange={handleProviderChange}>
              {PROVIDER_OPTIONS.map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  {p.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" fullWidth disabled={running || !!result}>
            <InputLabel>Model</InputLabel>
            <Select label="Model" value={model} onChange={(e) => setModel(e.target.value)}>
              {models.map((m) => (
                <MenuItem key={m} value={m}>
                  {m}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControlLabel
            control={
              <Switch
                checked={generatePhotos}
                onChange={(e) => setGeneratePhotos(e.target.checked)}
                disabled={running || !!result}
              />
            }
            label="Generate photos now"
          />
          {generatePhotos && !result && (
            <Alert severity="warning" sx={{ fontSize: '0.78rem' }}>
              Each photo is a paid AI image generation call — {total} agent{total === 1 ? '' : 's'}{' '}
              means up to {total} calls.
            </Alert>
          )}
          {(running || result) && (
            <Box>
              <LinearProgress
                variant="determinate"
                value={total ? Math.min(100, (progress.done / total) * 100) : 0}
              />
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ mt: 0.5, display: 'block' }}
              >
                {progress.done}/{total} processed
                {generatePhotos ? ` · ${progress.photosDone} photos processed` : ''}
              </Typography>
            </Box>
          )}
          {result && !result.error && (
            <Alert severity="success" sx={{ fontSize: '0.8rem' }}>
              {result.createdCount} activated
              {result.skippedCount ? `, ${result.skippedCount} skipped (already exist)` : ''}
              {generatePhotos
                ? `, ${result.photosGenerated} photo${result.photosGenerated === 1 ? '' : 's'} generated${
                    result.photoFailures ? `, ${result.photoFailures} photo failures` : ''
                  }`
                : ''}
              .
            </Alert>
          )}
          {result?.error && <Alert severity="error">{result.error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={running}>
          {result ? 'Close' : 'Cancel'}
        </Button>
        {!result && (
          <Button variant="contained" onClick={handleActivate} disabled={running || total === 0}>
            {running ? 'Activating…' : `Activate ${total}`}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
