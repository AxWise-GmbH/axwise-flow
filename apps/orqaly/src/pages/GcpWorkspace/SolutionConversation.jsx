import { useEffect, useRef } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  FormControlLabel,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AssistantMarkdown from '../../components/VoiceControl/AssistantMarkdown.jsx';
import { TaskDisclosure } from '../WorkflowV2/TaskDisclosure.jsx';
import { Link as RouterLink } from 'react-router-dom';
import { useSolutionConversation } from './useSolutionConversation.js';

const WORKING = new Set(['queued', 'running']);
const STATUS = {
  queued: 'Request saved',
  running: 'Working on your request',
  completed: 'Complete',
  blocked: 'Needs attention',
  failed: 'Could not complete',
};
const PHASE = {
  resolving_intent: 'Understanding your request',
  answering: 'Checking your workflow',
  designing: 'Preparing your change',
  needs_input: 'Waiting for your choice',
  needs_setup: 'Connection needed to continue',
  ready: 'Draft ready · live unchanged',
  failed: 'Request paused · live unchanged',
};

export default function SolutionConversation(props) {
  return <Conversation key={props.solution.id} {...props} />;
}

function Conversation(props) {
  const controller = useSolutionConversation(props);
  const { snapshot, turns, error, busy, send, setMode, setMessage } = controller;
  const logRef = useRef(null),
    composerRef = useRef(null),
    latestTurnRef = useRef(null);
  const readerMoved = useRef(false),
    lastRevealedTurn = useRef(null);
  const latestTurnId = turns.at(-1)?.id;
  const latestTurnStatus = turns.at(-1)?.status;
  useEffect(() => {
    if (latestTurnId !== lastRevealedTurn.current) {
      lastRevealedTurn.current = latestTurnId;
      readerMoved.current = false;
    }
    if (readerMoved.current) return;
    const log = logRef.current,
      turn = latestTurnRef.current;
    if (latestTurnId && log && turn)
      log.scrollTop += turn.getBoundingClientRect().top - log.getBoundingClientRect().top;
  }, [latestTurnId, latestTurnStatus]);
  return (
    <Stack
      component="section"
      aria-label="Workflow conversation"
      gap={2}
      sx={{
        minWidth: 0,
        minHeight: { xs: 680, lg: 700 },
        border: 1,
        borderColor: 'divider',
        borderRadius: 2,
        p: { xs: 1.5, sm: 2 },
        bgcolor: 'background.paper',
      }}
    >
      <Box>
        <Typography component="h2" variant="h6" sx={{ textTransform: 'none' }}>
          Workflow chat
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Ask how it works, investigate a result, or describe a change.
        </Typography>
        <SolutionConversationContext controller={controller} />
      </Box>
      <Box
        ref={logRef}
        role="log"
        aria-label="Saved workflow conversation"
        aria-live="polite"
        aria-relevant="additions text"
        onWheel={() => {
          readerMoved.current = true;
        }}
        onTouchMove={() => {
          readerMoved.current = true;
        }}
        onPointerDown={() => {
          readerMoved.current = true;
        }}
        onKeyDown={() => {
          readerMoved.current = true;
        }}
        sx={{
          flex: 1,
          minHeight: { xs: 260, lg: 300 },
          maxHeight: { xs: 520, lg: 'min(680px, 65dvh)' },
          overflowY: 'auto',
          overscrollBehavior: 'contain',
          pr: 0.5,
        }}
      >
        {!snapshot && !error ? (
          <CircularProgress size={20} aria-label="Loading workflow conversation" />
        ) : null}
        {snapshot && !turns.length ? (
          <Stack gap={1.5} sx={{ py: 2 }}>
            <Typography variant="body2">
              This conversation stays with this workflow and its recorded results.
            </Typography>
            {['Explain what this workflow does', 'Help me troubleshoot the latest run'].map(
              (prompt) => (
                <Button
                  key={prompt}
                  variant="outlined"
                  size="small"
                  disabled={busy}
                  sx={{ alignSelf: 'flex-start', textAlign: 'left' }}
                  onClick={() => {
                    setMode('ask');
                    setMessage(prompt);
                  }}
                >
                  {prompt}
                </Button>
              )
            )}
          </Stack>
        ) : null}
        <Stack gap={2.5}>
          {turns.map((turn) => (
            <Box key={turn.id} ref={turn.id === latestTurnId ? latestTurnRef : undefined}>
              <SolutionConversationTurn
                turn={turn}
                controller={controller}
                onSelectDraft={props.onSelectDraft}
                onOpenHistory={props.onOpenHistory}
                inputRef={composerRef}
              />
            </Box>
          ))}
        </Stack>
      </Box>
      <SolutionConversationFeedback controller={controller} />
      <Box
        component="form"
        onSubmit={(event) => {
          event.preventDefault();
          send('auto');
        }}
      >
        <SolutionConversationComposer controller={controller} inputRef={composerRef} />
      </Box>
    </Stack>
  );
}

export function SolutionConversationContext({ controller }) {
  const { solution, contextReady, selectedDraft } = controller;
  if (!solution) return null;
  return (
    <Chip
      size="small"
      variant="outlined"
      sx={{ mt: 1 }}
      label={
        !contextReady
          ? 'Loading selected workflow context…'
          : selectedDraft
            ? 'Selected draft · live v' + solution.version + ' unchanged'
            : 'Context: workflow v' + solution.version
      }
    />
  );
}

export function SolutionConversationTurn({ controller, turn, onSelectDraft, onOpenHistory }) {
  // Inactive workflow history is display-only. Never wire its actions to the
  // currently selected workflow's controller or infer a target from prose.
  const { nativeEditing, busy, sending, working, uncertain, clarification } = controller || {};
  const resolvedMode = turn.resolvedMode || turn.mode;
  return (
    <>
      <Stack gap={1.5} component="article" aria-label="Workflow conversation turn">
        <Box sx={{ ml: 2, p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
          <Typography variant="caption" color="text.secondary">
            You{resolvedMode === 'change' ? ' · Requested change' : ''}
          </Typography>
          <Typography
            variant="body1"
            sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', mt: 0.5 }}
          >
            {turn.message}
          </Typography>
          {turn.includedInvocation ? (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              Included run {turn.includedInvocation.id.slice(0, 8)} for this message only.
              {turn.includedInvocation.omissionReasons?.length
                ? ' Some payloads were omitted for safety or size.'
                : ''}
            </Typography>
          ) : null}
        </Box>
        <Box
          sx={{
            minWidth: 0,
            '& .assistant-markdown p, & .assistant-markdown li': { fontSize: '1rem' },
          }}
        >
          <Typography variant="caption" color="text.secondary">
            Orqaly ·{' '}
            {turn.id === clarification?.id
              ? 'Waiting for your answer'
              : turn.errorCode === 'WORKFLOW_CONVERSATION_BLOCKED' && turn.questions?.length
                ? 'Asked for clarification'
                : turn.status === 'completed'
                  ? resolvedMode === 'ask'
                    ? 'Answered'
                    : turn.draftRevisionId
                      ? 'Draft ready · live unchanged'
                      : 'Response saved'
                  : PHASE[turn.phase] || STATUS[turn.status] || 'Status unavailable'}
          </Typography>
          {(typeof turn.reply === 'string' ? turn.reply : turn.reply?.markdown) ? (
            <AssistantMarkdown
              text={typeof turn.reply === 'string' ? turn.reply : turn.reply.markdown}
              variant="conversation"
            />
          ) : WORKING.has(turn.status) ? (
            <Typography variant="body1" role="status" sx={{ mt: 0.75 }}>
              {turn.phase === 'resolving_intent'
                ? 'Understanding your request and the version you are working on…'
                : resolvedMode === 'change'
                  ? 'Preparing a draft from this workflow and your request…'
                  : 'Checking this workflow and its saved evidence…'}
            </Typography>
          ) : null}
          {turn.proposals?.length ? (
            <Stack gap={1} sx={{ mt: 1.5 }} aria-label="Suggested workflow changes">
              {turn.proposals.map((proposal) => (
                <Box
                  key={proposal.id}
                  sx={{ border: 1, borderColor: 'divider', p: 1.5, borderRadius: 1.5 }}
                >
                  <Typography variant="subtitle2">{proposal.title}</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    {proposal.reason || proposal.request}
                  </Typography>
                  {proposal.capability === 'requires_runtime' ? (
                    <Typography variant="caption" sx={{ display: 'block', mt: 1 }}>
                      Requires runtime support before this can be implemented here.
                    </Typography>
                  ) : controller ? (
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={busy || nativeEditing}
                      sx={{ mt: 1 }}
                      onClick={() => controller.chooseProposal(turn, proposal)}
                    >
                      {proposal.capability === 'requires_setup'
                        ? 'Prepare & connect'
                        : 'Prepare this change'}
                    </Button>
                  ) : null}
                </Box>
              ))}
            </Stack>
          ) : null}
          {turn.evidence?.length || turn.model || turn.baseWorkflowHash || turn.errorCode ? (
            <TaskDisclosure title="Evidence">
              {turn.evidence?.length ? (
                <Stack
                  direction="row"
                  flexWrap="wrap"
                  gap={0.5}
                  sx={{ mt: 1 }}
                  aria-label="Supporting workflow evidence"
                >
                  {turn.evidence
                    .filter((item) => item.kind === 'build' && item.id)
                    .slice(0, 1)
                    .map((item) => (
                      <Button
                        key={item.id}
                        component={RouterLink}
                        to={`/workspace/builds/${encodeURIComponent(item.id)}`}
                        size="small"
                      >
                        Source build
                      </Button>
                    ))}
                  {turn.evidence.some((item) => item.kind === 'invocation') && onOpenHistory ? (
                    <Button size="small" onClick={onOpenHistory}>
                      Recorded runs (
                      {turn.evidence.filter((item) => item.kind === 'invocation').length})
                    </Button>
                  ) : null}
                </Stack>
              ) : null}
              <Typography variant="caption" sx={{ overflowWrap: 'anywhere', display: 'block' }}>
                Saved request {turn.id}
              </Typography>
              {turn.errorCode ? (
                <Typography variant="caption" sx={{ overflowWrap: 'anywhere', display: 'block' }}>
                  Request status: {turn.errorCode}
                </Typography>
              ) : null}
              {turn.baseWorkflowHash ? (
                <Typography variant="caption" sx={{ overflowWrap: 'anywhere', display: 'block' }}>
                  Workflow {turn.baseWorkflowHash}
                </Typography>
              ) : null}
              {turn.model ? (
                <Typography variant="caption">
                  Model:{' '}
                  {typeof turn.model === 'string'
                    ? turn.model
                    : turn.model.model ||
                      turn.model.name ||
                      turn.model.id ||
                      'Recorded by the service'}
                </Typography>
              ) : null}
            </TaskDisclosure>
          ) : null}
          {controller && turn.status === 'completed' && turn.draftRevisionId ? (
            <Button
              variant="outlined"
              size="small"
              disabled={busy || nativeEditing || sending || working || uncertain}
              onClick={() => onSelectDraft?.(turn.draftRevisionId)}
              sx={{ mt: 1 }}
            >
              Show changes
            </Button>
          ) : null}
          {(turn.id === clarification?.id ? [] : turn.questions || []).map((question) => (
            <Typography key={question.id || question.prompt} variant="body2" sx={{ mt: 1 }}>
              {question.prompt}
            </Typography>
          ))}
          {(turn.dependencies || []).map((dependency, index) => (
            <Typography key={dependency.code || index} variant="body2" sx={{ mt: 1 }}>
              {dependency.message || dependency.code}
            </Typography>
          ))}
          {turn.status === 'failed' ||
          (turn.status === 'blocked' &&
            !['needs_input', 'needs_setup'].includes(turn.phase) &&
            !turn.draftSelectionRequired) ? (
            <Alert severity="warning" sx={{ mt: 1 }}>
              {turn.id === clarification?.id ? (
                'Waiting for your answer below. The live workflow was not changed.'
              ) : turn.errorCode === 'WORKFLOW_CONVERSATION_BLOCKED' && turn.questions?.length ? (
                'A preference was needed before preparing this draft. No live change was made.'
              ) : (
                <>
                  {resolvedMode === 'change'
                    ? 'I couldn’t prepare this change. '
                    : 'I couldn’t complete this request. '}
                  The live workflow was not changed. Your saved work is retained.{' '}
                  {turn.nextInstruction ||
                    'You can review the evidence, then clarify your request or try again.'}
                </>
              )}
            </Alert>
          ) : null}
          {controller && turn.status === 'failed' ? (
            <Button
              variant="outlined"
              size="small"
              sx={{ mt: 1 }}
              disabled={busy || nativeEditing || !controller.contextReady}
              onClick={() => controller.continueTurn(turn, 'retry')}
            >
              Retry this request
            </Button>
          ) : null}
          {controller && turn.phase === 'needs_setup' && turn.setupRef ? (
            <Box sx={{ mt: 1 }}>
              <Typography variant="body2" color="text.secondary">
                This draft needs a connection. Secure setup for workflow revisions is not available
                in this preview yet; do not paste credentials into chat.
              </Typography>
              <Button
                variant="outlined"
                size="small"
                sx={{ mt: 1 }}
                disabled={busy || nativeEditing}
                onClick={() => onSelectDraft?.(turn.setupRef.revisionId)}
              >
                Review draft requirements
              </Button>
            </Box>
          ) : null}
        </Box>
      </Stack>
    </>
  );
}

export function SolutionConversationFeedback({ controller }) {
  const { error, refresh, uncertain, sending, snapshot } = controller;
  return (
    <>
      {error ? (
        <Alert severity="warning" action={<Button onClick={refresh}>Refresh</Button>}>
          {error.message || 'Conversation updates are unavailable. Your saved work is retained.'}
        </Alert>
      ) : null}
      {uncertain ? (
        <Alert
          severity="warning"
          action={
            <Button disabled={sending} onClick={controller.retrySame}>
              Retry same request
            </Button>
          }
        >
          Delivery is unconfirmed. Refresh to check the saved request, or retry this exact request.
          No second request will be created.
        </Alert>
      ) : null}
      {snapshot?.enabled === false ? (
        <Alert severity="info">
          Workflow conversation is not enabled on this deployment yet. Your workflow remains
          available to view and run.
        </Alert>
      ) : null}
    </>
  );
}

export function SolutionConversationNotices({ controller }) {
  const {
    clarification,
    clarificationNeedsRun,
    needsDraftSelection,
    contextReady,
    nativeEditing,
    busy,
    useExistingDraft,
  } = controller;
  return (
    <>
      {clarification ? (
        <Box
          role="note"
          aria-label="Workflow clarification"
          sx={{ p: 1.5, border: 1, borderColor: 'divider', borderRadius: 1.5 }}
        >
          <Typography variant="subtitle2">
            {clarification.questions.length === 1
              ? 'One quick question'
              : 'A few details before I continue'}
          </Typography>
          {clarification.questions.map((question) => (
            <Typography key={question.id || question.prompt} sx={{ mt: 0.75 }}>
              {question.prompt}
            </Typography>
          ))}
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            Answer here to continue this workflow change. Nothing is activated.
          </Typography>
          {clarificationNeedsRun ? (
            <Typography variant="caption" sx={{ display: 'block', mt: 1 }}>
              This question used run data. To continue with that context, include the same run again
              for this answer under Troubleshooting data. It is not shared automatically.
            </Typography>
          ) : null}
        </Box>
      ) : null}
      {needsDraftSelection ? (
        <Alert
          severity="info"
          action={
            <Button
              sx={{ whiteSpace: 'nowrap' }}
              disabled={!contextReady || nativeEditing || busy}
              onClick={useExistingDraft}
            >
              Update existing draft
            </Button>
          }
        >
          Apply your saved change to the existing draft? The live version stays unchanged.
        </Alert>
      ) : null}
      {nativeEditing ? (
        <Typography variant="caption" color="text.secondary">
          Finish saving and reviewing your n8n edits to continue here. Your message stays in this
          chat.
        </Typography>
      ) : null}
    </>
  );
}

export function SolutionConversationInput({ controller, inputRef }) {
  const {
    clarification,
    message,
    setMessage,
    sending,
    working,
    uncertain,
    hasSecret,
    messageTooLong,
  } = controller;
  return (
    <>
      <TextField
        label={clarification ? 'Your answer' : 'Message this workflow'}
        placeholder={
          clarification
            ? 'Tell me your preference, or ask me to explain the choice…'
            : 'Ask a question or describe what you want to change…'
        }
        multiline
        minRows={3}
        maxRows={6}
        fullWidth
        value={message}
        inputRef={inputRef}
        onChange={(event) => setMessage(event.target.value)}
        disabled={sending || working || uncertain}
        error={hasSecret || messageTooLong}
        inputProps={{ maxLength: 8000 }}
        helperText={
          hasSecret
            ? 'Remove credentials. Add them through the secure connection controls, not chat.'
            : messageTooLong
              ? 'Keep workflow messages within 8,000 characters.'
              : clarification
                ? 'Send your answer to continue the same saved request.'
                : 'One chat for questions and changes. Changes are prepared as drafts; the live workflow stays unchanged.'
        }
      />
    </>
  );
}

export function SolutionConversationActions({ controller }) {
  const {
    availableInvocations,
    includeRun,
    sharingOpen,
    setSharingOpen,
    setIncludeRun,
    setInvocationId,
    busy,
    sending,
    uncertain,
    invocationId,
    selectedDraft,
    context,
    actionDisabled,
    send,
    nativeEditing,
    clarificationNeedsRun,
    clarification,
  } = controller;
  return (
    <>
      {availableInvocations.length ? (
        <Box>
          <Button
            size="small"
            aria-expanded={sharingOpen}
            onClick={() => {
              setSharingOpen(!sharingOpen);
              if (sharingOpen) {
                setIncludeRun(false);
                setInvocationId('');
              }
            }}
            disabled={busy}
          >
            {includeRun ? 'Run data included for this message' : 'Troubleshooting data (optional)'}
          </Button>
          {sharingOpen ? (
            <Box>
              <FormControlLabel
                sx={{ alignItems: 'flex-start', m: 0 }}
                control={
                  <Checkbox
                    size="small"
                    checked={includeRun}
                    disabled={busy}
                    onChange={(event) => setIncludeRun(event.target.checked)}
                  />
                }
                label={
                  <Typography variant="caption" sx={{ display: 'block', pt: 1 }}>
                    Include one run’s input/output for this message
                  </Typography>
                }
              />
              {includeRun ? (
                <TextField
                  select
                  fullWidth
                  size="small"
                  label="Run to include"
                  value={invocationId}
                  disabled={busy}
                  onChange={(event) => setInvocationId(event.target.value)}
                  helperText="Sends this selected run’s payload to AxWise/Gemini for this message only. Credentials are excluded."
                  sx={{ mt: 1 }}
                >
                  {availableInvocations.map((item) => (
                    <MenuItem key={item.id} value={item.id}>
                      {item.status} · {item.mode} · {item.id.slice(0, 8)}
                      {item.workflowHash !== (selectedDraft?.workflowHash || context?.workflowHash)
                        ? ' · different workflow version'
                        : ''}
                    </MenuItem>
                  ))}
                </TextField>
              ) : (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  Optional data sharing only—not permission to edit. Run payloads stay private
                  unless you include one for this message.
                </Typography>
              )}
            </Box>
          ) : null}
        </Box>
      ) : null}
      <Stack direction="row" gap={1} justifyContent="flex-end" flexWrap="wrap">
        {busy ? (
          <Typography role="status" variant="caption" sx={{ alignSelf: 'center' }}>
            {sending ? 'Saving…' : uncertain ? 'Delivery unconfirmed' : 'Working…'}
          </Typography>
        ) : null}
        <Button
          type="button"
          variant="contained"
          disabled={actionDisabled || nativeEditing || clarificationNeedsRun}
          onClick={() => send('auto')}
        >
          {clarification ? 'Answer & continue' : 'Send'}
        </Button>
      </Stack>
    </>
  );
}

/** Presentation only: the Assistant uses Notices + Actions around its existing input. */
export function SolutionConversationComposer({ controller, inputRef }) {
  return (
    <Stack gap={1.25}>
      <SolutionConversationNotices controller={controller} />
      <SolutionConversationInput controller={controller} inputRef={inputRef} />
      <SolutionConversationActions controller={controller} />
    </Stack>
  );
}
