import { useState } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Slider,
  FormControl,
  Select,
  MenuItem,
  Chip,
  alpha,
  useTheme,
} from '@mui/material';
import { keyframes } from '@mui/system';
import GraphicEqRoundedIcon from '@mui/icons-material/GraphicEqRounded';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import PauseRoundedIcon from '@mui/icons-material/PauseRounded';
import BentoCard from '../../../components/Common/BentoCard';
import { EditButton, SectionLabel, StatusDot } from './_shared';
import { speak, stopSpeaking } from '../../../services/ttsService';

import AppIcon from '../../../components/icons/AppIcon';

const BAR_COUNT = 36;
// Deterministic pseudo-waveform (no Math.random) so renders and tests stay stable.
const WAVE = Array.from({ length: BAR_COUNT }, (_, i) => {
  const a = Math.sin(i * 0.7) + Math.sin(i * 0.27 + 1);
  return 0.35 + ((a + 2) / 4) * 0.65;
});

// Equalizer pulse — bars scale vertically from their center. Per-bar duration
// and delay (derived from the index, no Math.random) give an organic, offset wave.
const equalize = keyframes`
  0%, 100% { transform: scaleY(0.35); }
  50% { transform: scaleY(1); }
`;

const PROVIDER_LABEL = { voicebox: 'Voicebox (local)', builtin: 'Built-in voice' };

/** Voice identity, provider, live status, voice picker, and a sample preview. */
export default function VoiceSampleCard({ voice, onEdit, onProfileChange }) {
  const theme = useTheme();
  const [playing, setPlaying] = useState(false);
  const reachable = voice.status !== 'unreachable';
  const profiles = voice.profiles || [];
  const profileId = profiles.some((p) => p.id === voice.profileId)
    ? voice.profileId
    : profiles[0]?.id || '';

  const togglePlay = async () => {
    if (!voice.sampleText) return;
    if (playing) {
      stopSpeaking();
      setPlaying(false);
      return;
    }
    setPlaying(true);
    try {
      await speak({
        text: voice.sampleText,
        provider: voice.provider,
        onEnd: () => setPlaying(false),
      });
    } catch {
      setPlaying(false);
    }
  };

  return (
    <BentoCard
      title="Voice"
      icon={GraphicEqRoundedIcon}
      action={<EditButton onClick={onEdit} />}
      plainHeader
      scrollBody
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Chip
          size="small"
          variant="outlined"
          label={PROVIDER_LABEL[voice.provider] || voice.provider}
          sx={{ fontWeight: 700 }}
        />
        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
          <StatusDot color={reachable ? theme.palette.success.main : theme.palette.error.main} />
          <Typography
            variant="caption"
            sx={{ color: reachable ? 'success.main' : 'error.main', fontWeight: 700 }}
          >
            {reachable ? 'Reachable' : 'Unreachable'}
          </Typography>
        </Box>
        {voice.language && (
          <Typography variant="caption" color="text.secondary">
            {voice.language}
          </Typography>
        )}
      </Box>
      {profiles.length > 0 && (
        <Box sx={{ mt: 1.5 }}>
          <SectionLabel>Voice ({profiles.length} available)</SectionLabel>
          <FormControl size="small" fullWidth sx={{ mt: 0.5 }}>
            <Select
              value={profileId}
              aria-label="Voice profile"
              onChange={(e) => onProfileChange && onProfileChange(e.target.value)}
              sx={{ '& .MuiSelect-select': { py: 0.85, fontWeight: 700 } }}
            >
              {profiles.map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  {p.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
      )}
      {voice.sampleText && (
        <Box sx={{ mt: 1.5 }}>
          <SectionLabel>Preview</SectionLabel>
          <Typography variant="body2" sx={{ mt: 0.5 }}>
            {voice.sampleText}
          </Typography>
        </Box>
      )}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 1.5 }}>
        <IconButton
          aria-label={playing ? 'Pause voice preview' : 'Play voice preview'}
          onClick={togglePlay}
          disabled={!voice.sampleText}
          sx={{
            bgcolor: alpha(theme.palette.primary.main, 0.16),
            color: 'primary.main',
            '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.24) },
          }}
        >
          {playing ? (
            <AppIcon name="PauseRounded" fallback={PauseRoundedIcon} />
          ) : (
            <AppIcon name="PlayArrowRounded" fallback={PlayArrowRoundedIcon} />
          )}
        </IconButton>
        <Slider
          value={0}
          disabled
          aria-label="Preview position"
          sx={{ flex: 1, '&.Mui-disabled': { color: alpha(theme.palette.primary.main, 0.5) } }}
        />
        <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
          {voice.positionLabel} / {voice.durationLabel}
        </Typography>
      </Box>
      {/* Full-width animated waveform, pinned to the bottom to match the
          Profile & Brain pulse footer (no voice-name label). */}
      <Box
        data-testid="voice-waveform"
        sx={{
          mt: 'auto',
          pt: 1.5,
          width: '100%',
          height: 120,
          display: 'flex',
          alignItems: 'center',
          gap: '3px',
        }}
      >
        {WAVE.map((h, i) => (
          <Box
            key={i}
            sx={{
              flex: 1,
              minWidth: 2,
              borderRadius: 2,
              height: `${Math.round(h * 100)}%`,
              transformOrigin: 'center',
              bgcolor: alpha(theme.palette.primary.main, playing ? 0.7 : 0.45),
              animation: `${equalize} ${(playing ? 0.55 : 1.1) + (i % 6) * 0.1}s ease-in-out ${(i % 8) * 0.07}s infinite`,
              '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
            }}
          />
        ))}
      </Box>
    </BentoCard>
  );
}
