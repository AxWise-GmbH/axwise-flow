import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Typography,
} from '@mui/material';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import PageLayout from '../../components/Common/PageLayout';
import EmptyState from '../../components/Common/EmptyState';
import TaskAdmissionPanel from '../../components/AgenticControl/TaskAdmissionPanel';
import AgentTeamSummary from '../../components/AgenticControl/AgentTeamSummary';
import MemoryScopeSummary from '../../components/AgenticControl/MemoryScopeSummary';
import ResourceControlGroups from '../../components/AgenticControl/ResourceControlGroups';
import RunPlanTimeline from '../../components/AgenticControl/RunPlanTimeline';
import ApprovalPanel from '../../components/AgenticControl/ApprovalPanel';
import { agenticControlPlaneClient } from '../../services/agenticControlPlaneService';

const API_LIMITATIONS = {
  team: 'The current v1 control plane does not expose Agent-team membership details.',
  memory: 'The current v1 control plane does not expose memory scopes or routing decisions.',
  controls:
    'Run, Agent and schedule control endpoints are not exposed yet. These controls are view-only.',
  events: 'The current v1 control plane does not expose the run event timeline.',
};

const DISABLED_CONTROL_REASONS = {
  'run.pause': 'The current v1 control plane has no run pause endpoint.',
  'run.resume': 'The current v1 control plane has no run resume endpoint.',
  'run.cancel': 'The current v1 control plane has no run cancellation endpoint.',
  'agent.pause': 'The current v1 control plane has no Agent pause endpoint.',
  'agent.resume': 'The current v1 control plane has no Agent resume endpoint.',
  'agent.revoke': 'The current v1 control plane has no Agent revocation endpoint.',
  'schedule.activate': 'The current v1 control plane has no schedule activation endpoint.',
  'schedule.runNow': 'The current v1 control plane has no run-now endpoint.',
  'schedule.pause': 'The current v1 control plane has no schedule pause endpoint.',
  'schedule.resume': 'The current v1 control plane has no schedule resume endpoint.',
};

function agentId(agent) {
  return agent?.id || agent?.agent_id || '';
}

function agentLabel(agent, index = 0) {
  return agent?.display_name || agent?.displayName || `Agent ${index + 1}`;
}

function originatingRunId(agent) {
  return agent?.originating_run_id || agent?.originatingRunId || '';
}

function errorMessage(error, fallback) {
  return error?.message || fallback;
}

function agentsFromResponse(response) {
  if (response?.version !== 'orqaly_agent_list_v1' || !Array.isArray(response.agents)) {
    throw new Error('The control plane returned an invalid Agent-list response.');
  }
  return response.agents;
}

function runFromResponse(response) {
  if (
    response?.version !== 'orqaly_run_detail_v1' ||
    !response.run ||
    typeof response.run !== 'object'
  ) {
    throw new Error('The control plane returned an invalid run-detail response.');
  }
  return response.run;
}

function admissionFromResponse(response) {
  if (response?.version !== 'orqaly_task_admission_result_v1') {
    throw new Error('The control plane returned an invalid task-admission response.');
  }
  return response;
}

function approvalsFromResponse(response) {
  if (response?.version !== 'orqaly_approval_list_v1' || !Array.isArray(response.approvals)) {
    throw new Error('The control plane returned an invalid approval-list response.');
  }
  return response.approvals;
}

function approvalDecisionFromResponse(response, approvalId) {
  if (
    response?.version !== 'orqaly_approval_decision_result_v1' ||
    response.approvalId !== approvalId ||
    !['approved', 'rejected'].includes(response.status)
  ) {
    throw new Error('The control plane returned an invalid approval-decision response.');
  }
  return response;
}

function operationIdempotencyKey(action, resourceId) {
  const nonce = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  return `agentic-control:${action}:${resourceId}:${nonce}`;
}

function LoadingView({ label = 'Loading Agentic Control…' }) {
  return (
    <Box
      role="status"
      aria-live="polite"
      sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 6, gap: 1.5 }}
    >
      <CircularProgress size={32} />
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
    </Box>
  );
}

export default function AgenticControlPage({ client = agenticControlPlaneClient }) {
  const [task, setTask] = useState('');
  const [stepKind, setStepKind] = useState('reason');
  const [descriptorKey, setDescriptorKey] = useState('');
  const [connectionKey, setConnectionKey] = useState('');
  const [admissionState, setAdmissionState] = useState('idle');
  const [admissionResult, setAdmissionResult] = useState(null);
  const [admissionError, setAdmissionError] = useState('');
  const [agents, setAgents] = useState([]);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [listState, setListState] = useState('loading');
  const [listError, setListError] = useState('');
  const [run, setRun] = useState(null);
  const [loadedRunId, setLoadedRunId] = useState('');
  const [runState, setRunState] = useState('idle');
  const [runError, setRunError] = useState('');
  const [approvals, setApprovals] = useState([]);
  const [approvalState, setApprovalState] = useState('idle');
  const [approvalError, setApprovalError] = useState('');
  const [pendingApprovalAction, setPendingApprovalAction] = useState('');
  const listEpoch = useRef(0);
  const runEpoch = useRef(0);
  const approvalEpoch = useRef(0);

  const loadAgents = useCallback(async () => {
    const epoch = ++listEpoch.current;
    setListState('loading');
    setListError('');
    try {
      const response = await client.listAgents({ limit: 50 });
      if (epoch !== listEpoch.current) return;
      const nextAgents = agentsFromResponse(response);
      setAgents(nextAgents);
      setSelectedAgentId((current) => {
        if (current && nextAgents.some((agent) => agentId(agent) === current)) return current;
        return agentId(nextAgents[0]);
      });
      setListState('ready');
    } catch (error) {
      if (epoch !== listEpoch.current) return;
      setAgents([]);
      setSelectedAgentId('');
      setListError(errorMessage(error, 'Materialized Agents could not be loaded.'));
      setListState('error');
    }
  }, [client]);

  const loadRun = useCallback(
    async (id) => {
      const epoch = ++runEpoch.current;
      setRunError('');
      if (!id) {
        setRun(null);
        setLoadedRunId('');
        setRunState('idle');
        return;
      }

      setRun(null);
      setLoadedRunId(id);
      setRunState('loading');
      try {
        const response = await client.getRun(id);
        if (epoch !== runEpoch.current) return;
        setRun(runFromResponse(response));
        setRunState('ready');
      } catch (error) {
        if (epoch !== runEpoch.current) return;
        setRun(null);
        setRunError(errorMessage(error, 'The originating run could not be loaded.'));
        setRunState('error');
      }
    },
    [client]
  );

  const loadApprovals = useCallback(
    async (runId) => {
      const epoch = ++approvalEpoch.current;
      setApprovalError('');
      if (!runId) {
        setApprovals([]);
        setApprovalState('idle');
        return;
      }
      setApprovalState('loading');
      try {
        const response = await client.listApprovals({ limit: 50, status: 'pending' });
        if (epoch !== approvalEpoch.current) return;
        setApprovals(
          approvalsFromResponse(response).filter(
            (approval) => (approval.run_id || approval.runId) === runId
          )
        );
        setApprovalState('ready');
      } catch (error) {
        if (epoch !== approvalEpoch.current) return;
        setApprovals([]);
        setApprovalError(errorMessage(error, 'Pending approvals could not be loaded.'));
        setApprovalState('error');
      }
    },
    [client]
  );

  useEffect(() => {
    const epoch = ++listEpoch.current;
    client
      .listAgents({ limit: 50 })
      .then((response) => {
        if (epoch !== listEpoch.current) return;
        const nextAgents = agentsFromResponse(response);
        setAgents(nextAgents);
        setSelectedAgentId(agentId(nextAgents[0]));
        setListState('ready');
      })
      .catch((error) => {
        if (epoch !== listEpoch.current) return;
        setAgents([]);
        setSelectedAgentId('');
        setListError(errorMessage(error, 'Materialized Agents could not be loaded.'));
        setListState('error');
      });
    return () => {
      listEpoch.current += 1;
    };
  }, [client]);

  const selectedAgent = useMemo(
    () => agents.find((agent) => agentId(agent) === selectedAgentId) || null,
    [agents, selectedAgentId]
  );
  const selectedRunId = originatingRunId(selectedAgent);

  useEffect(() => {
    const epoch = ++runEpoch.current;
    if (!selectedRunId) return undefined;

    client
      .getRun(selectedRunId)
      .then((response) => {
        if (epoch !== runEpoch.current) return;
        setRun(runFromResponse(response));
        setLoadedRunId(selectedRunId);
        setRunState('ready');
      })
      .catch((error) => {
        if (epoch !== runEpoch.current) return;
        setRun(null);
        setLoadedRunId(selectedRunId);
        setRunError(errorMessage(error, 'The originating run could not be loaded.'));
        setRunState('error');
      });
    return () => {
      runEpoch.current += 1;
    };
  }, [client, selectedRunId]);

  useEffect(() => {
    loadApprovals(selectedRunId);
    return () => {
      approvalEpoch.current += 1;
    };
  }, [loadApprovals, selectedRunId]);

  const currentRun = loadedRunId === selectedRunId ? run : null;
  const currentRunState = !selectedRunId
    ? 'idle'
    : loadedRunId === selectedRunId
      ? runState
      : 'loading';
  const currentRunError = loadedRunId === selectedRunId ? runError : '';

  const handleAdmission = useCallback(async () => {
    const title = task.trim();
    if (!title) return;
    setAdmissionState('loading');
    setAdmissionResult(null);
    setAdmissionError('');
    try {
      const response = await client.admitTask({
        version: 'orqaly_task_admission_request_v1',
        task: { title, description: '' },
        requestedSteps: [
          {
            stepKind,
            descriptorKey: descriptorKey.trim() || null,
            connectionKey: connectionKey.trim() || null,
          },
        ],
      });
      setAdmissionResult(admissionFromResponse(response));
      setAdmissionState('success');
    } catch (error) {
      setAdmissionError(errorMessage(error, 'The task could not be checked.'));
      setAdmissionState('error');
    }
  }, [client, connectionKey, descriptorKey, stepKind, task]);

  const handleApprovalDecision = useCallback(
    async (approvalId, decision, stateVersion) => {
      const actionKey = `${approvalId}:decision`;
      const idempotencyKey = operationIdempotencyKey(decision, approvalId);
      setPendingApprovalAction(actionKey);
      setApprovalError('');
      try {
        const response = await client.decideApproval(
          approvalId,
          {
            version: 'orqaly_approval_decision_request_v1',
            idempotencyKey,
            decision,
            reason:
              decision === 'approve'
                ? 'Approved in Agentic Control after reviewing the bound plan.'
                : 'Rejected in Agentic Control.',
          },
          stateVersion
        );
        approvalDecisionFromResponse(response, approvalId);
        await Promise.all([loadApprovals(selectedRunId), loadRun(selectedRunId), loadAgents()]);
      } catch (error) {
        setApprovalError(errorMessage(error, 'The approval decision could not be applied.'));
      } finally {
        setPendingApprovalAction('');
      }
    },
    [client, loadAgents, loadApprovals, loadRun, selectedRunId]
  );

  const planUnavailableReason =
    currentRunState === 'error' ? 'Run detail cannot be displayed until the request succeeds.' : '';

  return (
    <PageLayout
      title="Agentic Control"
      subtitle="See what delegated Agents may do, what they are doing and where your approval is required."
      explain={false}
    >
      <Stack spacing={1.5}>
        <TaskAdmissionPanel
          task={task}
          onTaskChange={setTask}
          stepKind={stepKind}
          onStepKindChange={setStepKind}
          descriptorKey={descriptorKey}
          onDescriptorKeyChange={setDescriptorKey}
          connectionKey={connectionKey}
          onConnectionKeyChange={setConnectionKey}
          onSubmit={handleAdmission}
          state={admissionState}
          result={admissionResult}
          error={admissionError}
        />

        <Box
          sx={{
            display: 'flex',
            alignItems: { xs: 'stretch', sm: 'center' },
            flexDirection: { xs: 'column', sm: 'row' },
            gap: 1,
          }}
        >
          <Box sx={{ flex: 1 }}>
            <Typography variant="h5">Materialized Agents</Typography>
            <Typography variant="body2" color="text.secondary">
              Production data comes only from the configured GCP control plane.
            </Typography>
          </Box>
          {agents.length > 0 ? (
            <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 260 } }}>
              <InputLabel id="agentic-agent-select-label">Selected Agent</InputLabel>
              <Select
                labelId="agentic-agent-select-label"
                value={selectedAgentId}
                label="Selected Agent"
                onChange={(event) => setSelectedAgentId(event.target.value)}
              >
                {agents.map((agent, index) => (
                  <MenuItem key={agentId(agent)} value={agentId(agent)}>
                    {agentLabel(agent, index)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          ) : null}
        </Box>

        {listState === 'loading' ? <LoadingView /> : null}

        {listState === 'error' ? (
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" onClick={loadAgents}>
                Retry
              </Button>
            }
          >
            {listError}
          </Alert>
        ) : null}

        {listState === 'ready' && agents.length === 0 ? (
          <EmptyState
            icon={SmartToyOutlinedIcon}
            title="No materialized Agents yet"
            description="Task admission only checks capability. An Agent appears here after a complete proposal is materialized through the control plane."
          />
        ) : null}

        {listState === 'ready' && selectedAgent ? (
          <>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
              <Typography variant="h5">{agentLabel(selectedAgent)}</Typography>
              <Chip
                size="small"
                label={String(selectedAgent.state || 'unknown').replaceAll('_', ' ')}
              />
              {selectedAgent.agent_kind ? (
                <Chip size="small" variant="outlined" label={selectedAgent.agent_kind} />
              ) : null}
              {currentRun?.state ? (
                <Chip
                  size="small"
                  variant="outlined"
                  label={`Run: ${String(currentRun.state).replaceAll('_', ' ')}`}
                />
              ) : null}
            </Stack>

            {!selectedRunId ? (
              <Alert severity="info">
                This Agent has no originating run reference, so no run detail can be requested.
              </Alert>
            ) : null}

            {currentRunState === 'loading' ? (
              <LoadingView label="Loading originating run…" />
            ) : null}

            {currentRunState === 'error' ? (
              <Alert
                severity="error"
                action={
                  <Button color="inherit" size="small" onClick={() => loadRun(selectedRunId)}>
                    Retry
                  </Button>
                }
              >
                {currentRunError}
              </Alert>
            ) : null}

            {currentRunState !== 'loading' ? (
              <>
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: {
                      xs: '1fr',
                      lg: 'minmax(0, 1fr) minmax(0, 1fr)',
                    },
                    gap: 1.5,
                  }}
                >
                  <AgentTeamSummary
                    team={null}
                    agent={selectedAgent}
                    teamReference={currentRun?.team_id}
                    teamUnavailableReason={API_LIMITATIONS.team}
                  />
                  <MemoryScopeSummary memory={null} unavailableReason={API_LIMITATIONS.memory} />
                </Box>

                <ResourceControlGroups
                  run={currentRun}
                  agent={selectedAgent}
                  schedule={null}
                  controls={{}}
                  disabledReasons={DISABLED_CONTROL_REASONS}
                  unavailableReason={API_LIMITATIONS.controls}
                />
                <RunPlanTimeline
                  run={currentRun}
                  events={[]}
                  eventsUnavailableReason={API_LIMITATIONS.events}
                  planUnavailableReason={planUnavailableReason}
                />
                <ApprovalPanel
                  approvals={approvals}
                  pendingAction={pendingApprovalAction}
                  onDecision={handleApprovalDecision}
                  actionError={approvalError}
                  unavailableReason={
                    approvalState === 'loading'
                      ? 'Loading pending approvals…'
                      : approvalState === 'error'
                        ? 'Pending approvals are unavailable until the request succeeds.'
                        : ''
                  }
                />
              </>
            ) : null}
          </>
        ) : null}
      </Stack>
    </PageLayout>
  );
}
