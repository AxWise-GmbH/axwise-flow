import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { containsSolutionBuildSecret } from '../../../shared/workflow-v2/solution-build-secrets.js';

const WORKING = new Set(['queued', 'running']);
const EMPTY = [];

function assertSnapshot(value, solutionId) {
  if (value?.solutionId !== solutionId || !Array.isArray(value.turns) || !value.context)
    throw new Error('The saved workflow conversation could not be verified.');
  return value;
}

/**
 * The durable workflow conversation controller, without a transcript or composer.
 * A host may supply its existing message state; a null solution makes no requests.
 * Keep this hook mounted when merely hiding the canvas, and block target changes
 * during pending delivery/native editing. Scope changes never resend old work.
 */
export function useSolutionConversation({
  client,
  solution = null,
  scopeKey = null,
  draftId,
  onSelectDraft,
  onDraftReady,
  nativeEditing = false,
  onWorkingChange,
  message: controlledMessage,
  onMessageChange,
}) {
  const solutionId = solution?.id ?? null;
  const scope = useMemo(() => ({ client, solutionId, scopeKey }), [client, solutionId, scopeKey]);
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const [stateScope, setStateScope] = useState(scope);
  const [snapshot, setSnapshot] = useState(null);
  const [localMessage, setLocalMessage] = useState('');
  const message = typeof controlledMessage === 'string' ? controlledMessage : localMessage;
  const setMessage = onMessageChange || setLocalMessage;
  const hostCallbacks = useRef({ setMessage, message, onDraftReady, nativeEditing });
  hostCallbacks.current = { setMessage, message, onDraftReady, nativeEditing };
  const [mode, setMode] = useState('auto');
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [includeRun, setIncludeRun] = useState(false);
  const [invocationId, setInvocationId] = useState('');
  const [sharingOpen, setSharingOpen] = useState(false);
  const [verifiedContext, setVerifiedContext] = useState(null);
  const [selectingDraft, setSelectingDraft] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const pending = useRef(null);
  const preparedChange = useRef(null);
  const commandError = useRef(false);
  const sendLock = useRef(null);
  const mounted = useRef(true);
  const activeTarget = useRef(null);
  activeTarget.current = draftId || null;
  const history = useRef({ scope, loaded: false, announced: new Set() });
  const requestEpoch = useRef(0);

  // Reset this hook's state before React commits another owner's/thread's controls.
  // The parent's one text field is not cleared here: only a same-scope confirmed
  // acknowledgement may consume its message. Async handlers also check scope.
  if (stateScope !== scope) {
    setStateScope(scope);
    setSnapshot(null);
    setLocalMessage('');
    setMode('auto');
    setError(null);
    setSending(false);
    setUncertain(false);
    setIncludeRun(false);
    setInvocationId('');
    setSharingOpen(false);
    setVerifiedContext(null);
    setSelectingDraft(null);
    commandError.current = false;
  }

  const turns = snapshot?.turns || EMPTY;
  const working = turns.some((turn) => WORKING.has(turn.status));
  const context = snapshot?.context;
  const selectedDraft = context?.selectedDraft;
  const availableDraft = context?.availableDraft;
  const availableInvocations = snapshot?.availableInvocations || EMPTY;
  const selectedInvocation = availableInvocations.find((item) => item.id === invocationId);
  // A fresh-draft read can outlive the consent state that started it. Retain an
  // identity only while the exact per-message selection remains unchanged.
  const latestConsent = useRef(null);
  if (
    latestConsent.current?.scope !== scope ||
    latestConsent.current?.target !== (draftId || null) ||
    latestConsent.current?.includeRun !== includeRun ||
    latestConsent.current?.invocationId !== invocationId ||
    latestConsent.current?.selectedId !== (selectedInvocation?.id || null)
  ) latestConsent.current = {
    scope, target: draftId || null, includeRun, invocationId,
    selectedId: selectedInvocation?.id || null,
  };
  // This exact revision and the last-eight-turn context are the service's design
  // continuation boundary, not a heuristic inferred from the model's prose.
  const latestChange = turns
    .slice(-8)
    .findLast(
      (turn) =>
        (turn.resolvedMode === 'change' || turn.mode === 'change') &&
        turn.baseWorkflowHash === context?.workflowHash &&
        (turn.targetDraft?.id || null) === (selectedDraft?.id || null)
    );
  const clarification =
    latestChange?.status === 'blocked' &&
    !latestChange.draftSelectionRequired &&
    !turns.some((turn) => turn.continuation?.turnId === latestChange.id) &&
    (!selectedDraft ||
      (latestChange.targetDraft?.workflowHash === selectedDraft.workflowHash &&
        latestChange.targetDraft?.rowVersion === selectedDraft.rowVersion)) &&
    latestChange.questions?.length
      ? latestChange
      : null;
  const clarificationNeedsRun =
    !!clarification?.includedInvocation &&
    (!includeRun || selectedInvocation?.id !== clarification.includedInvocation.id);
  const draftSelectionTurn = turns.findLast(
    (turn) => turn.draftSelectionRequired && turn.status === 'blocked' &&
      turn.baseWorkflowHash === context?.workflowHash &&
      !turns.some((next) => next.continuation?.turnId === turn.id)
  );
  const needsDraftSelection = !selectedDraft && availableDraft &&
    (mode === 'change' || !!draftSelectionTurn);
  const contextReady =
    !!solutionId &&
    !!context &&
    verifiedContext?.scope === scope &&
    verifiedContext.target === (draftId || null) &&
    (selectedDraft?.id || null) === (draftId || null) &&
    !selectingDraft;
  const hasSecret = containsSolutionBuildSecret(message) || /orqaly_app_/i.test(message);
  const messageTooLong = message.length > 8000;
  const busy = sending || working || uncertain || !!selectingDraft;
  const actionDisabled =
    !contextReady ||
    snapshot?.enabled === false ||
    busy ||
    hasSecret ||
    messageTooLong ||
    (includeRun && !selectedInvocation) ||
    !message.trim();
  const refresh = useCallback(() => setRefreshKey((value) => value + 1), []);

  const adopt = useCallback(
    (value) => {
      if (!mounted.current || currentScope.current !== scope) return;
      const next = assertSnapshot(value, solutionId);
      if ((next.context.selectedDraft?.id || null) === activeTarget.current) {
        setSnapshot(next);
        setVerifiedContext({ scope, target: activeTarget.current });
        setSelectingDraft(null);
      } else setSnapshot((previous) => (previous ? { ...previous, turns: next.turns } : previous));
      const saved =
        pending.current?.scope === scope &&
        next.turns.find((turn) => turn.id === pending.current.command.turnId);
      if (saved) {
        const consumed = pending.current.consumeText;
        pending.current = null;
        preparedChange.current = null;
        setUncertain(false);
        if (consumed !== null && hostCallbacks.current.message === consumed)
          hostCallbacks.current.setMessage('');
        setIncludeRun(false);
        setInvocationId('');
        setSharingOpen(false);
        setMode('auto');
        setError(null);
        commandError.current = false;
      }
      if (history.current.scope !== scope)
        history.current = { scope, loaded: false, announced: new Set() };
      for (const turn of next.turns) {
        if (
          turn.status === 'completed' &&
          turn.draftRevisionId &&
          !history.current.announced.has(turn.id)
        ) {
          history.current.announced.add(turn.id);
          if (history.current.loaded) hostCallbacks.current.onDraftReady?.(turn.draftRevisionId);
        }
      }
      history.current.loaded = true;
    },
    [scope, solutionId]
  );

  useEffect(() => {
    setIncludeRun(false);
    setInvocationId('');
    setSharingOpen(false);
    // Draft selection preserves typed text and intention, never sharing consent.
  }, [draftId, scope]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!solutionId || !client?.solutionConversation) return undefined;
    let cancelled = false;
    let timer;
    const read = async () => {
      let delay = 15_000;
      if (sendLock.current?.scope === scope) {
        timer = setTimeout(read, 2500);
        return;
      }
      const epoch = ++requestEpoch.current;
      try {
        const next = assertSnapshot(
          await client.solutionConversation(solutionId, { draftId }),
          solutionId
        );
        if (cancelled || currentScope.current !== scope) return;
        if ((next.context.selectedDraft?.id || null) !== (draftId || null))
          throw new Error(
            'The selected draft context could not be verified. Refresh before sending.'
          );
        if (epoch === requestEpoch.current) {
          adopt(next);
          if (pending.current?.scope !== scope && !commandError.current) setError(null);
        }
        if (next.turns.some((turn) => WORKING.has(turn.status))) delay = 2500;
      } catch (value) {
        if (!cancelled && currentScope.current === scope && epoch === requestEpoch.current)
          setError(value);
      }
      if (!cancelled) timer = setTimeout(read, delay);
    };
    void read();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [client, solutionId, scope, draftId, refreshKey, adopt]);
  useEffect(() => {
    onWorkingChange?.(busy);
  }, [busy, onWorkingChange]);

  async function dispatch(request) {
    if (
      !solutionId ||
      request.scope !== scope ||
      currentScope.current !== scope ||
      sendLock.current?.scope === scope
    )
      return;
    const lock = { scope };
    sendLock.current = lock;
    requestEpoch.current += 1;
    setSending(true);
    setError(null);
    commandError.current = false;
    try {
      const response = await client.sendSolutionConversationTurn(
        solutionId,
        request.command,
        request.key
      );
      if (!mounted.current || currentScope.current !== scope) return;
      const next = assertSnapshot(response, solutionId);
      if (!next.turns.some((turn) => turn.id === request.command.turnId))
        throw new Error('The saved request has not been confirmed. Check it before sending again.');
      adopt(next);
      refresh();
    } catch (value) {
      if (!mounted.current || currentScope.current !== scope) return;
      setError(value);
      commandError.current = true;
      if (value.status >= 400 && value.status < 500) {
        pending.current = null;
        setUncertain(false);
      } else setUncertain(true);
    } finally {
      if (sendLock.current === lock) sendLock.current = null;
      if (mounted.current && currentScope.current === scope) setSending(false);
    }
  }

  function requestFor(action, text, currentContext, options = {}) {
    return {
      scope,
      key: crypto.randomUUID(),
      consumeText: options.preserveComposer ? null : message,
      command: {
        turnId: crypto.randomUUID(),
        mode: action,
        message: text,
        expectedSolutionVersion: currentContext.solutionVersion,
        workflowHash: currentContext.workflowHash,
        ...(options.proposalRef ? { proposalRef: options.proposalRef } : {}),
        ...(options.continuation ? { continuation: options.continuation } : {}),
        ...(includeRun && selectedInvocation
          ? { includeInvocation: { id: selectedInvocation.id, inputOutput: true } }
          : {}),
        ...(currentContext.selectedDraft ? { draft: {
          id: currentContext.selectedDraft.id,
          rowVersion: currentContext.selectedDraft.rowVersion,
          workflowHash: currentContext.selectedDraft.workflowHash,
        } } : {}),
      },
    };
  }

  function send(action = 'auto', options = {}) {
    const text = (options.message ?? message).trim();
    if (
      !['auto', 'ask', 'change'].includes(action) ||
      currentScope.current !== scope ||
      sendLock.current?.scope === scope ||
      !contextReady || snapshot?.enabled === false || busy || !text || text.length > 8000 ||
      containsSolutionBuildSecret(text) || /orqaly_app_/i.test(text) ||
      (includeRun && !selectedInvocation) ||
      (action !== 'ask' && nativeEditing)
    )
      return;
    if (action !== 'ask' && clarificationNeedsRun) return;
    setMode(action);
    if (action === 'change' && availableDraft && !selectedDraft) {
      preparedChange.current = { scope, action, text, options };
      return;
    }
    const request = requestFor(action, text, context, {
      ...(clarification && !options.continuation
        ? { continuation: { turnId: clarification.id, kind: 'answer' } } : {}),
      ...options,
    });
    pending.current = request;
    void dispatch(request);
  }

  async function useExistingDraft() {
    if (!contextReady || busy || nativeEditing || !availableDraft || !onSelectDraft) return;
    const source = draftSelectionTurn;
    if (source?.includedInvocation &&
      (!includeRun || selectedInvocation?.id !== source.includedInvocation.id)) {
      setSharingOpen(true);
      setError(new Error('Include the same run explicitly for this continuation, or send a new request without its payload.'));
      return;
    }
    const targetBeforeRead = activeTarget.current;
    if (source && source.availableDraft?.id !== availableDraft.id) {
      setError(new Error('The original draft is no longer available. Review the saved change before choosing another draft.'));
      return;
    }
    // Keep the immutable request's draft identity, but let a subsequent explicit
    // confirmation use the newly displayed CAS after a conflict and refresh.
    const requestedDraft = availableDraft;
    const consentBeforeRead = latestConsent.current;
    const prepared = preparedChange.current?.scope === scope ? preparedChange.current : null;
    const text = source ? 'Update the existing draft with my saved change.' : prepared?.text || message.trim();
    if (!text || containsSolutionBuildSecret(text) || /orqaly_app_/i.test(text)) return;
    setSelectingDraft(availableDraft.id);
    requestEpoch.current += 1;
    try {
      const next = assertSnapshot(await client.solutionConversation(solutionId, {
        draftId: requestedDraft.id,
      }), solutionId);
      if (!mounted.current || currentScope.current !== scope ||
          activeTarget.current !== targetBeforeRead || hostCallbacks.current.nativeEditing) return;
      if (latestConsent.current !== consentBeforeRead)
        throw new Error('Run-data sharing changed while the draft was loading. Review your selection and confirm again; your request is preserved.');
      const verified = next.context.selectedDraft;
      if (!verified || verified.id !== requestedDraft.id ||
          verified.rowVersion !== requestedDraft.rowVersion ||
          verified.workflowHash !== requestedDraft.workflowHash ||
          next.context.solutionVersion !== context.solutionVersion ||
          next.context.workflowHash !== context.workflowHash)
        throw new Error('The draft changed. Review the refreshed version before continuing; your request is preserved.');
      const request = requestFor('change', text, next.context, source ? {
        continuation: { turnId: source.id, kind: 'answer' }, preserveComposer: true,
      } : prepared?.options || {});
      pending.current = request;
      onSelectDraft(verified.id);
      await dispatch(request);
    } catch (value) {
      if (mounted.current && currentScope.current === scope) {
        commandError.current = true;
        setError(value);
        refresh();
      }
    } finally {
      if (mounted.current && currentScope.current === scope) setSelectingDraft(null);
    }
  }

  function proposeFromTurn(turn) {
    if (busy || nativeEditing || !turn?.message) return;
    setMessage(turn.message);
    setMode('change');
    setIncludeRun(false);
    setInvocationId('');
    setSharingOpen(false);
  }

  function continueTurn(turn, kind = 'retry') {
    if (!turns.some((item) => item.id === turn.id) || busy || nativeEditing) return;
    if (turn.includedInvocation &&
        (!includeRun || selectedInvocation?.id !== turn.includedInvocation.id)) {
      setSharingOpen(true);
      setError(new Error('This request used run data. Include that run again for this message before continuing.'));
      return;
    }
    send(turn.resolvedMode === 'ask' || turn.mode === 'ask' ? 'ask' : 'auto', {
      message: kind === 'resume_setup' ? 'Continue my saved change after secure setup.' : turn.message,
      continuation: { turnId: turn.id, kind }, preserveComposer: true,
    });
  }

  return {
    solution,
    nativeEditing,
    snapshot,
    turns,
    context,
    contextReady,
    selectedDraft,
    availableDraft,
    message,
    setMessage,
    mode,
    setMode,
    error,
    sending,
    working,
    uncertain,
    busy,
    clarification,
    clarificationNeedsRun,
    needsDraftSelection,
    draftSelectionTurn,
    hasSecret,
    messageTooLong,
    actionDisabled,
    includeRun,
    setIncludeRun,
    invocationId,
    setInvocationId,
    sharingOpen,
    setSharingOpen,
    availableInvocations,
    selectedInvocation,
    send,
    refresh: () => { commandError.current = false; refresh(); },
    useExistingDraft,
    proposeFromTurn,
    continueTurn,
    chooseProposal: (turn, proposal) => send('change', {
      message: proposal.request,
      proposalRef: { turnId: turn.id, proposalId: proposal.id, proposalHash: proposal.contentHash },
      preserveComposer: true,
    }),
    retrySame: () => {
      if (pending.current?.scope === scope) void dispatch(pending.current);
    },
  };
}
