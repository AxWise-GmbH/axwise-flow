import { useMemo, useState } from 'react';
import {
  Tabs,
  Tab,
  Box,
  Button,
  TextField,
  Typography,
  Tooltip,
  Chip,
  Stack,
  CircularProgress,
  InputAdornment,
  ToggleButtonGroup,
  ToggleButton,
  alpha,
  keyframes,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import FormDialog, { FORM_FIELD_SX } from '../Common/FormDialog';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import MicOutlinedIcon from '@mui/icons-material/MicOutlined';
import StopOutlinedIcon from '@mui/icons-material/StopOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import GroupIcon from '@mui/icons-material/Group';
import DashboardCustomizeIcon from '@mui/icons-material/DashboardCustomize';
import { useVoiceControl } from '../../hooks/useVoiceControl';
import { createDashboard, autoBuildDashboard } from '../../services/dashboardService';

import AppIcon from '../icons/AppIcon';

// Shared animations
const fadeInUp = keyframes`
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
`;
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

const TAB_STORAGE_KEY = 'dashboards.newDialogTab';

/**
 * Unified "create dashboard" dialog with two flows:
 *   - Build: blank dashboard with title/description/visibility, then redirect to editor.
 *   - Generate: AI auto-build via LLM (catalog-grounded), then redirect to editor.
 *
 * Replaces the previous separate "+ New dashboard" + "✨ Auto-build" buttons.
 */
export default function NewDashboardDialog({ open, onClose, onCreated }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const initialTab = useMemo(() => {
    if (typeof window === 'undefined') return 0;
    try {
      const stored = window.localStorage.getItem(TAB_STORAGE_KEY);
      return stored === 'generate' ? 1 : 0;
    } catch {
      return 0;
    }
  }, []);

  const [tab, setTab] = useState(initialTab);
  const [error, setError] = useState('');

  // Build tab state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState('private');
  const [building, setBuilding] = useState(false);

  // Generate tab state
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genResult, setGenResult] = useState(null);

  const voice = useVoiceControl({
    onListeningEnd: (transcript) => {
      const clean = String(transcript || '').trim();
      if (!clean) return;
      setPrompt((prev) => (prev ? `${prev} ${clean}` : clean).slice(0, 1000));
    },
  });

  const handleTabChange = (_e, v) => {
    setTab(v);
    setError('');
    try {
      window.localStorage.setItem(TAB_STORAGE_KEY, v === 1 ? 'generate' : 'build');
    } catch {
      /* ignore */
    }
  };

  const resetAndClose = () => {
    if (building || generating) return;
    voice.stopListening();
    setTitle('');
    setDescription('');
    setVisibility('private');
    setPrompt('');
    setGenResult(null);
    setError('');
    onClose();
  };

  const handleBuild = async () => {
    const trimmed = title.trim();
    if (!trimmed) {
      setError('Give your dashboard a title.');
      return;
    }
    setBuilding(true);
    setError('');
    try {
      const created = await createDashboard({
        title: trimmed,
        description: description.trim() || null,
        visibility,
      });
      onCreated?.(created, { auto: false });
    } catch (err) {
      setError(err?.message || 'Failed to create dashboard');
    } finally {
      setBuilding(false);
    }
  };

  const handleGenerate = async () => {
    const text = prompt.trim();
    if (!text) {
      setError('Describe what you want to see.');
      return;
    }
    setGenerating(true);
    setError('');
    setGenResult(null);
    try {
      const data = await autoBuildDashboard({ prompt: text });
      setGenResult(data);
    } catch (err) {
      setError(err?.message || 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const handleApplyGenerated = async () => {
    if (!genResult?.config) return;
    setBuilding(true);
    try {
      const created = await createDashboard({
        title: 'Untitled dashboard',
        config: genResult.config,
      });
      onCreated?.(created, { auto: true });
    } catch (err) {
      setError(err?.message || 'Apply failed');
      setBuilding(false);
    }
  };

  return (
    <FormDialog
      open={open}
      onClose={resetAndClose}
      title="Create dashboard"
      subtitle="Pick a flow below"
      icon={DashboardCustomizeIcon}
      paperSx={{ borderRadius: isMobile ? 0 : 3, overflow: 'hidden' }}
      contentSx={{ p: { xs: 1.75, sm: 3 }, minHeight: 320 }}
      contentDividers={false}
      actions={
        <>
          <Button
            onClick={resetAndClose}
            disabled={building || generating}
            sx={{ textTransform: 'none' }}
          >
            Cancel
          </Button>
          {tab === 0 ? (
            <Button
              variant="contained"
              onClick={handleBuild}
              disabled={building || !title.trim()}
              startIcon={
                building ? (
                  <CircularProgress size={14} />
                ) : (
                  <AppIcon name="EditOutlined" fallback={EditOutlinedIcon} />
                )
              }
              sx={{ textTransform: 'none', fontWeight: 700 }}
            >
              {isMobile ? 'Build' : 'Build dashboard'}
            </Button>
          ) : genResult ? (
            <>
              <Button
                onClick={() => {
                  setGenResult(null);
                  setPrompt('');
                }}
                disabled={building}
                sx={{ textTransform: 'none' }}
              >
                Try again
              </Button>
              <Button
                variant="contained"
                onClick={handleApplyGenerated}
                disabled={building}
                startIcon={
                  building ? (
                    <CircularProgress size={14} />
                  ) : (
                    <AppIcon name="AutoAwesome" fallback={AutoAwesomeIcon} />
                  )
                }
                sx={{ textTransform: 'none', fontWeight: 700 }}
              >
                {isMobile ? 'Apply' : 'Apply to dashboard'}
              </Button>
            </>
          ) : (
            <Button
              variant="contained"
              onClick={handleGenerate}
              disabled={generating || building || !prompt.trim()}
              startIcon={
                generating ? (
                  <CircularProgress size={14} sx={{ color: 'inherit' }} />
                ) : (
                  <AppIcon name="AutoAwesome" fallback={AutoAwesomeIcon} />
                )
              }
              sx={{ textTransform: 'none', fontWeight: 700 }}
            >
              {isMobile ? 'Generate' : 'Generate dashboard'}
            </Button>
          )}
        </>
      }
    >
      <Tabs
        value={tab}
        onChange={handleTabChange}
        variant="fullWidth"
        sx={{
          mx: { xs: -1.75, sm: -3 },
          mt: { xs: -3.5, sm: -3.5 },
          mb: 2,
          borderBottom: 1,
          borderColor: 'divider',
          '& .MuiTab-root': {
            minHeight: 48,
            fontSize: '0.8rem',
            fontWeight: 700,
            textTransform: 'none',
          },
          '& .MuiTabs-indicator': { height: 3 },
        }}
      >
        <Tab
          icon={<AppIcon name="EditOutlined" fallback={EditOutlinedIcon} sx={{ fontSize: 18 }} />}
          iconPosition="start"
          label={isMobile ? 'Build' : 'Build dashboard'}
        />
        <Tab
          icon={<AppIcon name="AutoAwesome" fallback={AutoAwesomeIcon} sx={{ fontSize: 18 }} />}
          iconPosition="start"
          label={isMobile ? 'Generate' : 'Generate dashboard'}
        />
      </Tabs>
      {/* BUILD TAB */}
      {tab === 0 && (
        <Box
          key="build-panel"
          sx={{
            animation: `${fadeInUp} 0.28s ease-out`,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            mt: 1,
          }}
        >
          <TextField
            autoFocus
            label="Title"
            fullWidth
            size="small"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleBuild()}
            disabled={building}
            error={Boolean(error) && tab === 0 && !title.trim()}
            helperText="You can rename this later."
          />
          <TextField
            label="Description (optional)"
            fullWidth
            multiline
            minRows={2}
            maxRows={4}
            size="small"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={building}
          />
          <Box>
            <Typography
              variant="caption"
              sx={{
                display: 'block',
                mb: 0.75,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: 0.4,
                fontSize: '0.65rem',
                color: 'text.secondary',
              }}
            >
              Visibility
            </Typography>
            <ToggleButtonGroup
              value={visibility}
              exclusive
              onChange={(_e, v) => v && setVisibility(v)}
              size="small"
              fullWidth
              disabled={building}
              sx={{
                '& .MuiToggleButton-root': {
                  textTransform: 'none',
                  fontWeight: 600,
                  py: 0.75,
                  border: '1px solid',
                  borderColor: 'divider',
                  '&.Mui-selected': {
                    bgcolor: (t) => alpha(t.palette.primary.main, 0.12),
                    color: 'primary.main',
                    borderColor: 'primary.main',
                  },
                },
              }}
            >
              <ToggleButton value="private">
                <AppIcon
                  name="LockOutlined"
                  fallback={LockOutlinedIcon}
                  sx={{ fontSize: 14, mr: 0.5 }}
                />{' '}
                Private
              </ToggleButton>
              <ToggleButton value="group">
                <AppIcon name="Group" fallback={GroupIcon} sx={{ fontSize: 14, mr: 0.5 }} /> Group
              </ToggleButton>
            </ToggleButtonGroup>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              {visibility === 'private'
                ? 'Only you can see it.'
                : 'Choose share groups after the dashboard is created.'}
            </Typography>
          </Box>
        </Box>
      )}
      {/* GENERATE TAB */}
      {tab === 1 && (
        <Box
          key="generate-panel"
          sx={{
            animation: `${fadeInUp} 0.28s ease-out`,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            mt: 1,
          }}
        >
          <TextField
            autoFocus
            multiline
            minRows={3}
            maxRows={8}
            placeholder='e.g. "Show me agent spend this month by provider, plus the 5 most expensive jobs"'
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={generating || building}
            error={Boolean(error) && tab === 1 && !prompt.trim()}
            helperText={
              voice.error
                ? voice.error
                : voice.state === 'listening'
                  ? 'Listening… speak now'
                  : `${prompt.length} / 1000`
            }
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
                            ? 'Speak your prompt'
                            : 'Voice not supported in this browser'
                      }
                    >
                      <span>
                        <IconButton
                          size="small"
                          disabled={!voice.isSupported || generating || building}
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
                            <AppIcon
                              name="MicOutlined"
                              fallback={MicOutlinedIcon}
                              fontSize="small"
                            />
                          )}
                        </IconButton>
                      </span>
                    </Tooltip>
                  </InputAdornment>
                ),
              },
            }}
          />

          <Box>
            <Typography
              variant="caption"
              sx={{
                display: 'block',
                mb: 0.75,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: 0.4,
                fontSize: '0.65rem',
                color: 'text.secondary',
              }}
            >
              Try one of these
            </Typography>
            <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75 }}>
              {EXAMPLES.map((ex) => (
                <Chip
                  key={ex}
                  label={ex}
                  size="small"
                  onClick={() => setPrompt(ex)}
                  disabled={generating || building}
                  sx={{
                    fontSize: '0.7rem',
                    borderRadius: 2,
                    cursor: 'pointer',
                    bgcolor: (t) => alpha(t.palette.primary.main, 0.06),
                    border: (t) => `1px solid ${alpha(t.palette.primary.main, 0.18)}`,
                    '&:hover': {
                      bgcolor: (t) => alpha(t.palette.primary.main, 0.12),
                    },
                  }}
                />
              ))}
            </Stack>
          </Box>

          {generating && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                py: 2,
                px: 1.5,
                borderRadius: 2,
                border: '1px dashed',
                borderColor: 'divider',
                bgcolor: (t) => alpha(t.palette.primary.main, 0.03),
              }}
            >
              <CircularProgress size={20} />
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  Composing your dashboard…
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Takes 5–15s on the first run.
                </Typography>
              </Box>
            </Box>
          )}

          {genResult && !generating && (
            <Box
              sx={{
                p: 1.5,
                borderRadius: 2,
                bgcolor: (t) => alpha(t.palette.success.main, 0.06),
                border: (t) => `1px solid ${alpha(t.palette.success.main, 0.25)}`,
                animation: `${fadeInUp} 0.32s ease-out`,
              }}
            >
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
                ✨ {genResult.config?.blocks?.length || 0} blocks ready
              </Typography>
              {genResult.rationale && (
                <Typography variant="caption" color="text.secondary">
                  {genResult.rationale}
                </Typography>
              )}
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 1 }}>
                {(genResult.config?.blocks || []).slice(0, 10).map((b, i) => (
                  <Chip
                    key={b.id}
                    label={`${b.type} · ${b.title}`}
                    size="small"
                    sx={{
                      fontSize: '0.65rem',
                      height: 22,
                      opacity: 0,
                      animation: `${fadeInUp} 0.32s ease-out forwards`,
                      animationDelay: `${i * 60}ms`,
                    }}
                  />
                ))}
              </Box>
            </Box>
          )}
        </Box>
      )}
      {error && (
        <Typography
          variant="caption"
          color="error.main"
          sx={{ fontWeight: 600, mt: 1.5, display: 'block' }}
        >
          {error}
        </Typography>
      )}
    </FormDialog>
  );
}
