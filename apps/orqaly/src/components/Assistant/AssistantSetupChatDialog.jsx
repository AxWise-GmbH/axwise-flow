/**
 * AssistantSetupChatDialog - the unified "Set up your AI Assistant" popup.
 * Replaces the old Dashboard ActivateAssistantDialog and the Organizations
 * 7-module checklist.
 *
 * Two views over the same setup state, switched from the header:
 *  - Steps (default): a step-by-step wizard mirroring the /setup page - a
 *    horizontal stepper across the 7 capabilities, one per step, Back/Next.
 *  - Chat: a conversational assistant kept as a support option - it greets the
 *    user, answers any question (assistant-chat natural-reply endpoint) and
 *    walks them through the same cards inline.
 *
 * Both views drive one deterministic setup state (useAssistantSetup, persisted
 * in the assistant_setup table) via a shared `persistStep`, so completing a
 * capability in either view is reflected in the other. Configuring the BYOK
 * brain (keys) is the activation gate.
 *
 * Beside the two views sits "My Assistants" - a dropdown, not a third view. It
 * lists every assistant the user owns and switching picks a new current one
 * server-side, so Steps/Chat immediately reflect that assistant's config while
 * staying on whichever view was open. Create / rename / delete deliberately live
 * elsewhere (the Assistant context drawer and the /assistant console).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Dialog,
  Typography,
  IconButton,
  TextField,
  Avatar,
  Tooltip,
  CircularProgress,
  ToggleButton,
  ToggleButtonGroup,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  alpha,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import SmartToyRoundedIcon from '@mui/icons-material/SmartToyRounded';
import ForumRoundedIcon from '@mui/icons-material/ForumRounded';
import ChecklistRoundedIcon from '@mui/icons-material/ChecklistRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import MicRoundedIcon from '@mui/icons-material/MicRounded';
import StopRoundedIcon from '@mui/icons-material/StopRounded';
import VolumeUpRoundedIcon from '@mui/icons-material/VolumeUpRounded';
import VolumeOffRoundedIcon from '@mui/icons-material/VolumeOffRounded';
import { supabase, hasSupabase } from '../../lib/supabase';
import { assistantChatApi } from '../../services/assistantChatApiService';
import { getChannels } from '../../services/communicatorService';
import { useAssistantSetup } from '../../hooks/useAssistantSetup';
import { useVoiceChat } from '../../hooks/useVoiceChat';
import { unlockAudioContext } from '../../services/ttsService';
import { ASSISTANT_SETUP_STEPS as STEPS } from './setupSteps';
import { persistAssistantStep } from './persistAssistantStep';
import AssistantSetupWizard from './AssistantSetupWizard';
import AssistantWelcomeDialog from './AssistantWelcomeDialog';

import AppIcon from '../icons/AppIcon';

const GREETING =
  "Hi! I'm your AI assistant. Let's get me set up so I can work for your company - " +
  "I'll walk you through it and you can ask me anything along the way. First, let's connect a channel so I can reach you.";

let _mid = 0;
const nextId = () => `m${Date.now()}_${_mid++}`;

// Shared by the Steps/Chat group and the standalone "My Assistants" trigger so
// the three header buttons stay visually identical.
const TOGGLE_SX = {
  textTransform: 'none',
  fontWeight: 700,
  px: 2.25,
  py: 0.5,
  borderRadius: 2,
  gap: 0.75,
};

async function getToken() {
  if (!hasSupabase()) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || null;
}

export default function AssistantSetupChatDialog({ open, onClose, initialStep = 0 }) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  // Defaults keep partial mocks (and any future partial hook) working.
  const {
    config,
    steps,
    save,
    loading,
    assistants = [],
    currentId = null,
    switchAssistant,
  } = useAssistantSetup({ enabled: open });

  const [mode, setMode] = useState('wizard'); // 'wizard' | 'chat'
  const [assistantAnchor, setAssistantAnchor] = useState(null);
  const [switching, setSwitching] = useState(false);
  // The assistant that just became current, while it introduces itself.
  const [welcomeFor, setWelcomeFor] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [muted, setMuted] = useState(false);
  const [token, setToken] = useState(null);
  const scrollRef = useRef(null);
  const startedRef = useRef(false);
  const sendingRef = useRef(false);
  const spokeRef = useRef(false); // the last message came in by voice
  const mutedRef = useRef(false);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  // Keep a fresh JWT around for the ElevenLabs voice fallback (Voicebox needs none).
  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    getToken().then((t) => {
      if (active) setToken(t);
    });
    return () => {
      active = false;
    };
  }, [open]);

  // Self-heal the Channel step: if a channel is already connected (e.g. set up
  // via the Communicator, not this wizard), mark it done so we don't ask again.
  useEffect(() => {
    if (!open || loading || steps.channel) return undefined;
    let active = true;
    getChannels()
      .then((chs) => {
        const list = Array.isArray(chs) ? chs : chs?.channels || [];
        const hasActive = list.some((c) => c.status === 'active');
        if (active && hasActive) save({ steps: { channel: true } }).catch(() => {});
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [open, loading, steps.channel, save]);

  const push = useCallback((msg) => {
    setMessages((prev) => [...prev, { id: nextId(), ...msg }]);
  }, []);

  // "My Assistants": make the picked one current, then hand the screen to that
  // assistant so it can introduce itself. The switch used to happen in silence -
  // the hook re-applied the list, the wizard stayed put, and the only sign
  // anything had changed was the subtitle. Picking the assistant you are already
  // on is still a no-op: there is nothing to be introduced to.
  const handlePickAssistant = useCallback(
    async (id) => {
      setAssistantAnchor(null);
      if (!id || id === currentId) return;
      // Read the row before switching: the welcome names the assistant even if
      // the list is still settling.
      const picked = assistants.find((a) => a.id === id) || null;
      setSwitching(true);
      try {
        await switchAssistant?.(id);
        onClose?.();
        setWelcomeFor(picked);
      } catch {
        /* non-fatal: keep the current assistant, and say nothing */
      } finally {
        setSwitching(false);
      }
    },
    [assistants, currentId, switchAssistant, onClose]
  );

  // First unlocked, incomplete step - the one the assistant should offer next.
  const nextStep = useCallback(
    (completed) => STEPS.find((s) => !s.locked && !completed[s.key]),
    []
  );

  // Persist a finished capability (shared by the wizard + the chat). Returns the
  // resolved completion map. Configuring the BYOK brain activates the assistant.
  const persistStep = useCallback(
    async (stepKey, patch = {}) => {
      const saved = await persistAssistantStep(save, stepKey, patch).catch(() => null);
      return saved?.steps || { ...steps, [stepKey]: true };
    },
    [save, steps]
  );

  // Wizard: configuring the brain (keys) is the gate to finish.
  const canFinish = !!steps.keys;
  const handleFinish = useCallback(async () => {
    await save({ activated: true }).catch(() => {});
    onClose?.();
  }, [save, onClose]);

  // Seed the conversation the first time Chat is shown for this open. Reads
  // `steps` via a ref so we only depend on [open, loading, mode] - depending on
  // the `steps` identity would re-seed on every render.
  const stepsRef = useRef(steps);
  stepsRef.current = steps;
  useEffect(() => {
    if (!open) {
      startedRef.current = false;
      setMessages([]);
      setInput('');
      return;
    }
    if (mode !== 'chat' || startedRef.current || loading) return;
    startedRef.current = true;
    const first = nextStep(stepsRef.current);
    const seed = [{ id: nextId(), role: 'assistant', text: GREETING }];
    if (first) seed.push({ id: nextId(), role: 'assistant', cardKey: first.key });
    else
      seed.push({
        id: nextId(),
        role: 'assistant',
        text: "You're all set up - I'm ready to work. Ask me anything.",
      });
    setMessages(seed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, loading, mode, currentId]);

  // Switching assistants starts a fresh thread: the greeting and the offered
  // card belong to the newly current assistant, not the previous one's progress.
  const seededForRef = useRef(currentId);
  useEffect(() => {
    if (seededForRef.current === currentId) return;
    seededForRef.current = currentId;
    startedRef.current = false;
    setMessages([]);
    setInput('');
  }, [currentId]);

  // Auto-scroll on new messages. (Guarded: jsdom doesn't implement scrollTo.)
  useEffect(() => {
    const el = scrollRef.current;
    if (el && typeof el.scrollTo === 'function') {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
  }, [messages]);

  // Chat: a card finished - persist, acknowledge, then offer the next step.
  const handleCardComplete = useCallback(
    async (stepKey, patch = {}) => {
      const completed = await persistStep(stepKey, patch);
      const done = STEPS.find((s) => s.key === stepKey);
      push({ role: 'assistant', text: `Done - ${done?.label?.toLowerCase() || stepKey} is set.` });
      const next = nextStep(completed);
      if (next) push({ role: 'assistant', cardKey: next.key });
      else
        push({
          role: 'assistant',
          text: "That's everything - I'm set up and ready to go. You can close this anytime, or keep chatting.",
        });
    },
    [persistStep, push, nextStep]
  );

  const handleSkip = useCallback(
    (stepKey) => {
      const next = nextStep({ ...steps, [stepKey]: true });
      push({ role: 'assistant', text: 'No problem, we can come back to that.' });
      if (next) push({ role: 'assistant', cardKey: next.key });
    },
    [steps, push, nextStep]
  );

  // Voice loop (mic in, spoken reply out). Routes to Voicebox when configured +
  // reachable, else the built-in Web-Speech / ElevenLabs fallback. onTranscript
  // is stable and dispatches through a ref so the hook never re-subscribes.
  const voiceSettings = useMemo(() => ({ language: 'en-US', muted }), [muted]);
  const handleSendRef = useRef(null);
  const onTranscript = useCallback((t) => {
    spokeRef.current = true;
    handleSendRef.current?.(t);
  }, []);
  const voice = useVoiceChat({ voiceConfig: config?.voice, token, voiceSettings, onTranscript });

  // Free-text (typed or spoken) -> human-like reply from the assistant LLM, then
  // optionally spoken aloud. `textOverride` is the mic transcript path.
  const handleSend = useCallback(
    async (textOverride) => {
      const text = (typeof textOverride === 'string' ? textOverride : input).trim();
      if (!text || sendingRef.current) return;
      sendingRef.current = true;
      if (typeof textOverride !== 'string') setInput('');
      push({ role: 'user', text });
      setSending(true);
      let reply = "I'm here - let's keep going.";
      try {
        const tok = token || (await getToken());
        const res = await assistantChatApi({
          action: 'natural-reply',
          message: text,
          personality: config?.tone || 'friendly',
          token: tok,
        });
        reply = res?.message || res?.reply || reply;
      } catch {
        reply = "I couldn't reach my brain just now, but we can keep setting things up.";
      } finally {
        setSending(false);
        sendingRef.current = false;
      }
      push({ role: 'assistant', text: reply });
      // Speak the reply when voice is configured, or when the user just spoke.
      const wantSpeak = (!!config?.voice || spokeRef.current) && !mutedRef.current;
      spokeRef.current = false;
      if (wantSpeak) voice.speakReply(reply);
    },
    [input, token, config, push, voice]
  );

  useEffect(() => {
    handleSendRef.current = handleSend;
  }, [handleSend]);

  // Context-aware mic button: speaking -> stop, recording -> stop+transcribe,
  // idle -> record. Unlocks audio on the gesture (iOS).
  const handleMic = useCallback(() => {
    unlockAudioContext();
    if (voice.micState === 'recording') voice.stopMic();
    else if (voice.isSpeaking) voice.stopSpeaking();
    else voice.startMic();
  }, [voice]);

  const voiceActive = voice.micState !== 'idle' || voice.isSpeaking;

  const renderCard = (key) => {
    const step = STEPS.find((s) => s.key === key);
    if (!step?.Card) return null;
    const Card = step.Card;
    return (
      <Card
        config={config}
        onComplete={(patch) => handleCardComplete(key, patch)}
        onSkip={() => handleSkip(key)}
      />
    );
  };

  const currentAssistant = assistants.find((a) => a.id === currentId) || null;
  const baseSubtitle =
    mode === 'wizard'
      ? 'Follow the steps - switch to Chat anytime for help'
      : "Chat with me - I'll guide the setup";
  // With more than one assistant, name the one being edited so the user can see
  // it without opening the picker.
  const subtitle =
    assistants.length > 1 && currentAssistant
      ? `${currentAssistant.name || 'My Assistant'} - ${baseSubtitle.charAt(0).toLowerCase()}${baseSubtitle.slice(1)}`
      : baseSubtitle;

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        fullScreen={fullScreen}
        maxWidth="sm"
        fullWidth
        slotProps={{
          paper: {
            sx: {
              borderRadius: fullScreen ? 0 : 4,
              height: fullScreen ? '100dvh' : '82vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              border: '1px solid',
              borderColor: alpha(theme.palette.primary.main, 0.25),
            },
          },
        }}
      >
        {/* Header */}
        <Box
          sx={{
            flexShrink: 0,
            px: 2.5,
            py: 1.75,
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            borderBottom: '1px solid',
            borderColor: 'divider',
            bgcolor: alpha(theme.palette.primary.main, 0.06),
          }}
        >
          <Avatar
            sx={{
              bgcolor: alpha(theme.palette.primary.main, 0.15),
              color: 'primary.main',
              width: 38,
              height: 38,
            }}
          >
            <AppIcon name="SmartToyRounded" fallback={SmartToyRoundedIcon} />
          </Avatar>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 800, lineHeight: 1.1 }}>
              Set up your AI Assistant
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {subtitle}
            </Typography>
          </Box>
          <IconButton onClick={onClose} aria-label="Close">
            <AppIcon name="CloseRounded" fallback={CloseRoundedIcon} />
          </IconButton>
        </Box>
        {/* Mode toggle: Steps (wizard) | Chat (support), then the assistant picker */}
        <Box
          sx={{
            flexShrink: 0,
            px: 2,
            py: 1,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 1,
            borderBottom: '1px solid',
            borderColor: 'divider',
            bgcolor: alpha(theme.palette.primary.main, 0.03),
          }}
        >
          <ToggleButtonGroup
            size="small"
            exclusive
            value={mode}
            onChange={(_e, v) => {
              if (v) setMode(v);
            }}
            aria-label="Setup view"
            sx={{ '& .MuiToggleButton-root': TOGGLE_SX }}
          >
            <ToggleButton value="wizard" aria-label="Steps">
              <AppIcon
                name="ChecklistRounded"
                fallback={ChecklistRoundedIcon}
                sx={{ fontSize: 18 }}
              />{' '}
              Steps
            </ToggleButton>
            <ToggleButton value="chat" aria-label="Chat">
              <AppIcon name="ForumRounded" fallback={ForumRoundedIcon} sx={{ fontSize: 18 }} /> Chat
            </ToggleButton>
          </ToggleButtonGroup>
          {/* Not a view - a menu trigger, so it stays outside the exclusive group. */}
          <ToggleButton
            size="small"
            value="assistants"
            selected={Boolean(assistantAnchor)}
            disabled={assistants.length === 0}
            onClick={(e) => setAssistantAnchor(e.currentTarget)}
            aria-label="My Assistants"
            aria-haspopup="menu"
            aria-expanded={Boolean(assistantAnchor)}
            sx={TOGGLE_SX}
          >
            <AppIcon name="SmartToyRounded" fallback={SmartToyRoundedIcon} sx={{ fontSize: 18 }} />
            {/* Three buttons is tight in the fullScreen mobile dialog. */}
            <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
              My Assistants
            </Box>
            <AppIcon
              name="ExpandMoreRounded"
              fallback={ExpandMoreRoundedIcon}
              sx={{ fontSize: 18 }}
            />
          </ToggleButton>
          <Menu
            anchorEl={assistantAnchor}
            open={Boolean(assistantAnchor)}
            onClose={() => setAssistantAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            transformOrigin={{ vertical: 'top', horizontal: 'center' }}
            slotProps={{ list: { 'aria-label': 'My Assistants', dense: true } }}
          >
            {assistants.map((a) => (
              <MenuItem
                key={a.id}
                selected={a.id === currentId}
                disabled={switching}
                onClick={() => handlePickAssistant(a.id)}
              >
                <ListItemIcon sx={{ minWidth: 32 }}>
                  {a.id === currentId && (
                    <AppIcon name="CheckRounded" fallback={CheckRoundedIcon} fontSize="small" />
                  )}
                </ListItemIcon>
                <ListItemText
                  primary={a.name || 'My Assistant'}
                  secondary={a.activated ? 'Ready' : 'Set Core to finish'}
                  slotProps={{ primary: { sx: { fontWeight: a.id === currentId ? 700 : 500 } } }}
                />
              </MenuItem>
            ))}
          </Menu>
        </Box>
        {loading ? (
          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CircularProgress />
          </Box>
        ) : mode === 'wizard' ? (
          <AssistantSetupWizard
            // Remount on switch: the step cards seed their local state from
            // `config` at mount, so a stale card would show the old assistant's.
            key={currentId || 'new'}
            stepsDone={steps}
            config={config}
            onComplete={persistStep}
            canFinish={canFinish}
            onFinish={handleFinish}
            initialStep={initialStep}
          />
        ) : (
          <>
            {/* Conversation */}
            <Box
              ref={scrollRef}
              sx={{
                flex: 1,
                minHeight: 0,
                overflowY: 'auto',
                px: 2,
                py: 2,
                display: 'flex',
                flexDirection: 'column',
                gap: 1.5,
              }}
            >
              {messages.map((m) => (
                <Box
                  key={m.id}
                  sx={{
                    display: 'flex',
                    justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
                  }}
                >
                  {m.cardKey ? (
                    <Box sx={{ width: '100%' }}>{renderCard(m.cardKey)}</Box>
                  ) : (
                    <Box
                      sx={{
                        maxWidth: '85%',
                        px: 1.75,
                        py: 1.1,
                        borderRadius: 2.5,
                        bgcolor:
                          m.role === 'user'
                            ? 'primary.main'
                            : alpha(theme.palette.text.primary, 0.06),
                        color: m.role === 'user' ? 'primary.contrastText' : 'text.primary',
                        fontSize: '0.9rem',
                        lineHeight: 1.5,
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {m.text}
                    </Box>
                  )}
                </Box>
              ))}
              {sending && (
                <Box
                  sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}
                >
                  <CircularProgress size={14} />{' '}
                  <Typography variant="caption">Thinking...</Typography>
                </Box>
              )}
            </Box>

            {/* Composer */}
            <Box
              sx={{
                flexShrink: 0,
                p: 1.5,
                borderTop: '1px solid',
                borderColor: 'divider',
                display: 'flex',
                flexDirection: 'column',
                gap: 0.75,
              }}
            >
              {(voiceActive || voice.voiceError) && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 0.5, minHeight: 22 }}>
                  {voice.micState === 'recording' && (
                    <Typography variant="caption" color="error.main">
                      ● Listening... tap the mic to stop
                    </Typography>
                  )}
                  {voice.micState === 'transcribing' && (
                    <Typography variant="caption" color="text.secondary">
                      Transcribing...
                    </Typography>
                  )}
                  {voice.isSpeaking && (
                    <Typography variant="caption" color="primary.main">
                      Speaking...
                    </Typography>
                  )}
                  {(voice.isSpeaking || voice.micState === 'recording') && (
                    <IconButton
                      size="small"
                      onClick={() => {
                        voice.stopMic();
                        voice.stopSpeaking();
                      }}
                      aria-label="Stop voice"
                    >
                      <AppIcon name="StopRounded" fallback={StopRoundedIcon} fontSize="small" />
                    </IconButton>
                  )}
                  {voice.voiceError && (
                    <Typography
                      variant="caption"
                      color="warning.main"
                      sx={{ ml: 'auto', textAlign: 'right' }}
                    >
                      {voice.voiceError}
                    </Typography>
                  )}
                </Box>
              )}
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                {voice.isSupported && (
                  <Tooltip title={voice.micState === 'recording' ? 'Stop' : 'Speak'}>
                    <span>
                      <IconButton
                        color={voice.micState === 'recording' ? 'error' : 'primary'}
                        onClick={handleMic}
                        disabled={voice.micState === 'transcribing'}
                        aria-label={
                          voice.micState === 'recording' ? 'Stop recording' : 'Start voice input'
                        }
                      >
                        {voice.micState === 'recording' ? (
                          <AppIcon name="StopRounded" fallback={StopRoundedIcon} />
                        ) : (
                          <AppIcon name="MicRounded" fallback={MicRoundedIcon} />
                        )}
                      </IconButton>
                    </span>
                  </Tooltip>
                )}
                <TextField
                  fullWidth
                  size="small"
                  placeholder="Ask me anything, or answer above..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 3 } }}
                />
                {!!config?.voice && (
                  <Tooltip title={muted ? 'Unmute voice' : 'Mute voice'}>
                    <IconButton
                      onClick={() => setMuted((m) => !m)}
                      aria-label={muted ? 'Unmute voice' : 'Mute voice'}
                    >
                      {muted ? (
                        <AppIcon name="VolumeOffRounded" fallback={VolumeOffRoundedIcon} />
                      ) : (
                        <AppIcon name="VolumeUpRounded" fallback={VolumeUpRoundedIcon} />
                      )}
                    </IconButton>
                  </Tooltip>
                )}
                <IconButton
                  color="primary"
                  onClick={() => handleSend()}
                  disabled={!input.trim() || sending}
                  aria-label="Send"
                >
                  <AppIcon name="SendRounded" fallback={SendRoundedIcon} />
                </IconButton>
              </Box>
            </Box>
          </>
        )}
      </Dialog>
      {/* Outside the setup Dialog on purpose: switching closes that one, and
          every host keeps this component mounted with `open` toggled, so the
          introduction survives the close. */}
      <AssistantWelcomeDialog
        open={Boolean(welcomeFor)}
        assistant={welcomeFor}
        onClose={() => setWelcomeFor(null)}
      />
    </>
  );
}
