import { describe, expect, it } from 'vitest';
import {
  buildDeterministicPlaybookPlan,
  selectWorkShapePlaybook,
  WORK_SHAPE_PLAYBOOK_IDS,
  WORK_SHAPE_PLAYBOOK_REGISTRY,
} from './work-shape-playbooks.js';

function nativeScope({
  objective = 'Prepare the requested deliverable.',
  type = 'markdown',
  admission = null,
} = {}) {
  return {
    version: 'axwise_scope_packet_v1',
    intent: {
      objective,
      problem: 'The work needs a bounded execution shape.',
      desired_outcome: 'A reliable result from the approved scope.',
    },
    deliverable: { type, count: 1, required_sections: [] },
    ledger: { requirements: [] },
    ...(admission ? { admission } : {}),
  };
}

function admission(overrides = {}) {
  return {
    version: 'axwise_scope_admission_v1',
    work_types: [],
    geographies: [],
    channels: [],
    success_criteria: [],
    required_capabilities: [],
    requested_actions: [],
    ...overrides,
  };
}

describe('domain-neutral work-shape playbook routing', () => {
  it('publishes the seven bounded playbooks with mixed/custom as the inference fallback', () => {
    expect(WORK_SHAPE_PLAYBOOK_REGISTRY.map((item) => item.id)).toEqual([
      WORK_SHAPE_PLAYBOOK_IDS.EXTERNAL_ACTION,
      WORK_SHAPE_PLAYBOOK_IDS.LOGISTICS_DISTRIBUTION,
      WORK_SHAPE_PLAYBOOK_IDS.CAMPAIGN,
      WORK_SHAPE_PLAYBOOK_IDS.SOFTWARE_PRD,
      WORK_SHAPE_PLAYBOOK_IDS.RESEARCH_STRATEGY,
      WORK_SHAPE_PLAYBOOK_IDS.SIMPLE_CONTENT,
      WORK_SHAPE_PLAYBOOK_IDS.MIXED_CUSTOM,
    ]);
    expect(WORK_SHAPE_PLAYBOOK_REGISTRY.at(-1).deterministic).toBe(false);
  });

  it('routes the rebuilt "not software—make this a campaign" admission as a campaign', () => {
    const scopePacket = nativeScope({
      objective: 'Not software—make this a campaign.',
      admission: admission({
        work_types: ['outreach_campaign'],
        success_criteria: ['A measurable campaign is ready for review'],
      }),
    });

    expect(selectWorkShapePlaybook({ scopePacket })).toMatchObject({
      playbook_id: WORK_SHAPE_PLAYBOOK_IDS.CAMPAIGN,
      source: 'axwise_admission',
      grants_authorization: false,
    });
  });

  it.each([
    ['content_asset_creation', WORK_SHAPE_PLAYBOOK_IDS.SIMPLE_CONTENT],
    ['research_analysis', WORK_SHAPE_PLAYBOOK_IDS.RESEARCH_STRATEGY],
    ['strategy_planning', WORK_SHAPE_PLAYBOOK_IDS.RESEARCH_STRATEGY],
    ['software_development', WORK_SHAPE_PLAYBOOK_IDS.SOFTWARE_PRD],
    ['outreach_campaign', WORK_SHAPE_PLAYBOOK_IDS.CAMPAIGN],
    ['procurement_logistics', WORK_SHAPE_PLAYBOOK_IDS.LOGISTICS_DISTRIBUTION],
    ['physical_operations', WORK_SHAPE_PLAYBOOK_IDS.LOGISTICS_DISTRIBUTION],
  ])('prefers the signed %s admission work type', (workType, expected) => {
    const route = selectWorkShapePlaybook({
      goal: {},
      scopePacket: nativeScope({
        objective:
          expected === WORK_SHAPE_PLAYBOOK_IDS.SOFTWARE_PRD
            ? 'Create a product requirements document.'
            : 'Prepare the requested deliverable.',
        type:
          expected === WORK_SHAPE_PLAYBOOK_IDS.SOFTWARE_PRD
            ? 'product requirements document'
            : 'markdown',
        admission: admission({ work_types: [workType] }),
      }),
    });

    expect(route).toMatchObject({
      playbook_id: expected,
      source: 'axwise_admission',
      confidence: 0.99,
      authoritative_scope: true,
      deterministic_plan_eligible: true,
      grants_authorization: false,
    });
  });

  it('routes an execute-mode SMS request to the external-action playbook without authorizing it', () => {
    const route = selectWorkShapePlaybook({
      scopePacket: nativeScope({
        objective: 'Send an appointment reminder to the approved recipients.',
        admission: admission({
          work_types: ['outreach_campaign', 'external_service_operation'],
          channels: ['sms'],
          required_capabilities: ['Twilio'],
          requested_actions: [
            {
              action: 'Send the final SMS to approved recipients',
              mode: 'execute',
              side_effect: 'irreversible',
              requires_authorization: true,
            },
          ],
        }),
      }),
    });

    expect(route).toMatchObject({
      playbook_id: WORK_SHAPE_PLAYBOOK_IDS.EXTERNAL_ACTION,
      requires_authorization: true,
      maximum_side_effect: 'irreversible',
      grants_authorization: false,
    });
    const plan = buildDeterministicPlaybookPlan({ route, requiredRoles: [] });
    const jobs = plan.phases.flatMap((phase) => phase.jobs);
    const handoff = jobs.find((item) => item.title === 'Produce Authorization Handoff Manifest');
    expect(jobs.every((item) => item.tool_requirements.length === 0)).toBe(true);
    expect(jobs.some((item) => item.category === 'external_action_execution')).toBe(false);
    expect(handoff.description).toContain('ACTION_BLOCKED_NO_AUTHORIZATION');
    expect(handoff.description).toContain('MUST NOT call a connector');
    expect(handoff.requirements).toContain('grants_authorization=false');
  });

  it('does not ignore an execute action after twenty advisory actions', () => {
    const advisoryActions = Array.from({ length: 20 }, (_, index) => ({
      action: `Advise on option ${index + 1}`,
      mode: 'advise',
      side_effect: 'none',
      requires_authorization: false,
    }));
    const route = selectWorkShapePlaybook({
      scopePacket: nativeScope({
        admission: admission({
          work_types: ['external_service_operation'],
          requested_actions: [
            ...advisoryActions,
            {
              action: 'Send the approved SMS',
              mode: 'execute',
              side_effect: 'irreversible',
              requires_authorization: true,
            },
          ],
        }),
      }),
    });

    expect(route).toMatchObject({
      playbook_id: WORK_SHAPE_PLAYBOOK_IDS.EXTERNAL_ACTION,
      requires_authorization: true,
      maximum_side_effect: 'irreversible',
      grants_authorization: false,
    });
    expect(route.requested_actions).toHaveLength(21);
    const plan = buildDeterministicPlaybookPlan({ route });
    expect(plan.phases[0].jobs[0].description).toContain('Send the approved SMS');
    expect(plan.phases[1].jobs[0].description).toContain('Send the approved SMS');
  });

  it('does not let mixed/custom hide an explicit side-effecting action', () => {
    const route = selectWorkShapePlaybook({
      scopePacket: nativeScope({
        admission: admission({
          work_types: ['mixed_custom', 'external_service_operation'],
          requested_actions: [
            {
              action: 'Place the approved supplier order',
              mode: 'execute',
              side_effect: 'irreversible',
              requires_authorization: true,
            },
          ],
        }),
      }),
    });

    expect(route).toMatchObject({
      playbook_id: WORK_SHAPE_PLAYBOOK_IDS.EXTERNAL_ACTION,
      requires_authorization: true,
      maximum_side_effect: 'irreversible',
      grants_authorization: false,
    });
  });

  it('preserves every signed admission value within the AxWise field cardinalities', () => {
    const route = selectWorkShapePlaybook({
      scopePacket: nativeScope({
        admission: admission({
          work_types: Array.from({ length: 9 }, () => 'research_analysis'),
          geographies: Array.from({ length: 100 }, (_, index) => `Geography ${index + 1}`),
          channels: Array.from({ length: 100 }, (_, index) => `Channel ${index + 1}`),
          success_criteria: Array.from(
            { length: 200 },
            (_, index) => `Success criterion ${index + 1}`
          ),
          required_capabilities: Array.from(
            { length: 100 },
            (_, index) => `Capability ${index + 1}`
          ),
          requested_actions: Array.from({ length: 100 }, (_, index) => ({
            action: `Advise on action ${index + 1}`,
            mode: 'advise',
            side_effect: 'none',
            requires_authorization: false,
          })),
        }),
      }),
    });

    expect(route).toMatchObject({
      playbook_id: WORK_SHAPE_PLAYBOOK_IDS.RESEARCH_STRATEGY,
      requires_authorization: false,
      maximum_side_effect: 'none',
    });
    expect(route.work_types).toHaveLength(9);
    expect(route.geographies).toHaveLength(100);
    expect(route.channels).toHaveLength(100);
    expect(route.success_criteria).toHaveLength(200);
    expect(route.required_capabilities).toHaveLength(100);
    expect(route.requested_actions).toHaveLength(100);
  });

  it('keeps advisory SMS service design on the software playbook', () => {
    const route = selectWorkShapePlaybook({
      scopePacket: nativeScope({
        objective: 'Design an SMS service API.',
        type: 'product requirements document',
        admission: admission({
          work_types: ['software_development'],
          channels: ['sms'],
          requested_actions: [
            {
              action: 'Advise on SMS provider integration',
              mode: 'advise',
              side_effect: 'none',
              requires_authorization: false,
            },
          ],
        }),
      }),
    });

    expect(route).toMatchObject({
      playbook_id: WORK_SHAPE_PLAYBOOK_IDS.SOFTWARE_PRD,
      requires_authorization: false,
      maximum_side_effect: 'none',
    });
  });

  it('does not turn advisory external-service operations into execution', () => {
    const route = selectWorkShapePlaybook({
      scopePacket: nativeScope({
        admission: admission({
          work_types: ['external_service_operation'],
          requested_actions: [
            {
              action: 'Advise on an SMS provider configuration',
              mode: 'advise',
              side_effect: 'none',
              requires_authorization: false,
            },
          ],
        }),
      }),
    });

    expect(route).toMatchObject({
      playbook_id: WORK_SHAPE_PLAYBOOK_IDS.MIXED_CUSTOM,
      deterministic_plan_eligible: false,
      requires_authorization: false,
      grants_authorization: false,
    });
  });

  it('keeps an outreach campaign deterministic when external-service work is advisory', () => {
    const route = selectWorkShapePlaybook({
      scopePacket: nativeScope({
        admission: admission({
          work_types: ['outreach_campaign', 'external_service_operation'],
          channels: ['sms'],
          requested_actions: [
            {
              action: 'Prepare SMS provider configuration guidance',
              mode: 'advise',
              side_effect: 'none',
              requires_authorization: false,
            },
          ],
        }),
      }),
    });

    expect(route).toMatchObject({
      playbook_id: WORK_SHAPE_PLAYBOOK_IDS.CAMPAIGN,
      source: 'axwise_admission',
      deterministic_plan_eligible: true,
      requires_authorization: false,
      grants_authorization: false,
    });
  });

  it('maps the exact mixed_custom enum to the inference fallback', () => {
    const route = selectWorkShapePlaybook({
      scopePacket: nativeScope({
        admission: admission({ work_types: ['mixed_custom'] }),
      }),
    });

    expect(route).toMatchObject({
      playbook_id: WORK_SHAPE_PLAYBOOK_IDS.MIXED_CUSTOM,
      source: 'axwise_admission',
      deterministic_plan_eligible: false,
    });
  });

  it('treats research and content as supporting work within campaign or logistics shapes', () => {
    const campaignRoute = selectWorkShapePlaybook({
      scopePacket: nativeScope({
        admission: admission({
          work_types: ['research_analysis', 'content_asset_creation', 'outreach_campaign'],
        }),
      }),
    });
    const distributionRoute = selectWorkShapePlaybook({
      scopePacket: nativeScope({
        admission: admission({
          work_types: ['research_analysis', 'content_asset_creation', 'procurement_logistics'],
          geographies: ['Estonia'],
        }),
      }),
    });

    expect(campaignRoute.playbook_id).toBe(WORK_SHAPE_PLAYBOOK_IDS.CAMPAIGN);
    expect(distributionRoute).toMatchObject({
      playbook_id: WORK_SHAPE_PLAYBOOK_IDS.LOGISTICS_DISTRIBUTION,
      geographies: ['Estonia'],
    });
  });

  it('uses research as a supporting phase when the canonical output is an article', () => {
    const scopePacket = nativeScope({
      objective: 'Research the evidence and write a consumer article.',
      type: 'consumer article',
      admission: admission({
        work_types: ['research_analysis', 'content_asset_creation'],
      }),
    });
    const route = selectWorkShapePlaybook({ scopePacket });
    const plan = buildDeterministicPlaybookPlan({ route, scopePacket });

    expect(route).toMatchObject({
      playbook_id: WORK_SHAPE_PLAYBOOK_IDS.SIMPLE_CONTENT,
      deterministic_plan_eligible: true,
    });
    expect(plan.phases.map((phase) => phase.name)).toEqual([
      'Evidence Preparation',
      'Content Production',
    ]);
    expect(plan.phases[0].jobs[0].category).toBe('content_research');
    expect(plan.phases.at(-1).jobs.at(-1)).toMatchObject({
      title: 'Create and Validate Requested Content',
      category: 'content',
    });
  });

  it('uses the dynamic planner when research and content have no clear final deliverable', () => {
    const route = selectWorkShapePlaybook({
      scopePacket: nativeScope({
        objective: 'Research and prepare the requested work.',
        type: 'custom output',
        admission: admission({
          work_types: ['research_analysis', 'content_asset_creation'],
        }),
      }),
    });

    expect(route).toMatchObject({
      playbook_id: WORK_SHAPE_PLAYBOOK_IDS.MIXED_CUSTOM,
      deterministic_plan_eligible: false,
    });
  });

  it('uses mixed/custom when signed work types require unrelated primary playbooks', () => {
    const route = selectWorkShapePlaybook({
      scopePacket: nativeScope({
        admission: admission({
          work_types: ['software_development', 'procurement_logistics'],
        }),
      }),
    });

    expect(route).toMatchObject({
      playbook_id: WORK_SHAPE_PLAYBOOK_IDS.MIXED_CUSTOM,
      deterministic_plan_eligible: false,
      grants_authorization: false,
    });
    expect(buildDeterministicPlaybookPlan({ route })).toBeNull();
  });

  it('falls back deterministically to accepted scope text for older native packets', () => {
    const route = selectWorkShapePlaybook({
      goal: { title: 'Generic title' },
      scopePacket: nativeScope({
        objective: 'Create a product requirements document for a workflow.',
        type: 'markdown PRD',
      }),
    });

    expect(route).toMatchObject({
      playbook_id: WORK_SHAPE_PLAYBOOK_IDS.SOFTWARE_PRD,
      source: 'scope_contract',
      confidence: 0.85,
      deterministic_plan_eligible: true,
    });
  });

  it('does not bypass inference for a legacy, non-authoritative goal fallback', () => {
    const route = selectWorkShapePlaybook({
      goal: {
        title: 'Create an Estonia cat-food distribution plan',
        description: 'Analyze distributors, warehousing, transport, and unit economics.',
      },
    });

    expect(route).toMatchObject({
      playbook_id: WORK_SHAPE_PLAYBOOK_IDS.LOGISTICS_DISTRIBUTION,
      source: 'goal_fallback',
      authoritative_scope: false,
      deterministic_plan_eligible: false,
    });
    expect(buildDeterministicPlaybookPlan({ route })).toBeNull();
  });

  it('builds different bounded topologies for content, research, campaign, and distribution', () => {
    const cases = [
      [WORK_SHAPE_PLAYBOOK_IDS.SIMPLE_CONTENT, [1]],
      [WORK_SHAPE_PLAYBOOK_IDS.RESEARCH_STRATEGY, [1, 1]],
      [WORK_SHAPE_PLAYBOOK_IDS.CAMPAIGN, [2, 1]],
      [WORK_SHAPE_PLAYBOOK_IDS.LOGISTICS_DISTRIBUTION, [2, 1]],
    ];

    for (const [playbookId, expectedJobs] of cases) {
      const route = {
        ...selectWorkShapePlaybook({
          scopePacket: nativeScope({
            admission: admission({ work_types: [playbookId] }),
          }),
        }),
        playbook_id: playbookId,
        deterministic_plan_eligible: true,
      };
      const plan = buildDeterministicPlaybookPlan({ route, scopePacket: nativeScope() });
      expect(plan.phases.map((item) => item.jobs.length)).toEqual(expectedJobs);
      expect(plan.phases.flatMap((item) => item.jobs)).not.toHaveLength(0);
    }
  });

  it('uses the caller-supplied strict PRD plan unchanged', () => {
    const route = selectWorkShapePlaybook({
      scopePacket: nativeScope({
        objective: 'Create a product requirements document.',
        type: 'product requirements document',
        admission: admission({ work_types: ['software_development'] }),
      }),
    });
    const strictPrdPlan = { strategy: 'Strict existing behavior', phases: [{ jobs: [] }] };

    expect(buildDeterministicPlaybookPlan({ route, strictPrdPlan })).toBe(strictPrdPlan);
  });

  it('keeps code, deployment, and visual-asset modalities on the existing dynamic planner', () => {
    const cases = [
      ['software_development', 'code'],
      ['software_development', 'deployment'],
      ['content_asset_creation', 'image asset'],
      ['research_analysis', 'structured data'],
    ];

    for (const [workType, type] of cases) {
      const scopePacket = nativeScope({
        objective: `Create the requested ${type}.`,
        type,
        admission: admission({ work_types: [workType] }),
      });
      const route = selectWorkShapePlaybook({ scopePacket });
      expect(route.deterministic_plan_eligible).toBe(false);
      expect(buildDeterministicPlaybookPlan({ route, scopePacket })).toBeNull();
    }
  });
});
