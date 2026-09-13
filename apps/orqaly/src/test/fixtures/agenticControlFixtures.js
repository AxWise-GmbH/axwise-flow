export const AGENT_ID = '11111111-1111-4111-8111-111111111111';
export const RUN_ID = '55555555-5555-4555-8555-555555555555';
export const APPROVAL_ID = '99999999-9999-4999-8999-999999999999';

export const admissionFixture = {
  version: 'orqaly_task_admission_result_v1',
  status: 'ready',
  task: { title: 'Prepare a cited market brief', description: '' },
  missing: [],
  executable: true,
  executionEnabled: false,
  dispatchable: false,
};

export const agentsFixture = {
  version: 'orqaly_agent_list_v1',
  agents: [
    {
      id: AGENT_ID,
      display_name: 'Market Research Agent',
      agent_kind: 'temporary',
      state: 'proposed',
      source_task_id: 'task-brief-1',
      source_decision_id: 'decision-1',
      project_id: 'project-1',
      conversation_id: 'conversation-1',
      originating_run_id: RUN_ID,
      expires_at: '2026-09-05T12:00:00.000Z',
      version: '1',
      persona_contract_version: 'axwise_executor_persona_v1',
      persona_id: 'market-research-persona',
      persona_content_hash: 'a'.repeat(64),
      created_at: '2026-09-04T10:00:00.000Z',
      updated_at: '2026-09-04T10:00:00.000Z',
    },
  ],
};

export const runFixture = {
  version: 'orqaly_run_detail_v1',
  run: {
    id: RUN_ID,
    source_task_id: 'task-brief-1',
    agent_id: AGENT_ID,
    team_id: '44444444-4444-4444-8444-444444444444',
    plan_id: '66666666-6666-4666-8666-666666666666',
    plan_version_id: '77777777-7777-4777-8777-777777777777',
    state: 'awaiting_plan_approval',
    requested_by: 'user-1',
    budget_minor: 0,
    reserved_minor: 0,
    spent_minor: 0,
    currency: 'EUR',
    deadline_at: null,
    started_at: null,
    terminal_at: null,
    version: '2',
    created_at: '2026-09-04T10:00:00.000Z',
    updated_at: '2026-09-04T10:05:00.000Z',
    steps: [
      {
        id: '88888888-8888-4888-8888-888888888888',
        node_id: 'research-options',
        step_kind: 'reason',
        descriptor_key: 'agent_reason_v1',
        descriptor_version: '1.0',
        assigned_agent_id: AGENT_ID,
        reviewer_agent_id: null,
        dependencies: [],
        state: 'queued',
        attempt_count: 0,
        version: '1',
      },
    ],
  },
};

export const approvalsFixture = {
  version: 'orqaly_approval_list_v1',
  approvals: [
    {
      id: APPROVAL_ID,
      run_id: RUN_ID,
      step_id: null,
      approval_subject_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      subject_kind: 'plan',
      subject_hash: 'd'.repeat(64),
      presentation: {
        version: 'orqaly_approval_presentation_v1',
        title: 'Approve this Agent plan',
        subjectKind: 'plan',
        planVersion: {
          planId: '66666666-6666-4666-8666-666666666666',
          planVersionId: '77777777-7777-4777-8777-777777777777',
          planVersion: 1,
          contentHash: 'c'.repeat(64),
        },
        owningAgentId: AGENT_ID,
        teamId: '44444444-4444-4444-8444-444444444444',
        budget: { amountMinor: 250, currency: 'EUR' },
        issuedAt: '2026-09-04T10:05:00.000Z',
        expiresAt: '2026-09-05T10:00:00.000Z',
        steps: [
          {
            stepId: '88888888-8888-4888-8888-888888888888',
            nodeId: 'research-options',
            title: 'Update CRM record',
            objective: 'Set record 42 status to active.',
            operation: {
              kind: 'provider_operation',
              key: 'crm.record_update',
              version: '1.0',
              contentHash: 'a'.repeat(64),
            },
            agent: {
              agentId: AGENT_ID,
              personaVersion: {
                contractVersion: '1.0',
                personaVersionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
                personaId: 'market-research-persona',
                personaVersion: '1',
                contentHash: 'a'.repeat(64),
              },
              delegation: {
                delegationId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
                version: 1,
                policyHash: 'b'.repeat(64),
              },
            },
            descriptor: {
              contractVersion: '1.0',
              descriptorKey: 'record_update_v1',
              schemaVersion: '1.0',
              contentHash: 'a'.repeat(64),
            },
            executorBinding: {
              contractVersion: '1.0',
              bindingKey: 'connector_executor',
              bindingVersion: '1.0',
              contentHash: 'b'.repeat(64),
            },
            canonicalParameters: { recordId: '42', status: 'active' },
            canonicalInputHash: 'e'.repeat(64),
            redactedParameterPaths: [],
            effectProfile: { externality: 'write', mutation: 'update', flags: [] },
            dataEgressProfile: {
              mode: 'policy_bound_external',
              destinationClasses: ['customer_crm'],
              providerClasses: ['crm'],
              regionClasses: ['eu'],
              permittedInputClassifications: ['internal'],
              permittedOutputClassifications: [],
              redactionRequired: false,
              dlpRequired: true,
              providerRetentionPolicyRequired: true,
              providerTrainingPolicyRequired: true,
            },
            limits: {
              maximumTurns: 1,
              maximumTokens: 1000,
              maximumToolCalls: 1,
              maximumRuntimeSeconds: 120,
              maximumAttempts: 1,
              maximumCostMinor: 250,
              currency: 'EUR',
            },
            deadline: null,
            humanReadableEffect: {
              summary: 'Set record 42 status to active.',
              risks: ['external update operation'],
            },
            action: {
              actionIntentId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
              effectId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
              providerOperation: {
                contractVersion: '1.0',
                operationKey: 'crm.record_update',
                operationVersion: '1.0',
                contentHash: 'a'.repeat(64),
              },
              connection: {
                connectionReference: 'connection/crm-primary',
                providerKey: 'crm',
                requestedScopes: ['records.write'],
              },
              targets: [
                {
                  targetType: 'crm_record',
                  targetReference: 'record/42',
                  targetHash: 'f'.repeat(64),
                },
              ],
              externalPreconditions: [
                {
                  preconditionType: 'etag',
                  targetReference: 'record/42',
                  expectedStateHash: 'f'.repeat(64),
                },
              ],
              idempotency: {
                scope: 'crm_record_update',
                key: 'effect/record-42/status',
              },
              reconciliation: { strategy: 'provider_idempotency', lookupOperation: null },
              compensation: { strategy: 'none', operation: null },
            },
          },
        ],
      },
      status: 'pending',
      expires_at: '2026-09-05T10:00:00.000Z',
      version: 1,
      created_at: '2026-09-04T10:05:00.000Z',
      controls: {
        approval: { approve: true, reject: true, reason: null },
      },
    },
  ],
};
