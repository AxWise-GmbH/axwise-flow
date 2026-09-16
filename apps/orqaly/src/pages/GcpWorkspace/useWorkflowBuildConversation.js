import { useEffect, useMemo, useRef, useState } from 'react';
import { containsSolutionBuildSecret } from '../../../shared/workflow-v2/solution-build-secrets.js';
import { executionHasUnknownOutcome } from './solution-presentation.js';
import { openBuildQuestions } from './workflow-build-presentation.js';

const EMPTY = [];

/** A controller for the original chat composer, not another conversation.
 * Only an explicit answer or allowed repair reaches a build-scoped command.
 * The workspace owns the fresh read, exact version check and idempotency key.
 */
export function useWorkflowBuildConversation({
  context = null,
  scopeKey = null,
  message = '',
  onMessageChange,
}) {
  const build = context?.build;
  const scope = useMemo(() => ({ id: build?.id || null, scopeKey }), [build?.id, scopeKey]);
  const [stateScope, setStateScope] = useState(scope);
  const [selectedMode, setSelectedMode] = useState(null);
  const [selection, setSelection] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const lock = useRef(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const latest = useRef(null);
  latest.current = { scope, context, message, onMessageChange };
  if (stateScope !== scope) {
    setStateScope(scope);
    setSelectedMode(null);
    setSelection(null);
    setSending(false);
    setError(null);
  }
  const questions = useMemo(
    () =>
      build?.status === 'needs_input'
        ? openBuildQuestions(build).filter((question) => question.kind === 'information')
        : EMPTY,
    [build]
  );
  const version = build ? `${build.id}:${build.rowVersion}:${build.inputVersion}` : null;
  const questionId =
    selection?.version === version ? selection.id : questions.length === 1 ? questions[0].id : '';
  const question = questions.find((item) => item.id === questionId) || null;
  const mode = selectedMode || (questions.length ? 'answer' : null);
  const canRepair =
    !!build?.repairEligibility?.allowed &&
    !executionHasUnknownOutcome(build.testEvidence) &&
    !['queued', 'running'].includes(build?.testEvidence?.status) &&
    typeof context?.onRepair === 'function';
  const hasSecret = containsSolutionBuildSecret(message);
  const maxLength = mode === 'answer' ? 2000 : 4000;
  const busy = sending || !!context?.panelBusy;
  const actionDisabled =
    !build ||
    context?.ready === false ||
    context?.nativeEditing ||
    busy ||
    hasSecret ||
    !message.trim() ||
    message.length > maxLength ||
    (mode === 'answer'
      ? !question || typeof context?.onAnswer !== 'function'
      : mode !== 'repair' || !canRepair);
  const setMode = (value) => {
    if (busy || context?.nativeEditing) return;
    setSelectedMode(['answer', 'repair'].includes(value) ? value : null);
    setError(null);
  };
  const setQuestionId = (id) => {
    if (busy || context?.nativeEditing) return;
    setSelection({ version, id: questions.some((item) => item.id === id) ? id : '' });
    setError(null);
  };
  const send = async () => {
    if (actionDisabled || lock.current === scope) return false;
    const frozen = { scope, context, message, mode, questionId };
    lock.current = scope;
    setSending(true);
    setError(null);
    try {
      const confirmed =
        mode === 'answer'
          ? await context.onAnswer(questionId, message.trim())
          : await context.onRepair(message.trim());
      if (!mounted.current || latest.current.scope !== frozen.scope) return false;
      if (confirmed !== true) {
        setError(
          'The saved build has not confirmed this request. Check its current question or repair status before retrying. Your message is kept.'
        );
        return false;
      }
      // A response can arrive after the user has typed the next message. Consume
      // only the exact text whose build-scoped command was acknowledged.
      if (latest.current.message === frozen.message) latest.current.onMessageChange?.('');
      return true;
    } catch (failure) {
      if (mounted.current && latest.current.scope === frozen.scope)
        setError(
          failure.message || 'This build request could not be confirmed. Your message is kept.'
        );
      return false;
    } finally {
      if (lock.current === frozen.scope) lock.current = null;
      if (mounted.current && latest.current.scope === frozen.scope) setSending(false);
    }
  };
  return {
    build,
    mode,
    setMode,
    questions,
    questionId,
    setQuestionId,
    question,
    currentQuestion: question,
    canRepair,
    busy,
    error: error || context?.error || null,
    hasSecret,
    maxLength,
    actionDisabled,
    send,
    targetLabel:
      mode === 'answer' && question
        ? `Answering: ${question.prompt}`
        : mode === 'repair'
          ? 'Prepare changes to this saved draft'
          : 'Choose a build action',
  };
}
