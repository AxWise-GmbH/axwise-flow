import { useId, useState } from 'react';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import {
  Box,
  Button,
  Chip,
  IconButton,
  Link,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import AssistantMarkdown from '../../components/VoiceControl/AssistantMarkdown.jsx';
import { CollapsibleMarkdownDocument } from '../../components/VoiceControl/CollapsibleMarkdownDocument.jsx';
import { AssistantDelegatedAgentCard } from './AssistantDelegatedAgentCard.jsx';
import { AssistantGoalCard } from './AssistantGoalCard.jsx';
import { AssistantOperationStatus } from './AssistantOperationStatus.jsx';
import {
  assistantArtifactDownloadMarkdown,
  assistantMessageEvidence,
  assistantMessageText,
  assistantRoutingProvenance,
} from './assistant-view-model.js';

const ROUTE_LABELS = {
  DIRECT_ANSWER: 'Assistant',
  DISCOVER: 'Assistant',
  AXWISE_ONE_SHOT: 'Research',
  PROPOSE_GOAL: 'Goal proposed',
  START_GOAL: 'Goal created',
  CONTINUE_GOAL: 'Goal continued',
};

const SCREEN_READER_ONLY = {
  border: 0,
  clip: 'rect(0 0 0 0)',
  height: 1,
  margin: -1,
  overflow: 'hidden',
  padding: 0,
  position: 'absolute',
  whiteSpace: 'nowrap',
  width: 1,
};

function downloadMarkdown(title, markdown) {
  const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${
    title
      .toLocaleLowerCase()
      .replace(/[^a-z0-9]+/gu, '-')
      .replace(/^-|-$/gu, '') || 'assistant-result'
  }.md`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function messageTime(createdAt) {
  const value = new Date(createdAt);
  if (Number.isNaN(value.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(value);
}

function ArtifactPart({ part, sources }) {
  const genericTitle = /^(?:research result|result artifact|assistant result)$/iu.test(
    part.title.trim()
  );
  return (
    <Box component="section" aria-label={genericTitle ? 'Research report' : part.title}>
      <Stack spacing={1}>
        {!genericTitle ? (
          <Typography component="p" variant="subtitle2">
            {part.title}
          </Typography>
        ) : null}
        <CollapsibleMarkdownDocument
          text={part.markdown}
          previewBlocks={6}
          openLabel="Open full report"
          closeLabel="Show less"
          testId="assistant-artifact-preview"
          endAction={
            <Button
              size="small"
              onClick={() =>
                downloadMarkdown(
                  part.title,
                  assistantArtifactDownloadMarkdown(part.markdown, sources)
                )
              }
              sx={{ minWidth: 0, px: 0, py: 0.25, textTransform: 'none' }}
            >
              Download .md
            </Button>
          }
        />
      </Stack>
    </Box>
  );
}

function CitationLinks({ sources }) {
  if (!sources.length) return null;
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        gap: 0.25,
        ml: 0.5,
        position: 'relative',
        top: '-0.22em',
      }}
    >
      {sources.map((source) => (
        <Link
          key={source.url}
          href={source.url}
          target="_blank"
          rel="noreferrer"
          aria-label={`Source ${source.number}: ${source.title}`}
          sx={{
            fontSize: '0.6875rem',
            fontWeight: 650,
            lineHeight: 1,
            textDecoration: 'none',
          }}
        >
          [{source.number}]
        </Link>
      ))}
    </Box>
  );
}

function evidenceClaimMarkdown(statement) {
  return String(statement)
    .replace(/^\s{0,3}#{1,6}(?:[\t ]+|$)/gmu, '')
    .replace(/^\s{0,3}(?:=+|-+)\s*$/gmu, '');
}

function SourcesEvidenceDisclosure({ evidence, discloseEmptyResearch = false }) {
  const [expanded, setExpanded] = useState(false);
  const buttonId = useId();
  const contentId = useId();
  const sourceCount = evidence.citedSources.length;
  const claimCount = evidence.supportedClaimCount;
  const gapCount = evidence.uncitedClaimCount + evidence.unmatchedClaimCount;
  const hasContent = evidence.sources.length > 0 || evidence.claims.length > 0;
  if (!hasContent && !discloseEmptyResearch) return null;

  return (
    <Box
      component="section"
      aria-labelledby={buttonId}
      sx={{ borderBlock: '1px solid', borderColor: 'divider', py: 0.25 }}
    >
      <Typography component="h2" variant="inherit" sx={{ m: 0 }}>
        <Button
          id={buttonId}
          color="inherit"
          size="small"
          aria-expanded={expanded}
          aria-controls={contentId}
          onClick={() => setExpanded((value) => !value)}
          sx={{
            justifyContent: 'flex-start',
            minHeight: 36,
            px: 0,
            textTransform: 'none',
            width: '100%',
          }}
        >
          Sources &amp; evidence · {sourceCount} {sourceCount === 1 ? 'source' : 'sources'} ·{' '}
          {claimCount} supported {claimCount === 1 ? 'claim' : 'claims'}
          {gapCount ? ` · ${gapCount} to review` : ''}
          <ExpandMoreRoundedIcon
            aria-hidden="true"
            sx={{
              fontSize: 18,
              ml: 'auto',
              transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 150ms ease',
              '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
            }}
          />
        </Button>
      </Typography>
      {expanded ? (
        <Stack id={contentId} spacing={2} sx={{ pb: 1.5, pt: 0.75 }}>
          {sourceCount === 0 ? (
            <Box component="aside" role="note" aria-label="Research evidence gap">
              <Typography component="h3" variant="subtitle2" color="warning.main">
                {evidence.discoveredSources.length
                  ? 'Returned pages are not linked to a claim'
                  : 'No verifiable sources were returned'}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                This result has no fully matched claim evidence. Verify it before relying on claims
                that require current or authoritative information.
              </Typography>
            </Box>
          ) : null}

          {evidence.citedSources.length ? (
            <Box>
              <Typography component="h3" variant="subtitle2">
                Cited sources
              </Typography>
              <Stack component="ol" spacing={1.25} sx={{ listStyle: 'none', pl: 0, mb: 0, mt: 1 }}>
                {evidence.citedSources.map((source) => (
                  <Box component="li" key={source.url} sx={{ display: 'flex', gap: 1 }}>
                    <Typography
                      component="span"
                      aria-hidden="true"
                      sx={{ color: 'text.secondary', fontSize: '0.6875rem', pt: 0.3 }}
                    >
                      [{source.number}]
                    </Typography>
                    <Box sx={{ minWidth: 0 }}>
                      <Link href={source.url} target="_blank" rel="noreferrer" underline="hover">
                        {source.title}
                      </Link>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ display: 'block' }}
                      >
                        {[source.hostname, ...source.sourceTypeLabels].join(' · ')}
                      </Typography>
                    </Box>
                  </Box>
                ))}
              </Stack>
            </Box>
          ) : null}

          {evidence.claims.length ? (
            <Box>
              <Typography component="h3" variant="subtitle2">
                Evidence coverage{gapCount ? ` · ${gapCount} need review` : ''}
              </Typography>
              <Stack component="ul" spacing={1.5} sx={{ pl: 2.5, mb: 0, mt: 1 }}>
                {evidence.claims.map((claim, index) => (
                  <Box component="li" key={`${claim.statement}:${index}`}>
                    <Stack direction="row" alignItems="flex-start" gap={0.25}>
                      <Box sx={{ minWidth: 0 }}>
                        <AssistantMarkdown
                          text={evidenceClaimMarkdown(claim.statement)}
                          variant="conversation"
                        />
                      </Box>
                      {claim.citationSources.length ? (
                        <CitationLinks sources={claim.citationSources} />
                      ) : null}
                    </Stack>
                    {claim.status === 'uncited' ? (
                      <Typography variant="caption" color="warning.main">
                        Uncited · not counted as supported
                      </Typography>
                    ) : null}
                    {claim.status === 'unmatched' ? (
                      <Typography variant="caption" color="warning.main">
                        Citation not matched to a returned source · not counted as supported
                      </Typography>
                    ) : null}
                  </Box>
                ))}
              </Stack>
            </Box>
          ) : null}

          {evidence.discoveredSources.length ? (
            <Box>
              <Typography component="h3" variant="subtitle2">
                Other discovered sources ({evidence.discoveredSources.length})
              </Typography>
              <Typography variant="caption" color="text.secondary">
                These pages were returned during discovery but are not linked to a claim in this
                answer.
              </Typography>
              <Stack component="ul" spacing={1} sx={{ pl: 2.5, mb: 0, mt: 1 }}>
                {evidence.discoveredSources.map((source) => (
                  <Box component="li" key={source.url}>
                    <Link href={source.url} target="_blank" rel="noreferrer" underline="hover">
                      {source.title}
                    </Link>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                      {[source.hostname, ...source.sourceTypeLabels].join(' · ')}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            </Box>
          ) : null}
        </Stack>
      ) : null}
    </Box>
  );
}

function MessagePart({
  part,
  sources,
  busy,
  client,
  onOpenGoal,
  onStartGoal,
  onGoalStatusChange,
  liveGoal = true,
  goalAlreadyStarted = false,
  agent = null,
  buildAgentId,
  onOpenWorkflow,
  onOpenBuild,
  workflowRunIds,
}) {
  if (part.type === 'text') {
    return <AssistantMarkdown text={part.markdown} variant="conversation" />;
  }
  if (part.type === 'artifact') return <ArtifactPart part={part} sources={sources} />;
  if (part.type === 'delegated_agent') {
    return <AssistantDelegatedAgentCard part={part} agent={agent} />;
  }
  if (part.type === 'recommendation') {
    if (part.kind !== 'consider_goal') return null;
    return (
      <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 1 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1}>
          <Typography variant="body2">{part.summary}</Typography>
          <Button
            size="small"
            variant="outlined"
            disabled={busy || goalAlreadyStarted}
            onClick={() => onStartGoal(part.summary)}
          >
            {goalAlreadyStarted ? 'Agent delegated' : 'Delegate to Agent'}
          </Button>
        </Stack>
      </Paper>
    );
  }
  if (part.type === 'goal_link') {
    if (!liveGoal) {
      return (
        <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1}>
            <Box>
              <Typography variant="subtitle2">{part.label}</Typography>
              <Typography variant="caption" color="text.secondary">
                Earlier update for this Goal · open its live card below
              </Typography>
            </Box>
            <Button size="small" variant="outlined" onClick={() => onOpenGoal(part.runId)}>
              Open advanced details
            </Button>
          </Stack>
        </Paper>
      );
    }
    return (
      <AssistantGoalCard
        client={client}
        runId={part.runId}
        label={part.label}
        initialStatus={part.status}
        onOpenAdvanced={onOpenGoal}
        onStatusChange={onGoalStatusChange}
        buildAgentId={buildAgentId}
        onOpenWorkflow={onOpenWorkflow}
        onOpenBuild={onOpenBuild}
        hasSavedWorkflow={workflowRunIds?.has(part.runId)}
      />
    );
  }
  if (part.type === 'approval') {
    return (
      <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 1 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1}>
          <Box>
            <Typography variant="subtitle2">{part.prompt}</Typography>
            <Typography variant="caption" color="text.secondary">
              An Agent runs this as a Goal with durable steps, progress, and approvals. Nothing
              starts until you confirm.
            </Typography>
          </Box>
          <Button
            size="small"
            variant="contained"
            disabled={busy || goalAlreadyStarted}
            onClick={() => onStartGoal(part.request)}
          >
            {goalAlreadyStarted ? 'Agent delegated' : 'Delegate to Agent'}
          </Button>
        </Stack>
      </Paper>
    );
  }
  return null;
}

function latestTerminalActivityEvent(events) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (['completed', 'failed', 'cancelled'].includes(events[index].type)) return events[index];
  }
  return null;
}

function messagePartKey(part, index) {
  if (part.type === 'goal_link') return `goal:${part.runId}`;
  if (part.type === 'delegated_agent') return `agent:${part.id || part.runId}`;
  if (part.type === 'artifact') return `artifact:${part.contentType}:${part.title}`;
  if (part.type === 'approval') return `approval:${part.action}:${part.request}`;
  if (part.type === 'recommendation') return `recommendation:${part.kind}:${part.summary}`;
  return `${part.type}:${index}`;
}

function RoutingProvenance({ message }) {
  const provenance = assistantRoutingProvenance(message);
  return (
    <Tooltip title={provenance.detail} arrow describeChild enterTouchDelay={500}>
      <Chip
        size="small"
        variant="outlined"
        label={provenance.label}
        tabIndex={0}
        data-testid="assistant-routing-provenance"
        aria-label={`Routing: ${provenance.label}. ${provenance.detail}`}
        sx={{
          height: 22,
          maxWidth: { xs: 190, sm: 'none' },
          '& .MuiChip-label': { px: 0.75, overflow: 'hidden', textOverflow: 'ellipsis' },
        }}
      />
    </Tooltip>
  );
}

export function AssistantConversationMessage({
  message,
  busy,
  client,
  activityEvents,
  onOpenGoal,
  onRetry,
  onStartGoal,
  retryAvailable,
  attemptNumber = 1,
  attemptCount = 1,
  liveGoalLinkKeys,
  agents = [],
  onGoalStatusChange,
  startedGoalRequests,
  onOpenWorkflow,
  onOpenBuild,
  workflowRunIds,
}) {
  const [copyStatus, setCopyStatus] = useState(null);
  const user = message.role === 'user';
  const copyValue = assistantMessageText(message);
  const createdAt = messageTime(message.createdAt);
  const evidence = assistantMessageEvidence(message);
  const sources = evidence.citedSources;
  const hasResearchResult = message.parts.some(
    (part) => part.type === 'text' || part.type === 'artifact'
  );
  const hasResearchEvidence = hasResearchResult ? evidence.supportedClaimCount > 0 : null;
  const operationPart = message.parts.find((part) => part.type === 'operation_status');
  const terminalEvent = latestTerminalActivityEvent(activityEvents);
  const staleActiveOperation =
    operationPart && ['accepted', 'running', 'cancel_requested'].includes(operationPart.status);
  const activityPart =
    terminalEvent && (!operationPart || staleActiveOperation)
      ? {
          ...operationPart,
          type: 'operation_status',
          status: terminalEvent.type,
          retryMode: terminalEvent.type === 'failed' ? 'none' : operationPart?.retryMode,
        }
      : operationPart;
  const visibleParts = message.parts.filter(
    (part) => !['fact', 'operation_status', 'source'].includes(part.type)
  );
  const activityAfterAnswer =
    !user &&
    activityPart &&
    hasResearchResult &&
    ['completed', 'failed', 'cancelled'].includes(activityPart.status);
  const hasDelegatedAgent = message.parts.some((part) => part.type === 'delegated_agent');
  const assistantRouteLabel =
    !user && (!['DIRECT_ANSWER', 'DISCOVER'].includes(message.route) || attemptCount > 1)
      ? `${hasDelegatedAgent ? 'Agent delegated' : ROUTE_LABELS[message.route] || message.route}${
          attemptCount > 1 ? ` · Attempt ${attemptNumber}` : ''
        }`
      : null;

  return (
    <Box
      component="article"
      aria-label={`${user ? 'You' : 'Assistant'} message`}
      sx={{
        alignSelf: user ? 'flex-end' : 'stretch',
        maxWidth: user ? { xs: '100%', md: 640 } : '100%',
        bgcolor: user ? 'action.selected' : 'transparent',
        border: user ? '1px solid' : 'none',
        borderColor: user ? 'divider' : 'transparent',
        borderRadius: user ? 2 : 0,
        px: user ? 1.5 : { xs: 0.25, sm: 0.5 },
        py: user ? 1.25 : 0.5,
      }}
    >
      <Stack spacing={user ? 1 : 1.25}>
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          flexWrap="wrap"
          gap={0.5}
        >
          {user ? (
            <Stack direction="row" alignItems="center" gap={0.75}>
              <Typography variant="caption" color="text.secondary">
                You
              </Typography>
              <RoutingProvenance message={message} />
            </Stack>
          ) : (
            <Stack direction="row" alignItems="center" gap={0.75}>
              <Typography component="span" sx={SCREEN_READER_ONLY}>
                Assistant
              </Typography>
              {assistantRouteLabel ? (
                <Chip
                  size="small"
                  variant="outlined"
                  label={assistantRouteLabel}
                  sx={{ height: 22, '& .MuiChip-label': { px: 0.75 } }}
                />
              ) : null}
            </Stack>
          )}
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="flex-end"
            gap={0.5}
            sx={{ ml: 'auto' }}
          >
            {createdAt ? (
              <Typography variant="caption" color="text.secondary">
                {createdAt}
              </Typography>
            ) : null}
            {copyValue && navigator.clipboard?.writeText ? (
              <Tooltip title={`Copy ${user ? 'your message' : 'response'}`}>
                <IconButton
                  size="small"
                  color="inherit"
                  aria-label={`Copy ${user ? 'your message' : 'response'}`}
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(copyValue);
                      setCopyStatus('Copied');
                    } catch {
                      setCopyStatus('Copy failed');
                    }
                  }}
                  sx={{ width: 30, height: 30 }}
                >
                  <ContentCopyRoundedIcon sx={{ fontSize: 15 }} />
                </IconButton>
              </Tooltip>
            ) : null}
            {copyStatus ? (
              <Typography
                variant="caption"
                color={copyStatus === 'Copied' ? 'text.secondary' : 'error'}
                role="status"
                aria-live="polite"
              >
                {copyStatus}
              </Typography>
            ) : null}
          </Stack>
        </Stack>
        {!user && activityPart && !activityAfterAnswer ? (
          <AssistantOperationStatus
            key={
              ['completed', 'failed', 'cancelled'].includes(activityPart.status)
                ? 'terminal'
                : 'active'
            }
            part={activityPart}
            route={message.route}
            events={activityEvents}
            busy={busy}
            hasResearchEvidence={hasResearchEvidence}
            onRetry={() => onRetry(message.turnId)}
            retryAvailable={retryAvailable}
          />
        ) : null}
        {visibleParts.map((part, index) => (
          <MessagePart
            key={messagePartKey(part, index)}
            part={part}
            agent={
              part.type === 'delegated_agent' ? agents.find((agent) => agent.id === part.id) : null
            }
            sources={sources}
            busy={busy}
            client={client}
            buildAgentId={
              part.type === 'goal_link'
                ? message.parts.find(
                    (candidate) =>
                      candidate.type === 'delegated_agent' && candidate.runId === part.runId
                  )?.id
                : undefined
            }
            onOpenGoal={onOpenGoal}
            onOpenWorkflow={onOpenWorkflow}
            onOpenBuild={onOpenBuild}
            workflowRunIds={workflowRunIds}
            onStartGoal={onStartGoal}
            onGoalStatusChange={onGoalStatusChange}
            liveGoal={part.type !== 'goal_link' || liveGoalLinkKeys.has(`${message.id}:${index}`)}
            goalAlreadyStarted={
              (part.type === 'approval' && startedGoalRequests.has(part.request.trim())) ||
              (part.type === 'recommendation' &&
                part.kind === 'consider_goal' &&
                startedGoalRequests.has(part.summary.trim()))
            }
          />
        ))}
        {!user ? (
          <SourcesEvidenceDisclosure
            evidence={evidence}
            discloseEmptyResearch={message.route === 'AXWISE_ONE_SHOT' && hasResearchResult}
          />
        ) : null}
        {!user && activityPart && activityAfterAnswer ? (
          <AssistantOperationStatus
            key="terminal"
            part={activityPart}
            route={message.route}
            events={activityEvents}
            busy={busy}
            hasResearchEvidence={hasResearchEvidence}
            onRetry={() => onRetry(message.turnId)}
            retryAvailable={retryAvailable}
          />
        ) : null}
      </Stack>
    </Box>
  );
}
