/**
 * BrandKit settings page - view + edit the persistent brand tokens that
 * Designer agents reuse across goals. Backed by /api/app?path=brand-kit.
 *
 * When this page saves, the next landing-page goal's brand-seed stage
 * will load this kit directly instead of generating fresh values.
 */
import { useEffect, useState, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Stack,
  Chip,
  Alert,
  CircularProgress,
  Divider,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import { supabase } from '../../../lib/supabase';

import AppIcon from '../../../components/icons/AppIcon';

const DEFAULT_PALETTE = ['#1E293B', '#475569', '#F59E0B', '#FAFAF9', '#0F172A', '#E2E8F0'];
const DEFAULT_FONTS = ['Inter', 'Playfair Display'];
const PALETTE_LABELS = ['Primary', 'Secondary', 'Accent', 'Background', 'Text', 'Border'];

async function api(op, opts = {}) {
  const { method = 'GET', body } = opts;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  const res = await fetch(`/api/app?path=brand-kit&op=${op}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Brand kit API error ${res.status}`);
  }
  return res.json();
}

export default function BrandKit() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [kit, setKit] = useState({
    palette: [...DEFAULT_PALETTE],
    fonts: [...DEFAULT_FONTS],
    vibe: '',
    mood_words: [],
    target_audience: '',
    tone: '',
    logo_url: '',
  });
  const [moodInput, setMoodInput] = useState('');
  const [stale, setStale] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const data = await api('get');
      if (data) {
        setKit({
          palette:
            Array.isArray(data.palette) && data.palette.length
              ? data.palette
              : [...DEFAULT_PALETTE],
          fonts: Array.isArray(data.fonts) && data.fonts.length ? data.fonts : [...DEFAULT_FONTS],
          vibe: data.vibe || '',
          mood_words: Array.isArray(data.mood_words) ? data.mood_words : [],
          target_audience: data.target_audience || '',
          tone: data.tone || '',
          logo_url: data.logo_url || '',
        });
        setStale(data.stale_at ? data.stale_reason || 'Marked stale by recent vision QA' : null);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handlePaletteChange = (index, value) => {
    setKit((prev) => {
      const next = [...prev.palette];
      next[index] = value;
      return { ...prev, palette: next };
    });
  };

  const handleFontChange = (index, value) => {
    setKit((prev) => {
      const next = [...prev.fonts];
      next[index] = value;
      return { ...prev, fonts: next };
    });
  };

  const handleAddMood = () => {
    const word = moodInput.trim();
    if (!word) return;
    if (kit.mood_words.includes(word)) return;
    setKit((prev) => ({ ...prev, mood_words: [...prev.mood_words, word].slice(0, 12) }));
    setMoodInput('');
  };

  const handleRemoveMood = (word) => {
    setKit((prev) => ({ ...prev, mood_words: prev.mood_words.filter((w) => w !== word) }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError('');
      setMessage('');
      await api('upsert', { method: 'PUT', body: kit });
      setMessage('Brand kit saved. Future goals will use these tokens.');
      setStale(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 880, mx: 'auto', p: 3 }}>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
        Brand kit
      </Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
        These tokens persist across goals. The Designer agent uses them as the foundation for every
        landing page, so updates here propagate to your next goal automatically.
      </Typography>
      {stale && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Recent visual QA flagged this kit as stale: {stale}. Saving will clear the flag.
        </Alert>
      )}
      {message && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {message}
        </Alert>
      )}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <Paper variant="outlined" sx={{ p: 3, mb: 2, borderRadius: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>
          Palette
        </Typography>
        <Stack spacing={1.5}>
          {kit.palette.map((hex, i) => (
            <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box
                sx={{
                  width: 36,
                  height: 36,
                  borderRadius: 1,
                  bgcolor: hex,
                  border: '1px solid',
                  borderColor: 'divider',
                }}
              />
              <TextField
                size="small"
                label={PALETTE_LABELS[i] || `Color ${i + 1}`}
                value={hex}
                onChange={(e) => handlePaletteChange(i, e.target.value)}
                sx={{ flex: 1 }}
              />
            </Box>
          ))}
        </Stack>
      </Paper>
      <Paper variant="outlined" sx={{ p: 3, mb: 2, borderRadius: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>
          Typography
        </Typography>
        <Stack spacing={1.5}>
          <TextField
            size="small"
            label="Primary (headline) Google Font"
            value={kit.fonts[0] || ''}
            onChange={(e) => handleFontChange(0, e.target.value)}
          />
          <TextField
            size="small"
            label="Secondary (body) Google Font"
            value={kit.fonts[1] || ''}
            onChange={(e) => handleFontChange(1, e.target.value)}
          />
        </Stack>
      </Paper>
      <Paper variant="outlined" sx={{ p: 3, mb: 2, borderRadius: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>
          Brand voice
        </Typography>
        <Stack spacing={1.5}>
          <TextField
            size="small"
            label="Vibe (2-5 words)"
            value={kit.vibe}
            onChange={(e) => setKit((p) => ({ ...p, vibe: e.target.value }))}
            placeholder='e.g. "warm artisan", "minimalist nordic"'
          />
          <TextField
            size="small"
            label="Tone"
            value={kit.tone}
            onChange={(e) => setKit((p) => ({ ...p, tone: e.target.value }))}
            placeholder="friendly | formal | urgent | playful | authoritative"
          />
          <TextField
            size="small"
            label="Target audience"
            value={kit.target_audience}
            onChange={(e) => setKit((p) => ({ ...p, target_audience: e.target.value }))}
            placeholder="One-sentence persona"
            multiline
            minRows={2}
          />
          <Box>
            <Typography
              variant="caption"
              sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}
            >
              Mood words (drive image search)
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1 }}>
              {kit.mood_words.map((word) => (
                <Chip
                  key={word}
                  label={word}
                  onDelete={() => handleRemoveMood(word)}
                  size="small"
                />
              ))}
            </Box>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <TextField
                size="small"
                value={moodInput}
                onChange={(e) => setMoodInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddMood();
                  }
                }}
                placeholder="Add a word"
                sx={{ flex: 1 }}
              />
              <Button onClick={handleAddMood} variant="outlined" size="small">
                Add
              </Button>
            </Box>
          </Box>
        </Stack>
      </Paper>
      <Paper variant="outlined" sx={{ p: 3, mb: 2, borderRadius: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>
          Logo
        </Typography>
        <TextField
          size="small"
          fullWidth
          label="Logo URL (optional)"
          value={kit.logo_url}
          onChange={(e) => setKit((p) => ({ ...p, logo_url: e.target.value }))}
          placeholder="https://…"
        />
      </Paper>
      <Divider sx={{ my: 2 }} />
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
        <Button onClick={load} disabled={saving}>
          Reload
        </Button>
        <Button
          onClick={handleSave}
          variant="contained"
          startIcon={<AppIcon name="Save" fallback={SaveIcon} sx={{ fontSize: 18 }} />}
          disabled={saving}
        >
          {saving ? 'Saving…' : 'Save brand kit'}
        </Button>
      </Box>
    </Box>
  );
}
