import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Snackbar, Alert, Button, Dialog, Typography, useTheme } from '@mui/material';
import { useNavigate, useLocation } from 'react-router-dom';
import PageTransition from './PageTransition';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import { DRAWER_WIDTH, CONTENT_PADDING, HEADER_OFFSET } from '../../utils/constants';
import { getAppMainScrollSx, APP_SHELL_ROOT_SX } from '../../utils/mobileTouchScroll';
import NotificationCenterDrawer from '../../pages/Partners/components/NotificationCenterDrawer';
import HumanTaskInbox from '../HumanTaskInbox.jsx';
import { NotificationProvider } from '../../context/NotificationContext';
import { RunningGoalProvider } from '../../context/RunningGoalContext';
import { AssistantConversationProvider } from '../../context/AssistantConversationContext';
import { useAuth } from '../../context/AuthContext';
import { usePartnerAccessOptional } from '../../context/PartnerAccessContext';
import { useVoiceControl } from '../../hooks/useVoiceControl';
import { usePartners } from '../../hooks/usePartners';
import { parseVoiceCommands } from '../../utils/voiceCommandParser';
import VoiceCommandDialog from '../VoiceControl/VoiceCommandDialog';
import ToolRequirementPopup from '../ToolRequirement/ToolRequirementPopup';
import { partnerService } from '../../services/partnerService';
import {
  addConversation,
  appendConversationMessage,
  createInitialChatState,
  deleteConversation,
  loadChatState,
  renameConversation,
  saveChatState,
  setActiveConversation,
} from '../../services/chatSessionService';
import {
  AI_OPERATOR_MODES,
  buildExecutionPlanFromIntent,
  executeAutonomousObjective,
  runOperatorCycle,
  runPredictiveAnalysis,
} from '../../services/operatorOrchestratorService';
import {
  executeAllSafeNotificationActions,
  executeNotificationAction,
  getActiveNotifications,
  getNotificationAnalytics,
  runDueOutcomeMeasurements,
  runNotificationMonitoringCycle,
  summarizeTopNotifications,
} from '../../services/aiNotificationActionCenterService';
import {
  buildActionSummaryReply,
  buildConversationalReply,
  buildAsyncConversationalReply,
} from '../../services/assistantConversationService';
import {
  consiliumDiscuss,
  predictAnalysis,
  generateSmartReport,
  fetchAssistantHomeSummary,
  fetchToolCatalog,
  assistantChatApi,
} from '../../services/assistantChatApiService';
import { copilotChat, resolveCopilotAction } from '../../services/copilotChatApiService';
import { computePageContext } from '../../utils/pageContext';
import { bulkUploadFiles } from '../../services/assistantIngestService';
import { OnboardingProvider } from '../Onboarding/OnboardingProvider';
import SetupOnboardingGate from '../Onboarding/SetupOnboardingGate';
import QuickActionDialogs from '../Onboarding/QuickActionDialogs';
import ModeRouteGuard from './ModeRouteGuard';
import { useSimpleMode } from '../../hooks/useSimpleMode';
import { useEnabledFeatures } from '../../hooks/useEnabledFeatures';
import { subscribeVoiceCommandOpen } from '../../hooks/useVoiceCommand';
import SimpleDock from './SimpleDock';
import AxwisePulseBar from './AxwisePulseBar';
import SimpleContentFrame from './SimpleContentFrame';
import { supabase } from '../../lib/supabase';

const addDays = (days = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
};

const DEFAULT_VOICE_SETTINGS = {
  enabled: true,
  muted: true,
  language: 'en-US',
  rate: 1,
  pitch: 1,
  tone: 'professional',
  ttsProvider: 'elevenlabs', // 'elevenlabs' | 'browser'
  voiceId: '21m00Tcm4TlvDq8ikWAM', // ElevenLabs Rachel
  // UI preference: keep the TopBar clean unless explicitly enabled in Settings.
  showLetsTalkBar: false,
};
const VOICE_STOP_PHRASE_REGEX =
  /\b(ok(?:ay)? stop|stop listening|end (?:voice|session)|goodbye|bye|talk later)\b/i;
const VOICE_SETTINGS_STORAGE_KEY = 'orch_voice_settings';
const VOICE_SETTINGS_UPDATED_EVENT = 'orch_voice_settings_updated';

function ShellConversationProviders({ children }) {
  return (
    <RunningGoalProvider>
      <AssistantConversationProvider>{children}</AssistantConversationProvider>
    </RunningGoalProvider>
  );
}

export default function MainLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const [pinErrorOpen, setPinErrorOpen] = useState(false);

  useEffect(() => {
    if (location.state?.showPinError) {
      setPinErrorOpen(true);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, navigate, location.pathname]);
  const { user, getToken } = useAuth();
  const getAuthToken = useCallback(async () => {
    try {
      return (await getToken()) || null;
    } catch {
      return null;
    }
  }, [getToken]);
  const { partners } = usePartners();
  const partnerAccess = usePartnerAccessOptional();
  const { simpleMode } = useSimpleMode();
  const { isFeatureEnabled } = useEnabledFeatures();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return true;
    const stored = window.localStorage.getItem('orch_sidebar_collapsed');
    return stored === null ? true : stored === '1';
  });
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [humanTaskInboxOpen, setHumanTaskInboxOpen] = useState(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).has('humanTask');
  });
  const [humanTaskPendingCount, setHumanTaskPendingCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [toast, setToast] = useState(null);
  const [voiceCommandDialogOpen, setVoiceCommandDialogOpen] = useState(false);
  const [voiceActions, setVoiceActions] = useState([]);
  const [voiceArtifact, setVoiceArtifact] = useState(null);
  const [assistantMode, setAssistantMode] = useState('execute');
  const [homeSummary, setHomeSummary] = useState(null);
  const [homeSummaryLoading, setHomeSummaryLoading] = useState(false);
  // Dynamic banners + greeting (returned alongside legacy counts by the same endpoint).
  const [banners, setBanners] = useState(null);
  const [bannersError, setBannersError] = useState(false);
  const [greeting, setGreeting] = useState(null);
  // Full tool catalog for the View Actions catalog browser.
  const [toolCatalog, setToolCatalog] = useState(null);
  const [toolCatalogLoading, setToolCatalogLoading] = useState(false);
  const [toolCatalogError, setToolCatalogError] = useState(null);
  const [chatState, setChatState] = useState(() => createInitialChatState());
  const [aiOperatorMode, setAiOperatorMode] = useState(
    () =>
      (typeof window !== 'undefined'
        ? window.localStorage.getItem('orch_ai_operator_mode')
        : null) || AI_OPERATOR_MODES.executive
  );
  const [continuousOptimizationEnabled, setContinuousOptimizationEnabled] = useState(() =>
    typeof window !== 'undefined'
      ? window.localStorage.getItem('orch_continuous_optimization') === '1'
      : false
  );
  const normalizeVoiceSettings = useCallback(
    (candidate) => ({
      ...DEFAULT_VOICE_SETTINGS,
      ...(candidate && typeof candidate === 'object' ? candidate : {}),
    }),
    []
  );

  const [voiceSettings, setVoiceSettings] = useState(() => {
    if (typeof window === 'undefined') return DEFAULT_VOICE_SETTINGS;
    try {
      const raw = window.localStorage.getItem(VOICE_SETTINGS_STORAGE_KEY);
      if (!raw) return DEFAULT_VOICE_SETTINGS;
      const parsed = JSON.parse(raw);
      return normalizeVoiceSettings(parsed);
    } catch {
      return DEFAULT_VOICE_SETTINGS;
    }
  });
  const [voiceProcessing, setVoiceProcessing] = useState(false);
  const [isAssistantSpeaking, setIsAssistantSpeaking] = useState(false);
  const voiceProcessingRef = useRef(false);
  const browserNotifyInFlightRef = useRef(false);
  const autoVoiceSessionRef = useRef(true);
  const pendingAutoResumeRef = useRef(false);
  const chatScope = user?.uid || user?.email || 'anonymous';

  useEffect(() => {
    setChatState(loadChatState(chatScope));
  }, [chatScope]);

  useEffect(() => {
    saveChatState(chatScope, chatState);
  }, [chatScope, chatState]);

  const activeConversation =
    chatState.conversations.find((c) => c.id === chatState.activeConversationId) ||
    chatState.conversations[0];
  const activeConversationId = activeConversation?.id || '';
  const voiceChatHistory = activeConversation?.messages || [];

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('orch_sidebar_collapsed', desktopSidebarCollapsed ? '1' : '0');
  }, [desktopSidebarCollapsed]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('orch_ai_operator_mode', aiOperatorMode);
  }, [aiOperatorMode]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(
      'orch_continuous_optimization',
      continuousOptimizationEnabled ? '1' : '0'
    );
  }, [continuousOptimizationEnabled]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(VOICE_SETTINGS_STORAGE_KEY, JSON.stringify(voiceSettings));
  }, [voiceSettings]);

  // ── Poll notification_log for backend-generated in-app notifications ──
  const lastNotifCheckRef = useRef(new Date().toISOString());
  useEffect(() => {
    setNotifications([]);
    setToast(null);
    lastNotifCheckRef.current = new Date().toISOString();
    if (!user?.id || !supabase) return;
    let mounted = true;
    const poll = async () => {
      try {
        const { data } = await supabase
          .from('notification_log')
          .select('id, event_type, subject, body, metadata, created_at')
          .eq('user_id', user.id)
          .eq('channel', 'in_app')
          .gt('created_at', lastNotifCheckRef.current)
          .order('created_at', { ascending: true })
          .limit(10);
        if (!mounted || !data?.length) return;
        lastNotifCheckRef.current = data[data.length - 1].created_at;
        for (const n of data) {
          const severity = n.metadata?.priority === 'high' ? 'warning' : 'info';
          // action is a structured { type, label, target_url } object set
          // by notifyGoalEvent in _helpers.js — drives the button shown
          // on each notification card in NotificationCenterDrawer.
          const action = n.metadata?.action || null;
          setNotifications((prev) => {
            if (prev.some((p) => p.id === n.id)) return prev;
            return [
              {
                id: n.id,
                topic: n.subject,
                changes: n.body,
                time: new Date(n.created_at).toLocaleTimeString(),
                severity,
                action,
                unread: true,
              },
              ...prev.slice(0, 49),
            ];
          });
          setToast({ id: n.id, topic: n.subject, changes: n.body, severity, action });
        }
      } catch {
        /* non-critical */
      }
    };
    poll();
    const interval = setInterval(poll, 15000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [user?.id]);

  // Poll the public.human_tasks table so the TopBar badge reflects pending
  // signup tasks. 15s cadence matches the notification poll above.
  useEffect(() => {
    setHumanTaskPendingCount(0);
    if (!user?.id || !supabase) return undefined;
    let mounted = true;
    const pollHumanTasks = async () => {
      try {
        const { count } = await supabase
          .from('human_tasks')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('status', 'pending');
        if (mounted) setHumanTaskPendingCount(count || 0);
      } catch {
        /* non-critical */
      }
    };
    pollHumanTasks();
    const id = setInterval(pollHumanTasks, 15000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [user?.id]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handler = (e) => {
      const next = normalizeVoiceSettings(e?.detail);
      setVoiceSettings(next);
    };
    window.addEventListener(VOICE_SETTINGS_UPDATED_EVENT, handler);
    return () => window.removeEventListener(VOICE_SETTINGS_UPDATED_EVENT, handler);
  }, [normalizeVoiceSettings]);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        await runNotificationMonitoringCycle();
        const measured = runDueOutcomeMeasurements();
        if (measured.length > 0) {
          setToast({
            topic: 'AI Learning',
            changes: `Captured ${measured.length} outcome measurement(s) for model calibration.`,
          });
        }
      } catch {
        // Keep silent: monitoring should not break UI.
      }
    };
    tick();
    const timer = window.setInterval(
      () => {
        if (cancelled) return;
        tick();
      },
      5 * 60 * 1000
    );
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!continuousOptimizationEnabled) return undefined;
    let cancelled = false;
    const runTick = async () => {
      try {
        const [cycle, predictive, monitoring] = await Promise.all([
          runOperatorCycle({
            autoFix: false,
            trigger: 'continuous-optimization',
            preferredMode: aiOperatorMode,
          }),
          runPredictiveAnalysis(),
          runNotificationMonitoringCycle(),
        ]);
        if (
          !cancelled &&
          (cycle.issues.length > 0 ||
            predictive.riskLevel !== 'low' ||
            monitoring.generated.length > 0)
        ) {
          setToast({
            topic: `${aiOperatorMode}`,
            changes: `Continuous optimization: issues ${cycle.issues.length}, risk ${predictive.riskLevel}, notifications ${monitoring.generated.length}.`,
          });
        }
      } catch {
        // Keep silent to avoid noisy UI in continuous mode.
      }
    };
    runTick();
    const timer = window.setInterval(runTick, 3 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [aiOperatorMode, continuousOptimizationEnabled]);

  const getActionsFromText = useCallback(
    (text) => {
      const parsed = parseVoiceCommands(text || '');
      if (parsed.length > 0) {
        // Attach a conversational summary as the first item so the user sees
        // both the friendly message AND the action list.
        const summary = buildActionSummaryReply(parsed, aiOperatorMode);
        return [
          {
            id: `vc-summary-${Date.now()}`,
            type: 'assistant_reply',
            label: 'AI summary',
            message: summary,
          },
          ...parsed,
        ];
      }
      return [
        {
          id: `vc-reply-${Date.now()}`,
          type: 'assistant_reply',
          label: 'AI Operator response',
          message: buildConversationalReply({
            text,
            chatHistory: voiceChatHistory,
            mode: aiOperatorMode,
          }),
        },
      ];
    },
    [aiOperatorMode, voiceChatHistory]
  );

  const appendVoiceChat = useCallback(
    (role, message, meta = {}) => {
      const content = String(message || '').trim();
      if (!content || !activeConversationId) return;
      const payload = {
        role,
        message: content,
        time: new Date().toISOString(),
        ...meta,
      };
      // Store structured actions alongside assistant messages so the detail
      // panel can reconstruct them when the user scrolls back through history.
      if (meta.actions && Array.isArray(meta.actions) && meta.actions.length > 0) {
        payload.actions = meta.actions;
      }
      setChatState((prev) => appendConversationMessage(prev, activeConversationId, payload));
    },
    [activeConversationId]
  );

  // Restore the action panel from the last assistant message that has stored actions
  const restoreActionsFromConversation = useCallback((conv) => {
    if (!conv || !Array.isArray(conv.messages)) {
      setVoiceActions([]);
      return;
    }
    // Walk backwards to find the most recent assistant message with actions
    for (let i = conv.messages.length - 1; i >= 0; i -= 1) {
      const msg = conv.messages[i];
      if (msg?.role === 'assistant' && Array.isArray(msg.actions) && msg.actions.length > 0) {
        setVoiceActions(msg.actions);
        return;
      }
    }
    setVoiceActions([]);
  }, []);

  const handleCreateConversation = useCallback(() => {
    setChatState((prev) => addConversation(prev, 'New conversation'));
    setVoiceActions([]); // New conversation starts empty
  }, []);

  const handleSelectConversation = useCallback(
    (conversationId) => {
      setChatState((prev) => {
        const next = setActiveConversation(prev, conversationId);
        const conv = next.conversations.find((c) => c.id === conversationId);
        // Use setTimeout to restore after state update
        setTimeout(() => restoreActionsFromConversation(conv), 0);
        return next;
      });
    },
    [restoreActionsFromConversation]
  );

  const handleRenameConversation = useCallback((conversationId, title) => {
    setChatState((prev) => renameConversation(prev, conversationId, title));
  }, []);

  const handleDeleteConversation = useCallback(
    (conversationId) => {
      setChatState((prev) => {
        const next = deleteConversation(prev, conversationId);
        const activeConv = next.conversations.find((c) => c.id === next.activeConversationId);
        setTimeout(() => restoreActionsFromConversation(activeConv), 0);
        return next;
      });
    },
    [restoreActionsFromConversation]
  );

  const summarizeActionsForChat = useCallback(
    (actions) => {
      if (!Array.isArray(actions) || actions.length === 0) {
        return buildConversationalReply({
          text: '',
          chatHistory: voiceChatHistory,
          mode: aiOperatorMode,
        });
      }
      // If the first action is a conversational summary, use it directly
      const directReply = actions.find((a) => a.type === 'assistant_reply' && a.message);
      if (directReply) return directReply.message;
      // Otherwise build a summary from the action list
      return buildActionSummaryReply(actions, aiOperatorMode);
    },
    [aiOperatorMode, voiceChatHistory]
  );

  const speakText = useCallback(
    async (text) => {
      if (typeof window === 'undefined') return;
      if (!voiceSettings.enabled || voiceSettings.muted) return;

      const content = String(text || '').trim();
      if (!content) return;

      try {
        const { speak } = await import('../../services/ttsService');
        const token = await getAuthToken();
        speak({
          text: content,
          provider: voiceSettings.ttsProvider || 'elevenlabs',
          voiceId: voiceSettings.voiceId,
          token,
          voiceSettings,
          onStart: () => setIsAssistantSpeaking(true),
          onEnd: () => setIsAssistantSpeaking(false),
        });
      } catch {
        setIsAssistantSpeaking(false);
      }
    },
    [
      getAuthToken,
      voiceSettings.enabled,
      voiceSettings.language,
      voiceSettings.muted,
      voiceSettings.pitch,
      voiceSettings.rate,
      voiceSettings.ttsProvider,
      voiceSettings.voiceId,
    ]
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!voiceSettings.muted) return;
    import('../../services/ttsService').then(({ stopSpeaking }) => stopSpeaking());
    setIsAssistantSpeaking(false);
  }, [voiceSettings.muted]);

  const pushNotification = useCallback(
    async (topic, changes, options = {}) => {
      const opts = typeof options === 'string' ? { severity: options } : options || {};
      const suppressWhileVoiceCenterOpen =
        voiceCommandDialogOpen && opts?.allowDuringVoiceCenter !== true;
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
      const item = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        topic,
        changes,
        time,
        severity: opts.severity || 'info',
      };
      if (!suppressWhileVoiceCenterOpen) {
        setNotifications((prev) => [item, ...prev.slice(0, 49)]);
        setToast(item);
      }
      if (opts?.speak) speakText(`${topic}. ${changes}`);
      if (suppressWhileVoiceCenterOpen) return;

      // Browser-level push-like notifications for action updates.
      if (typeof window === 'undefined' || !('Notification' in window)) return;

      const showSystemNotification = () => {
        try {
          const n = new Notification(topic || 'AI Operator', {
            body: changes || '',
            icon: '/logo.svg',
            badge: '/logo.svg',
            tag: `orch-action-${topic || 'general'}`,
            renotify: false,
          });
          n.onclick = () => window.focus();
        } catch {
          // Browser blocked or unsupported edge-case.
        }
      };

      if (window.Notification.permission === 'granted') {
        showSystemNotification();
        return;
      }

      // Request permission lazily on first actionable notification.
      if (window.Notification.permission === 'default' && !browserNotifyInFlightRef.current) {
        browserNotifyInFlightRef.current = true;
        try {
          const permission = await window.Notification.requestPermission();
          if (permission === 'granted') showSystemNotification();
        } catch {
          // Ignore permission errors and keep in-app notifications only.
        } finally {
          browserNotifyInFlightRef.current = false;
        }
      }
    },
    [speakText, voiceCommandDialogOpen]
  );

  const onListeningEnd = useCallback(
    async (transcript) => {
      if (voiceProcessingRef.current) return;
      const text = String(transcript || '').trim();
      const normalized = text.toLowerCase();
      const isStopPhrase =
        VOICE_STOP_PHRASE_REGEX.test(normalized) ||
        ['stop', 'ok stop', 'okay stop', 'bye', 'goodbye', 'buy'].includes(normalized);
      if (isStopPhrase) {
        autoVoiceSessionRef.current = false;
        pendingAutoResumeRef.current = false;
        appendVoiceChat('user', text, { source: 'voice' });
        appendVoiceChat(
          'assistant',
          'Voice interaction stopped. You can continue by typing, or turn the microphone on again.'
        );
        pushNotification(
          'Voice',
          'Voice interaction stopped. Reopen command center or tap resume when ready.',
          { speak: true }
        );
        return;
      }

      appendVoiceChat('user', text, { source: 'voice' });
      voiceProcessingRef.current = true;
      setVoiceProcessing(true);

      const newActions = getActionsFromText(text);
      const hasRealActions = newActions.some(
        (a) => a.type !== 'assistant_reply' && a.type !== 'info'
      );

      let assistantMsg;
      if (hasRealActions) {
        // Actionable command — use existing action summary
        setVoiceActions(newActions);
        assistantMsg = summarizeActionsForChat(newActions);
      } else {
        // Conversational input — use LLM for natural reply
        const token = await getAuthToken();
        if (token) {
          try {
            const { message } = await buildAsyncConversationalReply({
              text,
              chatHistory: voiceChatHistory,
              mode: aiOperatorMode,
              personality: voiceSettings.personality || 'professional',
              token,
            });
            assistantMsg = message;
          } catch {
            assistantMsg = summarizeActionsForChat(newActions);
          }
        } else {
          assistantMsg = summarizeActionsForChat(newActions);
        }
      }

      setVoiceProcessing(false);
      voiceProcessingRef.current = false;
      appendVoiceChat('assistant', assistantMsg, {
        source: 'assistant',
        actions: hasRealActions ? newActions : [],
      });
      if (autoVoiceSessionRef.current) {
        pendingAutoResumeRef.current = true;
      }
      // Always speak the assistant response for voice input
      speakText(assistantMsg);
    },
    [
      appendVoiceChat,
      getAuthToken,
      getActionsFromText,
      speakText,
      summarizeActionsForChat,
      voiceChatHistory,
      aiOperatorMode,
      voiceSettings.personality,
    ]
  );

  const handleVoiceError = useCallback(() => {
    setVoiceCommandDialogOpen(true);
  }, []);

  const {
    state: voiceState,
    transcript: voiceTranscript,
    error: voiceError,
    isSupported: voiceIsSupported,
    startListening,
    stopListening,
    pauseListening,
    resumeListening,
    clearTranscript,
    clearError: clearVoiceError,
  } = useVoiceControl({
    onListeningEnd,
    onError: handleVoiceError,
    language: voiceSettings.language,
  });

  useEffect(() => {
    if (!voiceCommandDialogOpen) return;
    if (!autoVoiceSessionRef.current || !pendingAutoResumeRef.current) return;
    if (isAssistantSpeaking) return;
    if (voiceState !== 'idle') return;
    const timer = window.setTimeout(() => {
      if (!autoVoiceSessionRef.current || !voiceCommandDialogOpen || !voiceIsSupported) return;
      pendingAutoResumeRef.current = false;
      startListening(false, false);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [isAssistantSpeaking, voiceState, voiceCommandDialogOpen, startListening, voiceIsSupported]);

  const handleOpenVoiceCommand = useCallback(() => {
    // Unlock iOS audio context on user gesture so ElevenLabs TTS can play
    import('../../services/ttsService').then(({ unlockAudioContext }) => unlockAudioContext());
    setVoiceCommandDialogOpen(true);
    // Auto-unmute voice output when opening the voice dialog — the user
    // is explicitly engaging with voice, so they expect audio responses.
    setVoiceSettings((prev) => (prev.muted ? { ...prev, muted: false } : prev));
    autoVoiceSessionRef.current = false;
    pendingAutoResumeRef.current = false;
    runNotificationMonitoringCycle().catch(() => {});
    clearVoiceError();
    // Restore actions from the active conversation so the right panel
    // shows the last detected actions when re-opening.
    restoreActionsFromConversation(activeConversation);
    // Do not append a welcome message when history is empty: keep the initial view
    // with orb, greeting, and action banners (same as new conversation).
  }, [activeConversation, clearVoiceError, restoreActionsFromConversation]);

  const handleCloseVoiceCommand = useCallback(() => {
    setVoiceCommandDialogOpen(false);
    autoVoiceSessionRef.current = false;
    pendingAutoResumeRef.current = false;
    stopListening();
    clearVoiceError();
  }, [stopListening, clearVoiceError]);

  // Fetch live counts for the assistant home tiles whenever the dialog opens
  // and the conversation is empty (i.e. user is on the welcome screen).
  useEffect(() => {
    if (!voiceCommandDialogOpen) return;
    if (voiceChatHistory.length > 0) return;
    let cancelled = false;
    setHomeSummaryLoading(true);
    setBannersError(false);
    (async () => {
      try {
        const token = await getAuthToken();
        if (!token) return;
        const data = await fetchAssistantHomeSummary({ token });
        if (cancelled) return;
        setHomeSummary(data);
        // The same endpoint now returns dynamic banners + greeting too.
        if (Array.isArray(data?.banners)) setBanners(data.banners);
        else setBanners(null);
        if (data?.greeting) setGreeting(data.greeting);
      } catch {
        if (cancelled) return;
        setHomeSummary(null);
        setBanners(null);
        setBannersError(true);
      } finally {
        if (!cancelled) setHomeSummaryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getAuthToken, voiceCommandDialogOpen, voiceChatHistory.length]);

  // Fetch the full tool catalog on dialog open so the View Actions browser
  // can render immediately when the user taps it.
  useEffect(() => {
    if (!voiceCommandDialogOpen) return;
    if (toolCatalog || toolCatalogLoading) return;
    let cancelled = false;
    setToolCatalogLoading(true);
    setToolCatalogError(null);
    (async () => {
      try {
        const token = await getAuthToken();
        if (!token) return;
        const data = await fetchToolCatalog({ token });
        if (!cancelled) setToolCatalog(data);
      } catch (err) {
        if (!cancelled) setToolCatalogError(err?.message || 'Failed to load catalog');
      } finally {
        if (!cancelled) setToolCatalogLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getAuthToken, voiceCommandDialogOpen, toolCatalog, toolCatalogLoading]);

  // Listen for orch-open-voice-command events fired by Hero "Let's Talk" buttons
  // anywhere in the app (SimpleHome hero, future floating mic, etc).
  useEffect(() => subscribeVoiceCommandOpen(handleOpenVoiceCommand), [handleOpenVoiceCommand]);

  const findPartnerByHint = useCallback(
    (hint) => {
      const query = String(hint || '')
        .trim()
        .toLowerCase();
      if (!query) return null;
      const allPartners = Array.isArray(partners) ? partners : [];
      const getValues = (p) =>
        [
          p?.name,
          p?.id,
          p?.userId,
          p?.team,
          p?.telegramNick,
          p?.information?.name,
          p?.information?.userId,
        ]
          .filter(Boolean)
          .map((v) => String(v).trim().toLowerCase());

      const exact = allPartners.find((p) => getValues(p).some((v) => v === query));
      if (exact) return exact;
      return allPartners.find((p) => getValues(p).some((v) => v.includes(query)));
    },
    [partners]
  );

  const openPartnerMeetings = useCallback(
    (partner, options = {}) => {
      if (!partner?.id) return false;
      const state = {
        ...(options.meetingAction ? { meetingAction: options.meetingAction } : {}),
        ...(options.meetingTitle ? { meetingTitle: options.meetingTitle } : {}),
        meetingActionNonce: Date.now(),
      };
      navigate({ pathname: `/partners/${partner.id}`, hash: '#meetings' }, { state });
      return true;
    },
    [navigate]
  );

  const executeOneAction = useCallback(
    async (action) => {
      try {
        if (action.type === 'navigate') {
          navigate(action.path);
          return { ok: true };
        }
        if (action.type === 'open_human_task') {
          setHumanTaskInboxOpen(true);
          if (action.target_url) navigate(action.target_url);
          return { ok: true };
        }
        if (action.type === 'view_tool' || action.type === 'view_goal') {
          if (action.target_url) navigate(action.target_url);
          return { ok: true };
        }
        if (action.type === 'open_partner_meetings') {
          const partner = findPartnerByHint(action.partnerHint);
          if (!partner) {
            navigate('/partners');
            pushNotification(
              'Meetings',
              action.partnerHint
                ? `I could not find partner "${action.partnerHint}". Opening Partners so you can choose one.`
                : 'Opening Partners. Choose a partner to access meetings.',
              { speak: true }
            );
            return { ok: true };
          }
          openPartnerMeetings(partner);
          pushNotification('Meetings', `Opening meetings for "${partner.name || partner.id}".`, {
            speak: true,
          });
          return { ok: true };
        }
        if (action.type === 'record_meeting_for_partner') {
          const partner = findPartnerByHint(action.partnerHint);
          if (!partner) {
            navigate('/partners');
            pushNotification(
              'Record',
              action.partnerHint
                ? `I could not find partner "${action.partnerHint}". Opening Partners so you can select one.`
                : 'Opening Partners. Select a partner to start recording.',
              { speak: true }
            );
            return { ok: true };
          }
          openPartnerMeetings(partner, { meetingAction: 'record' });
          pushNotification(
            'Record',
            `Starting meeting recording flow for "${partner.name || partner.id}".`,
            { speak: true }
          );
          return { ok: true };
        }
        if (action.type === 'upload_meeting_for_partner') {
          const partner = findPartnerByHint(action.partnerHint);
          if (!partner) {
            navigate('/partners');
            pushNotification(
              'Upload',
              action.partnerHint
                ? `I could not find partner "${action.partnerHint}". Opening Partners so you can select one.`
                : 'Opening Partners. Select a partner to upload a meeting recording.',
              { speak: true }
            );
            return { ok: true };
          }
          openPartnerMeetings(partner, { meetingAction: 'upload' });
          pushNotification('Upload', `Opening upload flow for "${partner.name || partner.id}".`, {
            speak: true,
          });
          return { ok: true };
        }
        if (action.type === 'create_partner') {
          const name = (action.name || '').toString().trim();
          if (!name)
            return {
              ok: false,
              error: 'Partner name is required. Enter it in the dialog and approve again.',
            };
          const payload = {
            name,
            ...(action.group && { group: action.group }),
            ...(action.team && { team: action.team }),
            ...(action.agreement && { agreement: action.agreement }),
            ...(action.geos && action.geos.length > 0 && { geos: action.geos }),
            ...(action.telegramContact && { telegramNick: action.telegramContact }),
            ...(action.telegramGroup && { telegramGroup: action.telegramGroup }),
            ...(action.attachCampaign && {
              campaigns: [
                { id: `C-voice-${Date.now()}`, name: action.attachCampaign, status: 'Active' },
              ],
            }),
          };
          await partnerService.create(payload);
          if (typeof window !== 'undefined')
            window.dispatchEvent(new CustomEvent('orch-partners-invalidated'));
          return { ok: true };
        }
        if (action.type === 'notification_status_query') {
          const active = getActiveNotifications({ status: 'active' });
          const top = summarizeTopNotifications(3);
          const analytics = getNotificationAnalytics('monthly');
          if (action.query === 'revenue_loss') {
            pushNotification(
              'AI Recomend',
              top.length > 0
                ? `Top losses: ${top.map((t) => `${t.entity} (${Math.round(t.score)})`).join(' · ')}.`
                : `No active loss alerts above threshold. Revenue at risk ${analytics.revenueAtRisk.toLocaleString()}.`,
              { speak: true }
            );
            return { ok: true };
          }
          if (action.query === 'priority') {
            pushNotification(
              'AI Recomend',
              `${active.length} active alerts. Critical/high: ${active.filter((n) => n.priority === 'critical' || n.priority === 'high').length}.`,
              { speak: true }
            );
            return { ok: true };
          }
          if (action.query === 'partner_performance') {
            const partnerAlerts = active.filter((n) =>
              String(n.trigger?.type || '').startsWith('partner_')
            );
            pushNotification(
              'Partners',
              `${partnerAlerts.length} partner performance alert(s) currently active.`,
              { speak: true }
            );
            return { ok: true };
          }
          if (action.query === 'kpi_targets') {
            const kpiAlerts = active.filter((n) =>
              String(n.trigger?.type || '').startsWith('kpi_')
            );
            pushNotification(
              'KPI',
              `${kpiAlerts.length} KPI risk alert(s). Revenue at risk ${analytics.revenueAtRisk.toLocaleString()}.`,
              { speak: true }
            );
            return { ok: true };
          }
          return { ok: true };
        }
        if (action.type === 'notification_analysis') {
          const top = summarizeTopNotifications(1)[0];
          if (!top) {
            pushNotification('AI Analysis', 'No active notification to analyze right now.', {
              speak: true,
            });
            return { ok: true };
          }
          const active = getActiveNotifications({ status: 'active' });
          const selected = active.find((n) => n.id === top.id);
          if (!selected) return { ok: true };
          const summary = selected.aiAnalysis?.situationSummary || 'No summary available.';
          const impact30d = Number(
            selected.financialImpact?.projectedMonthly || 0
          ).toLocaleString();
          pushNotification(
            'AI Analysis',
            `${summary} If no action, 30-day impact is about ${impact30d}.`,
            { speak: true }
          );
          return { ok: true };
        }
        if (action.type === 'notification_fix_all_safe') {
          const results = await executeAllSafeNotificationActions({
            method: 'voice',
            userId: 'ai-operator',
          });
          pushNotification(
            'AI Recomend',
            results.length > 0
              ? `Executed ${results.length} safe fix(es).`
              : 'No safe actions met auto-fix policy right now.',
            { speak: true }
          );
          return { ok: true };
        }
        if (action.type === 'notification_execute') {
          const active = getActiveNotifications({ status: 'active' });
          const matchByType = active.find((n) =>
            (n.actionOptions || []).some((opt) => opt.type === action.actionType)
          );
          const matchByEntity = active.find((n) =>
            String(n.trigger?.entity || '')
              .toLowerCase()
              .includes(String(action.entity || '').toLowerCase())
          );
          const match = matchByType || matchByEntity;
          if (!match) {
            pushNotification('AI Recomend', 'No matching alert/action found to execute.', {
              speak: true,
            });
            return { ok: true };
          }
          const selectedAction =
            (match.actionOptions || []).find((opt) => opt.type === action.actionType) ||
            match.actionOptions?.[0];
          if (!selectedAction) return { ok: false, error: 'No executable action option found.' };
          const result = await executeNotificationAction({
            notificationId: match.id,
            actionId: selectedAction.id,
            method: 'voice',
            userId: 'ai-operator',
            userModifications: action.assignee
              ? { assignee: action.assignee, taskId: action.taskId }
              : {},
          });
          pushNotification('AI Recomend', result.summary, { speak: true });
          return { ok: true };
        }
        if (action.type === 'create_task') {
          // Try to assign to a partner; if none specified, use the first available
          let partnerId = action.partnerId;
          if (!partnerId) {
            const allPartners = partners || [];
            if (allPartners.length > 0) {
              partnerId = allPartners[0].id;
            } else {
              pushNotification(
                'Task',
                `Task planned: "${action.title || 'New task'}". Create a partner first, then I can attach it.`,
                { speak: true }
              );
              return { ok: true };
            }
          }
          const partner = await partnerService.getById(partnerId);
          if (!partner) {
            pushNotification(
              'Task',
              `Task planned: "${action.title || 'New task'}". The target partner was not found.`,
              { speak: true }
            );
            return { ok: true };
          }
          const tasks = Array.isArray(partner.tasks) ? partner.tasks : [];
          const taskId = `T-${partner.id}-voice-${Date.now()}`;
          const newTask = {
            id: taskId,
            taskId,
            title: (action.title || '').trim() || 'New Task',
            status: 'todo',
            priority: 'medium',
            assignedTo: 'AI Operator',
            estimate: '',
            description: (action.description || '').trim() || 'Created via AI chat.',
            deadline: addDays(7),
          };
          await partnerService.updateTasks(partner.id, [...tasks, newTask]);
          pushNotification(
            'Task',
            `Task "${newTask.title}" created and assigned to partner "${partner.name || partnerId}".`,
            { speak: true }
          );
          return { ok: true };
        }
        // ── Create workflow ─────────────────────────────────────────────
        if (action.type === 'create_workflow') {
          pushNotification(
            'Workflow',
            `Workflow "${action.name || 'New Workflow'}" creation initiated. Navigate to Workflows to configure it.`,
            { speak: true }
          );
          navigate('/workflow');
          return { ok: true };
        }
        // ── Assign partner to project ───────────────────────────────────
        if (action.type === 'assign_partner_to_project') {
          pushNotification(
            'Assignment',
            `Assignment noted: partner "${action.partnerHint}" → project "${action.projectHint}". Opening partners page to complete.`,
            { speak: true }
          );
          navigate('/partners');
          return { ok: true };
        }
        // ── Link workflow to project ────────────────────────────────────
        if (action.type === 'link_workflow_to_project') {
          pushNotification(
            'Link',
            `Link noted: workflow "${action.workflowHint}" → project "${action.projectHint}". Opening workflow page.`,
            { speak: true }
          );
          navigate('/workflow');
          return { ok: true };
        }
        // ── Show summary ────────────────────────────────────────────────
        if (action.type === 'show_summary') {
          const partnerCount = (partners || []).length;
          const predictive = await runPredictiveAnalysis();
          pushNotification(
            'Summary',
            `Platform: ${partnerCount} partners, ${predictive.forecast.overloadedWorkflows.length} workflow issues, risk level: ${predictive.riskLevel}.`,
            { speak: true }
          );
          return { ok: true };
        }
        // ── Count entities ──────────────────────────────────────────────
        if (action.type === 'count_entities') {
          const entity = action.entity || 'partner';
          if (entity === 'partner') {
            pushNotification(
              'Count',
              `You have ${(partners || []).length} partner(s) in the platform.`,
              { speak: true }
            );
          } else {
            pushNotification(
              'Count',
              `To see all ${entity}s, I'll navigate you to the right page.`,
              { speak: true }
            );
          }
          return { ok: true };
        }
        // ── Update entity ───────────────────────────────────────────────
        if (action.type === 'update_entity') {
          pushNotification(
            'Update',
            `Update request noted: "${action.target}". I'll navigate you to the relevant section.`,
            { speak: true }
          );
          return { ok: true };
        }
        // ── Delete entity ───────────────────────────────────────────────
        if (action.type === 'delete_entity') {
          if (action.requiresConfirmation) {
            const approved = window.confirm(`Confirm: ${action.label}`);
            if (!approved) return { ok: false, error: 'Cancelled by user.' };
          }
          pushNotification(
            'Delete',
            `Delete/archive request noted: "${action.target}". Please confirm on the detail page.`,
            { speak: true }
          );
          return { ok: true };
        }
        // ── Status query ────────────────────────────────────────────────
        if (action.type === 'status_query') {
          const predictive = await runPredictiveAnalysis();
          pushNotification(
            'Status',
            `System status: risk level ${predictive.riskLevel}, ${predictive.forecast.overloadedWorkflows.length} workflow(s) flagged, ${predictive.forecast.underperformingPartners.length} partner(s) underperforming.`,
            { speak: true }
          );
          return { ok: true };
        }
        // ── Schedule meeting ────────────────────────────────────────────
        if (action.type === 'schedule_meeting') {
          const partner = findPartnerByHint(action.partnerHint);
          if (!partner) {
            navigate('/partners');
            pushNotification(
              'Schedule',
              action.partnerHint
                ? `I could not find partner "${action.partnerHint}". Opening Partners so you can select one for planning.`
                : `Meeting "${action.name}" noted. Opening Partners so you can choose who to schedule with.`,
              { speak: true }
            );
            return { ok: true };
          }
          openPartnerMeetings(partner, { meetingAction: 'plan', meetingTitle: action.name });
          pushNotification(
            'Schedule',
            `Opening planning for "${action.name}" with "${partner.name || partner.id}".`,
            { speak: true }
          );
          return { ok: true };
        }
        // ── Set deadline ────────────────────────────────────────────────
        if (action.type === 'set_deadline') {
          pushNotification(
            'Deadline',
            `Deadline request noted: "${action.target}". Navigate to the task to set the date.`,
            { speak: true }
          );
          return { ok: true };
        }
        // ── Confirm yes/no (contextual) ─────────────────────────────────
        if (action.type === 'confirm_yes') {
          pushNotification('Confirmed', 'Got it, proceeding with the pending action.', {
            speak: true,
          });
          return { ok: true };
        }
        if (action.type === 'confirm_no') {
          pushNotification(
            'Cancelled',
            "Action cancelled. Tell me what you'd like to do instead.",
            { speak: true }
          );
          return { ok: true };
        }
        if (action.type === 'generate_report') {
          const params = new URLSearchParams({
            template: action.templateId || 'tpl-finance-growth',
          });
          if (action.filters) {
            Object.entries(action.filters).forEach(([k, v]) => {
              if (v) params.set(k, v);
            });
          }
          pushNotification(
            'Reports',
            `Building your ${action.templateName || 'Finance & Growth'} report. Navigating now.`,
            { speak: true }
          );
          navigate(`/reports?${params.toString()}`);
          return { ok: true };
        }
        if (action.type === 'export_report') {
          pushNotification(
            'Voice',
            'Export report is available from each Partner detail page or the Reports page.',
            { speak: true }
          );
          navigate('/reports');
          return { ok: true };
        }
        if (action.type === 'ai_operator_cycle') {
          const result = await executeAutonomousObjective({
            objective: action.label || 'AI operator cycle',
            actions: [action],
            autoFix: action.autoFix !== false,
            preferredMode: aiOperatorMode,
            trigger: 'ask-anything',
          });
          pushNotification(
            result.mode || aiOperatorMode,
            `Checked P:${result.checked.partners} / Pr:${result.checked.projects} / W:${result.checked.workflows} · Issues:${result.cycle.issues.length} · Fixes:${result.cycle.fixes.length}`,
            { speak: true }
          );
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('orch-partners-invalidated'));
          }
          return { ok: true };
        }
        if (action.type === 'switch_ai_mode') {
          setAiOperatorMode(action.mode || AI_OPERATOR_MODES.executive);
          pushNotification(
            'AI Mode',
            `Operator mode switched to ${action.mode || AI_OPERATOR_MODES.executive}.`,
            { speak: true }
          );
          return { ok: true };
        }
        if (action.type === 'toggle_continuous_optimization') {
          const enabled = action.enabled !== false;
          setContinuousOptimizationEnabled(enabled);
          pushNotification(
            'Continuous Optimization',
            enabled ? 'Enabled. AI will monitor and optimize continuously.' : 'Disabled.',
            { speak: true }
          );
          return { ok: true };
        }
        if (action.type === 'show_bottlenecks') {
          const predictive = await runPredictiveAnalysis();
          const overloadCount = predictive.forecast.overloadedWorkflows.length;
          const underperformingCount = predictive.forecast.underperformingPartners.length;
          pushNotification(
            predictive.mode,
            `Bottlenecks: overloaded workflows ${overloadCount}, underperforming partners ${underperformingCount}, risk ${predictive.riskLevel}.`,
            { speak: true }
          );
          return { ok: true };
        }
        if (
          action.type === 'optimize_partner_routing' ||
          action.type === 'fix_broken_workflows' ||
          action.type === 'create_project'
        ) {
          if (action.requiresConfirmation) {
            const approved = window.confirm(`Confirm action: ${action.label}`);
            if (!approved) return { ok: false, error: 'Cancelled by user.' };
          }
          const result = await executeAutonomousObjective({
            objective: action.label || action.type,
            actions: [action],
            autoFix: true,
            preferredMode: aiOperatorMode,
            trigger: `ask-anything:${action.type}`,
          });
          pushNotification(
            result.mode || aiOperatorMode,
            result.outcomes[0] || result.warnings[0] || 'Autonomous objective completed.',
            { speak: true }
          );
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('orch-partners-invalidated'));
          }
          return { ok: true };
        }
        // ── Consilium board discussion ──────────────────────────────────
        if (action.type === 'consilium_discuss') {
          const token = await getAuthToken();
          if (!token) {
            pushNotification('Consilium', 'Authentication required for board discussions.', {
              speak: true,
            });
            return { ok: true };
          }
          pushNotification('Consilium', 'Consulting the board... This may take a moment.', {
            speak: true,
          });
          try {
            const result = await consiliumDiscuss({ topic: action.topic, token });
            if (result.discussion?.length > 0) {
              setVoiceArtifact({
                type: 'consilium-discussion',
                title: `Board: ${action.topic?.slice(0, 40)}`,
                data: result,
              });
              pushNotification(
                'Consilium',
                `Board discussion complete. ${result.consensus?.memberCount || 0} members responded. Consensus: ${result.consensus?.dominantPosition || 'N/A'} (${result.consensus?.averageConfidence || 0}/10).`,
                { speak: true }
              );
            } else {
              pushNotification('Consilium', result.message || 'No board members available.', {
                speak: true,
              });
            }
          } catch (err) {
            pushNotification('Consilium', `Board discussion failed: ${err.message}`, {
              speak: true,
            });
          }
          return { ok: true };
        }
        // ── Predictive analysis ─────────────────────────────────────────
        if (action.type === 'predict') {
          const token = await getAuthToken();
          if (!token) {
            pushNotification('Predict', 'Authentication required for predictions.', {
              speak: true,
            });
            return { ok: true };
          }
          pushNotification('Predict', 'Running predictive analysis...', { speak: true });
          try {
            const result = await predictAnalysis({
              scope: action.scope || 'all',
              context: action.context,
              token,
            });
            setVoiceArtifact({
              type: 'prediction',
              title: `Predictions: ${action.scope || 'all'}`,
              data: result,
              cost: result.cost,
              model: result.model,
            });
            const highRisk = (result.predictions || []).filter((p) => p.risk === 'high');
            pushNotification(
              'Predict',
              `Analysis complete. Risk level: ${result.riskLevel || 'unknown'}. ${highRisk.length} high-risk item(s) found.`,
              { speak: true }
            );
          } catch (err) {
            pushNotification('Predict', `Prediction failed: ${err.message}`, { speak: true });
          }
          return { ok: true };
        }
        return { ok: false, error: 'Unknown action type.' };
      } catch (err) {
        return { ok: false, error: err.message || 'Action failed.' };
      }
    },
    [
      aiOperatorMode,
      findPartnerByHint,
      getAuthToken,
      navigate,
      openPartnerMeetings,
      partners,
      pushNotification,
    ]
  );

  const handleApproveAll = useCallback(
    async (actionsToRun) => {
      let successCount = 0;
      const errors = [];
      for (const a of actionsToRun) {
        const res = await executeOneAction(a);
        if (res.ok) successCount++;
        else errors.push({ actionId: a.id, message: res.error });
      }
      pushNotification(
        'AI Operator',
        errors.length > 0
          ? `Executed ${successCount}/${actionsToRun.length} action(s) with ${errors.length} issue(s).`
          : `Executed ${successCount}/${actionsToRun.length} action(s) successfully.`,
        { speak: true }
      );
      return { successCount, total: actionsToRun.length, errors };
    },
    [executeOneAction, pushNotification]
  );

  const handleApproveOne = useCallback(
    async (action) => {
      return executeOneAction(action);
    },
    [executeOneAction]
  );

  // Inline chat blocks: map block { type, entityId, deepLink, route } → route nav.
  const handleOpenEntity = useCallback(
    (payload) => {
      if (!payload) return;
      const { type, entityId, deepLink, route } = payload;
      // Honor explicit deep links / show-all routes verbatim.
      if (route) {
        setVoiceCommandDialogOpen(false);
        navigate(route);
        return;
      }
      if (deepLink && typeof deepLink === 'string' && deepLink.startsWith('/')) {
        setVoiceCommandDialogOpen(false);
        navigate(deepLink);
        return;
      }
      const ROUTES = {
        goal: (id) => (id ? `/goals/${id}` : '/dashboard'),
        task: (id) => (id ? `/task-manager?taskId=${encodeURIComponent(id)}` : '/task-manager'),
        workflow: (id) => (id ? `/workflow?id=${encodeURIComponent(id)}` : '/workflow'),
        report: (id) => (id ? `/reports?id=${encodeURIComponent(id)}` : '/reports'),
        project: (id) => (id ? `/projects?id=${encodeURIComponent(id)}` : '/projects'),
        'kb-doc': (id) => (id ? `/knowledge-base?id=${encodeURIComponent(id)}` : '/knowledge-base'),
        dashboard: (id) => (id ? `/dashboards/${id}` : '/dashboards'),
        organization: (id) =>
          id ? `/organizations?id=${encodeURIComponent(id)}` : '/organizations',
        agent: (id) => (id ? `/agent-hub?agentId=${encodeURIComponent(id)}` : '/agent-hub'),
        request: (id) => (id ? `/job-pool?requestId=${encodeURIComponent(id)}` : '/job-pool'),
        tool: (id) => (id ? `/tools?toolId=${encodeURIComponent(id)}` : '/tools'),
        'marketplace-listing': (id) =>
          id ? `/marketplace/browse?id=${encodeURIComponent(id)}` : '/marketplace',
        'communicator-thread': (id) =>
          id ? `/communicator?threadId=${encodeURIComponent(id)}` : '/communicator',
        partner: (id) => (id ? `/partners/${id}` : '/partners'),
        pulse: () => '/pulses',
        loop: (id) => (id ? `/goals/${id}` : '/dashboard'),
        consilium: () => '/consilium',
        'concilium-decision': () => '/consilium',
      };
      const fn = ROUTES[type];
      const path = fn ? fn(entityId) : null;
      if (path) {
        setVoiceCommandDialogOpen(false);
        navigate(path);
      }
    },
    [navigate]
  );

  const handleConfirmAction = useCallback(
    async (proposal) => {
      const token = await getAuthToken();
      if (!token || !proposal?.pendingCallId) {
        return { status: 'error', error: 'This action is no longer available.' };
      }
      try {
        const res = await resolveCopilotAction({
          token,
          pendingCallId: proposal.pendingCallId,
          decision: 'approve',
        });
        if (res?.status === 'approved' && Array.isArray(res.blocks) && res.blocks.length > 0) {
          appendVoiceChat('assistant', `Done: ${proposal.summary || proposal.tool}`, {
            source: 'system',
            blocks: res.blocks,
          });
        }
        return res;
      } catch (e) {
        return { status: 'error', error: e?.message || 'Could not complete the action.' };
      }
    },
    [appendVoiceChat, getAuthToken]
  );

  const handleCopilotModelChange = useCallback(({ provider, model }) => {
    setVoiceSettings((prev) => ({ ...prev, provider, model }));
  }, []);

  const handleVoiceTextSubmit = useCallback(
    async (text, opts = {}) => {
      const content = String(text || '').trim();
      if (!content) return;
      appendVoiceChat('user', content, { source: 'text' });

      // ── TALK MODE ────────────────────────────────────────────────
      // Brainstorming only: no action parsing, no auto-execution.
      // Reply comes from the natural-reply LLM path (or consilium-discuss
      // if a boardId is set in voiceSettings).
      if (assistantMode === 'talk') {
        const token = await getAuthToken();
        let replyMessage = '';
        if (token) {
          try {
            const { message } = await buildAsyncConversationalReply({
              text: content,
              chatHistory: voiceChatHistory,
              mode: aiOperatorMode,
              personality: voiceSettings.personality || 'professional',
              token,
              assistantMode: 'talk',
              boardId: voiceSettings.consiliumBoardId || undefined,
            });
            replyMessage = message;
          } catch {
            replyMessage = "I'm here. Tell me what's on your mind.";
          }
        } else {
          replyMessage = "I'm here. Tell me what's on your mind.";
        }
        const replyAction = {
          id: `llm-reply-${Date.now()}`,
          type: 'assistant_reply',
          label: 'AI response',
          message: replyMessage,
        };
        setVoiceActions([replyAction]);
        appendVoiceChat('assistant', replyMessage, {
          source: 'assistant',
          actions: [replyAction],
        });
        speakText(replyMessage);
        return;
      }

      // ── EXECUTE MODE (default) — Platform Copilot ───────────────
      // Multi-turn read -> reason -> act loop. Renders the answer + inline
      // entity blocks, and any confirmation-gated mutations as ActionCards.
      {
        const token = await getAuthToken();
        if (token) {
          try {
            const history = voiceChatHistory.slice(-8).map((m) => ({
              role: m.role || 'user',
              content: m.message || m.content || '',
            }));
            // Upload any attached files into the knowledge base first, then
            // reference them by document id so the copilot can read them.
            let attachmentRefs;
            if (Array.isArray(opts.attachmentFiles) && opts.attachmentFiles.length > 0) {
              try {
                const up = await bulkUploadFiles(opts.attachmentFiles);
                attachmentRefs = (up?.docs || [])
                  .map((d) => ({ documentId: d.id || d.documentId || d.document_id }))
                  .filter((r) => r.documentId);
              } catch {
                // Upload failed — proceed without attachments.
              }
            }
            const result = await copilotChat({
              token,
              message: content,
              history,
              personality: voiceSettings.personality || 'professional',
              provider: voiceSettings.provider || undefined,
              model: voiceSettings.model || undefined,
              pageContext: computePageContext(location),
              attachments: attachmentRefs,
            });
            const replyMessage = result?.message || '';
            if (result?.capExceeded) {
              setVoiceActions([]);
              appendVoiceChat('assistant', replyMessage, { source: 'assistant' });
              speakText(replyMessage);
              return;
            }
            const pendingCalls = Array.isArray(result?.proposedActions)
              ? result.proposedActions.map((p, i) => ({
                  ...p,
                  id: p.pendingCallId || `pc-${Date.now()}-${i}`,
                }))
              : [];
            const replyAction = {
              id: `llm-reply-${Date.now()}`,
              type: 'assistant_reply',
              label: 'AI response',
              message: replyMessage,
            };
            setVoiceActions([replyAction]);
            appendVoiceChat('assistant', replyMessage || 'Done.', {
              source: 'assistant',
              actions: [replyAction],
              ...(Array.isArray(result?.blocks) && result.blocks.length > 0
                ? { blocks: result.blocks }
                : {}),
              ...(pendingCalls.length > 0 ? { pendingCalls } : {}),
            });
            speakText(replyMessage);
            return;
          } catch {
            // Copilot failed — fall through to the legacy regex + chat path below.
          }
        }
      }

      // ── LEGACY FALLBACK ─────────────────────────────────────────
      // Step 1: Try regex parser first (fast, local)
      let newActions = getActionsFromText(content);
      const hasRealActions = newActions.some(
        (a) => a.type !== 'assistant_reply' && a.type !== 'info'
      );

      // Step 2: If no real actions found, go through the LLM function-calling
      // endpoint with execute=true so it can run safe tool calls server-side
      // and return inline entity blocks for rich chat rendering.
      let serverBlocks = null;
      if (!hasRealActions) {
        const token = await getAuthToken();
        if (token) {
          try {
            const history = voiceChatHistory.slice(-6).map((m) => ({
              role: m.role || 'user',
              content: m.message || m.content || '',
            }));
            const result = await assistantChatApi({
              action: 'chat',
              message: content,
              personality: voiceSettings.personality || 'professional',
              history,
              execute: true,
              token,
            });
            const replyMessage = result?.message || '';
            if (Array.isArray(result?.blocks) && result.blocks.length > 0) {
              serverBlocks = result.blocks;
            }
            newActions = [
              {
                id: `llm-reply-${Date.now()}`,
                type: 'assistant_reply',
                label: 'AI response',
                message: replyMessage || '',
              },
            ];
          } catch {
            // LLM/chat failed — fall back to the simpler natural-reply path.
            try {
              const token2 = await getAuthToken();
              const { message } = await buildAsyncConversationalReply({
                text: content,
                chatHistory: voiceChatHistory,
                mode: aiOperatorMode,
                personality: voiceSettings.personality || 'professional',
                token: token2,
              });
              newActions = [
                {
                  id: `llm-reply-${Date.now()}`,
                  type: 'assistant_reply',
                  label: 'AI response',
                  message,
                },
              ];
            } catch {
              // Template fallback already in newActions.
            }
          }
        }
      }

      setVoiceActions(newActions);
      const assistantMessage = summarizeActionsForChat(newActions);
      appendVoiceChat('assistant', assistantMessage, {
        source: 'assistant',
        actions: newActions,
        ...(serverBlocks ? { blocks: serverBlocks } : {}),
      });

      // Speak the assistant response aloud
      speakText(assistantMessage);

      // Auto-execute safe (non-confirmation-required) actions immediately
      const executableActions = newActions.filter(
        (a) => a.type !== 'assistant_reply' && a.type !== 'info' && !a.requiresConfirmation
      );
      if (executableActions.length > 0) {
        for (const action of executableActions) {
          const res = await executeOneAction(action);
          if (res.ok) {
            appendVoiceChat('assistant', `Done: ${action.label}`, { source: 'system' });
          } else if (res.error) {
            appendVoiceChat('assistant', `Issue with "${action.label}": ${res.error}`, {
              source: 'system',
            });
          }
        }
      }
    },
    [
      appendVoiceChat,
      executeOneAction,
      getAuthToken,
      getActionsFromText,
      speakText,
      summarizeActionsForChat,
      voiceChatHistory,
      aiOperatorMode,
      voiceSettings.personality,
      voiceSettings.consiliumBoardId,
      voiceSettings.provider,
      voiceSettings.model,
      location,
      assistantMode,
    ]
  );

  const handleVoiceMicToggle = useCallback(() => {
    if (!voiceIsSupported) return;
    if (voiceState === 'listening') {
      autoVoiceSessionRef.current = false;
      pendingAutoResumeRef.current = false;
      stopListening();
      return;
    }
    if (voiceState === 'paused') {
      autoVoiceSessionRef.current = true;
      pendingAutoResumeRef.current = false;
      resumeListening();
      return;
    }
    autoVoiceSessionRef.current = true;
    pendingAutoResumeRef.current = false;
    clearTranscript();
    startListening(false, false);
  }, [
    voiceIsSupported,
    voiceState,
    stopListening,
    resumeListening,
    clearTranscript,
    startListening,
  ]);

  const notificationValue = {
    notifications,
    openNotificationCenter: () => setNotificationOpen(true),
    closeNotificationCenter: () => setNotificationOpen(false),
    openHumanTaskInbox: () => setHumanTaskInboxOpen(true),
    closeHumanTaskInbox: () => setHumanTaskInboxOpen(false),
    humanTaskPendingCount,
    pushNotification,
  };

  // ── Simple-mode dock replaces the left sidebar for non-partner users.
  // Partner role keeps its restricted sidebar (legacy behavior preserved).
  const useSimpleDock = simpleMode && !partnerAccess?.isPartnerRole;

  return (
    <OnboardingProvider>
      <NotificationProvider value={notificationValue}>
        {/* Wraps the top bar and the page together: the page publishes the goal
            it is showing, the top bar renders its Actions menu. */}
        <ShellConversationProviders>
          <SetupOnboardingGate />
          <QuickActionDialogs />
          <Box
            className="app-shell"
            sx={{
              display: 'flex',
              minHeight: '100vh',
              bgcolor: 'background.default',
              overflow: 'hidden',
              ...APP_SHELL_ROOT_SX,
            }}
          >
            {!useSimpleDock && (
              <Sidebar
                mobileOpen={mobileMenuOpen}
                onMobileClose={() => setMobileMenuOpen(false)}
                desktopCollapsed={desktopSidebarCollapsed}
                onDesktopCollapseToggle={() => setDesktopSidebarCollapsed((c) => !c)}
              />
            )}
            <Box
              sx={{
                flex: 1,
                minWidth: 0,
                maxWidth: '100%',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <TopBar
                voiceState={voiceProcessing ? 'processing' : voiceState}
                voiceIsSupported={voiceIsSupported}
                voiceError={voiceError}
                onOpenVoiceCommand={handleOpenVoiceCommand}
                showLetsTalkBar={
                  !!voiceSettings.showLetsTalkBar && !partnerAccess?.isPartnerRole && !simpleMode
                }
                onOpenMobileMenu={() => setMobileMenuOpen(true)}
                desktopSidebarCollapsed={useSimpleDock ? true : desktopSidebarCollapsed}
                onDesktopCollapseToggle={() => setDesktopSidebarCollapsed((c) => !c)}
                hideSidebarToggle={useSimpleDock}
              />
              <Box
                component="main"
                // Which element scrolls depends on the breakpoint (see
                // getAppMainScrollSx). Anything that needs to drive the app's
                // scroll finds this pane by attribute rather than by tag.
                data-app-main=""
                sx={getAppMainScrollSx({
                  contentPadding: CONTENT_PADDING,
                  useSimpleDock,
                  headerOffset: HEADER_OFFSET,
                })}
              >
                <ModeRouteGuard>
                  <SimpleContentFrame active={useSimpleDock}>
                    <PageTransition />
                  </SimpleContentFrame>
                </ModeRouteGuard>
              </Box>
            </Box>
            {useSimpleDock && <SimpleDock />}
            <AxwisePulseBar />

            <NotificationCenterDrawer
              open={notificationOpen}
              onClose={() => setNotificationOpen(false)}
              notifications={notifications}
            />

            <HumanTaskInbox
              open={humanTaskInboxOpen}
              onClose={() => setHumanTaskInboxOpen(false)}
              userId={user?.id}
            />

            <Snackbar
              open={Boolean(toast)}
              autoHideDuration={toast?.action ? 6000 : 2600}
              onClose={() => setToast(null)}
              anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
              sx={{ mt: 7 }}
            >
              <Alert
                onClose={() => setToast(null)}
                severity={toast?.severity || 'info'}
                variant="filled"
                sx={{ width: '100%' }}
                action={
                  toast?.action?.target_url ? (
                    <Button
                      size="small"
                      color="inherit"
                      href={toast.action.target_url}
                      onClick={() => setToast(null)}
                      sx={{ fontWeight: 700 }}
                    >
                      {toast.action.label || 'Open'}
                    </Button>
                  ) : undefined
                }
              >
                {toast ? `${toast.topic}: ${toast.changes}` : ''}
              </Alert>
            </Snackbar>

            <VoiceCommandDialog
              open={voiceCommandDialogOpen}
              onClose={handleCloseVoiceCommand}
              transcript={voiceTranscript}
              isRecording={voiceState === 'listening'}
              isPaused={voiceState === 'paused'}
              error={voiceError}
              isSupported={voiceIsSupported}
              onStop={() => {
                autoVoiceSessionRef.current = false;
                pendingAutoResumeRef.current = false;
                stopListening();
              }}
              onPause={() => {
                autoVoiceSessionRef.current = false;
                pendingAutoResumeRef.current = false;
                pauseListening();
              }}
              onResume={() => {
                autoVoiceSessionRef.current = true;
                pendingAutoResumeRef.current = false;
                resumeListening();
              }}
              actions={voiceActions}
              isAssistantSpeaking={isAssistantSpeaking}
              operatorMode={aiOperatorMode}
              executionPlan={buildExecutionPlanFromIntent({
                transcript: voiceTranscript || '',
                actions: voiceActions,
              })}
              partners={partners || []}
              onExecuteAction={handleApproveOne}
              onExecuteAll={handleApproveAll}
              onParseText={(text, storedActions) => {
                if (Array.isArray(storedActions) && storedActions.length > 0) {
                  setVoiceActions(storedActions);
                } else {
                  setVoiceActions(getActionsFromText(text || ''));
                }
              }}
              onSubmitText={handleVoiceTextSubmit}
              onToggleMic={handleVoiceMicToggle}
              chatHistory={voiceChatHistory}
              conversations={chatState.conversations}
              activeConversationId={activeConversationId}
              onCreateConversation={handleCreateConversation}
              onSelectConversation={handleSelectConversation}
              onRenameConversation={handleRenameConversation}
              onDeleteConversation={handleDeleteConversation}
              artifact={voiceArtifact}
              onCloseArtifact={() => setVoiceArtifact(null)}
              mode={assistantMode}
              onModeChange={setAssistantMode}
              homeSummary={homeSummary}
              homeSummaryLoading={homeSummaryLoading}
              banners={banners}
              bannersLoading={homeSummaryLoading}
              bannersError={bannersError}
              greeting={greeting}
              toolCatalog={toolCatalog}
              toolCatalogLoading={toolCatalogLoading}
              toolCatalogError={toolCatalogError}
              onOpenEntity={handleOpenEntity}
              onConfirmAction={handleConfirmAction}
              copilotProvider={voiceSettings.provider}
              copilotModel={voiceSettings.model}
              onCopilotModelChange={handleCopilotModelChange}
              notifications={notifications}
              voiceSettings={voiceSettings}
              onVoiceSettingsChange={(next) => {
                setVoiceSettings((prev) => {
                  const merged = { ...prev, ...next };
                  if (merged.tone === 'professional') {
                    merged.rate = 1;
                    merged.pitch = 1;
                  } else if (merged.tone === 'warm') {
                    merged.rate = 0.95;
                    merged.pitch = 1.12;
                  } else if (merged.tone === 'energetic') {
                    merged.rate = 1.08;
                    merged.pitch = 1.08;
                  } else if (merged.tone === 'calm') {
                    merged.rate = 0.9;
                    merged.pitch = 0.95;
                  }
                  return merged;
                });
              }}
            />

            <ToolRequirementPopup />

            {/* Delete pin error confirmation dialog */}
            <Dialog
              open={pinErrorOpen}
              onClose={() => setPinErrorOpen(false)}
              slotProps={{
                backdrop: {
                  sx: { backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' },
                },
                paper: {
                  sx: {
                    borderRadius: 4,
                    maxWidth: 360,
                    mx: 2,
                    background:
                      theme.palette.mode === 'dark'
                        ? 'rgba(30, 41, 59, 0.75)'
                        : 'rgba(255, 255, 255, 0.75)',
                    backdropFilter: 'blur(20px)',
                    border: `1px solid ${theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'}`,
                    boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
                  },
                },
              }}
            >
              <Box
                sx={{
                  p: 4,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  textAlign: 'center',
                }}
              >
                <Box
                  sx={{
                    width: 64,
                    height: 64,
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 4px 15px rgba(239, 68, 68, 0.3)',
                    mb: 3,
                    '@keyframes shakeIcon': {
                      '0%, 100%': { transform: 'translateX(0)' },
                      '20%, 60%': { transform: 'translateX(-4px)' },
                      '40%, 80%': { transform: 'translateX(4px)' },
                    },
                    animation: 'shakeIcon 0.4s ease-in-out',
                  }}
                >
                  <svg
                    width="32"
                    height="32"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="white"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </Box>
                <Typography
                  sx={{
                    fontWeight: 800,
                    fontSize: '1.25rem',
                    color: theme.palette.mode === 'dark' ? '#f8fafc' : '#0f172a',
                    mb: 1,
                    letterSpacing: '-0.02em',
                  }}
                >
                  Oops! Incorrect PIN
                </Typography>
                <Typography
                  sx={{
                    fontSize: '0.85rem',
                    color: theme.palette.mode === 'dark' ? '#94a3b8' : '#64748b',
                    mb: 3.5,
                    lineHeight: 1.5,
                  }}
                >
                  The PIN code doesn’t match. Please check it and try again.
                </Typography>
                <Button
                  fullWidth
                  variant="contained"
                  onClick={() => setPinErrorOpen(false)}
                  sx={{
                    textTransform: 'none',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    borderRadius: 2.5,
                    py: 1.2,
                    background: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
                    '&:hover': {
                      background: 'linear-gradient(135deg, #DC2626 0%, #B91C1C 100%)',
                    },
                    boxShadow: '0 4px 12px rgba(239, 68, 68, 0.2)',
                  }}
                >
                  Okay
                </Button>
              </Box>
            </Dialog>
          </Box>
        </ShellConversationProviders>
      </NotificationProvider>
    </OnboardingProvider>
  );
}
