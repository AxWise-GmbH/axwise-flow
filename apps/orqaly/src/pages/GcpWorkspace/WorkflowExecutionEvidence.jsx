import { Alert, Box, Chip, Stack, Typography } from '@mui/material';
import { executionHasUnknownOutcome } from './solution-presentation.js';

export default function WorkflowExecutionEvidence({ evidence, outputLabel = 'Test result' }) {
  if (!evidence) return null;
  const kind = evidence.kind || evidence.evidenceKind || evidence.testMode || evidence.mode;
  const mocked =
    ['mock', 'mocked', 'controlled_mock'].includes(kind) || evidence.mockedNodes?.length > 0;
  const staticOnly = ['static', 'validation'].includes(kind);
  const unknown = executionHasUnknownOutcome(evidence);
  const assertions = evidence.assertions || evidence.checks || [];
  const cases = Array.isArray(evidence.caseResults) ? evidence.caseResults : [];
  const failedChecks =
    assertions.some((item) => item.passed === false || item.status === 'failed') ||
    cases.some((item) => item.passed === false);
  const executionIds = cases.map((item) => item.executionId).filter(Boolean);
  const success =
    evidence.status === 'succeeded' &&
    (!!evidence.executionId ||
      (cases.length > 0 && cases.every((item) => item.passed === true && item.executionId))) &&
    !unknown &&
    !failedChecks;
  const failed = evidence.status === 'failed' || failedChecks;
  const title = unknown
    ? 'Outcome unknown. Check the execution history before another attempt; this request will not be automatically replayed.'
    : staticOnly
      ? 'Static checks only · no n8n execution'
      : failed
        ? 'Test failed · review the recorded diagnostics'
        : success
          ? `${mocked ? 'Mocked test completed' : evidence.mode === 'production' ? 'Production call succeeded' : cases.length ? 'Tests passed' : 'Test passed'} · n8n execution${cases.length > 1 ? 's' : ''} ${evidence.executionId || executionIds.join(', ')}`
          : evidence.status === 'queued'
            ? 'Test queued · you can leave this page. The worker will run this authorized draft and save the result.'
            : evidence.status === 'cancelled' && evidence.dispatched === false
              ? 'Queued test not dispatched · review the current draft before requesting another test.'
              : evidence.status === 'running'
                ? 'Execution in progress · waiting for verified evidence'
                : 'No verified n8n execution result is available yet.';
  return (
    <Stack gap={1.5} role="status" aria-live="polite" sx={{ minWidth: 0 }}>
      <Alert severity={unknown || failed ? 'warning' : success && !mocked ? 'success' : 'info'}>
        {title}
      </Alert>
      {['controlled_runtime', 'live_connection'].includes(kind) ? (
        <Typography variant="body2">
          {kind === 'controlled_runtime'
            ? 'Controlled runtime test · actual n8n execution within the authorized test scope.'
            : 'Live connection test · actual authorized provider actions may have occurred.'}
        </Typography>
      ) : null}
      {mocked ? (
        <Typography variant="body2">
          Mocked coverage is not proof of live provider actions.
          {evidence.mockedNodes?.length ? ` Mocked nodes: ${evidence.mockedNodes.join(', ')}.` : ''}
        </Typography>
      ) : null}
      {evidence.failedNode ? (
        <Typography variant="body2">
          Failed node:{' '}
          {typeof evidence.failedNode === 'string'
            ? evidence.failedNode
            : evidence.failedNode.name || evidence.failedNode.id}
        </Typography>
      ) : null}
      {evidence.diagnostics?.map((item, index) => (
        <Typography key={index} variant="body2" sx={{ overflowWrap: 'anywhere' }}>
          {item.message || item.code}
        </Typography>
      ))}
      {assertions.length ? (
        <Stack
          component="ul"
          gap={1}
          sx={{ m: 0, pl: 2.5 }}
          aria-label="Recorded acceptance results"
        >
          {assertions.map((item, index) => (
            <Box component="li" key={item.id || index}>
              <Chip
                size="small"
                label={
                  item.passed === true || item.status === 'passed'
                    ? 'Passed'
                    : item.passed === false || item.status === 'failed'
                      ? 'Failed'
                      : 'Not verified'
                }
              />{' '}
              <Typography component="span" variant="body2">
                {item.description || item.name || item.message || item.id}
              </Typography>
            </Box>
          ))}
        </Stack>
      ) : null}
      {cases.length ? (
        <Stack gap={2} aria-label="Recorded test cases">
          {cases.map((item) => (
            <Box
              key={item.id}
              sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5, minWidth: 0 }}
            >
              <Stack direction="row" flexWrap="wrap" gap={1} alignItems="center">
                <Typography variant="subtitle2">{item.id}</Typography>
                <Chip
                  size="small"
                  label={
                    item.passed === true && item.executionId
                      ? 'Passed'
                      : item.passed === false
                        ? 'Failed'
                        : 'Not verified'
                  }
                />
                <Typography variant="caption">
                  {item.executionId
                    ? `n8n execution ${item.executionId}`
                    : 'No verified execution receipt'}
                </Typography>
              </Stack>
              {item.issues?.map((issue, index) => (
                <Typography key={index} variant="body2">
                  {typeof issue === 'string' ? issue : issue.message || issue.code}
                </Typography>
              ))}
              <Box
                component="pre"
                aria-label={`Recorded case ${item.id} input and output`}
                sx={{ m: 0, mt: 1, fontSize: 12, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
              >
                {JSON.stringify(
                  {
                    input: item.input,
                    ...(!unknown && item.output !== undefined ? { output: item.output } : {}),
                  },
                  null,
                  2
                )}
              </Box>
            </Box>
          ))}
        </Stack>
      ) : null}
      {!staticOnly && !unknown && evidence.output !== undefined && evidence.output !== null ? (
        <Box
          component="pre"
          aria-label={outputLabel}
          sx={{
            m: 0,
            p: 2,
            bgcolor: 'action.hover',
            borderRadius: 1,
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
            fontSize: 13,
          }}
        >
          {JSON.stringify(evidence.output, null, 2)}
        </Box>
      ) : null}
    </Stack>
  );
}
