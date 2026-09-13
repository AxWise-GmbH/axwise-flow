import { describe, expect, it } from 'vitest';
import { getAgentExecutionPersonas } from './agentExecutionPersonaService.js';

describe('getAgentExecutionPersonas', () => {
  it('deduplicates repeated task observations for the same goal, agent, and role', () => {
    const context = {
      decision_id: 'decision-1',
      source_job_id: 'hybrid-1',
      customer_persona: { name: 'Clinic Operations Manager', confidence: 0.88 },
      execution_persona: {
        role: 'Healthcare Operations Specialist',
        communication_style: 'direct and reassuring',
        required_capabilities: ['appointment operations'],
      },
      assignment: { score: 0.91, applied: true },
    };
    const result = getAgentExecutionPersonas([
      {
        id: 'task-1',
        goal_id: 'goal-1',
        goal_title: 'Reduce missed appointments',
        updatedAt: '2026-07-17T09:00:00Z',
        axwise_execution_context: context,
      },
      {
        id: 'task-2',
        goal_id: 'goal-1',
        goal_title: 'Reduce missed appointments',
        updatedAt: '2026-07-17T10:00:00Z',
        axwise_execution_context: context,
      },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      goalId: 'goal-1',
      goalTitle: 'Reduce missed appointments',
      customerPersona: { name: 'Clinic Operations Manager' },
      executionPersona: { role: 'Healthcare Operations Specialist' },
      assignment: { score: 0.91, applied: true },
      presentationStatus: 'pending_execution_approval',
      authoritative: false,
      executable: false,
    });
  });

  it('keeps distinct agent and role overlays visible within the same goal', () => {
    const base = {
      customer_persona: { name: 'Bremen owner-manager' },
      assignment: { applied: true },
    };
    const result = getAgentExecutionPersonas([
      {
        id: 'task-market',
        goal_id: 'goal-bremen',
        agent_id: 'agent-research',
        agent_name: 'Researcher',
        axwise_execution_context: {
          ...base,
          execution_persona: { role: 'Market Research Lead' },
        },
      },
      {
        id: 'task-pricing',
        goal_id: 'goal-bremen',
        agent_id: 'agent-commercial',
        agent_name: 'Commercial Analyst',
        axwise_execution_context: {
          ...base,
          execution_persona: { role: 'Pricing Analyst' },
        },
      },
    ]);

    expect(result).toHaveLength(2);
    expect(result.map((item) => item.overlayKey)).toEqual(
      expect.arrayContaining([
        'goal-bremen::agent-research::market research lead',
        'goal-bremen::agent-commercial::pricing analyst',
      ])
    );
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          agentId: 'agent-research',
          executionRole: 'Market Research Lead',
        }),
        expect.objectContaining({ agentId: 'agent-commercial', executionRole: 'Pricing Analyst' }),
      ])
    );
  });

  it('marks a goal-scoped overlay executable only after the second approval', () => {
    const approvalHash = 'approval-hash-1';
    const context = {
      customer_persona: { name: 'Warehouse coordinator' },
      execution_persona: { role: 'Warehouse operations specialist' },
      assignment: { agent_id: 'agent-ops', applied: true },
      authorization_snapshot_hash: approvalHash,
      authorization_task_id: 'task-1',
      authorization_agent_id: 'agent-ops',
      authorization_required_tool_ids: ['tool-web-search'],
      authorization_granted_tool_ids: ['tool-web-search'],
    };
    const tasks = [
      {
        id: 'task-1',
        goal_id: 'goal-1',
        agent_id: 'agent-ops',
        tool_requirements: ['web-search'],
        axwise_execution_context: context,
      },
    ];

    const pending = getAgentExecutionPersonas(tasks, [
      {
        id: 'goal-1',
        status: 'awaiting_approval',
        data: { goal_approvals: { execution: { status: 'pending' } } },
      },
    ]);
    expect(pending[0]).toMatchObject({
      authorizationStatus: 'pending_execution_approval',
      authoritative: false,
      assignable: false,
      executable: false,
    });

    const approved = getAgentExecutionPersonas(tasks, [
      {
        id: 'goal-1',
        status: 'active',
        data: {
          execution_authorization: { status: 'approved', snapshot_hash: approvalHash },
          goal_approvals: {
            execution: {
              status: 'approved',
              snapshot_hash: approvalHash,
              snapshot: {
                authorization_manifest: {
                  tasks: [
                    {
                      task_id: 'task-1',
                      agent_id: 'agent-ops',
                      required_tool_ids: ['tool-web-search'],
                      granted_tool_ids: ['tool-web-search'],
                    },
                  ],
                },
              },
            },
          },
        },
      },
    ]);
    expect(approved[0]).toMatchObject({
      presentationStatus: 'authorized_overlay',
      authorizationStatus: 'approved',
      authoritative: true,
      assignable: true,
      executable: true,
    });
  });

  it('keeps an overlay non-authoritative when approval status is approved but hashes differ', () => {
    const result = getAgentExecutionPersonas(
      [
        {
          id: 'task-1',
          goal_id: 'goal-1',
          agent_id: 'agent-ops',
          tool_requirements: [],
          axwise_execution_context: {
            customer_persona: { name: 'Customer' },
            execution_persona: { role: 'Specialist' },
            authorization_snapshot_hash: 'old-hash',
            authorization_task_id: 'task-1',
            authorization_agent_id: 'agent-ops',
            authorization_granted_tool_ids: [],
          },
        },
      ],
      [
        {
          id: 'goal-1',
          data: {
            execution_authorization: { status: 'approved', snapshot_hash: 'current-hash' },
            goal_approvals: {
              execution: {
                status: 'approved',
                snapshot_hash: 'current-hash',
                snapshot: {
                  authorization_manifest: {
                    tasks: [
                      {
                        task_id: 'task-1',
                        agent_id: 'agent-ops',
                        required_tool_ids: [],
                        granted_tool_ids: [],
                      },
                    ],
                  },
                },
              },
            },
          },
        },
      ]
    );

    expect(result[0]).toMatchObject({
      authorizationStatus: 'pending_execution_approval',
      authoritative: false,
      executable: false,
    });
  });

  it('keeps an overlay non-authoritative when its role-specific research contract changed', () => {
    const approvalHash = 'approval-hash';
    const result = getAgentExecutionPersonas(
      [
        {
          id: 'task-1',
          goal_id: 'goal-1',
          agent_id: 'agent-ops',
          tool_requirements: [],
          axwise_execution_context: {
            customer_persona: { name: 'Customer' },
            execution_persona: { role: 'Commercial Risk Analyst' },
            research_contract: {
              bundle_hash: 'bundle-current',
              executor_persona_id: 'executor-tampered',
            },
            authorization_snapshot_hash: approvalHash,
            authorization_task_id: 'task-1',
            authorization_agent_id: 'agent-ops',
            authorization_granted_tool_ids: [],
          },
        },
      ],
      [
        {
          id: 'goal-1',
          data: {
            execution_authorization: { status: 'approved', snapshot_hash: approvalHash },
            goal_approvals: {
              execution: {
                status: 'approved',
                snapshot_hash: approvalHash,
                snapshot: {
                  authorization_manifest: {
                    tasks: [
                      {
                        task_id: 'task-1',
                        agent_id: 'agent-ops',
                        required_tool_ids: [],
                        granted_tool_ids: [],
                        research_contract: {
                          bundle_hash: 'bundle-current',
                          executor_persona_id: 'executor-approved',
                        },
                      },
                    ],
                  },
                },
              },
            },
          },
        },
      ]
    );

    expect(result[0]).toMatchObject({ authoritative: false, executable: false });
  });

  it('ignores ordinary tasks without a persona overlay', () => {
    expect(getAgentExecutionPersonas([{ id: 'task-1', goal_id: 'goal-1' }])).toEqual([]);
  });

  it('shows a matching synthetic hypothesis as review-only and non-executable', () => {
    const result = getAgentExecutionPersonas(
      [],
      [
        {
          id: 'goal-2',
          title: 'Understand warehouse delays',
          data: {
            axwise_customer_intelligence: {
              working_hypothesis: {
                review_status: 'awaiting_verification',
                authoritative: false,
                assignable: false,
                executable: false,
                persona_resolution: {
                  customer_persona: { name: 'Warehouse supervisor' },
                  ideal_agent_persona: { role: 'Operations research specialist' },
                  recommended_agent: { agent_id: 'agent-ops', score: 0.73 },
                },
              },
            },
          },
        },
      ],
      ['agent-ops']
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      presentationStatus: 'awaiting_verification',
      authoritative: false,
      assignable: false,
      executable: false,
      assignment: { agent_id: 'agent-ops', score: 0.73, applied: false },
    });
  });

  it('never shows a hypothesis on an unrelated Agent Hub profile', () => {
    const goal = {
      id: 'goal-2',
      data: {
        axwise_customer_intelligence: {
          working_hypothesis: {
            persona_resolution: {
              customer_persona: { name: 'Customer' },
              ideal_agent_persona: { role: 'Specialist' },
              recommended_agent: { agent_id: 'agent-ops', score: 0.73 },
            },
          },
        },
      },
    };
    expect(getAgentExecutionPersonas([], [goal], ['agent-finance'])).toEqual([]);
  });
});
