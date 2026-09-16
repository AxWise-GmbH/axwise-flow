import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  Paper,
  MenuItem,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { AssistantComposer } from './AssistantComposer.jsx';
import { AssistantConversationMessage } from './AssistantConversationMessage.jsx';
import { AssistantPreparingStatus } from './AssistantOperationStatus.jsx';
import { useAssistantWorkflows } from './useAssistantWorkflows.js';
import { assistantWorkflowTimeline } from './assistant-workflow-timeline.js';
import { useSolutionConversation } from '../GcpWorkspace/useSolutionConversation.js';
import { useWorkflowBuildConversation } from '../GcpWorkspace/useWorkflowBuildConversation.js';
import {
  SolutionConversationTurn,
  SolutionConversationFeedback,
} from '../GcpWorkspace/SolutionConversation.jsx';
import { AssistantWorkflowNavigationGuard } from './AssistantWorkflowNavigationGuard.jsx';
import { ASSISTANT_MODE_ORDER, assistantIntentForRoute } from './assistant-modes.js';
import { THREAD_MEASURE_PX } from '../../theme/measures.js';
import { normalizeDelegatedAgents } from '../GcpWorkspace/workspaceViewModel.js';
import {
  assistantMessageText,
  buildAssistantMessageView,
  mergeAssistantActivityEvents,
} from './assistant-view-model.js';

const ASSISTANT_POLL_MAX_BACKOFF_MS = 30000;
const ASSISTANT_EVENT_RECONNECT_BASE_MS = 5000;
const ASSISTANT_EVENT_RECONNECT_MAX_MS = 30000;
const ASSISTANT_EVENT_HISTORY_PAGE_SIZE = 100;
const ASSISTANT_EVENT_HISTORY_MAX_PAGES = 100;
const ASSISTANT_USER_MESSAGE_MAX_LENGTH = 24_000;
const AGENT_LIFETIMES = new Set(['temporary', 'persistent']);
const EMPTY_ACTIVITY_EVENTS = [];
const AssistantWorkflowPanel = lazy(() =>
  import('../GcpWorkspace/SolutionDetailPage.jsx').then((module) => ({
    default: module.SolutionDetailWorkspace,
  }))
);
const AssistantBuildPanel = lazy(() =>
  import('../GcpWorkspace/WorkflowBuildPage.jsx').then((module) => ({
    default: module.WorkflowBuildWorkspace,
  }))
);

function conversationLocation(threadId, workflowId = null, buildId = null) {
  const params = new URLSearchParams();
  if (threadId) params.set('thread', threadId);
  if (threadId && workflowId) params.set('workflow', workflowId);
  else if (threadId && buildId) params.set('build', buildId);
  return `${window.location.pathname}${params.size ? `?${params}` : ''}`;
}

function agentFromResponse(response) {
  const raw = response?.agent || response?.result?.agent || response?.body?.agent || response;
  if (!raw || typeof raw !== 'object') return null;
  return normalizeDelegatedAgents({ agents: [raw] })[0] || null;
}

function validAssistantCommandLength(content) {
  return content.length <= ASSISTANT_USER_MESSAGE_MAX_LENGTH;
}

function optimisticRouteForIntent(intent) {
  if (intent === 'research') return 'AXWISE_ONE_SHOT';
  if (intent === 'goal') return 'START_GOAL';
  return 'DIRECT_ANSWER';
}

async function loadAssistantEventHistory(client, threadId) {
  if (typeof client.assistantEvents !== 'function') return null;
  let after = 0;
  let events = [];

  for (let pageNumber = 0; pageNumber < ASSISTANT_EVENT_HISTORY_MAX_PAGES; pageNumber += 1) {
    const page = await client.assistantEvents({
      threadId,
      after,
      limit: ASSISTANT_EVENT_HISTORY_PAGE_SIZE,
    });
    const pageEvents = Array.isArray(page?.events) ? page.events : [];
    events = mergeAssistantActivityEvents(events, pageEvents);
    const cursor = Math.max(
      after,
      Number(page?.cursor) || 0,
      ...pageEvents.map((event) => Number(event.sequence) || 0)
    );

    if (pageEvents.length < ASSISTANT_EVENT_HISTORY_PAGE_SIZE) {
      return { cursor, events };
    }
    // A full page must move the cursor. Suppress a stale partial history if the server
    // violates that contract instead of looping or presenting the oldest page as complete.
    if (cursor <= after) return null;
    after = cursor;
  }

  // Ten thousand lifecycle events is an intentionally generous client-side guard. If a
  // conversation ever exceeds it, do not present an incomplete history as authoritative.
  return null;
}

export function AssistantSurface({
  client,
  onOpenGoal,
  showThreadRail = true,
  routeSearch,
  initialDraft = null,
  onDraftConsumed = null,
}) {
  const theme = useTheme();
  const desktopPanel = useMediaQuery(theme.breakpoints.up('md'), { defaultMatches: true });
  const [threads, setThreads] = useState([]);
  const [threadId, setThreadId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [selectedWorkflowId, setSelectedWorkflowId] = useState(null);
  const [selectedBuildId, setSelectedBuildId] = useState(null);
  const [buildEditing, setBuildEditing] = useState(false);
  const [buildBusy, setBuildBusy] = useState(false);
  const [canvasOpen, setCanvasOpen] = useState(false);
  const [workflowContext, setWorkflowContext] = useState(null);
  const [buildContext, setBuildContext] = useState(null);
  const workflowLock = useRef(false);
  const activeThreadRef = useRef(threadId);
  const selectedWorkflowRef = useRef(selectedWorkflowId);
  const selectedBuildRef = useRef(selectedBuildId);
  activeThreadRef.current = threadId;
  selectedWorkflowRef.current = selectedWorkflowId;
  selectedBuildRef.current = selectedBuildId;
  const [composerIntent, setComposerIntent] = useState('auto');
  const [agentLifetime, setAgentLifetime] = useState('temporary');
  const [agents, setAgents] = useState([]);
  const [agentDirectoryLoaded, setAgentDirectoryLoaded] = useState(false);
  const [agentLookup, setAgentLookup] = useState({ id: '', loading: false, error: null });
  const [agentLookupRetry, setAgentLookupRetry] = useState(0);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [busy, setBusy] = useState(false);
  const [activeIntent, setActiveIntent] = useState(null);
  const [activityEvents, setActivityEvents] = useState([]);
  const [stoppingTurnId, setStoppingTurnId] = useState(null);
  const [error, setError] = useState(null);
  const [streamFallbackTurnId, setStreamFallbackTurnId] = useState(null);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const sendIntent = useRef(null);
  const submitInFlight = useRef(false);
  const cancelInFlight = useRef(null);
  const retryIntents = useRef(new Map());
  const conversationEpoch = useRef(0);
  const threadListEpoch = useRef(0);
  const issuedAtClock = useRef(0);
  const appliedInitialDraft = useRef(null);
  const appliedRouteSearch = useRef({ initialized: false, search: null });
  const conversationViewport = useRef(null);
  const conversationEnd = useRef(null);
  const latestWorkflowTurn = useRef(null);
  const composerInput = useRef(null);
  const closePanelButton = useRef(null);
  const actionError = useRef(null);
  const shouldFollowConversation = useRef(true);
  const scrollingToLatest = useRef(false);
  const assistantEventCursor = useRef(0);

  const recordActivityEvents = useCallback((events) => {
    if (!Array.isArray(events) || !events.length) return;
    setActivityEvents((current) => mergeAssistantActivityEvents(current, events));
  }, []);

  const recordTerminalMessageActivity = useCallback(
    (message) => {
      if (!message || message.role !== 'assistant') return;
      const operation = message.parts.find((part) => part.type === 'operation_status');
      if (operation && ['accepted', 'running', 'cancel_requested'].includes(operation.status)) {
        return;
      }
      const type = ['failed', 'cancelled'].includes(operation?.status)
        ? operation.status
        : 'completed';
      // A persisted terminal message is authoritative even if the optional event stream loses
      // the race to polling. The server history event will merge in when it arrives.
      recordActivityEvents([
        {
          id: `persisted-message:${message.id}:${type}`,
          turnId: message.turnId,
          sequence: 0,
          type,
        },
      ]);
    },
    [recordActivityEvents]
  );

  const hydrateActivityHistory = useCallback(
    async (targetThreadId, requestEpoch) => {
      try {
        const history = await loadAssistantEventHistory(client, targetThreadId);
        if (!history || conversationEpoch.current !== requestEpoch) return;
        recordActivityEvents(history.events);
        assistantEventCursor.current = Math.max(assistantEventCursor.current, history.cursor);
      } catch {
        // Activity is an optional projection. Transcript loading and turn adoption must stay
        // usable if this endpoint is unavailable or slow.
      }
    },
    [client, recordActivityEvents]
  );

  const loadThreads = useCallback(async () => {
    const requestEpoch = ++threadListEpoch.current;
    try {
      const response = await client.assistantThreads({ limit: 25 });
      if (threadListEpoch.current === requestEpoch) setThreads(response.threads);
    } catch (value) {
      if (threadListEpoch.current === requestEpoch) setError(value);
    }
  }, [client]);

  const loadAgents = useCallback(async () => {
    if (typeof client.agents !== 'function') {
      setAgentDirectoryLoaded(true);
      return;
    }
    try {
      const response = await client.agents({ limit: 100 });
      setAgents(normalizeDelegatedAgents(response));
    } catch {
      // Agent discovery is additive to Assistant chat. The server still validates any Agent
      // selected from a deep link through the ID-specific lookup below, while ordinary chat
      // remains usable during runtime outages.
      setAgents([]);
    } finally {
      setAgentDirectoryLoaded(true);
    }
  }, [client]);

  const openThread = useCallback(
    async (nextThreadId, workflowId = null, buildId = null) => {
      if (workflowLock.current) {
        setError(
          new Error(
            'Finish the current workflow request or save your n8n edits before changing conversations.'
          )
        );
        return;
      }
      const requestEpoch = ++conversationEpoch.current;
      sendIntent.current = null;
      submitInFlight.current = false;
      cancelInFlight.current = null;
      retryIntents.current.clear();
      issuedAtClock.current = 0;
      assistantEventCursor.current = 0;
      shouldFollowConversation.current = true;
      setShowJumpToLatest(false);
      setStreamFallbackTurnId(null);
      setActiveIntent(null);
      setActivityEvents([]);
      setStoppingTurnId(null);
      // Remove controls from the previous conversation before the next thread loads. An
      // approval must never remain actionable while its owning conversation changes.
      setThreadId(nextThreadId);
      setSelectedWorkflowId(workflowId);
      setSelectedBuildId(buildId);
      setBuildEditing(false);
      setBuildBusy(false);
      setCanvasOpen(!!workflowId || !!buildId);
      setWorkflowContext(null);
      setMessages([]);
      setDraft('');
      setComposerIntent('auto');
      setAgentLifetime('temporary');
      setSelectedAgentId('');
      setBusy(true);
      setError(null);
      window.history.replaceState(
        window.history.state,
        '',
        conversationLocation(nextThreadId, workflowId, buildId)
      );
      try {
        const response = await client.assistantThread(nextThreadId);
        if (conversationEpoch.current !== requestEpoch) return;
        setMessages(response.messages);
        void hydrateActivityHistory(nextThreadId, requestEpoch);
      } catch (value) {
        if (conversationEpoch.current === requestEpoch) setError(value);
      } finally {
        if (conversationEpoch.current === requestEpoch) setBusy(false);
      }
    },
    [client, hydrateActivityHistory]
  );

  const clearConversation = useCallback(
    ({ replaceHistory = true, refreshThreads = false } = {}) => {
      if (workflowLock.current) {
        setError(
          new Error(
            'Finish the current workflow request or save your n8n edits before starting another conversation.'
          )
        );
        return;
      }
      conversationEpoch.current += 1;
      sendIntent.current = null;
      submitInFlight.current = false;
      cancelInFlight.current = null;
      retryIntents.current.clear();
      issuedAtClock.current = 0;
      assistantEventCursor.current = 0;
      shouldFollowConversation.current = true;
      setShowJumpToLatest(false);
      setStreamFallbackTurnId(null);
      setActiveIntent(null);
      setActivityEvents([]);
      setStoppingTurnId(null);
      setThreadId(null);
      setSelectedWorkflowId(null);
      setSelectedBuildId(null);
      setBuildEditing(false);
      setBuildBusy(false);
      setCanvasOpen(false);
      setWorkflowContext(null);
      setMessages([]);
      setDraft('');
      setComposerIntent('auto');
      setAgentLifetime('temporary');
      setSelectedAgentId('');
      setBusy(false);
      setError(null);
      if (refreshThreads) loadThreads();
      if (replaceHistory) {
        window.history.replaceState(window.history.state, '', window.location.pathname);
      }
    },
    [loadThreads]
  );

  const reset = useCallback(
    () => clearConversation({ replaceHistory: true, refreshThreads: true }),
    [clearConversation]
  );

  useEffect(() => {
    window.addEventListener('orqaly:new-assistant-conversation', reset);
    return () => window.removeEventListener('orqaly:new-assistant-conversation', reset);
  }, [reset]);

  useEffect(() => {
    loadThreads();
    loadAgents();
  }, [loadAgents, loadThreads]);

  useEffect(() => {
    const effectiveSearch = routeSearch ?? window.location.search;
    if (
      appliedRouteSearch.current.initialized &&
      appliedRouteSearch.current.search === effectiveSearch
    ) {
      return;
    }
    appliedRouteSearch.current = { initialized: true, search: effectiveSearch };
    const search = new URLSearchParams(effectiveSearch);
    const requestedThread = search.get('thread');
    const requestedAgent = search.get('agent') || '';
    if (requestedThread) {
      const requestedWorkflow = search.get('workflow') || null;
      const requestedBuild = requestedWorkflow ? null : search.get('build') || null;
      if (requestedThread !== activeThreadRef.current)
        openThread(requestedThread, requestedWorkflow, requestedBuild);
      else if (
        (requestedWorkflow !== selectedWorkflowRef.current ||
          requestedBuild !== selectedBuildRef.current) &&
        !workflowLock.current
      ) {
        // A canvas-only URL change must not reset the original transcript/composer.
        setSelectedWorkflowId(requestedWorkflow);
        setSelectedBuildId(requestedBuild);
        setBuildEditing(false);
        setBuildBusy(false);
        setCanvasOpen(!!requestedWorkflow || !!requestedBuild);
        setWorkflowContext(null);
      }
    } else if (routeSearch !== undefined) {
      clearConversation({ replaceHistory: false });
      setSelectedAgentId(requestedAgent);
      if (requestedAgent) setComposerIntent('goal');
    }
  }, [clearConversation, openThread, routeSearch]);

  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      queueMicrotask(() => {
        if (mounted.current) return;
        conversationEpoch.current += 1;
        threadListEpoch.current += 1;
        submitInFlight.current = false;
        cancelInFlight.current = null;
      });
    };
  }, []);

  useEffect(() => {
    if (!error) return;
    window.requestAnimationFrame(() => actionError.current?.focus());
  }, [error]);

  const pending = useMemo(() => {
    const visible = messages.find(
      (message) =>
        message.role === 'assistant' &&
        message.parts.some(
          (part) =>
            part.type === 'operation_status' &&
            ['accepted', 'running', 'cancel_requested'].includes(part.status)
        )
    );
    if (visible) return visible;
    return messages.find(
      (message) =>
        message.role === 'user' &&
        !messages.some(
          (candidate) => candidate.role === 'assistant' && candidate.turnId === message.turnId
        )
    );
  }, [messages]);

  const conversationView = useMemo(() => buildAssistantMessageView(messages), [messages]);
  const scopedWorkflowContext =
    workflowContext?.threadId === threadId && workflowContext?.solution?.id === selectedWorkflowId
      ? workflowContext
      : null;
  const workflowConversation = useSolutionConversation({
    client,
    solution: scopedWorkflowContext?.solution || null,
    scopeKey: threadId,
    draftId: scopedWorkflowContext?.selectedDraftId,
    nativeEditing: scopedWorkflowContext?.nativeEditing || false,
    onSelectDraft: scopedWorkflowContext?.onSelectDraft,
    onDraftReady: (revisionId) => {
      scopedWorkflowContext?.refreshDraft(revisionId);
      setCanvasOpen(true);
    },
    message: draft,
    onMessageChange: setDraft,
  });
  const scopedBuildContext =
    buildContext?.threadId === threadId && buildContext?.build?.id === selectedBuildId
      ? buildContext
      : null;
  const buildConversation = useWorkflowBuildConversation({
    context: scopedBuildContext,
    scopeKey: threadId,
    message: draft,
    onMessageChange: setDraft,
  });
  const threadWorkflows = useAssistantWorkflows({
    client,
    threadId,
    messages,
    activeSolutionId: selectedWorkflowId,
    activeSnapshot: workflowConversation.snapshot,
  });
  const selectedWorkflow = threadWorkflows.workflows.find(
    (item) => selectedWorkflowId && item.solutionId === selectedWorkflowId
  );
  const selectedBuild = threadWorkflows.workflows.find(
    (item) => selectedBuildId && item.build.id === selectedBuildId
  );
  const selectedPanel = selectedWorkflow || selectedBuild;
  const panelTargetId = selectedWorkflow?.solutionId || selectedBuild?.build.id || null;
  const refreshWorkflows = threadWorkflows.refresh;
  const workflowRunIds = useMemo(
    () =>
      new Set(
        threadWorkflows.workflows.filter((item) => item.solutionId).map((item) => item.build.runId)
      ),
    [threadWorkflows.workflows]
  );
  const timeline = useMemo(
    () => assistantWorkflowTimeline(conversationView.entries, threadWorkflows.conversations),
    [conversationView.entries, threadWorkflows.conversations]
  );
  const lastTimelineEntry = timeline.at(-1);
  const latestWorkflowUpdate =
    lastTimelineEntry?.kind === 'workflow'
      ? `${lastTimelineEntry.key}:${lastTimelineEntry.turn.status}`
      : null;
  const workflowComposer = {
    ...workflowConversation,
    busy: workflowConversation.busy || busy || !!pending || !!scopedWorkflowContext?.panelBusy,
    actionDisabled:
      workflowConversation.actionDisabled ||
      busy ||
      !!pending ||
      !!scopedWorkflowContext?.panelBusy,
    send: (action, options) => {
      if (!busy && !pending && !scopedWorkflowContext?.panelBusy)
        workflowConversation.send(action, options);
    },
    chooseProposal: (...args) => {
      if (!busy && !pending && !scopedWorkflowContext?.panelBusy)
        workflowConversation.chooseProposal(...args);
    },
    continueTurn: (...args) => {
      if (!busy && !pending && !scopedWorkflowContext?.panelBusy)
        workflowConversation.continueTurn(...args);
    },
    useExistingDraft: () => {
      if (!busy && !pending && !scopedWorkflowContext?.panelBusy)
        return workflowConversation.useExistingDraft();
    },
  };
  const buildComposer = {
    ...buildConversation,
    busy: buildConversation.busy || busy || !!pending,
    actionDisabled: buildConversation.actionDisabled || busy || !!pending,
    send: () => {
      if (!busy && !pending) return buildConversation.send();
      return false;
    },
  };
  workflowLock.current =
    !!scopedWorkflowContext?.nativeEditing ||
    !!scopedWorkflowContext?.panelBusy ||
    workflowConversation.busy ||
    buildEditing ||
    buildBusy ||
    buildConversation.busy;
  useEffect(() => {
    if (!desktopPanel && canvasOpen && panelTargetId) closePanelButton.current?.focus();
  }, [desktopPanel, canvasOpen, panelTargetId]);
  const receiveWorkflowContext = useCallback(
    (value) => {
      setWorkflowContext(value ? { ...value, threadId } : null);
    },
    [threadId]
  );
  const receiveBuildContext = useCallback(
    (value) => {
      setBuildContext(value ? { ...value, threadId } : null);
    },
    [threadId]
  );
  const openWorkflow = useCallback(
    (solutionId) => {
      if (
        workflowLock.current &&
        (solutionId !== selectedWorkflowRef.current || selectedBuildRef.current)
      ) {
        setError(
          new Error(
            'Finish the current request or save your n8n edits before selecting another workflow.'
          )
        );
        return;
      }
      if (!activeThreadRef.current) return;
      if (solutionId !== selectedWorkflowRef.current) setWorkflowContext(null);
      setSelectedWorkflowId(solutionId);
      setSelectedBuildId(null);
      setBuildEditing(false);
      setBuildBusy(false);
      setCanvasOpen(!!solutionId);
      window.history.replaceState(
        window.history.state,
        '',
        conversationLocation(activeThreadRef.current, solutionId)
      );
      refreshWorkflows();
    },
    [refreshWorkflows]
  );
  const openBuild = useCallback(
    (buildId) => {
      if (
        workflowLock.current &&
        (buildId !== selectedBuildRef.current || selectedWorkflowRef.current)
      ) {
        setError(
          new Error(
            'Finish the current request or save your n8n edits before selecting another workflow.'
          )
        );
        return;
      }
      if (!activeThreadRef.current) return;
      if (buildId === selectedBuildRef.current && !selectedWorkflowRef.current) {
        // Reopening the same mounted editor is visibility-only. Clearing host
        // ownership here would unlock navigation while its edits/request remain.
        setCanvasOpen(!!buildId);
        refreshWorkflows();
        return;
      }
      setSelectedWorkflowId(null);
      setWorkflowContext(null);
      setSelectedBuildId(buildId);
      setBuildEditing(false);
      setBuildBusy(false);
      setCanvasOpen(!!buildId);
      window.history.replaceState(
        window.history.state,
        '',
        conversationLocation(activeThreadRef.current, null, buildId)
      );
      refreshWorkflows();
    },
    [refreshWorkflows]
  );
  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId) || null,
    [agents, selectedAgentId]
  );
  useEffect(() => {
    if (!selectedAgentId || selectedAgent || !agentDirectoryLoaded) return undefined;
    let current = true;
    if (typeof client.agent !== 'function') {
      setAgentLookup({
        id: selectedAgentId,
        loading: false,
        error: new Error('This deployment cannot load an Agent by ID.'),
      });
      return undefined;
    }

    setAgentLookup({ id: selectedAgentId, loading: true, error: null });
    void client
      .agent(selectedAgentId)
      .then((response) => {
        if (!current) return;
        const resolved = agentFromResponse(response);
        if (!resolved || resolved.id !== selectedAgentId) {
          throw new Error('The selected Agent was not returned by the Agent service.');
        }
        setAgents((known) => [
          ...known.filter((candidate) => candidate.id !== resolved.id),
          resolved,
        ]);
        setAgentLookup({ id: selectedAgentId, loading: false, error: null });
      })
      .catch((value) => {
        if (!current) return;
        setAgentLookup({
          id: selectedAgentId,
          loading: false,
          error: value instanceof Error ? value : new Error('The selected Agent could not load.'),
        });
      });
    return () => {
      current = false;
    };
  }, [agentDirectoryLoaded, agentLookupRetry, client, selectedAgent, selectedAgentId]);
  const selectedAgentLookupError =
    selectedAgentId && agentLookup.id === selectedAgentId ? agentLookup.error : null;
  const selectedAgentLoading = Boolean(
    selectedAgentId &&
    !selectedAgent &&
    (!selectedAgentLookupError || agentLookup.loading || !agentDirectoryLoaded)
  );
  const activityEventsByTurn = useMemo(() => {
    const byTurn = new Map();
    for (const event of activityEvents) {
      const turnEvents = byTurn.get(event.turnId);
      if (turnEvents) turnEvents.push(event);
      else byTurn.set(event.turnId, [event]);
    }
    return byTurn;
  }, [activityEvents]);

  const pendingTerminalEvent = useMemo(
    () =>
      pending
        ? (activityEventsByTurn
            .get(pending.turnId)
            ?.findLast((event) => ['completed', 'failed', 'cancelled'].includes(event.type)) ??
          null)
        : null,
    [activityEventsByTurn, pending]
  );

  useEffect(() => {
    for (const message of messages) {
      const timestamp = new Date(message.createdAt).getTime();
      if (Number.isFinite(timestamp))
        issuedAtClock.current = Math.max(issuedAtClock.current, timestamp);
    }
  }, [messages]);

  const nextIssuedAt = useCallback(() => {
    const timestamp = Math.max(Date.now(), issuedAtClock.current + 1);
    issuedAtClock.current = timestamp;
    return new Date(timestamp).toISOString();
  }, []);

  const liveGoalLinkKeys = useMemo(() => {
    const latestByRun = new Map();
    for (const message of messages) {
      message.parts.forEach((part, index) => {
        if (part.type === 'goal_link') {
          latestByRun.set(part.runId, `${message.id}:${index}`);
        }
      });
    }
    return new Set(latestByRun.values());
  }, [messages]);

  const recentTaskAgent = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const part = messages[index].parts.findLast((part) => part.type === 'delegated_agent');
      if (part) return { ...part, avatar: agents.find((agent) => agent.id === part.id)?.avatar };
    }
    return null;
  }, [messages, agents]);

  const startedGoalRequests = useMemo(() => {
    const completedTurns = new Set(
      messages
        .filter(
          (message) =>
            message.role === 'assistant' &&
            message.route === 'START_GOAL' &&
            message.parts.some((part) => part.type === 'goal_link')
        )
        .map((message) => message.turnId)
    );
    return new Set(
      messages
        .filter(
          (message) =>
            message.role === 'user' &&
            message.route === 'START_GOAL' &&
            completedTurns.has(message.turnId)
        )
        .map((message) =>
          assistantMessageText(message)
            .replace(/^start a goal:\s*/iu, '')
            .trim()
        )
        .filter(Boolean)
    );
  }, [messages]);

  useEffect(() => {
    if (
      !pending ||
      !threadId ||
      typeof client.streamAssistantEvents !== 'function' ||
      streamFallbackTurnId === pending.turnId
    ) {
      return undefined;
    }
    const controller = new AbortController();
    const requestEpoch = conversationEpoch.current;
    let disposed = false;
    let reconnectTimer;
    let emptyBatchCount = 0;

    const connect = async () => {
      try {
        const batch = await client.streamAssistantEvents(threadId, {
          after: assistantEventCursor.current,
          signal: controller.signal,
          onEvent: (event) => {
            if (!disposed && conversationEpoch.current === requestEpoch) {
              recordActivityEvents([event]);
            }
          },
        });
        if (disposed || conversationEpoch.current !== requestEpoch) return;
        recordActivityEvents(batch.events);
        assistantEventCursor.current = Math.max(assistantEventCursor.current, batch.cursor);
        if (
          batch.events.some(
            (event) =>
              event.turnId === pending.turnId &&
              ['completed', 'failed', 'cancelled'].includes(event.type)
          )
        ) {
          const response = await client.assistantThread(threadId);
          if (!disposed && conversationEpoch.current === requestEpoch) {
            setMessages(response.messages);
          }
          return;
        }
        emptyBatchCount = batch.events.length === 0 ? emptyBatchCount + 1 : 0;
        const reconnectDelay = Math.min(
          ASSISTANT_EVENT_RECONNECT_BASE_MS * 2 ** Math.min(Math.max(0, emptyBatchCount - 1), 3),
          ASSISTANT_EVENT_RECONNECT_MAX_MS
        );
        reconnectTimer = window.setTimeout(connect, reconnectDelay);
      } catch (value) {
        if (disposed || value?.name === 'AbortError') return;
        if (conversationEpoch.current === requestEpoch) {
          setStreamFallbackTurnId(pending.turnId);
        }
      }
    };
    connect();
    return () => {
      disposed = true;
      controller.abort();
      window.clearTimeout(reconnectTimer);
    };
  }, [client, pending, recordActivityEvents, streamFallbackTurnId, threadId]);

  useEffect(() => {
    // The Orqaly event stream is a projection/wakeup channel. AxWise remains pull-based, so
    // resume polling is the progress engine that advances an accepted operation to terminal.
    if (!pending || !threadId || busy || stoppingTurnId === pending.turnId) return undefined;
    let disposed = false;
    let timer;
    const requestEpoch = conversationEpoch.current;
    const baseDelay =
      pending.parts.find((part) => part.type === 'operation_status')?.retryAfterSeconds || 2;
    const schedule = (failureCount = 0) => {
      const delayMs = Math.min(
        baseDelay * 1000 * 2 ** Math.min(failureCount, 30),
        ASSISTANT_POLL_MAX_BACKOFF_MS
      );
      timer = window.setTimeout(() => resume(failureCount), delayMs);
    };
    const resume = async (failureCount) => {
      try {
        const result = await client.assistantResume(threadId, pending.turnId);
        if (disposed || conversationEpoch.current !== requestEpoch) return;
        setError(null);
        if (result.persisted) {
          const response = await client.assistantThread(threadId);
          if (!disposed && conversationEpoch.current === requestEpoch) {
            setMessages(response.messages);
            recordTerminalMessageActivity(result.message);
            void hydrateActivityHistory(threadId, requestEpoch);
          }
        } else {
          setMessages((current) => [
            ...current.filter(
              (message) => !(message.turnId === pending.turnId && message.role === 'assistant')
            ),
            result.message,
          ]);
        }
      } catch (value) {
        if (!disposed && conversationEpoch.current === requestEpoch) {
          if (conversationEpoch.current === requestEpoch) setError(value);
          schedule(failureCount + 1);
        }
      }
    };
    schedule();
    return () => {
      disposed = true;
      window.clearTimeout(timer);
    };
  }, [
    busy,
    client,
    hydrateActivityHistory,
    pending,
    recordTerminalMessageActivity,
    stoppingTurnId,
    threadId,
  ]);

  const adoptAttempt = useCallback(
    async (activeThreadId, turnId, result, requestEpoch) => {
      const persisted = await client.assistantThread(activeThreadId);
      if (conversationEpoch.current !== requestEpoch) return false;
      setThreadId(activeThreadId);
      setMessages(
        result.persisted
          ? persisted.messages
          : [
              ...persisted.messages.filter(
                (candidate) => !(candidate.turnId === turnId && candidate.role === 'assistant')
              ),
              result.message,
            ]
      );
      recordTerminalMessageActivity(result.message);
      window.history.replaceState(
        window.history.state,
        '',
        conversationLocation(
          activeThreadId,
          activeThreadId === activeThreadRef.current ? selectedWorkflowRef.current : null,
          activeThreadId === activeThreadRef.current ? selectedBuildRef.current : null
        )
      );
      void client
        .assistantThreads({ limit: 25 })
        .then((threadList) => {
          if (conversationEpoch.current === requestEpoch) setThreads(threadList.threads);
        })
        .catch(() => {});
      void hydrateActivityHistory(activeThreadId, requestEpoch);
      return true;
    },
    [client, hydrateActivityHistory, recordTerminalMessageActivity]
  );

  const submit = useCallback(
    async (message, requestedIntent = composerIntent, requestedAgentLifetime = agentLifetime) => {
      const content = message.trim();
      // A targeted workflow request must never also enter ordinary Assistant context.
      if (selectedWorkflowRef.current || selectedBuildRef.current) return;
      if (!content || busy || pending || submitInFlight.current) return;
      const typedIntent = ASSISTANT_MODE_ORDER.includes(requestedIntent) ? requestedIntent : 'auto';
      if (typedIntent === 'goal' && selectedAgentId && !selectedAgent) {
        setError(
          new Error(
            'The selected Agent is not available. Retry loading it or select another Agent.'
          )
        );
        return;
      }
      if (
        typedIntent === 'goal' &&
        selectedAgent &&
        !['active', 'draft', 'proposed'].includes(selectedAgent.status)
      ) {
        setError(
          new Error(
            `The selected Agent is ${selectedAgent.status} and cannot accept work. Resume it or select another Agent.`
          )
        );
        return;
      }
      const typedAgentLifetime =
        selectedAgent?.lifetime ||
        (AGENT_LIFETIMES.has(requestedAgentLifetime) ? requestedAgentLifetime : 'temporary');
      const typedAgentId = typedIntent === 'goal' && selectedAgentId ? selectedAgentId : undefined;
      submitInFlight.current = true;
      const requestEpoch = ++conversationEpoch.current;
      shouldFollowConversation.current = true;
      setShowJumpToLatest(false);
      setActiveIntent(typedIntent);
      setBusy(true);
      setError(null);
      const existing = sendIntent.current;
      const intent =
        existing &&
        existing.content === content &&
        existing.intent === typedIntent &&
        existing.agentLifetime === typedAgentLifetime &&
        existing.agentId === typedAgentId &&
        existing.threadId === (threadId || existing.threadId)
          ? existing
          : {
              content,
              intent: typedIntent,
              agentLifetime: typedAgentLifetime,
              agentId: typedAgentId,
              threadId: threadId || crypto.randomUUID(),
              command: {
                turnId: crypto.randomUUID(),
                issuedAt: nextIssuedAt(),
                message: content,
                intent: typedIntent,
                ...(typedIntent === 'goal' ? { agentLifetime: typedAgentLifetime } : {}),
                ...(typedAgentId ? { agentId: typedAgentId } : {}),
              },
            };
      sendIntent.current = intent;
      setDraft('');
      setMessages((current) => {
        if (current.some((candidate) => candidate.turnId === intent.command.turnId)) return current;
        return [
          ...current,
          {
            id: `optimistic:${intent.command.turnId}`,
            threadId: intent.threadId,
            turnId: intent.command.turnId,
            role: 'user',
            route: optimisticRouteForIntent(intent.intent),
            parts: [
              { type: 'text', markdown: content },
              ...(intent.intent === 'goal'
                ? [
                    {
                      type: 'delegation_request',
                      lifetime: intent.agentLifetime,
                      ...(intent.agentId ? { agentId: intent.agentId } : {}),
                    },
                  ]
                : []),
            ],
            axwiseOperationId: null,
            workflowRunId: null,
            retryOfTurnId: null,
            requestedIntent: intent.intent,
            createdAt: intent.command.issuedAt,
          },
        ];
      });
      try {
        const result = await client.assistantSend(intent.threadId, intent.command);
        if (conversationEpoch.current !== requestEpoch) return;
        const adopted = await adoptAttempt(
          intent.threadId,
          intent.command.turnId,
          result,
          requestEpoch
        );
        if (adopted && conversationEpoch.current === requestEpoch) {
          sendIntent.current = null;
          setComposerIntent((current) =>
            typedIntent === 'goal' && current === typedIntent ? 'auto' : current
          );
          if (typedIntent === 'goal') setAgentLifetime('temporary');
          if (typedIntent === 'goal') void loadAgents();
        }
      } catch (value) {
        if (conversationEpoch.current === requestEpoch) {
          setMessages((current) =>
            current.filter((candidate) => candidate.id !== `optimistic:${intent.command.turnId}`)
          );
          setDraft((current) => current || content);
          const refreshConversation =
            value?.code === 'ASSISTANT_TURN_PENDING' ||
            value?.code === 'ASSISTANT_TURN_TIMESTAMP_CONFLICT';
          if (refreshConversation) {
            sendIntent.current = null;
            try {
              const response = await client.assistantThread(intent.threadId);
              if (conversationEpoch.current === requestEpoch) setMessages(response.messages);
            } catch {
              // Preserve the typed conflict as the actionable error; normal polling/retry can
              // recover after the conversation becomes readable again.
            }
          }
          if (conversationEpoch.current === requestEpoch) setError(value);
        }
      } finally {
        if (conversationEpoch.current === requestEpoch) {
          submitInFlight.current = false;
          setActiveIntent(null);
          setBusy(false);
        }
      }
    },
    [
      adoptAttempt,
      agentLifetime,
      busy,
      client,
      composerIntent,
      nextIssuedAt,
      loadAgents,
      pending,
      selectedAgent,
      selectedAgentId,
      threadId,
    ]
  );

  useEffect(() => {
    if (!initialDraft || appliedInitialDraft.current === initialDraft.nonce) return;
    const requestedThread = new URLSearchParams(routeSearch ?? window.location.search).get(
      'thread'
    );
    const content = typeof initialDraft.text === 'string' ? initialDraft.text.trim() : '';
    const canSend =
      ASSISTANT_MODE_ORDER.includes(initialDraft.mode) &&
      !requestedThread &&
      !threadId &&
      content &&
      validAssistantCommandLength(content);
    if (canSend && busy) return;
    appliedInitialDraft.current = initialDraft.nonce;
    if (canSend) {
      setComposerIntent(initialDraft.mode);
      if (initialDraft.mode === 'goal') {
        // Home hands Agent work to the real Assistant composer for an explicit lifetime choice.
        // Never create a temporary Agent merely because no lifetime was present in route state.
        setAgentLifetime('temporary');
        setDraft(content);
      } else {
        submit(content, initialDraft.mode);
      }
    }
    onDraftConsumed?.(initialDraft.nonce);
  }, [busy, initialDraft, onDraftConsumed, routeSearch, submit, threadId]);

  const scrollToLatest = useCallback((behavior = 'smooth', focusViewport = false) => {
    const viewport = conversationViewport.current;
    const resolvedBehavior = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      ? 'auto'
      : behavior;
    if (focusViewport) viewport?.focus({ preventScroll: true });
    shouldFollowConversation.current = true;
    setShowJumpToLatest(false);
    if (typeof viewport?.scrollTo === 'function') {
      scrollingToLatest.current = true;
      viewport.scrollTo({ top: viewport.scrollHeight, behavior: resolvedBehavior });
    } else if (typeof conversationEnd.current?.scrollIntoView === 'function') {
      scrollingToLatest.current = true;
      conversationEnd.current.scrollIntoView({ block: 'end', behavior: resolvedBehavior });
    } else {
      scrollingToLatest.current = false;
    }
  }, []);

  useEffect(() => {
    if (!shouldFollowConversation.current) return;
    scrollToLatest();
  }, [activityEvents, busy, messages, scrollToLatest]);
  useEffect(() => {
    const viewport = conversationViewport.current;
    const turn = latestWorkflowTurn.current;
    if (!latestWorkflowUpdate || !shouldFollowConversation.current || !viewport || !turn) return;
    // Reveal the start of a workflow reply, not just the tail of a long answer.
    // Stable turn/status identity avoids moving the reader on idle polling.
    scrollingToLatest.current = true;
    viewport.scrollTop += turn.getBoundingClientRect().top - viewport.getBoundingClientRect().top;
    setShowJumpToLatest(false);
  }, [latestWorkflowUpdate]);

  const retry = useCallback(
    async (failedTurnId) => {
      if (!threadId || busy) return;
      const requestEpoch = ++conversationEpoch.current;
      const failedRoute = messages.find(
        (message) => message.role === 'user' && message.turnId === failedTurnId
      )?.route;
      setActiveIntent(assistantIntentForRoute(failedRoute));
      shouldFollowConversation.current = true;
      setShowJumpToLatest(false);
      setBusy(true);
      setError(null);
      const command = retryIntents.current.get(failedTurnId) || {
        turnId: crypto.randomUUID(),
        issuedAt: nextIssuedAt(),
      };
      retryIntents.current.set(failedTurnId, command);
      try {
        const result = await client.assistantRetry(threadId, failedTurnId, command);
        if (conversationEpoch.current !== requestEpoch) return;
        const adopted = await adoptAttempt(threadId, command.turnId, result, requestEpoch);
        if (adopted && conversationEpoch.current === requestEpoch) {
          retryIntents.current.delete(failedTurnId);
          window.requestAnimationFrame(() => composerInput.current?.focus());
        }
      } catch (value) {
        if (conversationEpoch.current !== requestEpoch) return;
        if (value.code === 'ASSISTANT_RETRY_ALREADY_EXISTS') {
          const response = await client.assistantThread(threadId);
          if (conversationEpoch.current === requestEpoch) {
            setMessages(response.messages);
            retryIntents.current.delete(failedTurnId);
          }
        } else {
          setError(value);
        }
      } finally {
        if (conversationEpoch.current === requestEpoch) {
          setActiveIntent(null);
          setBusy(false);
        }
      }
    },
    [adoptAttempt, busy, client, messages, nextIssuedAt, threadId]
  );

  const cancel = useCallback(
    async (turnId) => {
      if (!threadId || cancelInFlight.current || typeof client.assistantCancel !== 'function') {
        return;
      }
      const requestEpoch = conversationEpoch.current;
      cancelInFlight.current = turnId;
      setStoppingTurnId(turnId);
      setError(null);
      try {
        const result = await client.assistantCancel(threadId, turnId);
        if (conversationEpoch.current !== requestEpoch) return;
        const adopted = await adoptAttempt(threadId, turnId, result, requestEpoch);
        if (adopted && conversationEpoch.current === requestEpoch) {
          window.requestAnimationFrame(() => composerInput.current?.focus());
        }
      } catch (value) {
        if (conversationEpoch.current === requestEpoch) setError(value);
      } finally {
        if (cancelInFlight.current === turnId) cancelInFlight.current = null;
        if (conversationEpoch.current === requestEpoch) setStoppingTurnId(null);
      }
    },
    [adoptAttempt, client, threadId]
  );

  const startGoal = useCallback((request) => submit(request, 'goal', 'temporary'), [submit]);
  const pendingOperationPart = pending?.parts.find((part) => part.type === 'operation_status');
  const pendingOperationId = pending?.axwiseOperationId || pendingOperationPart?.operationId;
  const canStop = Boolean(
    pending &&
    pendingOperationId &&
    !pendingTerminalEvent &&
    typeof client.assistantCancel === 'function' &&
    !['cancel_requested', 'cancelled', 'completed', 'failed'].includes(pendingOperationPart?.status)
  );
  const pendingIntent = assistantIntentForRoute(pending?.route);
  const stopLabel = pendingIntent === 'research' ? 'Stop research' : 'Stop response';
  return (
    <Box
      sx={{
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: {
          xs: '1fr',
          md:
            selectedPanel && canvasOpen
              ? showThreadRail
                ? '180px minmax(300px,1fr) minmax(360px,1.1fr)'
                : 'minmax(300px,1fr) minmax(360px,1.1fr)'
              : showThreadRail
                ? '240px minmax(0, 1fr)'
                : 'minmax(0, 1fr)',
        },
        gridTemplateRows: 'minmax(0, 1fr)',
        gap: selectedPanel && canvasOpen ? 1 : 3,
        height: showThreadRail ? 'calc(100dvh - 150px)' : '100dvh',
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      <AssistantWorkflowNavigationGuard active={workflowLock.current} />
      {showThreadRail ? (
        <Paper
          component="aside"
          variant="outlined"
          aria-label="Assistant threads"
          sx={{
            p: 1.5,
            display: { xs: 'none', md: 'block' },
            borderRadius: 1,
            overflowY: 'auto',
          }}
        >
          <Button fullWidth variant="outlined" onClick={reset}>
            New conversation
          </Button>
          <Divider sx={{ my: 1.5 }} />
          <Stack spacing={0.5}>
            {threads.map((thread) => (
              <Button
                key={thread.id}
                color="inherit"
                variant={thread.id === threadId ? 'contained' : 'text'}
                onClick={() => openThread(thread.id)}
                sx={{ justifyContent: 'flex-start', textAlign: 'left', textTransform: 'none' }}
              >
                {thread.title}
              </Button>
            ))}
            {!threads.length ? (
              <Typography variant="caption" color="text.secondary" sx={{ p: 1 }}>
                Your conversations will appear here.
              </Typography>
            ) : null}
          </Stack>
        </Paper>
      ) : null}
      <Stack
        spacing={0}
        inert={!!selectedPanel && canvasOpen && !desktopPanel}
        aria-hidden={!!selectedPanel && canvasOpen && !desktopPanel}
        sx={{
          height: '100%',
          minHeight: 0,
          minWidth: 0,
          width: '100%',
          maxWidth: THREAD_MEASURE_PX,
          mx: 'auto',
          overflow: 'hidden',
        }}
      >
        {threadWorkflows.workflows.length ? (
          <Stack direction="row" alignItems="center" gap={1} sx={{ px: 2, py: 1, flexShrink: 0 }}>
            <TextField
              select
              size="small"
              label="Working on"
              value={
                selectedWorkflow
                  ? selectedWorkflowId
                  : selectedBuild
                    ? `build:${selectedBuildId}`
                    : ''
              }
              disabled={workflowLock.current}
              onChange={(event) =>
                event.target.value.startsWith('build:')
                  ? openBuild(event.target.value.slice(6))
                  : openWorkflow(event.target.value || null)
              }
              sx={{ flex: 1, minWidth: 0 }}
            >
              <MenuItem value="">Task conversation</MenuItem>
              {threadWorkflows.workflows.map((item) => (
                <MenuItem
                  key={item.build.id}
                  value={
                    item.solutionId && item.build.id !== selectedBuildId
                      ? item.solutionId
                      : `build:${item.build.id}`
                  }
                >
                  {item.solution?.name || item.build.name || 'Your workflow'}
                </MenuItem>
              ))}
            </TextField>
            {selectedPanel ? (
              <Button size="small" onClick={() => setCanvasOpen((value) => !value)}>
                {canvasOpen ? 'Hide workflow' : 'Show workflow'}
              </Button>
            ) : null}
          </Stack>
        ) : null}
        {(selectedWorkflowId || selectedBuildId) && !selectedPanel ? (
          <Alert severity={threadWorkflows.loading || busy ? 'info' : 'warning'} sx={{ mx: 2 }}>
            {threadWorkflows.loading || busy
              ? 'Finding the workflow linked to this conversation…'
              : threadWorkflows.error
                ? threadWorkflows.error.status === 401
                  ? 'Your session needs to reconnect before this workflow can load. Your conversation and unsent message are preserved.'
                  : threadWorkflows.error.status === 403
                    ? 'Workflow access could not be confirmed. Check your workspace access and retry; your message is preserved.'
                    : 'Workflow details are temporarily unavailable. Retry loading them to continue your saved request.'
                : 'This workflow could not be verified as part of this conversation. No messages were moved.'}
            <Button size="small" onClick={() => openWorkflow(null)}>
              Return to task chat
            </Button>
          </Alert>
        ) : null}
        <Box sx={{ position: 'relative', flex: 1, minHeight: 0 }}>
          <Box
            ref={conversationViewport}
            component="section"
            role="region"
            aria-label="Assistant message history"
            tabIndex={0}
            onScroll={(event) => {
              const viewport = event.currentTarget;
              const isNearLatest =
                viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 160;
              if (scrollingToLatest.current) {
                shouldFollowConversation.current = true;
                setShowJumpToLatest(false);
                if (isNearLatest) scrollingToLatest.current = false;
                return;
              }
              shouldFollowConversation.current = isNearLatest;
              setShowJumpToLatest(!isNearLatest);
            }}
            onWheel={() => {
              scrollingToLatest.current = false;
            }}
            onTouchStart={() => {
              scrollingToLatest.current = false;
            }}
            onPointerDown={() => {
              scrollingToLatest.current = false;
            }}
            onKeyDown={() => {
              scrollingToLatest.current = false;
            }}
            sx={{
              height: '100%',
              minHeight: 0,
              overflowY: 'auto',
              overscrollBehavior: 'contain',
              touchAction: 'pan-y',
              WebkitOverflowScrolling: 'touch',
              px: { xs: 1, sm: 2 },
              py: 2,
              pb: showJumpToLatest ? 7 : 2,
            }}
          >
            <Stack spacing={2} sx={{ minHeight: '100%' }}>
              {!messages.length && busy ? (
                <Stack
                  alignItems="center"
                  justifyContent="center"
                  spacing={1.5}
                  sx={{ flex: 1, minHeight: 280 }}
                  role="status"
                >
                  <CircularProgress size={24} />
                  <Typography variant="body2" color="text.secondary">
                    Loading conversation…
                  </Typography>
                </Stack>
              ) : !messages.length ? (
                <Box
                  sx={{
                    textAlign: 'center',
                    display: 'grid',
                    placeContent: 'center',
                    flex: 1,
                    minHeight: 280,
                  }}
                >
                  <Typography variant="h3" component="h1">
                    What do you want to get done?
                  </Typography>
                  <Typography color="text.secondary" sx={{ mt: 1.5 }}>
                    Ask a question, explore an idea, or delegate work. Orqanix will create an Agent
                    only when durable execution helps.
                  </Typography>
                </Box>
              ) : null}
              {!!messages.length && (
                <Stack
                  spacing={2}
                  role="log"
                  aria-live="polite"
                  aria-relevant="additions"
                  aria-label="Assistant conversation"
                >
                  {timeline.map((entry) =>
                    entry.kind === 'workflow' ? (
                      <Box
                        key={entry.key}
                        ref={entry.key === lastTimelineEntry?.key ? latestWorkflowTurn : undefined}
                      >
                        <Stack direction="row" alignItems="center" gap={1}>
                          <Typography variant="caption" color="text.secondary">
                            Workflow · {entry.solutionName || 'Saved workflow'}
                          </Typography>
                          {entry.solutionId !== selectedWorkflowId ? (
                            <Button size="small" onClick={() => openWorkflow(entry.solutionId)}>
                              Open workflow
                            </Button>
                          ) : null}
                        </Stack>
                        <SolutionConversationTurn
                          turn={entry.turn}
                          controller={
                            entry.solutionId === selectedWorkflowId ? workflowComposer : null
                          }
                          onSelectDraft={
                            entry.solutionId === selectedWorkflowId
                              ? (revisionId) => {
                                  if (workflowComposer.busy || workflowComposer.nativeEditing)
                                    return;
                                  scopedWorkflowContext?.onSelectDraft(revisionId);
                                  setCanvasOpen(true);
                                }
                              : undefined
                          }
                          onOpenHistory={
                            entry.solutionId === selectedWorkflowId
                              ? scopedWorkflowContext?.onOpenHistory
                              : undefined
                          }
                          inputRef={composerInput}
                        />
                      </Box>
                    ) : (
                      <AssistantConversationMessage
                        key={entry.key}
                        message={entry.message}
                        busy={busy || Boolean(pending) || workflowConversation.busy}
                        client={client}
                        agents={agents}
                        activityEvents={
                          activityEventsByTurn.get(entry.message.turnId) || EMPTY_ACTIVITY_EVENTS
                        }
                        onOpenGoal={onOpenGoal}
                        onRetry={retry}
                        onStartGoal={startGoal}
                        retryAvailable={!conversationView.retriedTurns.has(entry.message.turnId)}
                        attemptNumber={entry.attemptNumber}
                        attemptCount={entry.attemptCount}
                        liveGoalLinkKeys={liveGoalLinkKeys}
                        startedGoalRequests={startedGoalRequests}
                        onOpenWorkflow={openWorkflow}
                        onOpenBuild={openBuild}
                        workflowRunIds={workflowRunIds}
                      />
                    )
                  )}
                  {busy && (!pending || pending.role === 'user') ? (
                    <AssistantPreparingStatus intent={activeIntent || 'assistant'} />
                  ) : null}
                </Stack>
              )}
              {threadWorkflows.hasMore ? (
                <Typography variant="caption" color="text.secondary">
                  The latest 50 workflow updates are available here. Older records are retained;
                  this view does not load older pages yet.
                </Typography>
              ) : null}
              {threadWorkflows.error ? (
                <Alert
                  severity="warning"
                  action={<Button onClick={threadWorkflows.refresh}>Retry</Button>}
                >
                  Some workflow updates could not load. Your saved conversation is preserved.
                </Alert>
              ) : null}
              <Box ref={conversationEnd} aria-hidden />
            </Stack>
          </Box>
          {showJumpToLatest ? (
            <Button
              size="small"
              variant="contained"
              color="inherit"
              onClick={() => scrollToLatest('smooth', true)}
              sx={{
                position: 'absolute',
                left: '50%',
                bottom: 12,
                transform: 'translateX(-50%)',
                borderRadius: 999,
                px: 1.5,
                py: 0.5,
                minWidth: 0,
                boxShadow: 3,
                whiteSpace: 'nowrap',
              }}
            >
              Jump to latest ↓
            </Button>
          ) : null}
        </Box>
        {error ? (
          <Alert
            ref={actionError}
            severity="error"
            tabIndex={-1}
            action={<Button onClick={() => setError(null)}>Dismiss</Button>}
            sx={{ mx: { xs: 1, sm: 2 }, mb: 1, flexShrink: 0 }}
          >
            {error.message}
          </Alert>
        ) : null}
        {selectedWorkflow ? (
          <SolutionConversationFeedback controller={workflowConversation} />
        ) : null}
        <AssistantComposer
          workflowController={selectedWorkflowId ? workflowComposer : null}
          buildController={selectedBuildId ? buildComposer : null}
          recentTaskAgent={recentTaskAgent}
          onOpenTask={onOpenGoal}
          agentLifetime={agentLifetime}
          agents={agents}
          busy={busy}
          canStop={canStop}
          draft={draft}
          intent={composerIntent}
          inputRef={composerInput}
          onAgentLifetimeChange={setAgentLifetime}
          onSelectedAgentChange={(agentId) => {
            setSelectedAgentId(agentId);
            const agent = agents.find((candidate) => candidate.id === agentId);
            if (agent) setAgentLifetime(agent.lifetime);
          }}
          agentLookupError={selectedAgentLookupError}
          agentLookupLoading={selectedAgentLoading}
          onRetrySelectedAgent={() => setAgentLookupRetry((value) => value + 1)}
          onDraftChange={setDraft}
          onIntentChange={setComposerIntent}
          onStop={() => cancel(pending.turnId)}
          onSubmit={
            selectedWorkflowId
              ? () => workflowComposer.send('auto')
              : selectedBuildId
                ? () => buildComposer.send()
                : submit
          }
          pending={pending}
          selectedAgentId={selectedAgentId}
          stopLabel={stopLabel}
          stopping={stoppingTurnId === pending?.turnId}
        />
      </Stack>
      {selectedPanel ? (
        <Box
          component="aside"
          aria-label="Workflow side panel"
          aria-hidden={!canvasOpen}
          sx={{
            display: canvasOpen ? 'flex' : 'none',
            flexDirection: 'column',
            minWidth: 0,
            minHeight: 0,
            position: { xs: 'absolute', md: 'relative' },
            insetBlock: { xs: 0, md: 'auto' },
            right: 0,
            width: { xs: 'calc(100% - 24px)', md: '100%' },
            height: '100%',
            bgcolor: 'background.paper',
            zIndex: { xs: 3, md: 'auto' },
            borderLeft: 1,
            borderColor: 'divider',
            overflow: 'hidden',
          }}
        >
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            gap={1}
            sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}
          >
            <Typography variant="subtitle2" noWrap>
              {selectedPanel.solution?.name || selectedPanel.build.name || 'Your workflow'}
            </Typography>
            <Button
              ref={closePanelButton}
              size="small"
              onClick={() => {
                setCanvasOpen(false);
                window.requestAnimationFrame(() => composerInput.current?.focus());
              }}
            >
              Close workflow panel
            </Button>
          </Stack>
          <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 1.5 }}>
            <Suspense fallback={<CircularProgress aria-label="Loading workflow panel" />}>
              {selectedWorkflow ? (
                <AssistantWorkflowPanel
                  key={selectedWorkflowId}
                  solutionId={selectedWorkflowId}
                  client={client}
                  embedded
                  conversationWorking={workflowConversation.busy}
                  onContextChange={receiveWorkflowContext}
                />
              ) : (
                <AssistantBuildPanel
                  key={selectedBuildId}
                  buildRequestId={selectedBuildId}
                  client={client}
                  embedded
                  onOpenWorkflow={openWorkflow}
                  onEditingChange={setBuildEditing}
                  onBusyChange={setBuildBusy}
                  onContextChange={receiveBuildContext}
                />
              )}
            </Suspense>
          </Box>
        </Box>
      ) : null}
    </Box>
  );
}
