/**
 * [module: design-system + connection-hub]
 * PersonalityPicker - compact MUI Select for choosing a Telegram channel's
 * bot personality. Reused by ConnectTelegram and SettingsTab.
 *
 * Mobile-first: stacks vertically below 600px, full-width select, helper text
 * always visible. Brand-consistent dark surface, rounded corners (2.5),
 * MUI typography tokens.
 */
import { useState } from 'react';
import {
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Typography,
  CircularProgress,
  Alert,
  useTheme,
  alpha,
} from '@mui/material';
import RecordVoiceOverOutlinedIcon from '@mui/icons-material/RecordVoiceOverOutlined';
import CheckIcon from '@mui/icons-material/Check';
import BusinessCenterOutlinedIcon from '@mui/icons-material/BusinessCenterOutlined';
import SentimentSatisfiedAltOutlinedIcon from '@mui/icons-material/SentimentSatisfiedAltOutlined';
import EngineeringOutlinedIcon from '@mui/icons-material/EngineeringOutlined';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import { PERSONALITY_OPTIONS, setChannelPersonality } from '../../../services/communicatorService';

import AppIcon from '../../../components/icons/AppIcon';

const PERSONALITY_ICONS = {
  professional: BusinessCenterOutlinedIcon,
  friendly: SentimentSatisfiedAltOutlinedIcon,
  technical: EngineeringOutlinedIcon,
  creative: AutoAwesomeOutlinedIcon,
  minimal: MoreHorizIcon,
};

export default function PersonalityPicker({
  channelId,
  value = 'professional',
  onChange,
  dense = false,
}) {
  const theme = useTheme();
  const [current, setCurrent] = useState(value);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(0);
  const [err, setErr] = useState('');

  const helper = PERSONALITY_OPTIONS.find((o) => o.value === current)?.helper || '';

  async function handleChange(e) {
    const next = e.target.value;
    if (next === current) return;
    const prev = current;
    setCurrent(next);
    setErr('');
    if (!channelId) {
      onChange?.(next);
      return;
    }
    setSaving(true);
    try {
      await setChannelPersonality(channelId, next);
      setSavedAt(Date.now());
      onChange?.(next);
    } catch (e2) {
      setErr(e2.message || 'Could not save');
      setCurrent(prev);
    } finally {
      setSaving(false);
    }
  }

  const justSaved = savedAt && Date.now() - savedAt < 2500;

  return (
    <Box
      sx={{
        p: dense ? 1.25 : 1.5,
        borderRadius: 2.5,
        bgcolor: alpha(theme.palette.primary.main, 0.04),
        border: '1px solid',
        borderColor: alpha(theme.palette.primary.main, 0.12),
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Box
          sx={{
            width: 28,
            height: 28,
            borderRadius: 1.5,
            flexShrink: 0,
            bgcolor: alpha(theme.palette.primary.main, 0.12),
            color: 'primary.main',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <AppIcon
            name="RecordVoiceOverOutlined"
            fallback={RecordVoiceOverOutlinedIcon}
            sx={{ fontSize: 16 }}
          />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            variant="caption"
            sx={{
              fontWeight: 700,
              fontSize: '0.66rem',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'text.secondary',
            }}
          >
            Bot personality
          </Typography>
        </Box>
        {saving && <CircularProgress size={14} />}
        {!saving && justSaved && (
          <AppIcon name="Check" fallback={CheckIcon} sx={{ fontSize: 16, color: 'success.main' }} />
        )}
      </Box>
      <FormControl size="small" fullWidth>
        <InputLabel id={`personality-${channelId || 'inline'}`}>Tone</InputLabel>
        <Select
          labelId={`personality-${channelId || 'inline'}`}
          label="Tone"
          value={current}
          onChange={handleChange}
          disabled={saving}
          sx={{
            borderRadius: 2,
            '& .MuiSelect-select': { display: 'flex', alignItems: 'center', gap: 1 },
          }}
        >
          {PERSONALITY_OPTIONS.map((o) => {
            const Icon = PERSONALITY_ICONS[o.value];
            return (
              <MenuItem key={o.value} value={o.value}>
                <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
                  {Icon && (
                    <Box component="span" sx={{ display: 'inline-flex', color: 'text.secondary' }}>
                      <AppIcon fallback={Icon} sx={{ fontSize: 18 }} />
                    </Box>
                  )}
                  <Box component="span">{o.label}</Box>
                </Box>
              </MenuItem>
            );
          })}
        </Select>
      </FormControl>
      <Typography
        variant="caption"
        sx={{
          display: 'block',
          mt: 0.75,
          color: 'text.secondary',
          fontSize: '0.72rem',
          lineHeight: 1.4,
        }}
      >
        {helper}
      </Typography>
      {err && (
        <Alert severity="error" sx={{ mt: 1, borderRadius: 2, fontSize: '0.78rem', py: 0.5 }}>
          {err}
        </Alert>
      )}
    </Box>
  );
}
