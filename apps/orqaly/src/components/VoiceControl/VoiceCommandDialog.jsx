import { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  Button,
  Typography,
  Box,
  IconButton,
  Tooltip,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Switch,
  Slider,
  Collapse,
  Chip,
  Divider,
  Drawer,
  Badge,
  alpha,
  keyframes,
  Menu,
  ListItemIcon,
  ListItemText,
  useTheme,
  useMediaQuery,
  Paper,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import MicOutlinedIcon from '@mui/icons-material/MicOutlined';
import StopOutlinedIcon from '@mui/icons-material/StopOutlined';
import PauseOutlinedIcon from '@mui/icons-material/PauseOutlined';
import PlayArrowOutlinedIcon from '@mui/icons-material/PlayArrowOutlined';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import SecurityOutlinedIcon from '@mui/icons-material/SecurityOutlined';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import ChatBubbleOutlineRoundedIcon from '@mui/icons-material/ChatBubbleOutlineRounded';
import GraphicEqRoundedIcon from '@mui/icons-material/GraphicEqRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import BoltRoundedIcon from '@mui/icons-material/BoltRounded';

import ViewInArRoundedIcon from '@mui/icons-material/ViewInArRounded';
import ChatRoundedIcon from '@mui/icons-material/ChatRounded';
import VoiceStudioView from './VoiceStudioView';
import ToolCatalogBrowser from './ToolCatalogBrowser';
import CopilotSidebar from './CopilotSidebar.jsx';
import AssistantMarkdown from './AssistantMarkdown.jsx';
import AiOrb from './AiOrb';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { GROUP_TYPES, AGREEMENT_TYPES } from '../../utils/constants';
import { getInfoContent } from '../../utils/askAnythingInfo';
import { classifyAssistantOutput } from '../../utils/assistantResponseFormat';
import ArtifactPanel from './ArtifactPanel';

import AppIcon from '../icons/AppIcon';

const recordPulse = keyframes`
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.8; transform: scale(1.1); }
`;
const speakingPulse = keyframes`
  0%, 100% { opacity: 0.45; transform: scaleY(0.6); }
  50% { opacity: 1; transform: scaleY(1); }
`;

const ACTION_TEMPLATES = [
  { id: 'partner', label: 'Partner', phrase: 'Create a new partner' },
  { id: 'task', label: 'Task', phrase: 'Create a task' },
  { id: 'workflow', label: 'Workflow', phrase: 'Open workflow' },
  { id: 'project', label: 'Project', phrase: 'Create or edit a project' },
  { id: 'finance', label: 'Finance', phrase: 'Show finances' },
  { id: 'report', label: 'Report', phrase: 'Generate a report' },
  { id: 'consilium', label: 'Board', phrase: 'Talk to consilium about strategy' },
  { id: 'predict', label: 'Predict', phrase: 'Predict which partners might churn' },
];

const LANGUAGE_OPTIONS = [
  { value: 'en-US', label: 'English (US)' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'es-ES', label: 'Spanish (Spain)' },
  { value: 'pt-BR', label: 'Portuguese (Brazil)' },
  { value: 'fr-FR', label: 'French' },
  { value: 'de-DE', label: 'German' },
  { value: 'it-IT', label: 'Italian' },
  { value: 'tr-TR', label: 'Turkish' },
  { value: 'ar-SA', label: 'Arabic' },
  { value: 'hi-IN', label: 'Hindi' },
];

const ELEVENLABS_VOICES = [
  { id: '21m00Tcm4TlvDq8ikWAM', label: 'Rachel', desc: 'Professional female — warm & clear' },
  { id: 'pNInz6obpgDQGcFmaJgB', label: 'Adam', desc: 'Professional male — deep & authoritative' },
  { id: 'ErXwobaYiN019PkySvjV', label: 'Antoni', desc: 'Professional male — clear & confident' },
  { id: 'oWAxZDx7w5VEj9dCyTzz', label: 'Grace', desc: 'Professional female — calm & composed' },
];

function InfoAnswerCard({ topic }) {
  const info = getInfoContent(topic);
  if (!info)
    return (
      <Typography variant="body2" color="text.secondary">
        No details for this topic.
      </Typography>
    );
  return (
    <Box>
      <Typography variant="subtitle2" fontWeight={700} color="primary" sx={{ mb: 1.5 }}>
        {info.title}
      </Typography>
      <Typography
        variant="caption"
        fontWeight={600}
        color="text.secondary"
        sx={{ display: 'block', mt: 1 }}
      >
        How it&apos;s calculated
      </Typography>
      <Typography variant="body2" sx={{ mb: 1.5 }}>
        {info.howCalculated}
      </Typography>
      <Typography
        variant="caption"
        fontWeight={600}
        color="text.secondary"
        sx={{ display: 'block', mt: 1 }}
      >
        How it works
      </Typography>
      <Typography variant="body2" sx={{ mb: 1.5 }}>
        {info.howItWorks}
      </Typography>
      <Typography
        variant="caption"
        fontWeight={600}
        color="text.secondary"
        sx={{ display: 'block', mt: 1 }}
      >
        Where the information is from
      </Typography>
      <Typography variant="body2" sx={{ mb: 1.5 }}>
        {info.source}
      </Typography>
      {info.related && info.related.length > 0 && (
        <>
          <Typography
            variant="caption"
            fontWeight={600}
            color="text.secondary"
            sx={{ display: 'block', mt: 1 }}
          >
            Related
          </Typography>
          <Typography variant="body2">{info.related.join(' · ')}</Typography>
        </>
      )}
    </Box>
  );
}

/**
 * Voice command pop-up: opens when user clicks "Ask Anything".
 * Shows recording animation, Stop/Pause, live transcription, and detected actions with options.
 */
export default function VoiceCommandDialog({
  open,
  onClose,
  transcript = '',
  isRecording = false,
  isPaused = false,
  error = null,
  isSupported = false,
  actions = [],
  operatorMode = '',
  executionPlan = null,
  partners = [],
  onExecuteAction,
  onExecuteAll,
  onParseText,
  onSubmitText,
  onToggleMic,
  chatHistory = [],
  conversations = [],
  activeConversationId = '',
  onCreateConversation,
  onSelectConversation,
  onRenameConversation,
  onDeleteConversation,
  isAssistantSpeaking = false,
  voiceSettings = {
    enabled: true,
    muted: true,
    language: 'en-US',
    rate: 1,
    pitch: 1,
    tone: 'professional',
  },
  onVoiceSettingsChange,
  artifact = null,
  onCloseArtifact,
  mode = 'execute',
  onModeChange,
  homeSummary = null,
  homeSummaryLoading = false,
  // Dynamic banners + greeting (from /api/assistant-home-summary)
  banners = null,
  bannersLoading = false,
  bannersError = false,
  greeting = null,
  // Full tool catalog (from /api/assistant-tools) — feeds the View Actions browser
  toolCatalog = null,
  toolCatalogLoading = false,
  toolCatalogError = null,
  // Navigation callback for inline chat blocks: ({ type, entityId, route, deepLink })
  onOpenEntity,
  // Copilot: confirm proposed actions, switch model, live sidebar signals.
  onConfirmAction,
  copilotProvider,
  copilotModel,
  onCopilotModelChange,
  notifications = [],
}) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { user } = useAuth();
  const [localTranscript, setLocalTranscript] = useState('');
  const [editPayload, setEditPayload] = useState({});
  const [voiceSettingsOpen, setVoiceSettingsOpen] = useState(false);
  const [menuAnchorEl, setMenuAnchorEl] = useState(null);
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
  const [studioMode, setStudioMode] = useState(true);
  // Prefill state for piping catalog picks into the studio input.
  const [studioPrefillText, setStudioPrefillText] = useState('');
  const [studioPrefillNonce, setStudioPrefillNonce] = useState(0);
  const chatEndRef = useRef(null);

  const handlePickToolFromCatalog = ({ template }) => {
    if (!template) return;
    setStudioPrefillText(template);
    setStudioPrefillNonce((n) => n + 1);
    setMobileActionsOpen(false);
  };

  const displayName = user?.displayName || user?.email?.split('@')[0] || '';

  // Derive last assistant message for studio view
  const lastAssistantMsg = (() => {
    for (let i = chatHistory.length - 1; i >= 0; i--) {
      if (chatHistory[i]?.role === 'assistant') return chatHistory[i].content || '';
    }
    return '';
  })();

  const formatMessageTime = (iso) => {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const renderFormattedAssistantText = (content) => {
    const formatted = classifyAssistantOutput(content);
    const codeBlockSx = {
      m: 0,
      p: { xs: 1, sm: 1.5 },
      borderRadius: 2,
      overflowX: 'auto',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      fontSize: { xs: '0.72rem', sm: '0.8rem' },
      bgcolor: (t) => alpha(t.palette.background.paper, 0.6),
      border: '1px solid',
      borderColor: 'divider',
      color: 'text.primary',
      maxWidth: '100%',
      wordBreak: 'break-all',
    };
    if (formatted.type === 'code' || formatted.type === 'json') {
      return (
        <Box component="pre" sx={codeBlockSx}>
          {formatted.value}
        </Box>
      );
    }
    if (formatted.type === 'table') {
      return (
        <Box component="pre" sx={codeBlockSx}>
          {formatted.value}
        </Box>
      );
    }
    return (
      <Typography
        variant="body2"
        sx={{
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
          fontSize: { xs: '0.85rem', sm: '0.875rem' },
          wordBreak: 'break-word',
        }}
      >
        {formatted.value}
      </Typography>
    );
  };

  useEffect(() => {
    if (!open) return;
    // Defer state update to avoid "setState during render" warning
    const t = setTimeout(() => setVoiceSettingsOpen(false), 0);
    const sync = window.setTimeout(() => setLocalTranscript(transcript), 0);
    return () => {
      clearTimeout(t);
      window.clearTimeout(sync);
    };
  }, [open, transcript]);

  useEffect(() => {
    if (!open) return;
    const sync = window.setTimeout(() => {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, 100);
    return () => window.clearTimeout(sync);
  }, [open, chatHistory.length, isAssistantSpeaking]);

  const handleClose = () => {
    setLocalTranscript('');
    setEditPayload({});
    onClose();
  };

  const handleTextChange = (e) => {
    const v = e.target.value || '';
    setLocalTranscript(v);
  };

  const handleSendText = () => {
    const payload = String(localTranscript || '').trim();
    if (!payload) return;
    if (onSubmitText) onSubmitText(payload);
    else if (onParseText) onParseText(payload);
    setLocalTranscript('');
  };

  const getActionPayload = (action) => {
    const key = action.id;
    if (editPayload[key]) return editPayload[key];
    const base = {
      name: action.name ?? '',
      group: action.group ?? '',
      team: action.team ?? '',
      agreement: action.agreement ?? '',
      geos: action.geos ?? [],
      telegramContact: action.telegramContact ?? '',
      telegramGroup: action.telegramGroup ?? '',
      attachCampaign: action.attachCampaign ?? '',
      partnerId: action.partnerId ?? '',
      title: action.title ?? '',
      description: action.description ?? action.title ?? '',
    };
    return base;
  };

  const generateTitleFromDescription = (desc) => {
    const s = (desc || '').trim();
    if (!s) return 'New Task';
    return s.length > 50 ? s.slice(0, 47) + '...' : s.charAt(0).toUpperCase() + s.slice(1);
  };

  const setActionPayload = (actionId, updates) => {
    setEditPayload((prev) => ({ ...prev, [actionId]: { ...prev[actionId], ...updates } }));
  };

  const executableActions = actions.filter(
    (a) => a.type !== 'info' && a.type !== 'assistant_reply'
  );
  const canExecuteAll =
    executableActions.length > 0 &&
    executableActions.every((a) => {
      if (a.type === 'create_partner') return (getActionPayload(a).name || '').trim().length > 0;
      if (a.type === 'create_task') {
        const p = getActionPayload(a);
        return (p.partnerId || '').trim().length > 0 && (p.title || '').trim().length > 0;
      }
      return true;
    });

  const handleExecuteAll = async () => {
    if (!canExecuteAll || !onExecuteAll) return;
    const toRun = executableActions.map((a) => {
      if (a.type === 'create_partner') {
        const p = getActionPayload(a);
        return {
          ...a,
          name: (p.name || '').trim(),
          group: p.group || undefined,
          team: p.team || undefined,
          agreement: p.agreement || undefined,
          geos: p.geos?.length ? p.geos : undefined,
          telegramContact: (p.telegramContact || '').trim() || undefined,
          telegramGroup: (p.telegramGroup || '').trim() || undefined,
          attachCampaign: (p.attachCampaign || '').trim() || undefined,
        };
      }
      if (a.type === 'create_task') {
        const p = getActionPayload(a);
        return {
          ...a,
          partnerId: p.partnerId,
          title: (p.title || generateTitleFromDescription(p.description)).trim(),
          description: (p.description || '').trim(),
        };
      }
      return a;
    });
    await onExecuteAll(toRun);
  };

  const handleExecuteOne = async (action) => {
    if (!onExecuteAction) return;
    let payload = action;
    if (action.type === 'create_partner') {
      const p = getActionPayload(action);
      payload = {
        ...action,
        name: (p.name || '').trim(),
        group: p.group || undefined,
        team: p.team || undefined,
        agreement: p.agreement || undefined,
        geos: p.geos?.length ? p.geos : undefined,
        telegramContact: (p.telegramContact || '').trim() || undefined,
        telegramGroup: (p.telegramGroup || '').trim() || undefined,
        attachCampaign: (p.attachCampaign || '').trim() || undefined,
      };
    } else if (action.type === 'create_task') {
      const p = getActionPayload(action);
      payload = {
        ...action,
        partnerId: p.partnerId,
        title: (p.title || generateTitleFromDescription(p.description)).trim(),
        description: (p.description || '').trim(),
      };
    }
    await onExecuteAction(payload);
  };

  const applyVoiceSetting = (updates) => {
    if (onVoiceSettingsChange) {
      onVoiceSettingsChange(updates);
    }
  };

  const previewVoice = async (voiceId, label) => {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) return;
      const { speak, stopSpeaking } = await import('../../services/ttsService');
      stopSpeaking();
      speak({
        text: `Hi, I'm ${label}. This is how I sound as your assistant.`,
        provider: 'elevenlabs',
        voiceId,
        token,
        voiceSettings: {},
        onStart: () => {},
        onEnd: () => {},
      });
    } catch {
      // silent
    }
  };

  const handleMenuOpen = (event) => setMenuAnchorEl(event.currentTarget);
  const handleMenuClose = () => setMenuAnchorEl(null);

  const activeConversation =
    conversations.find((c) => c.id === activeConversationId) || conversations[0];
  const activeConvTitle = activeConversation?.title || 'New conversation';

  /* ── Shared Actions Panel Content (used in desktop sidebar + mobile drawer) ── */
  const actionsContent = (
    <>
      <Box
        sx={{
          p: { xs: 1.5, md: 2 },
          borderBottom: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AppIcon
            name="BoltRounded"
            fallback={BoltRoundedIcon}
            color="primary"
            sx={{ fontSize: { xs: 20, md: 24 } }}
          />
          <Typography
            variant="subtitle1"
            fontWeight={700}
            sx={{ fontSize: { xs: '0.9rem', md: '1rem' } }}
          >
            Context
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {operatorMode && (
            <Chip
              size="small"
              label={operatorMode}
              variant="outlined"
              sx={{ fontSize: '0.65rem', height: 20 }}
            />
          )}
          {(isMobile || mobileActionsOpen) && (
            <IconButton
              size="small"
              onClick={() => setMobileActionsOpen(false)}
              sx={{ p: 0.5 }}
              aria-label="Close"
            >
              <AppIcon name="Close" fallback={CloseIcon} sx={{ fontSize: 18 }} />
            </IconButton>
          )}
        </Box>
      </Box>

      <Box sx={{ flex: 1, overflowY: 'auto', p: { xs: 1.5, md: 2.5 } }}>
        {/* ACTION TEMPLATES */}
        <Typography
          variant="overline"
          sx={{
            fontWeight: 700,
            color: 'text.secondary',
            letterSpacing: '0.08em',
            fontSize: '0.7rem',
            display: 'block',
            mb: 1,
          }}
        >
          Action templates
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 2 }}>
          {ACTION_TEMPLATES.map((t) => (
            <Chip
              key={t.id}
              label={t.label}
              size="small"
              clickable
              onClick={() => {
                if (onParseText) onParseText(t.phrase);
                setMobileActionsOpen(false);
              }}
              sx={{
                fontWeight: 600,
                fontSize: '0.75rem',
                height: 28,
                borderRadius: 2,
                '&:hover': { bgcolor: (theme) => alpha(theme.palette.primary.main, 0.12) },
              }}
            />
          ))}
        </Box>
        <Divider sx={{ mb: 2 }} />
        {/* EXECUTION PLAN CARD */}
        {executionPlan && actions.length > 0 && (
          <Paper
            elevation={0}
            sx={{
              mb: 2.5,
              p: { xs: 2, md: 2.5 },
              borderRadius: 3,
              border: '1px solid',
              borderColor: 'primary.main',
              bgcolor: (t) => alpha(t.palette.primary.main, 0.04),
            }}
          >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1.5 }}>
              <Typography
                variant="subtitle2"
                fontWeight={800}
                color="primary.main"
                sx={{ fontSize: { xs: '0.75rem', md: '0.875rem' } }}
              >
                PLAN OVERVIEW
              </Typography>
              <Chip
                size="small"
                label={executionPlan.riskLevel.toUpperCase()}
                color={
                  executionPlan.riskLevel === 'high'
                    ? 'error'
                    : executionPlan.riskLevel === 'medium'
                      ? 'warning'
                      : 'success'
                }
                sx={{ fontWeight: 700, borderRadius: 1 }}
              />
            </Box>
            {executionPlan.affectedModules?.length > 0 && (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 2 }}>
                {executionPlan.affectedModules.map((m) => (
                  <Chip
                    key={m}
                    label={m}
                    size="small"
                    variant="outlined"
                    sx={{ bgcolor: 'background.paper' }}
                  />
                ))}
              </Box>
            )}
            {executionPlan.confirmationsRequired?.length > 0 && (
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', color: 'warning.main' }}>
                <AppIcon name="SecurityOutlined" fallback={SecurityOutlinedIcon} fontSize="small" />
                <Typography variant="caption" fontWeight={700}>
                  Requires confirmation: {executionPlan.confirmationsRequired.join(', ')}
                </Typography>
              </Box>
            )}
          </Paper>
        )}

        {/* ACTION CARDS */}
        {actions.length === 0 ? (
          <Box sx={{ textAlign: 'center', mt: { xs: 4, md: 8 }, opacity: 0.5 }}>
            <AppIcon
              name="ContentCopyRounded"
              fallback={ContentCopyRoundedIcon}
              sx={{ fontSize: { xs: 36, md: 48 }, mb: 1.5 }}
            />
            <Typography variant="body2" fontWeight={500}>
              No actions detected yet.
            </Typography>
            <Typography variant="caption">Actions will appear here as you chat.</Typography>
          </Box>
        ) : (
          actions.map((action) => {
            if (action.type === 'assistant_reply') return null;
            return (
              <Paper
                key={action.id}
                elevation={0}
                sx={{
                  mb: 2,
                  p: 0,
                  overflow: 'hidden',
                  borderRadius: 3,
                  border: '1px solid',
                  borderColor: 'divider',
                }}
              >
                <Box
                  sx={{
                    p: { xs: 1.5, md: 2 },
                    bgcolor: 'background.paper',
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                  }}
                >
                  <Box
                    sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                  >
                    <Chip
                      size="small"
                      label={action.type.replace(/_/g, ' ')}
                      sx={{ textTransform: 'uppercase', fontWeight: 700, fontSize: '0.65rem' }}
                    />
                    {(action.requiresConfirmation || action.riskLevel) && (
                      <Tooltip title="Review needed">
                        <AppIcon
                          name="SecurityOutlined"
                          fallback={SecurityOutlinedIcon}
                          color="warning"
                          fontSize="small"
                        />
                      </Tooltip>
                    )}
                  </Box>
                  <Typography
                    variant="subtitle2"
                    fontWeight={700}
                    sx={{ mt: 1, fontSize: { xs: '0.82rem', md: '0.875rem' } }}
                  >
                    {action.label}
                  </Typography>
                </Box>
                <Box
                  sx={{
                    p: { xs: 1.5, md: 2 },
                    bgcolor: (t) => alpha(t.palette.background.default, 0.5),
                  }}
                >
                  {action.type === 'info' ? (
                    <InfoAnswerCard topic={action.topic} />
                  ) : (
                    <>
                      {action.type === 'create_partner' && (
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                          <TextField
                            label="Name"
                            size="small"
                            fullWidth
                            value={getActionPayload(action).name || ''}
                            onChange={(e) => setActionPayload(action.id, { name: e.target.value })}
                          />
                          <Box sx={{ display: 'flex', gap: 1 }}>
                            <FormControl size="small" fullWidth>
                              <InputLabel>Group</InputLabel>
                              <Select
                                value={getActionPayload(action).group || ''}
                                label="Group"
                                onChange={(e) =>
                                  setActionPayload(action.id, { group: e.target.value })
                                }
                              >
                                <MenuItem value="">None</MenuItem>
                                {GROUP_TYPES.map((g) => (
                                  <MenuItem key={g} value={g}>
                                    {g}
                                  </MenuItem>
                                ))}
                              </Select>
                            </FormControl>
                            <FormControl size="small" fullWidth>
                              <InputLabel>Agreement</InputLabel>
                              <Select
                                value={getActionPayload(action).agreement || ''}
                                label="Agreement"
                                onChange={(e) =>
                                  setActionPayload(action.id, { agreement: e.target.value })
                                }
                              >
                                <MenuItem value="">None</MenuItem>
                                {AGREEMENT_TYPES.map((a) => (
                                  <MenuItem key={a} value={a}>
                                    {a}
                                  </MenuItem>
                                ))}
                              </Select>
                            </FormControl>
                          </Box>
                        </Box>
                      )}
                      {action.type === 'create_task' && (
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                          <FormControl size="small" fullWidth>
                            <InputLabel>Partner</InputLabel>
                            <Select
                              value={getActionPayload(action).partnerId || ''}
                              label="Partner"
                              onChange={(e) =>
                                setActionPayload(action.id, { partnerId: e.target.value })
                              }
                            >
                              <MenuItem value="">Select...</MenuItem>
                              {partners.map((p) => (
                                <MenuItem key={p.id} value={p.id}>
                                  {p.name}
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                          <TextField
                            label="Task Title"
                            size="small"
                            fullWidth
                            value={getActionPayload(action).title || ''}
                            onChange={(e) => setActionPayload(action.id, { title: e.target.value })}
                          />
                        </Box>
                      )}
                      <Button
                        fullWidth
                        variant="contained"
                        sx={{ mt: 2, borderRadius: 2, fontWeight: 700, py: { xs: 0.75, md: 1 } }}
                        onClick={() => handleExecuteOne(action)}
                      >
                        Execute Action
                      </Button>
                    </>
                  )}
                </Box>
              </Paper>
            );
          })
        )}
      </Box>

      {/* FOOTER ACTIONS */}
      {canExecuteAll && (
        <Box
          sx={{
            p: { xs: 1.5, md: 2 },
            borderTop: '1px solid',
            borderColor: 'divider',
            bgcolor: 'background.paper',
          }}
        >
          <Button
            fullWidth
            variant="contained"
            size="large"
            onClick={handleExecuteAll}
            sx={{
              borderRadius: 2,
              py: { xs: 1, md: 1.5 },
              fontWeight: 800,
              fontSize: { xs: '0.9rem', md: '1rem' },
            }}
          >
            Execute All ({executableActions.length})
          </Button>
        </Box>
      )}

      {/* ── Section B: Categorized Command Catalog ── */}
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          p: { xs: 1.5, md: 2 },
          borderTop: '1px solid',
          borderColor: 'divider',
          bgcolor: (t) => alpha(t.palette.background.default, 0.5),
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            mb: 1.25,
          }}
        >
          <Typography
            variant="subtitle2"
            sx={{
              color: 'text.primary',
              fontWeight: 700,
              fontSize: '0.78rem',
              letterSpacing: 0.4,
              textTransform: 'uppercase',
            }}
          >
            Command catalog
          </Typography>
          {toolCatalog?.tools && (
            <Chip
              size="small"
              label={toolCatalog.tools.length}
              sx={{ height: 18, fontSize: '0.65rem' }}
            />
          )}
        </Box>
        <ToolCatalogBrowser
          catalog={toolCatalog}
          loading={toolCatalogLoading}
          error={toolCatalogError}
          onPickTool={handlePickToolFromCatalog}
        />
      </Box>
    </>
  );

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      fullScreen
      maxWidth="lg"
      PaperProps={{
        sx: {
          bgcolor: 'background.default',
          backgroundImage: 'none',
          /* Fix mobile viewport: use dvh so content fits between browser chrome */
          height: { xs: '100dvh', md: '100%' },
          maxHeight: { xs: '100dvh', md: '100%' },
          /* Safe area insets for notched devices (iPhone etc.) */
          pt: { xs: 'env(safe-area-inset-top, 0px)', md: 0 },
        },
      }}
      transitionDuration={300}
    >
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          maxHeight: { xs: '100dvh', md: '100%' },
          bgcolor: 'background.default',
          overflow: 'hidden',
        }}
      >
        {/* ── HEADER ───────────────────────────────────────────────────────────── */}
        <Box
          sx={{
            px: { xs: 1.25, sm: 3 },
            py: { xs: 0.75, sm: 1.5 },
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: { xs: 0.5, sm: 2 },
            borderBottom: '1px solid',
            borderColor: 'divider',
            bgcolor: 'background.paper',
            zIndex: 10,
            minHeight: { xs: 44, sm: 56 },
            flexShrink: 0,
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: { xs: 0.75, sm: 2 },
              minWidth: 0,
              flex: 1,
            }}
          >
            <Box sx={{ flex: 1 }} />
            <Menu
              anchorEl={menuAnchorEl}
              open={Boolean(menuAnchorEl)}
              onClose={handleMenuClose}
              PaperProps={{
                elevation: 0,
                sx: {
                  mt: 1,
                  minWidth: { xs: 220, sm: 240 },
                  maxWidth: { xs: '90vw', sm: 'none' },
                  borderRadius: 3,
                  border: '1px solid',
                  borderColor: 'divider',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                },
              }}
            >
              <MenuItem
                onClick={() => {
                  onCreateConversation();
                  handleMenuClose();
                }}
                sx={{ py: 1.2, fontWeight: 600, color: 'primary.main' }}
              >
                <ListItemIcon>
                  <AppIcon
                    name="AddRounded"
                    fallback={AddRoundedIcon}
                    fontSize="small"
                    color="primary"
                  />
                </ListItemIcon>
                <ListItemText primary="New conversation" />
              </MenuItem>
              <Divider sx={{ my: 0.5 }} />
              {conversations.map((c) => (
                <MenuItem
                  key={c.id}
                  selected={c.id === activeConversationId}
                  onClick={() => {
                    onSelectConversation(c.id);
                    handleMenuClose();
                  }}
                  sx={{ py: 1.2 }}
                >
                  <ListItemIcon>
                    <AppIcon
                      name="ChatBubbleOutlineRounded"
                      fallback={ChatBubbleOutlineRoundedIcon}
                      fontSize="small"
                      color={c.id === activeConversationId ? 'primary' : 'action'}
                    />
                  </ListItemIcon>
                  <ListItemText
                    primary={c.title}
                    primaryTypographyProps={{
                      variant: 'body2',
                      fontWeight: c.id === activeConversationId ? 700 : 500,
                      sx: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
                    }}
                  />
                  {c.id === activeConversationId && (
                    <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          const newTitle = prompt('Rename conversation', c.title);
                          if (newTitle) onRenameConversation(c.id, newTitle);
                        }}
                      >
                        <AppIcon
                          name="EditOutlined"
                          fallback={EditOutlinedIcon}
                          fontSize="small"
                          sx={{ fontSize: 16 }}
                        />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm('Delete this conversation?')) onDeleteConversation(c.id);
                        }}
                      >
                        <AppIcon
                          name="DeleteOutlineRounded"
                          fallback={DeleteOutlineRoundedIcon}
                          fontSize="small"
                          sx={{ fontSize: 16 }}
                        />
                      </IconButton>
                    </Box>
                  )}
                </MenuItem>
              ))}
            </Menu>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
            <Tooltip title="New conversation" arrow>
              <IconButton
                size="small"
                onClick={() => {
                  onCreateConversation();
                }}
                sx={{
                  bgcolor: (t) => alpha(t.palette.action.hover, 0.4),
                  color: 'text.secondary',
                  '&:hover': { bgcolor: 'action.hover', color: 'primary.main' },
                  transition: 'all 0.2s',
                }}
              >
                <AppIcon
                  name="AddRounded"
                  fallback={AddRoundedIcon}
                  sx={{ fontSize: { xs: 18, sm: 22 } }}
                />
              </IconButton>
            </Tooltip>
            <Tooltip title={studioMode ? 'Classic Chat View' : 'Studio View'} arrow>
              <IconButton
                size="small"
                onClick={() => setStudioMode((v) => !v)}
                sx={{
                  bgcolor: (t) =>
                    studioMode
                      ? alpha(t.palette.primary.main, 0.15)
                      : alpha(t.palette.action.hover, 0.4),
                  color: studioMode ? 'primary.main' : 'text.secondary',
                  '&:hover': {
                    bgcolor: (t) =>
                      studioMode ? alpha(t.palette.primary.main, 0.25) : 'action.hover',
                  },
                  transition: 'all 0.2s',
                }}
              >
                {studioMode ? (
                  <AppIcon
                    name="ChatRounded"
                    fallback={ChatRoundedIcon}
                    sx={{ fontSize: { xs: 18, sm: 22 } }}
                  />
                ) : (
                  <AppIcon
                    name="ViewInArRounded"
                    fallback={ViewInArRoundedIcon}
                    sx={{ fontSize: { xs: 18, sm: 22 } }}
                  />
                )}
              </IconButton>
            </Tooltip>
            <IconButton
              size="small"
              onClick={handleClose}
              sx={{
                bgcolor: (t) => alpha(t.palette.action.hover, 0.4),
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              <AppIcon name="Close" fallback={CloseIcon} sx={{ fontSize: { xs: 20, sm: 24 } }} />
            </IconButton>
          </Box>
        </Box>

        {/* ── STUDIO MODE VIEW ─────────────────────────────────────────────────── */}
        {studioMode ? (
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'row', minHeight: 0, minWidth: 0 }}>
            <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <VoiceStudioView
                userName={displayName}
                isRecording={isRecording}
                isPaused={isPaused}
                isProcessing={
                  isAssistantSpeaking
                    ? false
                    : chatHistory.length > 0 && chatHistory[chatHistory.length - 1]?.role === 'user'
                }
                isAssistantSpeaking={isAssistantSpeaking}
                transcript={transcript}
                chatHistory={chatHistory}
                error={error}
                actions={actions}
                executableActions={executableActions}
                onToggleMic={onToggleMic}
                onSubmitText={(text, opts) => {
                  if (onSubmitText) onSubmitText(text, opts);
                  else if (onParseText) onParseText(text);
                }}
                onParseText={onParseText}
                isSupported={isSupported}
                renderFormattedAssistantText={(text) => <AssistantMarkdown text={text} />}
                formatMessageTime={formatMessageTime}
                isMobile={isMobile}
                onOpenMobileActions={() => setMobileActionsOpen(true)}
                mode={mode}
                onModeChange={onModeChange}
                homeSummary={homeSummary}
                homeSummaryLoading={homeSummaryLoading}
                banners={banners}
                bannersLoading={bannersLoading}
                bannersError={bannersError}
                greeting={greeting}
                onOpenEntity={onOpenEntity}
                onConfirmAction={onConfirmAction}
                copilotProvider={copilotProvider}
                copilotModel={copilotModel}
                onCopilotModelChange={onCopilotModelChange}
                prefillText={studioPrefillText}
                prefillNonce={studioPrefillNonce}
              />
            </Box>
            {!isMobile && (
              <CopilotSidebar
                open={studioMode}
                homeSummary={homeSummary}
                notifications={notifications}
                onOpenEntity={onOpenEntity}
                onSuggestionAction={(action) => {
                  if (!action) return;
                  if (action.kind === 'navigate' && action.payload?.route) {
                    onOpenEntity?.({ route: action.payload.route });
                  } else if (action.payload?.text) {
                    if (onSubmitText) onSubmitText(action.payload.text);
                  }
                }}
              />
            )}
          </Box>
        ) : (
          <>
            {/* ── MAIN CONTENT (SPLIT VIEW) ───────────────────────────────────────── */}
            <Box
              sx={{
                flex: 1,
                display: 'flex',
                overflow: 'hidden',
                flexDirection: 'row',
                minHeight: 0,
              }}
            >
              {/* ── LEFT PANEL: CHAT ── */}
              <Box
                sx={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  position: 'relative',
                  bgcolor: (t) => alpha(t.palette.background.default, 0.4),
                  minHeight: 0,
                  minWidth: 0,
                  overflow: 'hidden',
                }}
              >
                {/* CONTROL BAR */}
                <Box
                  sx={{
                    px: { xs: 1.25, sm: 3 },
                    py: { xs: 0.5, sm: 1.5 },
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 0.5,
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    bgcolor: 'background.paper',
                    minHeight: { xs: 36, sm: 48 },
                    flexShrink: 0,
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <Chip
                      icon={
                        isAssistantSpeaking ? (
                          <AppIcon name="BoltRounded" fallback={BoltRoundedIcon} />
                        ) : (
                          <AppIcon name="GraphicEqRounded" fallback={GraphicEqRoundedIcon} />
                        )
                      }
                      label={isAssistantSpeaking ? 'Speaking...' : 'Ready'}
                      size="small"
                      color={isAssistantSpeaking ? 'primary' : 'default'}
                      variant={isAssistantSpeaking ? 'filled' : 'outlined'}
                      sx={{
                        fontWeight: 600,
                        px: 0.5,
                        fontSize: { xs: '0.68rem', sm: '0.8125rem' },
                        height: { xs: 26, sm: 32 },
                        animation: isAssistantSpeaking ? `${speakingPulse} 1.5s infinite` : 'none',
                      }}
                    />
                    {(isRecording || isPaused) && (
                      <Chip
                        icon={
                          isPaused ? (
                            <AppIcon name="PauseOutlined" fallback={PauseOutlinedIcon} />
                          ) : (
                            <AppIcon name="MicOutlined" fallback={MicOutlinedIcon} />
                          )
                        }
                        label={isPaused ? 'Paused' : 'Listening...'}
                        size="small"
                        color={isRecording ? 'error' : 'warning'}
                        variant="filled"
                        sx={{
                          fontWeight: 600,
                          px: 0.5,
                          fontSize: { xs: '0.68rem', sm: '0.8125rem' },
                          height: { xs: 26, sm: 32 },
                          animation: isRecording ? `${recordPulse} 2s infinite` : 'none',
                        }}
                      />
                    )}
                  </Box>

                  <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.25, sm: 1 } }}>
                    <Tooltip title="Mute assistant voice">
                      <IconButton
                        size="small"
                        onClick={() => applyVoiceSetting({ muted: !voiceSettings.muted })}
                        color={voiceSettings.muted ? 'default' : 'primary'}
                        sx={{ p: { xs: 0.5, sm: 1 } }}
                      >
                        <AppIcon
                          name="GraphicEqRounded"
                          fallback={GraphicEqRoundedIcon}
                          sx={{
                            opacity: voiceSettings.muted ? 0.4 : 1,
                            fontSize: { xs: 18, sm: 20 },
                          }}
                        />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Voice Settings">
                      <IconButton
                        size="small"
                        onClick={() => setVoiceSettingsOpen(!voiceSettingsOpen)}
                        sx={{
                          p: { xs: 0.5, sm: 1 },
                          color: voiceSettingsOpen ? 'primary.main' : 'text.secondary',
                          bgcolor: voiceSettingsOpen
                            ? (t) => alpha(t.palette.primary.main, 0.1)
                            : 'transparent',
                          borderRadius: 1.5,
                          display: { xs: 'flex', sm: 'none' },
                        }}
                      >
                        <AppIcon
                          name="TuneOutlined"
                          fallback={TuneOutlinedIcon}
                          sx={{ fontSize: 18 }}
                        />
                      </IconButton>
                    </Tooltip>
                    {/* Desktop: show text button */}
                    <Tooltip title="Voice Settings">
                      <Button
                        size="small"
                        startIcon={<AppIcon name="TuneOutlined" fallback={TuneOutlinedIcon} />}
                        onClick={() => setVoiceSettingsOpen(!voiceSettingsOpen)}
                        sx={{
                          textTransform: 'none',
                          color: voiceSettingsOpen ? 'primary.main' : 'text.secondary',
                          bgcolor: voiceSettingsOpen
                            ? (t) => alpha(t.palette.primary.main, 0.1)
                            : 'transparent',
                          borderRadius: 2,
                          display: { xs: 'none', sm: 'inline-flex' },
                        }}
                      >
                        Settings
                      </Button>
                    </Tooltip>
                  </Box>
                </Box>

                {/* SETTINGS PANEL (OVERLAY) */}
                <Collapse in={voiceSettingsOpen} sx={{ flexShrink: 0 }}>
                  <Box
                    sx={{
                      p: { xs: 1.5, sm: 2.5 },
                      bgcolor: 'background.paper',
                      borderBottom: '1px solid',
                      borderColor: 'divider',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                      maxHeight: { xs: '30vh', sm: 'none' },
                      overflowY: { xs: 'auto', sm: 'visible' },
                    }}
                  >
                    <Box
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' },
                        gap: { xs: 1.5, sm: 3 },
                        alignItems: 'start',
                      }}
                    >
                      <Box sx={{ gridColumn: 'span 1' }}>
                        <Typography
                          variant="subtitle2"
                          fontWeight={700}
                          sx={{ mb: 1, fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
                        >
                          Voice
                        </Typography>
                        <FormControlLabel
                          control={
                            <Switch
                              size="small"
                              checked={voiceSettings.muted !== false}
                              onChange={(e) => applyVoiceSetting({ muted: e.target.checked })}
                            />
                          }
                          label={
                            <Typography
                              variant="body2"
                              sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
                            >
                              Text-only
                            </Typography>
                          }
                        />
                      </Box>
                      <Box sx={{ gridColumn: 'span 1' }}>
                        <Typography
                          variant="subtitle2"
                          fontWeight={700}
                          sx={{ mb: 1, fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
                        >
                          Language
                        </Typography>
                        <FormControl size="small" fullWidth>
                          <Select
                            value={voiceSettings.language || 'en-US'}
                            onChange={(e) => applyVoiceSetting({ language: e.target.value })}
                            sx={{ borderRadius: 1.5, fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
                          >
                            {LANGUAGE_OPTIONS.map((o) => (
                              <MenuItem key={o.value} value={o.value}>
                                {o.label}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </Box>
                      <Box sx={{ gridColumn: { xs: 'span 2', sm: 'span 2' } }}>
                        <Typography
                          variant="subtitle2"
                          fontWeight={700}
                          sx={{ mb: 1, fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
                        >
                          Personality
                        </Typography>
                        <Box
                          sx={{
                            display: 'flex',
                            gap: { xs: 0.5, sm: 1 },
                            mb: 1.5,
                            flexWrap: 'wrap',
                          }}
                        >
                          {['professional', 'warm', 'calm', 'energetic'].map((tone) => (
                            <Chip
                              key={tone}
                              label={tone}
                              clickable
                              size="small"
                              onClick={() => applyVoiceSetting({ tone })}
                              color={voiceSettings.tone === tone ? 'primary' : 'default'}
                              variant={voiceSettings.tone === tone ? 'filled' : 'outlined'}
                              sx={{
                                textTransform: 'capitalize',
                                fontWeight: 500,
                                fontSize: { xs: '0.68rem', sm: '0.8125rem' },
                              }}
                            />
                          ))}
                        </Box>
                        <Box sx={{ display: 'flex', gap: { xs: 2, sm: 3 } }}>
                          <Box sx={{ flex: 1 }}>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ fontSize: { xs: '0.65rem', sm: '0.75rem' } }}
                            >
                              Speed ({Number(voiceSettings.rate || 1).toFixed(1)}x)
                            </Typography>
                            <Slider
                              size="small"
                              min={0.7}
                              max={1.3}
                              step={0.1}
                              value={Number(voiceSettings.rate || 1)}
                              onChange={(_, v) => applyVoiceSetting({ rate: v, tone: 'custom' })}
                            />
                          </Box>
                          <Box sx={{ flex: 1 }}>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ fontSize: { xs: '0.65rem', sm: '0.75rem' } }}
                            >
                              Pitch ({Number(voiceSettings.pitch || 1).toFixed(1)})
                            </Typography>
                            <Slider
                              size="small"
                              min={0.8}
                              max={1.2}
                              step={0.1}
                              value={Number(voiceSettings.pitch || 1)}
                              onChange={(_, v) => applyVoiceSetting({ pitch: v, tone: 'custom' })}
                            />
                          </Box>
                        </Box>
                      </Box>

                      {/* AI Personality (LLM reply style) */}
                      <Box sx={{ gridColumn: { xs: 'span 2', sm: 'span 4' }, mt: 0.5 }}>
                        <Typography
                          variant="subtitle2"
                          fontWeight={700}
                          sx={{ mb: 0.75, fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
                        >
                          AI Reply Style
                        </Typography>
                        <Box sx={{ display: 'flex', gap: { xs: 0.5, sm: 0.75 }, flexWrap: 'wrap' }}>
                          {[
                            { id: 'professional', label: 'Professional' },
                            { id: 'friendly', label: 'Friendly' },
                            { id: 'technical', label: 'Technical' },
                            { id: 'creative', label: 'Creative' },
                            { id: 'minimal', label: 'Minimal' },
                          ].map((p) => (
                            <Chip
                              key={p.id}
                              label={p.label}
                              clickable
                              size="small"
                              onClick={() => applyVoiceSetting({ personality: p.id })}
                              color={
                                (voiceSettings.personality || 'professional') === p.id
                                  ? 'secondary'
                                  : 'default'
                              }
                              variant={
                                (voiceSettings.personality || 'professional') === p.id
                                  ? 'filled'
                                  : 'outlined'
                              }
                              sx={{ fontWeight: 600, fontSize: { xs: '0.68rem', sm: '0.8125rem' } }}
                            />
                          ))}
                        </Box>
                      </Box>

                      {/* Voice Output Engine */}
                      <Box sx={{ gridColumn: { xs: 'span 2', sm: 'span 4' }, mt: 0.5 }}>
                        <Typography
                          variant="subtitle2"
                          fontWeight={700}
                          sx={{ mb: 0.75, fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
                        >
                          Voice Output
                        </Typography>
                        <Box
                          sx={{
                            display: 'flex',
                            gap: { xs: 0.5, sm: 0.75 },
                            flexWrap: 'wrap',
                            mb: 1,
                          }}
                        >
                          {[
                            { id: 'elevenlabs', label: 'AI Voice' },
                            { id: 'browser', label: 'Browser' },
                          ].map((eng) => (
                            <Chip
                              key={eng.id}
                              label={eng.label}
                              clickable
                              size="small"
                              onClick={() => applyVoiceSetting({ ttsProvider: eng.id })}
                              color={
                                (voiceSettings.ttsProvider || 'elevenlabs') === eng.id
                                  ? 'primary'
                                  : 'default'
                              }
                              variant={
                                (voiceSettings.ttsProvider || 'elevenlabs') === eng.id
                                  ? 'filled'
                                  : 'outlined'
                              }
                              sx={{ fontWeight: 600, fontSize: { xs: '0.68rem', sm: '0.8125rem' } }}
                            />
                          ))}
                        </Box>
                        {(voiceSettings.ttsProvider || 'elevenlabs') === 'elevenlabs' && (
                          <Box
                            sx={{ display: 'flex', gap: { xs: 0.5, sm: 0.75 }, flexWrap: 'wrap' }}
                          >
                            {ELEVENLABS_VOICES.map((v) => (
                              <Tooltip key={v.id} title={v.desc} placement="top" arrow>
                                <Chip
                                  label={v.label}
                                  clickable
                                  size="small"
                                  onClick={() => {
                                    applyVoiceSetting({ voiceId: v.id });
                                    previewVoice(v.id, v.label);
                                  }}
                                  color={
                                    (voiceSettings.voiceId || '21m00Tcm4TlvDq8ikWAM') === v.id
                                      ? 'secondary'
                                      : 'default'
                                  }
                                  variant={
                                    (voiceSettings.voiceId || '21m00Tcm4TlvDq8ikWAM') === v.id
                                      ? 'filled'
                                      : 'outlined'
                                  }
                                  sx={{
                                    fontWeight: 500,
                                    fontSize: { xs: '0.68rem', sm: '0.8125rem' },
                                  }}
                                />
                              </Tooltip>
                            ))}
                          </Box>
                        )}
                      </Box>
                    </Box>
                  </Box>
                </Collapse>

                {/* CHAT HISTORY AREA */}
                <Box
                  sx={{
                    flex: 1,
                    overflowY: 'auto',
                    WebkitOverflowScrolling: 'touch',
                    p: { xs: 1, sm: 3 },
                    display: 'flex',
                    flexDirection: 'column',
                    gap: { xs: 1.25, sm: 2 },
                    minHeight: 0,
                  }}
                >
                  {error && (
                    <Box
                      sx={{
                        p: 1.5,
                        mb: 1,
                        borderRadius: 2,
                        bgcolor: (t) => alpha(t.palette.error.main, 0.1),
                        border: '1px solid',
                        borderColor: 'error.main',
                        color: 'error.main',
                        fontSize: { xs: '0.78rem', sm: '0.85rem' },
                        fontWeight: 500,
                        textAlign: 'center',
                      }}
                    >
                      {error}
                    </Box>
                  )}
                  {(chatHistory || []).length === 0 ? (
                    <Box sx={{ mt: { xs: 2, sm: 8 }, textAlign: 'center', opacity: 0.6, px: 1 }}>
                      <AppIcon
                        name="AutoAwesomeOutlined"
                        fallback={AutoAwesomeOutlinedIcon}
                        sx={{ fontSize: { xs: 36, sm: 48 }, color: 'primary.main', mb: 1.5 }}
                      />
                      <Typography
                        variant="h6"
                        fontWeight={600}
                        gutterBottom
                        sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}
                      >
                        How can I help you today?
                      </Typography>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{
                          maxWidth: 400,
                          mx: 'auto',
                          fontSize: { xs: '0.8rem', sm: '0.875rem' },
                        }}
                      >
                        Ask me to analyze data, create projects, manage partners, or just chat about
                        your business.
                      </Typography>
                    </Box>
                  ) : (
                    chatHistory.map((msg) => {
                      const hasStoredActions =
                        msg.role === 'assistant' &&
                        Array.isArray(msg.actions) &&
                        msg.actions.length > 0;
                      return (
                        <Box
                          key={msg.id}
                          sx={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                            maxWidth: { xs: '92%', sm: '85%' },
                            alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                          }}
                        >
                          <Box
                            sx={{
                              p: { xs: 1.5, sm: 2 },
                              borderRadius: 2.5,
                              borderTopRightRadius: msg.role === 'user' ? 4 : 2.5,
                              borderTopLeftRadius: msg.role === 'user' ? 2.5 : 4,
                              bgcolor: msg.role === 'user' ? 'primary.main' : 'background.paper',
                              color: msg.role === 'user' ? '#fff' : 'text.primary',
                              boxShadow:
                                msg.role === 'user'
                                  ? '0 4px 12px rgba(0,0,0,0.1)'
                                  : '0 2px 8px rgba(0,0,0,0.05)',
                              border: '1px solid',
                              borderColor: msg.role === 'user' ? 'primary.main' : 'divider',
                              '& pre': {
                                maxWidth: '100%',
                                overflowX: 'auto',
                              },
                            }}
                          >
                            {msg.role === 'assistant' ? (
                              renderFormattedAssistantText(msg.message)
                            ) : (
                              <Typography
                                variant="body1"
                                sx={{
                                  whiteSpace: 'pre-wrap',
                                  fontSize: { xs: '0.875rem', sm: '1rem' },
                                  wordBreak: 'break-word',
                                }}
                              >
                                {msg.message}
                              </Typography>
                            )}
                          </Box>
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 0.75,
                              mt: 0.5,
                              px: 0.5,
                              flexWrap: 'wrap',
                            }}
                          >
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              fontWeight={500}
                              sx={{ fontSize: { xs: '0.65rem', sm: '0.75rem' } }}
                            >
                              {msg.role === 'assistant' ? 'AI Assistant' : 'You'} •{' '}
                              {formatMessageTime(msg.time)}
                            </Typography>
                            {hasStoredActions && (
                              <Chip
                                size="small"
                                label="View actions"
                                icon={
                                  <AppIcon
                                    name="BoltRounded"
                                    fallback={BoltRoundedIcon}
                                    sx={{ fontSize: '14px !important' }}
                                  />
                                }
                                onClick={() => onParseText && onParseText('', msg.actions)}
                                sx={{
                                  height: 20,
                                  fontSize: '0.65rem',
                                  cursor: 'pointer',
                                  bgcolor: 'action.hover',
                                }}
                              />
                            )}
                          </Box>
                        </Box>
                      );
                    })
                  )}
                  <div ref={chatEndRef} />
                </Box>

                {/* MOBILE: ACTIONS TOGGLE BAR (always show so user can open templates) */}
                {isMobile && (
                  <Box
                    onClick={() => setMobileActionsOpen(true)}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 1,
                      py: 0.6,
                      px: 2,
                      bgcolor: (t) => alpha(t.palette.primary.main, 0.08),
                      borderTop: '1px solid',
                      borderColor: (t) => alpha(t.palette.primary.main, 0.2),
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      flexShrink: 0,
                      '&:active': { bgcolor: (t) => alpha(t.palette.primary.main, 0.18) },
                    }}
                  >
                    <Badge
                      badgeContent={executableActions.length}
                      sx={{
                        '& .MuiBadge-badge': {
                          fontSize: '0.65rem',
                          minWidth: 18,
                          height: 18,
                          bgcolor: 'primary.main',
                          color: '#fff',
                        },
                      }}
                    >
                      <AppIcon
                        name="BoltRounded"
                        fallback={BoltRoundedIcon}
                        sx={{ fontSize: 18, color: 'primary.main' }}
                      />
                    </Badge>
                    <Typography
                      variant="caption"
                      sx={{ fontWeight: 700, color: 'primary.main', fontSize: '0.75rem' }}
                    >
                      View Actions
                    </Typography>
                    <AppIcon
                      name="ExpandMoreRounded"
                      fallback={ExpandMoreRoundedIcon}
                      sx={{ fontSize: 16, color: 'primary.main', transform: 'rotate(180deg)' }}
                    />
                  </Box>
                )}

                {/* INPUT AREA */}
                <Box
                  sx={{
                    p: { xs: 0.75, sm: 2.5 },
                    bgcolor: 'background.paper',
                    borderTop: '1px solid',
                    borderColor: 'divider',
                    flexShrink: 0,
                    /* On iOS, account for safe area / bottom bar */
                    pb: { xs: 'calc(6px + env(safe-area-inset-bottom, 0px))', sm: 2.5 },
                  }}
                >
                  <Paper
                    elevation={0}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      p: { xs: '3px 6px', sm: '4px 8px' },
                      borderRadius: { xs: 2.5, sm: 3 },
                      border: '1px solid',
                      borderColor: (t) =>
                        isRecording ? 'error.main' : alpha(t.palette.primary.main, 0.3),
                      bgcolor: (t) => alpha(t.palette.background.default, 0.5),
                      transition: 'all 0.2s',
                      boxShadow: (t) =>
                        isRecording ? `0 0 0 2px ${alpha(t.palette.error.main, 0.2)}` : 'none',
                    }}
                  >
                    <Tooltip title={isRecording ? 'Stop Recording' : 'Start Voice Input'}>
                      <IconButton
                        onClick={onToggleMic}
                        disabled={!isSupported}
                        size="small"
                        sx={{
                          color: isRecording ? 'error.main' : 'primary.main',
                          bgcolor: isRecording
                            ? alpha(theme.palette.error.main, 0.1)
                            : 'transparent',
                          '&:hover': {
                            bgcolor: isRecording
                              ? alpha(theme.palette.error.main, 0.2)
                              : alpha(theme.palette.primary.main, 0.1),
                          },
                          p: { xs: 0.75, sm: 1 },
                        }}
                      >
                        {isRecording ? (
                          <AppIcon
                            name="StopOutlined"
                            fallback={StopOutlinedIcon}
                            sx={{ fontSize: { xs: 20, sm: 24 } }}
                          />
                        ) : (
                          <AppIcon
                            name="MicOutlined"
                            fallback={MicOutlinedIcon}
                            sx={{ fontSize: { xs: 20, sm: 24 } }}
                          />
                        )}
                      </IconButton>
                    </Tooltip>

                    <TextField
                      fullWidth
                      placeholder={isRecording ? 'Listening...' : 'Type your message...'}
                      value={localTranscript}
                      onChange={handleTextChange}
                      multiline
                      maxRows={4}
                      variant="standard"
                      InputProps={{
                        disableUnderline: true,
                        sx: { fontSize: { xs: '0.875rem', sm: '1rem' } },
                      }}
                      sx={{ px: { xs: 0.75, sm: 1.5 } }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendText();
                        }
                      }}
                    />

                    <Tooltip title="Send Message">
                      <span>
                        <IconButton
                          onClick={handleSendText}
                          disabled={!localTranscript.trim()}
                          size="small"
                          sx={{
                            bgcolor: localTranscript.trim()
                              ? 'primary.main'
                              : 'action.disabledBackground',
                            color: localTranscript.trim() ? '#fff' : 'text.disabled',
                            '&:hover': {
                              bgcolor: localTranscript.trim()
                                ? 'primary.dark'
                                : 'action.disabledBackground',
                            },
                            transition: 'all 0.2s',
                            width: { xs: 34, sm: 40 },
                            height: { xs: 34, sm: 40 },
                          }}
                        >
                          <AppIcon
                            name="SendRounded"
                            fallback={SendRoundedIcon}
                            sx={{ fontSize: { xs: 16, sm: 20 } }}
                          />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </Paper>

                  {!isSupported && (
                    <Typography
                      variant="caption"
                      color="error"
                      sx={{
                        mt: 0.5,
                        display: 'block',
                        textAlign: 'center',
                        fontSize: { xs: '0.68rem', sm: '0.75rem' },
                      }}
                    >
                      Voice input is not supported in this browser.
                    </Typography>
                  )}
                </Box>
              </Box>

              {/* ── RIGHT PANEL: ACTIONS (Desktop) ── */}
              {!isMobile && (
                <Box
                  sx={{
                    width: artifact ? 320 : 420,
                    bgcolor: 'background.default',
                    borderLeft: '1px solid',
                    borderColor: 'divider',
                    display: 'flex',
                    flexDirection: 'column',
                    transition: 'width 0.2s ease',
                  }}
                >
                  {actionsContent}
                </Box>
              )}

              {/* ── ARTIFACT PANEL (Desktop) ── */}
              {!isMobile && artifact && (
                <Box
                  sx={{
                    width: 420,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                  }}
                >
                  <ArtifactPanel artifact={artifact} onClose={onCloseArtifact} />
                </Box>
              )}
            </Box>
          </>
        )}

        {/* ── MOBILE: ACTIONS DRAWER ── */}
        {isMobile && (
          <Drawer
            anchor="bottom"
            open={mobileActionsOpen}
            onClose={() => setMobileActionsOpen(false)}
            PaperProps={{
              sx: {
                borderRadius: '16px 16px 0 0',
                maxHeight: '75vh',
                bgcolor: 'background.default',
              },
            }}
            ModalProps={{ keepMounted: true }}
          >
            <Box sx={{ display: 'flex', justifyContent: 'center', pt: 1, pb: 0.5 }}>
              <Box
                sx={{
                  width: 36,
                  height: 4,
                  borderRadius: 2,
                  bgcolor: 'text.disabled',
                  opacity: 0.4,
                }}
              />
            </Box>
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                maxHeight: 'calc(75vh - 16px)',
                overflow: 'hidden',
              }}
            >
              {actionsContent}
            </Box>
          </Drawer>
        )}

        {/* ── DESKTOP (studio mode): ACTIONS DIALOG POPUP ── */}
        {!isMobile && studioMode && (
          <Dialog
            open={mobileActionsOpen}
            onClose={() => setMobileActionsOpen(false)}
            maxWidth="sm"
            fullWidth
            PaperProps={{
              sx: {
                borderRadius: 3,
                maxHeight: '85vh',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
              },
            }}
          >
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                maxHeight: '85vh',
                overflow: 'hidden',
              }}
            >
              {actionsContent}
            </Box>
          </Dialog>
        )}
      </Box>
    </Dialog>
  );
}
