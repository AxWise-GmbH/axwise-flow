import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { buildCustomerRoutingRequest } from './customer-intelligence.js';
import { customerScopeHash } from '../../goal-handlers/scope-confirmation.js';
import { canonicalContractHash } from '../../agent-handlers/compact-agent-contracts.js';
import {
  nativeDecisionContractsFixture,
  nativeScopePacketFixture,
} from '../../agent-handlers/native-axwise-contract.test-fixture.js';
import { selectWorkShapePlaybook } from '../../goal-handlers/work-shape-playbooks.js';
import {
  approvedApproval,
  buildContextApprovalSnapshot,
} from '../../goal-handlers/approval-audit.js';

function acceptedGoal() {
  const decisionId = 'decision-owner-scope';
  const clarificationScope = {
    version: 'orqaly_axwise_scope_confirmation_v1',
    business_idea: 'Create an evidence-grounded PRD',
    target_customer: 'Clinic operations managers',
    problem: 'Manual scheduling creates avoidable no-shows',
    desired_outcome: 'A review-ready PRD with traceable requirements',
    constraints: ['Do not expose personal health data'],
    evidence: [
      {
        reference_id: 'evidence-authoritative-1',
        verified: true,
        verification_source: 'axwise_audit',
      },
      {
        reference_id: 'orqaly-owner-scope-confirmation',
        verified: true,
        verification_source: 'axwise_audit',
      },
    ],
  };
  clarificationScope.scope_hash = customerScopeHash(decisionId, clarificationScope);
  const excerpt = 'The audited clinic record contains 42 scheduling gaps.';
  const sourceRefs = ['evidence-authoritative-1'];
  const sourceAuthorityIds = ['axwise.authority.clinic-ledger'];
  const factClaim = 'The audited clinic record contains 42 scheduling gaps.';
  const admission = {
    version: 'axwise_scope_admission_v1',
    work_types: ['software_development'],
    geographies: ['EE'],
    channels: ['chat'],
    success_criteria: ['Every P0 requirement has an acceptance test'],
    required_capabilities: ['product specification'],
    requested_actions: [
      {
        action: 'Prepare the product specification',
        mode: 'prepare',
        side_effect: 'none',
        requires_authorization: false,
      },
    ],
  };
  const packetSeed = nativeScopePacketFixture({
    audiences: ['Existing packet audience'],
    admission,
  });
  const packetWithoutHash = {
    ...packetSeed,
    ledger: {
      ...packetSeed.ledger,
      facts: [
        {
          fact_id: `fact-${canonicalContractHash({
            claim: factClaim.toLowerCase(),
            source_refs: sourceRefs,
            source_authority_ids: sourceAuthorityIds,
          }).slice(0, 16)}`,
          claim: factClaim,
          verification: 'verified',
          source_refs: sourceRefs,
          source_authority_ids: sourceAuthorityIds,
          verbatim_excerpt: excerpt,
          content_hash: createHash('sha256').update(excerpt).digest('hex'),
        },
      ],
    },
  };
  delete packetWithoutHash.scope_hash;
  const packet = {
    ...packetWithoutHash,
    scope_hash: canonicalContractHash(packetWithoutHash),
  };
  const nativeDecision = nativeDecisionContractsFixture(packet);
  return {
    id: 'goal-scope-state',
    user_id: 'user-scope-state',
    org_id: 'org-scope-state',
    title: 'Create an evidence-grounded PRD',
    description: 'Produce a complete PRD for the approved clinic workflow.',
    parsed_category: 'healthcare_operations',
    parsed_requirements: 'Preserve requirement-to-test traceability',
    budget_usd: 10,
    tech_doc: {
      target_audience: 'Clinic operations managers',
      problem_statement: 'Manual scheduling creates avoidable no-shows',
      success_criteria: ['Every P0 requirement has an acceptance test'],
      constraints: ['Keep tenant data isolated'],
      open_decisions: ['Which rollout cohort should be first?'],
      assumptions: ['The rollout calendar remains subject to owner review.'],
      decisions: ['The PRD is the sole requested artifact'],
      out_of_scope: ['Autonomous production changes'],
      required_sections: ['Problem', 'Requirements', 'Acceptance tests'],
    },
    data: {
      axwise_customer_intelligence: {
        status: 'scope_confirmed',
        decision_id: decisionId,
        clarification_scope: clarificationScope,
        scope_confirmation: {
          version: 'orqaly_axwise_scope_confirmation_v1',
          status: 'accepted',
          provenance: 'user_confirmed_assumption',
          source_decision_id: decisionId,
          source_scope_hash: clarificationScope.scope_hash,
          target_customer: clarificationScope.target_customer,
          problem: clarificationScope.problem,
          desired_outcome: clarificationScope.desired_outcome,
          optional_details: 'Use the corrected mobile-first workflow.',
          scope: clarificationScope,
        },
        scope_packet: nativeDecision.scope_packet,
        scope_validation: nativeDecision.scope_validation,
        axwise_scope_confirmation: nativeDecision.scope_confirmation,
        scope_contract_binding: nativeDecision.scope_contract_binding,
      },
      research_policy: { research_mode: 'instant' },
    },
  };
}

describe('Orqaly to AxWise structured cognitive-state bridge', () => {
  it('preserves all six accepted native executor roles in the AxWise request', () => {
    const roles = [
      'Market Evidence Analyst',
      'Customer Persona Researcher',
      'Regulatory Researcher',
      'Retail Channel Strategist',
      'Logistics Operations Planner',
      'Unit Economics Analyst',
    ];
    const goal = acceptedGoal();
    const packet = nativeScopePacketFixture({
      admission: {
        version: 'axwise_scope_admission_v1',
        work_types: ['research_analysis'],
        geographies: ['EE'],
        channels: ['physical retail'],
        success_criteria: ['Return the complete accepted executor-role coverage.'],
        required_capabilities: roles,
        requested_actions: [],
      },
    });
    const decision = nativeDecisionContractsFixture(packet);
    goal.data.axwise_customer_intelligence = {
      ...goal.data.axwise_customer_intelligence,
      scope_packet: packet,
      scope_validation: decision.scope_validation,
      axwise_scope_confirmation: decision.scope_confirmation,
      scope_contract_binding: decision.scope_contract_binding,
      updated_at: '2026-08-24T10:00:00.000Z',
    };
    const route = selectWorkShapePlaybook({ goal, scopePacket: packet });
    goal.data.work_shape_route = route;
    goal.data.scope_admission = {
      version: 1,
      native_scope: true,
      status: 'accepted',
      state_key: 'axwise_customer_intelligence',
      scope_hash: packet.scope_hash,
      playbook_id: route.playbook_id,
      route_version: route.version,
      accepted_at: '2026-08-24T10:00:00.000Z',
      requires_authorization: route.requires_authorization,
      maximum_side_effect: route.maximum_side_effect,
      grants_authorization: false,
    };
    goal.data.goal_approvals = {
      context: approvedApproval('context', buildContextApprovalSnapshot(goal), goal.user_id),
    };

    const request = buildCustomerRoutingRequest({ goal, agents: [] });

    const contractedRoles = packet.research_contract.executor_role_slots.map((slot) => slot.role);
    expect(request.research_brief.required_execution_roles).toEqual(contractedRoles);
    expect(request.task.required_capabilities).toEqual([...contractedRoles].sort());
  });

  it('rebuilds an evidence request from raw owner scope plus the latest evidence directive', () => {
    const goal = acceptedGoal();
    const intelligence = goal.data.axwise_customer_intelligence;
    const packet = intelligence.scope_packet;
    const route = selectWorkShapePlaybook({ goal, scopePacket: packet });
    goal.title = 'Original owner market request';
    goal.description = 'ORIGINAL RAW DESCRIPTION: validate the physical-market pilot.';
    goal.parsed_category = 'market_strategy';
    goal.parsed_requirements = 'ORIGINAL RAW REQUIREMENT: retain the approved business scope.';
    goal.tech_doc = {
      problem_statement: 'STALE RAW PROBLEM',
      target_audience: 'STALE RAW AUDIENCE',
      success_criteria: ['STALE RAW OUTCOME'],
      constraints: ['STALE RAW CONSTRAINT'],
      required_capabilities: ['stale software engineering'],
      requested_actions: ['deploy_software'],
    };
    goal.data.scope_admission = {
      version: 1,
      native_scope: true,
      status: 'evidence_requested',
      state_key: 'axwise_customer_intelligence',
      scope_hash: null,
      playbook_id: null,
      route_version: route.version,
      accepted_at: null,
      requires_authorization: route.requires_authorization,
      maximum_side_effect: route.maximum_side_effect,
      grants_authorization: false,
    };
    goal.data.work_shape_route = null;
    goal.data.goal_approvals = {
      context: { status: 'invalidated', snapshot_hash: 'a'.repeat(64) },
    };
    intelligence.previous_scope_contract = {
      version: 'orqaly_previous_native_scope_contract_v1',
      scope_hash: packet.scope_hash,
      generation: intelligence.generation ?? null,
      context_snapshot_hash: 'a'.repeat(64),
      scope_packet: packet,
      scope_validation: intelligence.scope_validation,
      scope_confirmation: intelligence.axwise_scope_confirmation,
      scope_contract_binding: intelligence.scope_contract_binding,
    };
    delete intelligence.scope_packet;
    delete intelligence.scope_validation;
    delete intelligence.axwise_scope_confirmation;
    delete intelligence.scope_contract_binding;
    goal.data.scope_revision = {
      version: 'orqaly_scope_revision_v1',
      status: 'pending_rebuild',
      revision_token: 'revision-evidence-1',
      kind: 'evidence_refresh',
      base_kind: 'accepted_native_scope',
      desired_outcome: 'Verify the market evidence for the accepted scope.',
      source_scope_hash: packet.scope_hash,
      source_generation: intelligence.generation ?? null,
    };
    goal.data.axwise_customer_intelligence.user_research_request = {
      feedback: 'Verify the market evidence for the accepted scope.',
    };

    const request = buildCustomerRoutingRequest({ goal, agents: [] });

    expect(request.task.objective).toContain('Verify the market evidence');
    expect(request.task.objective).toContain('ORIGINAL RAW REQUIREMENT');
    expect(request.task.desired_outcome).toContain('ORIGINAL RAW DESCRIPTION');
    expect(request.task.required_capabilities).toEqual([]);
    expect(request.task.requested_actions).toEqual(['gather_customer_evidence']);
    expect(request.scope_state).not.toHaveProperty('admission');
    expect(request.scope_state).not.toHaveProperty('deliverable');
    expect(request.scope_state).not.toHaveProperty('research_contract');
    expect(request.scope_state.requirements.map((item) => item.text).join('\n')).toContain(
      'Verify the market evidence'
    );
    expect(request).not.toHaveProperty('scope_research_acceptance');
  });

  it('fails closed when an evidence refresh cannot validate its source ScopePacket', () => {
    const goal = acceptedGoal();
    const packet = goal.data.axwise_customer_intelligence.scope_packet;
    goal.data.scope_admission = {
      native_scope: true,
      status: 'evidence_requested',
      scope_hash: packet.scope_hash,
    };
    goal.data.scope_revision = {
      version: 'orqaly_scope_revision_v1',
      status: 'pending_rebuild',
      revision_token: 'revision-evidence-invalid',
      kind: 'evidence_refresh',
      source_scope_hash: packet.scope_hash,
    };
    goal.data.axwise_customer_intelligence.scope_validation.scope_hash = 'f'.repeat(64);

    expect(() => buildCustomerRoutingRequest({ goal, agents: [] })).toThrow(
      /Accepted native AxWise scope authority is unavailable/
    );
  });

  it('uses the validated native packet as the sole ScopeStateV1 authority', () => {
    const goal = acceptedGoal();
    const request = buildCustomerRoutingRequest({ goal, agents: [] });
    const state = request.scope_state;

    expect(request.scope_state).toEqual(state);
    expect(Object.keys(state).sort()).toEqual(
      [
        'acceptance',
        'admission',
        'assumptions',
        'audiences',
        'constraints',
        'decisions',
        'deliverable',
        'facts',
        'non_goals',
        'requirements',
        'research_contract',
      ].sort()
    );
    expect(state.admission).toEqual(goal.data.axwise_customer_intelligence.scope_packet.admission);
    expect(state.requirements).toEqual([
      expect.objectContaining({
        text: 'Users can review and proceed with the proposed scope.',
        authority: 'user',
        source_refs: ['user-request'],
      }),
    ]);
    expect(state.audiences).toEqual(['Existing packet audience']);
    expect(state.deliverable).toMatchObject({
      type: 'markdown',
      required_sections: ['Problem', 'Conversational UX', 'Acceptance tests'],
    });
    expect(state.decisions).toEqual([]);
    expect(state.constraints).toEqual([]);
    expect(JSON.stringify(state)).not.toContain('Keep tenant data isolated');
    expect(JSON.stringify(state)).not.toContain('Use the corrected mobile-first workflow.');
    expect(JSON.stringify(state)).not.toContain('Produce a complete PRD');
  });

  it('preserves verified native facts but never upgrades owner confirmation into a fact', () => {
    const state = buildCustomerRoutingRequest({ goal: acceptedGoal(), agents: [] }).scope_state;

    expect(state.facts).toHaveLength(1);
    expect(state.facts[0]).toMatchObject({
      verification: 'verified',
      source_refs: ['evidence-authoritative-1'],
      source_authority_ids: ['axwise.authority.clinic-ledger'],
    });
    expect(state.facts[0].content_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(state.assumptions).toEqual([]);
    expect(
      state.facts.some((item) => item.source_refs.includes('orqaly-owner-scope-confirmation'))
    ).toBe(false);
  });

  it('rebuilds from a material correction without carrying the rejected native packet state', () => {
    const goal = acceptedGoal();
    goal.data.context_revision_feedback = 'Not software—make this a campaign.';

    const request = buildCustomerRoutingRequest({ goal, agents: [] });

    expect(request.task.objective).toContain(
      'latest correction is authoritative over every conflicting part: Not software—make this a campaign.'
    );
    expect(request.task.objective).toContain(
      'Original owner request: Preserve requirement-to-test traceability'
    );
    expect(request.task.desired_outcome).toContain('Not software—make this a campaign.');
    expect(request.task.desired_outcome).toContain('Preserve requirement-to-test traceability');
    expect(request.task.constraints).toContain(
      'Goal owner scope correction: Not software—make this a campaign.'
    );
    expect(request.scope_state).not.toHaveProperty('admission');
    expect(request.scope_state).not.toHaveProperty('deliverable');
    expect(request.scope_state).not.toHaveProperty('research_contract');
    expect(request.scope_state.requirements).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: 'Retain the validated native packet requirement' }),
      ])
    );
    expect(request.scope_state.requirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          text: 'Preserve requirement-to-test traceability',
          authority: 'user',
          source_refs: ['goal.parsed_requirements'],
        }),
        expect.objectContaining({
          text: expect.stringContaining('Not software—make this a campaign.'),
          authority: 'user',
        }),
      ])
    );
  });

  it('applies a correction as the only delta to the exact accepted native packet', () => {
    const goal = acceptedGoal();
    const intelligence = goal.data.axwise_customer_intelligence;
    const packet = intelligence.scope_packet;
    intelligence.generation = 7;
    intelligence.updated_at = '2026-08-24T10:00:00.000Z';
    const route = selectWorkShapePlaybook({ goal, scopePacket: packet });
    goal.data.work_shape_route = route;
    goal.data.scope_admission = {
      version: 1,
      native_scope: true,
      status: 'accepted',
      state_key: 'axwise_customer_intelligence',
      scope_hash: packet.scope_hash,
      playbook_id: route.playbook_id,
      route_version: route.version,
      accepted_at: '2026-08-24T10:00:00.000Z',
      requires_authorization: route.requires_authorization,
      maximum_side_effect: route.maximum_side_effect,
      grants_authorization: false,
    };
    goal.data.goal_approvals = {
      context: approvedApproval('context', buildContextApprovalSnapshot(goal), goal.user_id),
    };
    const contextHash = goal.data.goal_approvals.context.snapshot_hash;
    intelligence.previous_scope_contract = {
      version: 'orqaly_previous_native_scope_contract_v1',
      scope_hash: packet.scope_hash,
      generation: 7,
      context_snapshot_hash: contextHash,
      scope_packet: packet,
      scope_validation: intelligence.scope_validation,
      scope_confirmation: intelligence.axwise_scope_confirmation,
      scope_contract_binding: intelligence.scope_contract_binding,
    };
    intelligence.scope_packet = null;
    intelligence.scope_validation = null;
    intelligence.axwise_scope_confirmation = null;
    intelligence.scope_contract_binding = null;
    goal.data.goal_approvals.context.status = 'invalidated';
    goal.data.work_shape_route = null;
    goal.data.scope_admission = {
      ...goal.data.scope_admission,
      status: 'revision_requested',
      scope_hash: null,
    };
    goal.data.scope_revision = {
      version: 'orqaly_scope_revision_v1',
      status: 'pending_rebuild',
      base_kind: 'accepted_native_scope',
      source_scope_hash: packet.scope_hash,
      source_generation: 7,
      desired_outcome: 'Make the output a physical retail campaign, not software.',
    };
    goal.data.context_revision_feedback =
      'Make the output a physical retail campaign, not software.';
    goal.title = 'Create a clinic scheduling product for Estonia';
    goal.description =
      'Build a clinic scheduling software product for clinic operators in Estonia.';
    goal.parsed_requirements =
      'Deliver a software product PRD for an Estonia clinic workflow, with measurable launch criteria.';
    goal.tech_doc = { constraints: ['POISON RAW CONSTRAINT'] };

    const request = buildCustomerRoutingRequest({ goal, agents: [] });
    const serialized = JSON.stringify(request);

    expect(request.task.objective).toContain(
      'latest correction is authoritative over every conflicting part: Make the output a physical retail campaign, not software.'
    );
    expect(request.task.objective).toContain('Deliver a software product PRD for an Estonia');
    expect(request.task.desired_outcome).toContain(
      'Make the output a physical retail campaign, not software.'
    );
    expect(request.task.constraints).toContain(
      'Goal owner scope correction: Make the output a physical retail campaign, not software.'
    );
    expect(request.scope_state.requirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          text: expect.stringContaining('software product PRD for an Estonia clinic workflow'),
          source_refs: ['goal.parsed_requirements'],
        }),
        expect.objectContaining({
          text: expect.stringContaining('physical retail campaign'),
          authority: 'user',
        }),
      ])
    );
    expect(request.scope_state).not.toHaveProperty('admission');
    expect(request.scope_state).not.toHaveProperty('deliverable');
    expect(request.scope_state).not.toHaveProperty('research_contract');
    expect(serialized).not.toContain('POISON RAW CONSTRAINT');
    expect(serialized).not.toContain('Retain the validated native packet requirement');
  });

  it('retains non-conflicting commercial scope for a partial geography correction', () => {
    const goal = acceptedGoal();
    goal.title = 'Launch premium cat food in Estonia';
    goal.description =
      'Prepare a source-grounded commercial market launch PRD for premium cat food in Estonia.';
    goal.parsed_requirements =
      'Cover current market evidence, buyer personas, pricing, channels, regulatory risks, and a five-role executor team.';
    goal.data.context_revision_feedback =
      'Keep everything else unchanged; replace the launch geography Estonia with Latvia.';

    const request = buildCustomerRoutingRequest({ goal, agents: [] });

    expect(request.task.objective).toContain('replace the launch geography Estonia with Latvia');
    expect(request.task.objective).toContain('source-grounded commercial market launch PRD');
    expect(request.task.objective).toContain('current market evidence, buyer personas, pricing');
    expect(request.scope_state).not.toHaveProperty('admission');
    expect(request.scope_state).not.toHaveProperty('deliverable');
    expect(request.scope_state).not.toHaveProperty('research_contract');
    expect(request.scope_state.requirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          text: expect.stringContaining('commercial market launch PRD'),
          source_refs: ['goal.description'],
        }),
        expect.objectContaining({
          text: expect.stringContaining('five-role executor team'),
          source_refs: ['goal.parsed_requirements'],
        }),
        expect.objectContaining({
          text: expect.stringContaining('Estonia with Latvia'),
          source_refs: ['goal.data.context_revision_feedback'],
        }),
      ])
    );
  });

  it('deduplicates a long raw brief and retains its late exclusions within the same bounded envelope', () => {
    const goal = acceptedGoal();
    delete goal.data.axwise_customer_intelligence.scope_packet;
    delete goal.data.axwise_customer_intelligence.scope_validation;
    delete goal.data.axwise_customer_intelligence.axwise_scope_confirmation;
    const lateExclusion = 'LATE_EXCLUSION: do not contact or purchase from any supplier.';
    const rawBrief = `${'A'.repeat(12_250)}${lateExclusion}`;
    goal.parsed_requirements = rawBrief;
    goal.description = `${rawBrief}\n\nTool Usage: Use all available tools.`;

    const state = buildCustomerRoutingRequest({ goal, agents: [] }).scope_state;
    const rawWindows = state.requirements.filter((item) =>
      item.source_refs.some((ref) => ref.startsWith('goal.parsed_requirements#'))
    );

    expect(rawWindows).toHaveLength(2);
    expect(rawWindows[0].source_refs).toEqual(['goal.parsed_requirements#beginning']);
    expect(rawWindows[1].source_refs).toEqual(['goal.parsed_requirements#end']);
    expect(rawWindows[1].text).toContain(lateExclusion);
    expect(
      state.requirements.some((item) =>
        item.source_refs.some((ref) => ref.startsWith('goal.description#'))
      )
    ).toBe(false);
  });

  it('shares one bounded owner-text envelope across distinct parsed and described requests', () => {
    const goal = acceptedGoal();
    delete goal.data.axwise_customer_intelligence.scope_packet;
    delete goal.data.axwise_customer_intelligence.scope_validation;
    delete goal.data.axwise_customer_intelligence.axwise_scope_confirmation;
    goal.parsed_requirements = `${'P'.repeat(8_000)}PARSED_LATE_EXCLUSION`;
    goal.description = `${'D'.repeat(8_000)}DESCRIPTION_LATE_EXCLUSION`;

    const state = buildCustomerRoutingRequest({ goal, agents: [] }).scope_state;
    const rawWindows = state.requirements.filter((item) =>
      item.source_refs.some(
        (ref) => ref.startsWith('goal.parsed_requirements#') || ref.startsWith('goal.description#')
      )
    );

    expect(rawWindows).toHaveLength(4);
    expect(rawWindows.reduce((total, item) => total + item.text.length, 0)).toBeLessThanOrEqual(
      7_800
    );
    expect(
      rawWindows.find((item) => item.source_refs.includes('goal.parsed_requirements#end'))?.text
    ).toContain('PARSED_LATE_EXCLUSION');
    expect(
      rawWindows.find((item) => item.source_refs.includes('goal.description#end'))?.text
    ).toContain('DESCRIPTION_LATE_EXCLUSION');
  });

  it('fails closed for an unsupported native packet instead of rebuilding from stale raw text', () => {
    const goal = acceptedGoal();
    goal.data.axwise_customer_intelligence.scope_packet.version = 'axwise_scope_packet_v99';

    expect(() => buildCustomerRoutingRequest({ goal, agents: [] })).toThrow(
      'Native AxWise scope packet version is unsupported'
    );
  });

  it('preserves a direct SMS side-effect request but not SMS design or planning language', () => {
    const direct = acceptedGoal();
    direct.title = 'Send an SMS reminder to consented recipients';
    direct.description = 'Use the approved recipient list and retain provider receipts.';
    expect(
      buildCustomerRoutingRequest({ goal: direct, agents: [] }).task.requested_actions
    ).toEqual(['send_sms']);
    direct.title = 'Send an SMS service notification to consented recipients';
    expect(
      buildCustomerRoutingRequest({ goal: direct, agents: [] }).task.requested_actions
    ).toEqual(['send_sms']);

    for (const title of [
      'Design an SMS API for appointment reminders',
      'Prepare a plan to send an SMS reminder',
      'Explain how to send an SMS reminder',
      'Build a service that can send an SMS reminder',
      'Do not under any circumstances send an SMS reminder',
    ]) {
      const preparation = acceptedGoal();
      preparation.title = title;
      preparation.description = 'Return a reviewable design document only.';
      expect(
        buildCustomerRoutingRequest({ goal: preparation, agents: [] }).task.requested_actions
      ).not.toContain('send_sms');
    }
  });
});
