import { useEffect, useState } from 'react';
import { Alert, Box, Button, Chip, LinearProgress, Paper, Stack, Typography } from '@mui/material';
import { GoalWorkflowViewResponseSchema } from '../../../shared/workflow-v2/goal-workflow-view-contract.js';
import { CollapsibleMarkdownDocument } from '../../components/VoiceControl/CollapsibleMarkdownDocument.jsx';
import { stageDisplayName } from '../../workflow-v2/view-model.js';

function sameContext(a, b) {
  return (
    a &&
    [
      'client',
      'runId',
      'rowVersion',
      'refreshKey',
      'authScopeKey',
      'ownerUserId',
      'selectionEpoch',
    ].every((key) => a[key] === b[key])
  );
}

function OutputContent({ client, reference }) {
  const [state, setState] = useState(null);
  useEffect(() => {
    let disposed = false;
    client
      .artifact(reference.runId, reference.artifactId)
      .then(async (response) => {
        if (disposed) return;
        const artifact = response?.artifact;
        if (
          !artifact ||
          ['artifactId', 'artifactHash', 'kind'].some((key) => artifact[key] !== reference[key]) ||
          (artifact.runId != null && artifact.runId !== reference.runId)
        ) {
          throw new Error('Output identity did not match its immutable reference.');
        }
        if (artifact.contentType === 'text/markdown') {
          // Preserve the established Goal Markdown loader's ETag proof in
          // addition to checking the exact JSON artifact ID/hash/kind above.
          const document = await client.artifact(reference.runId, reference.artifactId, {
            markdown: true,
            includeMetadata: true,
          });
          if (disposed) return;
          if (
            typeof document?.markdown !== 'string' ||
            document.etag !== `"sha256-${reference.artifactHash}"` ||
            document.markdown !== artifact.markdown
          ) {
            throw new Error('Output Markdown did not match its immutable reference.');
          }
        }
        if (!disposed) setState({ client, reference, artifact });
      })
      .catch(() => {
        if (!disposed) setState({ client, reference, error: true });
      });
    return () => {
      disposed = true;
    };
  }, [client, reference]);
  const current = state?.client === client && state?.reference === reference ? state : null;
  if (!current) return <LinearProgress aria-label="Loading selected output" />;
  if (current.error)
    return (
      <Alert severity="warning">
        This exact output could not be loaded. Close and reopen it to retry.
      </Alert>
    );
  if (
    current.artifact.contentType === 'text/markdown' &&
    typeof current.artifact.markdown === 'string'
  ) {
    return (
      <CollapsibleMarkdownDocument text={current.artifact.markdown} openLabel="Read full output" />
    );
  }
  if (current.artifact.payload == null)
    return <Alert severity="info">No displayable content is recorded for this output.</Alert>;
  return (
    <Box
      component="pre"
      sx={{
        m: 0,
        p: 1.5,
        bgcolor: 'action.hover',
        borderRadius: 1,
        fontSize: '0.75rem',
        whiteSpace: 'pre-wrap',
        overflowWrap: 'anywhere',
        maxHeight: 360,
        overflow: 'auto',
      }}
    >
      {JSON.stringify(current.artifact.payload, null, 2)}
    </Box>
  );
}

function MetadataView({ client, response }) {
  const [selectedOutput, setSelectedOutput] = useState(null);
  const { workflow, coverage } = response;
  const selected = workflow.outputs.find(
    (output) => output.reference.artifactId === selectedOutput
  );
  return (
    <Stack spacing={2}>
      <Stack direction="row" gap={1} flexWrap="wrap" alignItems="center">
        <Chip size="small" variant="outlined" label={workflow.status.label} />
        <Typography variant="caption" color="text.secondary">
          Metadata at row version {workflow.rowVersion}
        </Typography>
      </Stack>
      {!coverage.stages.complete && (
        <Alert severity="info">
          Only the first {coverage.stages.limit} stages are loaded. Outputs from later stages are
          not included.
        </Alert>
      )}
      <Box>
        <Typography variant="subtitle2" component="h3">
          Workflow
        </Typography>
        {!workflow.steps.length && (
          <Typography variant="body2" color="text.secondary">
            No stages are recorded in this view yet.
          </Typography>
        )}
        {/* Reserve two digits, punctuation and a gap inside the scroll clip. */}
        <Stack component="ol" spacing={1} sx={{ pl: '4ch', my: 1 }}>
          {workflow.steps.map((step) => (
            <Box component="li" key={step.id}>
              <Stack direction="row" gap={1} justifyContent="space-between" alignItems="baseline">
                <Typography variant="body2" sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                  {stageDisplayName(step)}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                  {step.status.label}
                </Typography>
              </Stack>
            </Box>
          ))}
        </Stack>
      </Box>
      <Box>
        <Typography variant="subtitle2" component="h3">
          Outputs
        </Typography>
        {!workflow.outputs.length && (
          <Typography variant="body2" color="text.secondary">
            {coverage.outputs.complete
              ? 'No immutable outputs are recorded yet.'
              : 'No output references are loaded in this partial view.'}
          </Typography>
        )}
        {!coverage.outputs.complete && (
          <Typography variant="caption" color="text.secondary">
            Output coverage is partial; missing metadata is not proof that no output exists.
          </Typography>
        )}
        <Stack component="ul" spacing={1.5} sx={{ pl: 0, my: 1, listStyle: 'none' }}>
          {workflow.outputs.map((output) => {
            const reference = output.reference;
            const incomplete = coverage.lineage.incompleteArtifactIds.includes(
              reference.artifactId
            );
            return (
              <Box
                component="li"
                key={reference.artifactId}
                sx={{ borderTop: '1px solid', borderColor: 'divider', pt: 1 }}
              >
                <Button
                  size="small"
                  onClick={() =>
                    setSelectedOutput(
                      selectedOutput === reference.artifactId ? null : reference.artifactId
                    )
                  }
                  aria-expanded={selectedOutput === reference.artifactId}
                  sx={{ px: 0, textTransform: 'none' }}
                >
                  {selectedOutput === reference.artifactId ? 'Close' : 'Open'}{' '}
                  {reference.kind.replaceAll('_', ' ')} output
                </Button>
                <Typography
                  variant="caption"
                  component="div"
                  color="text.secondary"
                  sx={{ overflowWrap: 'anywhere' }}
                >
                  Run {reference.runId} · Artifact {reference.artifactId} · SHA-256{' '}
                  {reference.artifactHash}
                </Typography>
                <Typography
                  variant="caption"
                  component="div"
                  color="text.secondary"
                  sx={{ overflowWrap: 'anywhere' }}
                >
                  {output.contentType || 'Content type not loaded'} · Input hash{' '}
                  {output.inputHash || 'not loaded'}
                </Typography>
                <Typography
                  variant="caption"
                  component="div"
                  color="text.secondary"
                  sx={{ overflowWrap: 'anywhere' }}
                >
                  {output.sourceArtifactIds === null
                    ? 'Lineage not loaded.'
                    : output.sourceArtifactIds.length
                      ? `Source artifact IDs${incomplete ? ' (partial)' : ''}: ${output.sourceArtifactIds.join(', ')}`
                      : 'No source artifact lineage recorded.'}
                </Typography>
                {incomplete && (
                  <Typography variant="caption" color="text.secondary">
                    Lineage is limited to {coverage.lineage.limitPerOutput} source IDs.
                  </Typography>
                )}
              </Box>
            );
          })}
        </Stack>
        {selected && (
          <OutputContent
            key={`${selected.reference.runId}:${selected.reference.artifactId}:${selected.reference.artifactHash}:${selected.reference.kind}`}
            client={client}
            reference={selected.reference}
          />
        )}
      </Box>
      <Typography variant="caption" color="text.secondary">
        Read-only metadata. Attempts, dependencies, approvals, and history are not loaded here.
        Output content loads only when opened. Completion status does not verify business value.
      </Typography>
    </Stack>
  );
}

// No timers: the existing selected-Goal poll supplies a bounded metadata key,
// including stage-only changes that leave run.rowVersion unchanged. Changing
// metadata, run, auth/session, client or selection immediately hides stale data.
export function GoalWorkflowOutputs({
  client,
  runId,
  rowVersion,
  refreshKey = '',
  ownerUserId,
  authScopeKey,
  selectionEpoch = 0,
}) {
  const [state, setState] = useState(null);
  const [refresh, setRefresh] = useState(0);
  const context = {
    client,
    runId,
    rowVersion,
    refreshKey,
    ownerUserId,
    authScopeKey,
    selectionEpoch,
  };
  useEffect(() => {
    if (!runId || !ownerUserId || !authScopeKey || typeof client?.goalWorkflowView !== 'function')
      return undefined;
    const requestContext = {
      client,
      runId,
      rowVersion,
      refreshKey,
      ownerUserId,
      authScopeKey,
      selectionEpoch,
    };
    let disposed = false;
    const controller = new AbortController();
    client
      .goalWorkflowView(runId, { signal: controller.signal })
      .then((value) => {
        const response = GoalWorkflowViewResponseSchema.parse(value);
        if (
          response.workflow.source.id !== runId ||
          response.workflow.scope.ownerUserId !== ownerUserId ||
          response.workflow.rowVersion < rowVersion
        )
          throw new Error('Stale or mismatched Goal metadata');
        if (!disposed) setState({ context: requestContext, response, refresh });
      })
      .catch(() => {
        if (!disposed) setState({ context: requestContext, error: true, refresh });
      });
    return () => {
      disposed = true;
      controller.abort();
    };
  }, [client, runId, rowVersion, refreshKey, ownerUserId, authScopeKey, selectionEpoch, refresh]);
  if (!runId || !ownerUserId || !authScopeKey || typeof client?.goalWorkflowView !== 'function')
    return null;
  const current = sameContext(state?.context, context) && state.refresh === refresh ? state : null;
  return (
    <Paper
      component="section"
      variant="outlined"
      aria-label="Goal Workflow and Outputs"
      sx={{ p: { xs: 2, sm: 3 }, minWidth: 0 }}
    >
      <Stack spacing={2}>
        <Typography variant="h6" component="h2">
          Workflow &amp; Outputs
        </Typography>
        {!current && <LinearProgress aria-label="Loading Workflow and Outputs" />}
        {current?.error && (
          <Alert
            severity="warning"
            action={
              <Button color="inherit" onClick={() => setRefresh((value) => value + 1)}>
                Retry metadata
              </Button>
            }
          >
            Workflow and output metadata is unavailable. Existing Goal controls are unchanged.
          </Alert>
        )}
        {current?.response && (
          <Box
            role="region"
            aria-label="Workflow and output metadata details"
            tabIndex={0}
            sx={{ maxHeight: { xs: 360, sm: 480 }, overflowY: 'auto', minWidth: 0, pr: 0.5 }}
          >
            <MetadataView
              key={`${authScopeKey}:${runId}:${selectionEpoch}:${rowVersion}:${refreshKey}`}
              client={client}
              response={current.response}
            />
          </Box>
        )}
      </Stack>
    </Paper>
  );
}
