import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { Box, CssBaseline, ThemeProvider } from '@mui/material';
import { getEnterpriseTheme } from '../../src/theme/enterpriseTheme.js';
import { AssistantSurface } from '../../src/pages/WorkflowV2/AssistantSurface.jsx';
window.addEventListener('error', (event) =>
  console.error('UI fixture error', event.message, event.error?.stack)
);

const threadId = '10000000-0000-4000-8000-000000000001';
const runId = '20000000-0000-4000-8000-000000000001';
const solutionId = '30000000-0000-4000-8000-000000000001';
const buildId = '40000000-0000-4000-8000-000000000001';
const revisionId = '50000000-0000-4000-8000-000000000001';
const hash = 'a'.repeat(64),
  bundleHash = 'b'.repeat(64);
const scope = {
  targets: [{ nodeId: 'send', method: 'POST', destination: 'https://receiver.example.org/alerts' }],
};
const spec = {
  kind: 'n8n_workflow_v2',
  connections: [],
  acceptanceCases: [{ id: 'contact', input: { name: 'Ada' } }],
  ownedDependencies: [
    {
      id: 'error-handler',
      workflow: { name: 'Handle failure', nodes: [] },
      spec: { connections: [] },
    },
  ],
};
const solution = {
  id: solutionId,
  buildRequestId: buildId,
  version: 1,
  rowVersion: 1,
  agent: { id: '80000000-0000-4000-8000-000000000001', name: 'Contact operations agent' },
  environment: {
    name: 'Synthetic isolated environment',
    region: 'local',
    isolation: 'UI-only fixture',
    capacity: 'No provider calls',
  },
  name: 'Contact intake',
  purpose: 'Accept a contact, normalize it and return a usable result.',
  status: 'active',
  spec,
  workflow: { nodes: [], connections: {} },
  workflowHash: hash,
  deployment: { workflowId: 'synthetic-only' },
};
let draft = {
  id: revisionId,
  solutionId,
  version: 2,
  baseVersion: 1,
  rowVersion: 3,
  status: 'draft',
  spec,
  workflow: solution.workflow,
  workflowHash: hash,
  bundleHash,
  testedAt: null,
};
const buildRequest = {
  id: buildId,
  solutionId,
  runId,
  rowVersion: 4,
  name: solution.name,
  status: 'completed',
  source: { threadId },
};
let saved = false,
  probes = [],
  turns = [];
const requirement = () => ({
  id: 'notify',
  service: 'Test alert receiver',
  credentialType: 'orqalyBoundedHttp',
  nodeIds: ['send'],
  dependencyId: 'error-handler',
  status: saved ? 'saved' : 'missing',
  canConnect: !saved,
  canRevoke: saved,
  inherited: false,
  connectionId: saved ? '60000000-0000-4000-8000-000000000001' : null,
  scope,
  scopeHash: 'c'.repeat(64),
  fields: [
    { name: 'name', label: 'Header name', type: 'text', required: true },
    { name: 'value', label: 'API key', type: 'secret', required: true },
  ],
});
const setup = () => ({
  revision: structuredClone(draft),
  connectionRequirements: [requirement()],
  setup: { ready: saved, reason: saved ? '' : 'Connect the test alert receiver.' },
});
const conversation = () => ({
  solutionId,
  enabled: true,
  turns: structuredClone(turns),
  availableInvocations: [],
  context: { solutionVersion: 1, workflowHash: hash, selectedDraft: draft, availableDraft: draft },
});
const client = {
  assistantThreads: async () => ({
    threads: [{ id: threadId, title: 'Contact intake automation' }],
  }),
  assistantThread: async () => ({
    thread: { id: threadId },
    messages: [
      {
        id: '70000000-0000-4000-8000-000000000001',
        threadId,
        turnId: '71000000-0000-4000-8000-000000000001',
        role: 'user',
        route: 'DIRECT_ANSWER',
        createdAt: '2026-09-07T09:00:00Z',
        parts: [
          {
            type: 'text',
            markdown:
              'Create a workflow that accepts contact data and returns a normalized response.',
          },
        ],
      },
      {
        id: '70000000-0000-4000-8000-000000000002',
        threadId,
        turnId: '71000000-0000-4000-8000-000000000001',
        role: 'assistant',
        route: 'START_GOAL',
        workflowRunId: runId,
        createdAt: '2026-09-07T09:00:01Z',
        parts: [
          {
            type: 'text',
            markdown:
              'Your workflow is ready on the right. Ask for changes here, or edit its draft in n8n.',
          },
          { type: 'goal_link', runId, label: 'Contact intake task', status: 'completed' },
        ],
      },
    ],
  }),
  agents: async () => ({ agents: [] }),
  read: async () => ({
    workflow: {
      run: {
        id: runId,
        status: 'completed',
        rowVersion: 4,
        request: solution.purpose,
        evidenceReadiness: 'ready',
        finalArtifact: null,
      },
      stages: [],
      attempts: [],
      dependencies: [],
      approvals: [],
    },
  }),
  solutionBuildRequests: async () => ({ buildRequests: [buildRequest] }),
  solutionBuildRequest: async () => ({ buildRequest }),
  solution: async () => ({ solution, invocations: [], events: [] }),
  solutionRevisions: async () => ({ revisions: [structuredClone(draft)], invocations: [] }),
  createSolutionDraft: async () => ({ revision: draft, revisions: [draft] }),
  solutionRevisionSetup: async () => setup(),
  createSolutionRevisionConnection: async () => {
    saved = true;
    draft = {
      ...draft,
      rowVersion: draft.rowVersion + 1,
      workflowHash: 'd'.repeat(64),
      bundleHash: 'e'.repeat(64),
    };
    return setup();
  },
  revokeSolutionRevisionConnection: async () => {
    saved = false;
    draft = { ...draft, rowVersion: draft.rowVersion + 1 };
    return setup();
  },
  solutionFailureProbes: async () => ({ allowed: true, probes }),
  testSolutionFailureHandler: async () => {
    const probe = {
      id: crypto.randomUUID(),
      revisionId,
      sourceRowVersion: draft.rowVersion,
      sourceVersion: 2,
      workflowHash: draft.workflowHash,
      bundleHash: draft.bundleHash,
      coverage: 'handler_with_synthetic_failure',
      status: 'succeeded',
      cleanupState: 'removed',
    };
    probes.unshift(probe);
    return { probe };
  },
  solutionEndpoint: () => `${location.origin}/v2/solutions/${solutionId}`,
  nativeSolutionSession: async () => ({
    launchUrl: `${location.origin}/native-n8n/launch`,
    token: 'synthetic-ui-only',
  }),
  solutionConversation: async () => conversation(),
  sendSolutionConversationTurn: async (_id, command) => {
    turns.push({
      id: command.turnId,
      mode: 'ask',
      status: 'completed',
      message: command.message,
      reply: {
        markdown:
          'Synthetic UI response: your message stays in this conversation. No model or provider was called.',
      },
      baseWorkflowHash: hash,
      createdAt: new Date().toISOString(),
    });
    return conversation();
  },
};
createRoot(document.getElementById('root')).render(
  <ThemeProvider theme={getEnterpriseTheme('light')}>
    <CssBaseline />
    <MemoryRouter>
      <Box sx={{ px: { xs: 1, md: 2 }, height: '100dvh' }}>
        <Box sx={{ fontSize: 12, py: 1, color: 'text.secondary' }}>
          UI acceptance · synthetic data and native canvas. Real n8n is tested separately.
        </Box>
        <AssistantSurface
          client={client}
          onOpenGoal={() => {}}
          showThreadRail={false}
          routeSearch={`?thread=${threadId}&workflow=${solutionId}`}
        />
      </Box>
    </MemoryRouter>
  </ThemeProvider>
);
