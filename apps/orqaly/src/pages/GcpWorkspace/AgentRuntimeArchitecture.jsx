import { Alert, Box, Button, Chip, Stack, Typography } from '@mui/material';
import { useId, useState } from 'react';

const STATE_PRESENTATION = Object.freeze({
  live: Object.freeze({
    label: 'Live',
    color: 'success',
    description: 'Connected product capability reported by the current view.',
  }),
  available: Object.freeze({
    label: 'Available',
    color: 'info',
    description: 'Usable now, but no Agent run is selected for this view.',
  }),
  recorded: Object.freeze({
    label: 'Run recorded',
    color: 'info',
    description: 'A tenant-scoped run record is present; this is not a runtime health signal.',
  }),
  checking: Object.freeze({
    label: 'Checking',
    color: 'default',
    description: 'Current runtime readiness has not returned yet.',
  }),
  not_verified: Object.freeze({
    label: 'Not verified',
    color: 'warning',
    description: 'A contract exists, but this status response does not prove a live connection.',
  }),
  locked: Object.freeze({
    label: 'Locked',
    color: 'warning',
    description: 'The product cannot dispatch this step in the current release.',
  }),
  unavailable: Object.freeze({
    label: 'Unavailable',
    color: 'error',
    description: 'Readiness could not be verified, so execution fails closed.',
  }),
});

function readable(value, fallback = 'not reported') {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  return value.replaceAll('_', ' ');
}

function runtimeDependentState({ loading, error, runtime, ready }) {
  if (loading) return 'checking';
  if (error || !runtime || runtime.configured !== true) return 'unavailable';
  return ready ? 'live' : 'locked';
}

function buildNodes({ runtime, agent, latestRun, loading, error }) {
  const controlPlaneReady =
    runtime?.configured === true && runtime?.controlPlane?.status === 'ready';
  const n8nReady = runtime?.execution?.enabled === true && runtime?.execution?.connected === true;
  const internalRecordConfigured =
    !loading &&
    !error &&
    runtime?.execution?.internalActions?.includes('operational_record_create_v1');
  const profileState = agent
    ? 'live'
    : runtimeDependentState({ loading, error, runtime, ready: controlPlaneReady });
  const n8nState =
    internalRecordConfigured && !n8nReady
      ? 'not_verified'
      : runtimeDependentState({ loading, error, runtime, ready: n8nReady });
  const selectedRunStatus = latestRun?.state || latestRun?.status;
  const profileVersion = agent?.profileVersion
    ? `Profile v${agent.profileVersion}`
    : 'An immutable profile version';
  const agentName = agent?.name || 'The selected Agent';

  return [
    {
      id: 'orqaly',
      category: 'Customer control',
      title: 'Orqanix chat',
      state: 'live',
      body: 'The customer can create or select a named Agent, assign work, inspect Goal progress, and approve scope and plan artifacts. Exact external-effect approval is not exposed in this release.',
      boundary: 'Clerk user + Agent ID',
      next: 'selected Agent identity',
    },
    {
      id: 'identity',
      category: 'Agent control plane',
      title: 'Agent profile',
      state: profileState,
      body: agent
        ? `${profileVersion} for ${agentName} is loaded in this user-scoped view. Profile identity and instructions do not grant tools or external authority.`
        : controlPlaneReady
          ? 'The Agent control plane reports ready. It stores versioned identity and instructions within the tenant, workspace, and user boundary.'
          : 'No ready Agent control-plane status is available. Agent identity operations should be treated as unavailable until the check succeeds.',
      boundary: 'Exact profile snapshot',
      next: 'bounded profile + task',
    },
    {
      id: 'axwise',
      category: 'Reasoning contract',
      title: 'Reasoning service',
      state: 'not_verified',
      body: 'Agent and Goal contracts identify a reasoning service, but the runtime-status response has no connectivity signal for it. This view therefore does not claim that reasoning execution is live.',
      boundary: 'No external authority',
      next: 'reasoning result',
    },
    {
      id: 'workflow',
      category: 'Task record',
      title: 'Orqanix Goal workflow',
      state: latestRun ? 'recorded' : 'available',
      body: latestRun
        ? `Run ${latestRun.id || latestRun.runId || 'withheld'} is ${readable(selectedRunStatus)}. Its task history is separate from the reusable Agent profile.`
        : 'Goal workflows are available for scoped assignments. No Agent run is selected in this view.',
      boundary: 'Tenant + user + run',
      next: 'separate exact action intent',
    },
    {
      id: 'approval',
      category: 'Required product gate',
      title: 'Exact action approval',
      state: internalRecordConfigured ? 'available' : 'locked',
      body: internalRecordConfigured
        ? 'Completed Goals expose Prepare exact action and Approve and run in their existing chat. Approval currently permits one internal operational record only; SMS, email, GitHub and other external effects remain locked.'
        : 'Current Goal controls approve scope or plan artifacts only. An SMS, email, GitHub, CRM, or other external effect still needs a separate action-intent approval API and UI before it can dispatch.',
      boundary: 'Verified human + exact effect',
      next: 'short-lived scoped grant',
    },
    {
      id: 'n8n',
      category: 'Private execution adapter',
      title: 'Private self-hosted n8n',
      state: n8nState,
      body: internalRecordConfigured
        ? 'The API is configured to send an exactly approved internal record action through private self-hosted n8n. Configuration is not a live execution proof; inspect the saved signed result in the Goal chat.'
        : n8nReady && !loading && !error
          ? 'The runtime reports n8n connected and enabled. That proves adapter readiness only; it does not approve a provider effect or grant credentials.'
          : `Private n8n dispatch is ${readable(runtime?.execution?.status, 'not connected')} and treated as locked. No customer dispatch control is exposed while execution is not both connected and enabled.`,
      boundary: 'Private service + separate database',
      next: 'opaque grant only',
    },
    {
      id: 'gateway',
      category: 'Required release gate',
      title: 'Tool Gateway',
      state: internalRecordConfigured ? 'not_verified' : 'locked',
      body: internalRecordConfigured
        ? 'For the internal record action, the Gateway redeems a short-lived grant and atomically saves a tenant-scoped Cloud SQL record and signed receipt. The Goal chat verifies the signature. External connectors and automatic reconciliation remain unavailable.'
        : 'No Tool Gateway readiness signal or customer control is exposed by the current runtime API. Credentials, effect deduplication, signed receipts, and reconciliation therefore remain locked.',
      boundary: 'Credentials stay outside n8n',
      next: 'one approved effect',
    },
    {
      id: 'provider',
      category: 'External service',
      title: 'Approved service',
      state: 'locked',
      body: 'No provider connector is executable from this view. A future connection must be tenant-scoped and separately approved for the exact target and effect.',
      boundary: 'Exact target allowlist',
      next: null,
    },
  ];
}

function ArchitectureNode({ detailId, node, number, selected, onSelect }) {
  const state = STATE_PRESENTATION[node.state];
  return (
    <Button
      type="button"
      variant="outlined"
      aria-controls={detailId}
      aria-pressed={selected}
      onClick={() => onSelect(node.id)}
      sx={{
        width: '100%',
        minWidth: 0,
        minHeight: 150,
        display: 'block',
        textAlign: 'left',
        borderColor: selected ? 'primary.main' : 'divider',
        color: 'text.primary',
        bgcolor: selected ? 'action.selected' : 'background.paper',
        p: 1.5,
        textTransform: 'none',
        '&:hover': {
          borderColor: selected ? 'primary.main' : 'text.disabled',
          bgcolor: selected ? 'action.selected' : 'action.hover',
        },
      }}
    >
      <Stack spacing={1} alignItems="flex-start">
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          gap={1}
          width="100%"
        >
          <Typography variant="caption" color="text.secondary">
            Step {number}
          </Typography>
          <Chip
            size="small"
            color={state.color}
            variant={node.state === 'live' ? 'filled' : 'outlined'}
            label={state.label}
          />
        </Stack>
        <Box>
          <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.2 }}>
            {node.category}
          </Typography>
          <Typography variant="subtitle2" sx={{ mt: 0.35 }}>
            {node.title}
          </Typography>
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
          Boundary: {node.boundary}
        </Typography>
      </Stack>
    </Button>
  );
}

function RuntimeCheck({ runtime, loading, error, onRetry }) {
  if (loading) {
    return (
      <Alert severity="info" role="status">
        Checking current runtime readiness. External execution stays locked until the check
        succeeds.
      </Alert>
    );
  }
  if (error) {
    return (
      <Alert
        severity="warning"
        action={
          onRetry ? (
            <Button type="button" color="inherit" size="small" onClick={onRetry}>
              Retry runtime check
            </Button>
          ) : null
        }
      >
        Runtime readiness could not be checked. External execution is treated as locked.
        {error.message ? ` ${error.message}` : ''}
      </Alert>
    );
  }

  const controlPlaneReady =
    runtime?.configured === true && runtime?.controlPlane?.status === 'ready';
  const n8nReady = runtime?.execution?.enabled === true && runtime?.execution?.connected === true;
  const checkedAt = runtime?.checkedAt;
  return (
    <Alert severity={controlPlaneReady && n8nReady ? 'success' : 'warning'} role="status">
      <Typography variant="body2">
        Runtime checked
        {checkedAt ? (
          <>
            {' '}
            <Typography component="time" variant="inherit" dateTime={checkedAt}>
              {new Date(checkedAt).toLocaleString()}
            </Typography>
          </>
        ) : null}
        . Agent control plane: {controlPlaneReady ? 'ready' : 'unavailable'}. External execution:{' '}
        {n8nReady ? 'n8n connected and enabled' : 'locked'}.
      </Typography>
    </Alert>
  );
}

export function AgentRuntimeArchitecture({
  runtime = null,
  agent = null,
  latestRun = null,
  loading = false,
  error = null,
  onRetry,
}) {
  const [selectedId, setSelectedId] = useState('n8n');
  const detailId = useId();
  const detailHeadingId = useId();
  const nodes = buildNodes({ runtime, agent, latestRun, loading, error });
  const selected = nodes.find((node) => node.id === selectedId) || nodes[0];
  const selectedState = STATE_PRESENTATION[selected.state];
  const legendStates = [...new Set(nodes.map((node) => node.state))];

  return (
    <Stack spacing={2}>
      <RuntimeCheck runtime={runtime} loading={loading} error={error} onRetry={onRetry} />

      <Box component="section" aria-label="Readiness status legend">
        <Typography variant="subtitle2">Status legend</Typography>
        <Stack
          component="ul"
          direction="row"
          flexWrap="wrap"
          gap={1}
          sx={{ listStyle: 'none', p: 0, m: 0, mt: 1 }}
        >
          {legendStates.map((stateKey) => {
            const state = STATE_PRESENTATION[stateKey];
            return (
              <Stack component="li" direction="row" alignItems="center" gap={0.75} key={stateKey}>
                <Chip
                  size="small"
                  color={state.color}
                  variant={stateKey === 'live' ? 'filled' : 'outlined'}
                  label={state.label}
                />
                <Typography variant="caption" color="text.secondary">
                  {state.description}
                </Typography>
              </Stack>
            );
          })}
        </Stack>
      </Box>

      <Box
        component="ol"
        role="list"
        aria-label="Agent execution readiness flow"
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            md: 'repeat(2, minmax(0, 1fr))',
            xl: 'repeat(4, minmax(0, 1fr))',
          },
          gap: 1.25,
          listStyle: 'none',
          p: 0,
          m: 0,
        }}
      >
        {nodes.map((node, index) => (
          <Stack component="li" spacing={0.75} key={node.id} sx={{ minWidth: 0 }}>
            <ArchitectureNode
              detailId={detailId}
              node={node}
              number={index + 1}
              selected={selectedId === node.id}
              onSelect={setSelectedId}
            />
            {node.next ? (
              <Typography variant="caption" color="text.secondary" sx={{ px: 1 }}>
                <Box component="span" aria-hidden sx={{ mr: 0.5 }}>
                  ↓
                </Box>
                Next: {node.next}
              </Typography>
            ) : (
              <Typography variant="caption" color="text.secondary" sx={{ px: 1 }}>
                End of the currently defined path
              </Typography>
            )}
          </Stack>
        ))}
      </Box>

      <Box
        id={detailId}
        role="region"
        aria-live="polite"
        aria-atomic="true"
        aria-labelledby={detailHeadingId}
        sx={{ borderLeft: '3px solid', borderColor: 'primary.main', pl: 1.5, py: 0.25 }}
      >
        <Stack direction="row" alignItems="center" gap={0.75} flexWrap="wrap">
          <Typography id={detailHeadingId} variant="subtitle2">
            {selected.title}
          </Typography>
          <Chip
            size="small"
            color={selectedState.color}
            variant={selected.state === 'live' ? 'filled' : 'outlined'}
            label={selectedState.label}
          />
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {selected.body}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
          Boundary: {selected.boundary}
        </Typography>
      </Box>

      <Typography variant="caption" color="text.secondary">
        Isolation model: shared private services with tenant-scoped records. This view does not
        allocate a VM or container per customer or Agent, and it does not expose an external-action
        control until that path is implemented and verified.
      </Typography>
    </Stack>
  );
}
