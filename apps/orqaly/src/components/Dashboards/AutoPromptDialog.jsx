import { useState } from 'react';
import {
  Box,
  Button,
  TextField,
  Typography,
  Chip,
  CircularProgress,
  Stack,
  IconButton,
  InputAdornment,
  Tooltip,
  alpha,
  keyframes,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import FormDialog, { FORM_FIELD_SX } from '../Common/FormDialog';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import MicOutlinedIcon from '@mui/icons-material/MicOutlined';
import StopOutlinedIcon from '@mui/icons-material/StopOutlined';
import { autoBuildDashboard } from '../../services/dashboardService';
import { useVoiceControl } from '../../hooks/useVoiceControl';

import AppIcon from '../icons/AppIcon';

const pulse = keyframes`
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.85; transform: scale(1.05); }
`;

const EXAMPLES = [
  'Agent spend this month by provider, plus top 5 expensive jobs',
  'Goal pipeline overview — by status, by goal kind, top 10 by budget',
  'Lead funnel — counts by status, conversion over time, by source',
  'Financial events this quarter — revenue vs spend trend, by event_type',
];

/**
 * Describe-your-dashboard dialog. Supports initial generation OR refinement
 * (when currentConfig is provided).
 */
export default function AutoPromptDialog({ open, onClose, onApply, currentConfig = null }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isRefinement = Boolean(currentConfig);

  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const voice = useVoiceControl({
    onListeningEnd: (transcript) => {
      const clean = String(transcript || '').trim();
      if (!clean) return;
      setPrompt((prev) => (prev ? `${prev} ${clean}` : clean).slice(0, 1000));
    },
  });

  const handleSubmit = async () => {
    const text = prompt.trim();
    if (!text) {
      setError('Describe what you want to see');
      return;
    }
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const payload = isRefinement
        ? { refinement: text, current_config: currentConfig }
        : { prompt: text };
      const data = await autoBuildDashboard(payload);
      setResult(data);
    } catch (err) {
      setError(err.message || 'Failed to generate');
    } finally {
      setLoading(false);
    }
  };

  const handleApply = () => {
    if (!result) return;
    onApply(result.config);
    handleClose();
  };

  const handleClose = () => {
    voice.stopListening();
    setPrompt('');
    setResult(null);
    setError('');
    onClose();
  };

  return (
    <FormDialog
      open={open}
      onClose={handleClose}
      title={isRefinement ? 'Refine with AI' : 'Auto-build dashboard'}
      icon={AutoAwesomeIcon}
      paperSx={{ borderRadius: isMobile ? 0 : 3, m: { xs: 0, sm: 4 } }}
      contentSx={{ pt: 2, px: { xs: 1.75, sm: 3 } }}
      actions={
        <>
          <Button onClick={handleClose} sx={{ textTransform: 'none' }}>
            Cancel
          </Button>
          {result ? (
            <>
              <Button
                onClick={() => {
                  setResult(null);
                  setPrompt('');
                }}
                sx={{ textTransform: 'none' }}
              >
                Try again
              </Button>
              <Button
                variant="contained"
                onClick={handleApply}
                sx={{ textTransform: 'none', fontWeight: 600 }}
              >
                Apply to dashboard
              </Button>
            </>
          ) : (
            <Button
              variant="contained"
              onClick={handleSubmit}
              disabled={loading || !prompt.trim()}
              startIcon={
                loading ? (
                  <CircularProgress size={14} />
                ) : (
                  <AppIcon name="AutoAwesome" fallback={AutoAwesomeIcon} fontSize="small" />
                )
              }
              sx={{ textTransform: 'none', fontWeight: 600 }}
            >
              Generate
            </Button>
          )}
        </>
      }
    >
      <Stack spacing={2} sx={{ mt: 1 }}>
        <TextField
          autoFocus
          multiline
          minRows={3}
          maxRows={8}
          placeholder={
            isRefinement
              ? 'e.g. "Change the first block to a pie chart" or "Add a trend of cost over time"'
              : 'e.g. "Show me agent spend this month by provider, plus the 5 most expensive jobs"'
          }
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={loading}
          error={Boolean(error) || Boolean(voice.error)}
          helperText={
            error ||
            voice.error ||
            `${prompt.length} / 1000${voice.state === 'listening' ? ' · listening…' : ''}`
          }
          sx={FORM_FIELD_SX}
          slotProps={{
            htmlInput: { maxLength: 1000 },
            input: {
              endAdornment: (
                <InputAdornment position="end" sx={{ alignSelf: 'flex-start', mt: 1, mr: 0.5 }}>
                  <Tooltip
                    title={
                      voice.state === 'listening'
                        ? 'Stop recording'
                        : voice.isSupported
                          ? 'Speak your dashboard description'
                          : 'Voice not supported in this browser'
                    }
                  >
                    <span>
                      <IconButton
                        size="small"
                        disabled={!voice.isSupported || loading}
                        onClick={
                          voice.state === 'listening' ? voice.stopListening : voice.startListening
                        }
                        sx={{
                          color: voice.state === 'listening' ? 'error.main' : 'primary.main',
                          animation:
                            voice.state === 'listening'
                              ? `${pulse} 1.2s ease-in-out infinite`
                              : 'none',
                        }}
                      >
                        {voice.state === 'listening' ? (
                          <AppIcon
                            name="StopOutlined"
                            fallback={StopOutlinedIcon}
                            fontSize="small"
                          />
                        ) : (
                          <AppIcon name="MicOutlined" fallback={MicOutlinedIcon} fontSize="small" />
                        )}
                      </IconButton>
                    </span>
                  </Tooltip>
                </InputAdornment>
              ),
            },
          }}
        />
        {!isRefinement && (
          <Box>
            <Typography
              variant="caption"
              sx={{
                fontWeight: 700,
                fontSize: '0.65rem',
                textTransform: 'uppercase',
                letterSpacing: 0.4,
                color: 'text.secondary',
                display: 'block',
                mb: 0.75,
              }}
            >
              Try one of these
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
              {EXAMPLES.map((ex) => (
                <Chip
                  key={ex}
                  label={ex}
                  size="small"
                  onClick={() => setPrompt(ex)}
                  sx={{
                    fontSize: '0.7rem',
                    borderRadius: 2,
                    cursor: 'pointer',
                    bgcolor: alpha(theme.palette.primary.main, 0.06),
                    border: `1px solid ${alpha(theme.palette.primary.main, 0.18)}`,
                    '&:hover': {
                      bgcolor: alpha(theme.palette.primary.main, 0.12),
                    },
                  }}
                />
              ))}
            </Box>
          </Box>
        )}

        {loading && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 1.5,
              py: 3,
              color: 'text.secondary',
            }}
          >
            <CircularProgress size={20} />
            <Typography variant="body2">
              Composing your dashboard{isRefinement ? '…' : ' (this can take 5–15s)'}
            </Typography>
          </Box>
        )}

        {result && (
          <Box
            sx={{
              p: 1.5,
              borderRadius: 2,
              bgcolor: alpha(theme.palette.success.main, 0.06),
              border: `1px solid ${alpha(theme.palette.success.main, 0.25)}`,
            }}
          >
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
              Suggested: {result.config?.blocks?.length || 0} blocks
            </Typography>
            {result.rationale && (
              <Typography variant="caption" color="text.secondary">
                {result.rationale}
              </Typography>
            )}
            <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 1 }}>
              {(result.config?.blocks || []).slice(0, 8).map((b) => (
                <Chip
                  key={b.id}
                  label={`${b.type} · ${b.title}`}
                  size="small"
                  sx={{ fontSize: '0.65rem', height: 22 }}
                />
              ))}
            </Box>
            {result.retried && (
              <Typography variant="caption" color="warning.main" sx={{ display: 'block', mt: 1 }}>
                ⓘ Auto-corrected on retry
              </Typography>
            )}
          </Box>
        )}
      </Stack>
    </FormDialog>
  );
}
