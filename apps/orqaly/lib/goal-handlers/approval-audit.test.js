import { describe, expect, it } from 'vitest';
import {
  approvedApproval,
  buildContextApprovalSnapshot,
  buildExecutionApprovalSnapshot,
  hashApprovalSnapshot,
  isApprovalCurrent,
  invalidatedApproval,
  pendingApproval,
} from './approval-audit.js';

const goal = {
  id: 'goal-1',
  title: 'Reduce missed appointments',
  description: 'Reduce dental clinic no-shows.',
  budget_usd: 20,
  iteration: 0,
  agent_team_id: 'team-1',
  tech_doc: {
    problem_statement: 'No-shows leave clinical capacity unused.',
    target_audience: 'Clinic operations manager',
    success_criteria: ['Reduce no-shows by 20%'],
    constraints: ['Protect patient privacy'],
  },
  plan: { phases: [{ name: 'Diagnose', jobs: [] }] },
  proposal: { total_cost: { total: 4.2 } },
  data: {
    axwise_customer_intelligence: {
      decision_id: 'context-1',
      request_hash: 'request-1',
      routing_mode: 'evidence_assisted',
      persona_resolution: { customer_persona: { name: 'Clinic operations manager' } },
    },
    axwise_orchestration: { decision_id: 'team-decision-1', assignments: { step: 'agent-1' } },
    required_tools: ['tool-email'],
  },
};

describe('goal approval audit snapshots', () => {
  it('preserves the invalidation audit marker on a replacement pending approval', () => {
    const approved = approvedApproval('execution', { plan: 'old' }, 'user-1');
    const invalidated = invalidatedApproval(approved, 'plan_replaced_by_iteration');
    const pending = pendingApproval('execution', { plan: 'replacement' }, invalidated);

    expect(pending).toMatchObject({
      status: 'pending',
      invalidated_at: invalidated.invalidated_at,
      invalidation_reason: 'plan_replaced_by_iteration',
    });
    expect(pending.snapshot_hash).not.toBe(approved.snapshot_hash);
  });

  it('hashes equivalent objects deterministically', () => {
    expect(hashApprovalSnapshot('context', { b: 2, a: 1 })).toBe(
      hashApprovalSnapshot('context', { a: 1, b: 2 })
    );
  });

  it('invalidates context approval when customer understanding changes', () => {
    const snapshot = buildContextApprovalSnapshot(goal);
    const record = approvedApproval('context', snapshot, 'user-1');
    expect(isApprovalCurrent('context', snapshot, record)).toBe(true);

    const changed = buildContextApprovalSnapshot({
      ...goal,
      tech_doc: { ...goal.tech_doc, target_audience: 'Dental patients' },
    });
    expect(isApprovalCurrent('context', changed, record)).toBe(false);
  });

  it('binds context approval to the exact native packet, validation, and confirmation identity', () => {
    const scopeHash = 'a'.repeat(64);
    const withNativeScope = structuredClone(goal);
    Object.assign(withNativeScope.data.axwise_customer_intelligence, {
      scope_packet: {
        version: 'axwise_scope_packet_v1',
        scope_ref: 'axwise:goal-1:decision-1',
        scope_hash: scopeHash,
        document_status: 'Ready for review',
        admission: { version: 'axwise_scope_admission_v1' },
        research_contract: { contract_hash: 'b'.repeat(64) },
      },
      research_execution_inputs_hash: 'e'.repeat(64),
      scope_validation: {
        scope_hash: scopeHash,
        valid: true,
        ready_for_synthesis: true,
      },
      axwise_scope_confirmation: {
        scope_hash: scopeHash,
        status: 'proceed_or_edit',
        primary_action: 'proceed',
        authorizes_external_actions: false,
      },
    });

    const snapshot = buildContextApprovalSnapshot(withNativeScope);
    expect(snapshot.native_scope_contract).toEqual({
      packet_version: 'axwise_scope_packet_v1',
      scope_ref: 'axwise:goal-1:decision-1',
      scope_hash: scopeHash,
      generation: null,
      scope_updated_at: null,
      document_status: 'Ready for review',
      admission_version: 'axwise_scope_admission_v1',
      research_contract_hash: 'b'.repeat(64),
      research_execution_inputs_hash: 'e'.repeat(64),
      validation_scope_hash: scopeHash,
      validation_valid: true,
      validation_ready_for_synthesis: true,
      confirmation_scope_hash: scopeHash,
      confirmation_status: 'proceed_or_edit',
      confirmation_primary_action: 'proceed',
      confirmation_material_question: null,
      confirmation_authorizes_external_actions: false,
    });
    const approval = approvedApproval('context', snapshot, 'user-1');

    const replaced = structuredClone(withNativeScope);
    replaced.data.axwise_customer_intelligence.scope_packet.scope_hash = 'b'.repeat(64);
    replaced.data.axwise_customer_intelligence.scope_validation.scope_hash = 'b'.repeat(64);
    replaced.data.axwise_customer_intelligence.axwise_scope_confirmation.scope_hash = 'b'.repeat(
      64
    );
    expect(isApprovalCurrent('context', buildContextApprovalSnapshot(replaced), approval)).toBe(
      false
    );

    const regenerated = structuredClone(withNativeScope);
    regenerated.data.axwise_customer_intelligence.generation = 2;
    expect(isApprovalCurrent('context', buildContextApprovalSnapshot(regenerated), approval)).toBe(
      false
    );

    const materialQuestionChanged = structuredClone(withNativeScope);
    materialQuestionChanged.data.axwise_customer_intelligence.axwise_scope_confirmation = {
      ...materialQuestionChanged.data.axwise_customer_intelligence.axwise_scope_confirmation,
      status: 'needs_material_input',
      primary_action: 'answer',
      material_question: 'Which approved segment should receive the pilot?',
    };
    expect(
      isApprovalCurrent('context', buildContextApprovalSnapshot(materialQuestionChanged), approval)
    ).toBe(false);
  });

  it('pins the current research bundle, PRD and selected personas into context approval', () => {
    const withResearch = {
      ...goal,
      data: {
        ...goal.data,
        research_policy: {
          market_scope_hash: 'a'.repeat(64),
          market_scope: {
            resolved_scope: {
              countries: [{ country_code: 'EE' }, { country_code: 'LV' }],
            },
          },
        },
        axwise_customer_intelligence: {
          ...goal.data.axwise_customer_intelligence,
          research_bundle: {
            run_id: 'run-1',
            bundle_hash: 'b'.repeat(64),
            research_prd_hash: 'c'.repeat(64),
            selected_persona_ids: ['executor-1', 'customer-1', 'executor-1'],
            source_count: 10,
            market_scope_hash: 'a'.repeat(64),
          },
        },
      },
    };

    const snapshot = buildContextApprovalSnapshot(withResearch);
    expect(snapshot.research_bundle).toEqual({
      bundle_hash: 'b'.repeat(64),
      research_prd_hash: 'c'.repeat(64),
      selected_persona_ids: ['customer-1', 'executor-1'],
      market_scope_hash: 'a'.repeat(64),
    });
    expect(snapshot.research_market_scope).toEqual({
      scope_hash: 'a'.repeat(64),
      resolved_country_codes: ['EE', 'LV'],
    });
    const approval = approvedApproval('context', snapshot, 'user-1');
    const changed = structuredClone(withResearch);
    changed.data.axwise_customer_intelligence.research_bundle.bundle_hash = 'd'.repeat(64);
    expect(isApprovalCurrent('context', buildContextApprovalSnapshot(changed), approval)).toBe(
      false
    );
    const marketChanged = structuredClone(withResearch);
    marketChanged.data.research_policy.market_scope_hash = 'e'.repeat(64);
    expect(
      isApprovalCurrent('context', buildContextApprovalSnapshot(marketChanged), approval)
    ).toBe(false);
  });

  it('conditionally pins typed v2 evidence identities and counts without changing v1 pins', () => {
    const withV2 = structuredClone(goal);
    withV2.data.research_policy = {
      intent: 'commercial_market_launch',
      customer_role_contract: {
        primary_roles: ['decision_authority', 'economic_buyer'],
        secondary_roles: ['operational_user', 'influencer'],
        require_primary_buyer: true,
        ineligible_roles: [],
      },
      critical_claim_policy: {
        required: true,
        fail_closed: true,
        freshness_days: 120,
        freshness_by_class: { observed_primary_market: 120, official_statistic: 730 },
        mandatory_claim_classes: [
          'statutory_current',
          'official_statistic',
          'observed_primary_market',
        ],
        authoritative_current_source_required: true,
        conflict_resolution_required: true,
      },
    };
    withV2.data.axwise_customer_intelligence.research_bundle = {
      run_id: 'run-v2',
      bundle_version: 'axwise_research_bundle_v2',
      bundle_hash: 'a'.repeat(64),
      research_prd_hash: 'b'.repeat(64),
      selected_persona_ids: ['customer-1'],
      evidence_profile_version: 'business_evidence_profile_v1',
      evidence_profile_hash: 'c'.repeat(64),
      fact_manifest_hash: 'd'.repeat(64),
      calculation_manifest_hash: 'e'.repeat(64),
      fact_count: 2,
      calculation_count: 1,
      required_role_slots: ['domain_delivery', 'pricing_finance'],
    };

    expect(buildContextApprovalSnapshot(withV2).research_bundle).toEqual({
      bundle_hash: 'a'.repeat(64),
      research_prd_hash: 'b'.repeat(64),
      selected_persona_ids: ['customer-1'],
      bundle_version: 'axwise_research_bundle_v2',
      evidence_profile_version: 'business_evidence_profile_v1',
      evidence_profile_hash: 'c'.repeat(64),
      fact_manifest_hash: 'd'.repeat(64),
      calculation_manifest_hash: 'e'.repeat(64),
      fact_count: 2,
      calculation_count: 1,
      required_role_slots: ['domain_delivery', 'pricing_finance'],
    });
    expect(buildContextApprovalSnapshot(withV2).research_authority_policy).toEqual({
      intent: 'commercial_market_launch',
      customer_role_contract: {
        primary_roles: ['decision_authority', 'economic_buyer'],
        secondary_roles: ['influencer', 'operational_user'],
        ineligible_roles: [],
        require_primary_buyer: true,
      },
      critical_claim_policy: {
        required: true,
        fail_closed: true,
        freshness_days: 120,
        freshness_by_class: { observed_primary_market: 120, official_statistic: 730 },
        mandatory_claim_classes: [
          'observed_primary_market',
          'official_statistic',
          'statutory_current',
        ],
        authoritative_current_source_required: true,
        conflict_resolution_required: true,
      },
    });

    const approved = approvedApproval('context', buildContextApprovalSnapshot(withV2), 'user-1');
    const weakened = structuredClone(withV2);
    delete weakened.data.research_policy.critical_claim_policy;
    expect(isApprovalCurrent('context', buildContextApprovalSnapshot(weakened), approved)).toBe(
      false
    );

    const reordered = structuredClone(withV2);
    reordered.data.research_policy.customer_role_contract.primary_roles.reverse();
    reordered.data.research_policy.critical_claim_policy.mandatory_claim_classes.reverse();
    expect(hashApprovalSnapshot('context', buildContextApprovalSnapshot(reordered))).toBe(
      hashApprovalSnapshot('context', buildContextApprovalSnapshot(withV2))
    );
  });

  it('invalidates execution approval when plan, team, tools, or budget changes', () => {
    const context = buildContextApprovalSnapshot(goal);
    const withContextApproval = {
      ...goal,
      data: {
        ...goal.data,
        goal_approvals: { context: approvedApproval('context', context, 'user-1') },
      },
    };
    const snapshot = buildExecutionApprovalSnapshot(withContextApproval);
    const record = approvedApproval('execution', snapshot, 'user-1');
    expect(isApprovalCurrent('execution', snapshot, record)).toBe(true);
    expect(record.snapshot).toEqual(snapshot);

    for (const changed of [
      { ...withContextApproval, budget_usd: 30 },
      { ...withContextApproval, agent_team_id: 'team-2' },
      { ...withContextApproval, plan: { phases: [{ name: 'Changed', jobs: [] }] } },
      {
        ...withContextApproval,
        data: { ...withContextApproval.data, required_tools: ['tool-browser'] },
      },
      {
        ...withContextApproval,
        data: { ...withContextApproval.data, skip_tools: true },
      },
      {
        ...withContextApproval,
        data: { ...withContextApproval.data, tool_mode: 'no_tools' },
      },
    ]) {
      expect(isApprovalCurrent('execution', buildExecutionApprovalSnapshot(changed), record)).toBe(
        false
      );
    }
  });

  it('invalidates execution approval when team membership, assignment, or task grants change', () => {
    const authorization = {
      version: 'orqaly_execution_authorization_v1',
      team_id: 'team-1',
      team_members: [{ agent_id: 'agent-1', team_role: 'member' }],
      agent_grants: [{ agent_id: 'agent-1', tool_ids: ['tool-email'] }],
      tasks: [
        {
          task_id: 'task-1',
          agent_id: 'agent-1',
          required_tool_ids: ['tool-email'],
          granted_tool_ids: ['tool-email'],
        },
      ],
      valid: true,
      issues: [],
    };
    const snapshot = buildExecutionApprovalSnapshot(goal, authorization);
    const approval = approvedApproval('execution', snapshot, 'user-1');

    for (const changed of [
      { ...authorization, team_members: [] },
      {
        ...authorization,
        tasks: [{ ...authorization.tasks[0], agent_id: 'agent-2' }],
      },
      {
        ...authorization,
        tasks: [{ ...authorization.tasks[0], granted_tool_ids: [] }],
      },
    ]) {
      expect(
        isApprovalCurrent('execution', buildExecutionApprovalSnapshot(goal, changed), approval)
      ).toBe(false);
    }
  });

  it('keeps durable no-tools approval current when the legacy flag is cleared', () => {
    const approvedShape = {
      ...goal,
      data: { ...goal.data, tool_mode: 'no_tools', skip_tools: true },
    };
    const runtimeShape = {
      ...goal,
      data: { ...goal.data, tool_mode: 'no_tools' },
    };
    const snapshot = buildExecutionApprovalSnapshot(approvedShape);
    const approval = approvedApproval('execution', snapshot, 'user-1');

    expect(
      isApprovalCurrent('execution', buildExecutionApprovalSnapshot(runtimeShape), approval)
    ).toBe(true);
  });

  it('keeps one approval current while plan runtime status advances between phases', () => {
    const snapshot = buildExecutionApprovalSnapshot(goal);
    const approval = approvedApproval('execution', snapshot, 'user-1');
    const progressed = {
      ...goal,
      plan: {
        ...goal.plan,
        phases: goal.plan.phases.map((phase) => ({
          ...phase,
          status: 'completed',
          started_at: '2026-08-03T10:00:00Z',
          completed_at: '2026-08-03T10:01:00Z',
          duration_ms: 60_000,
          quality_score: 91,
          research_quality: {
            score: 100,
            passed: true,
            totalSources: 22,
            uniqueDomains: 21,
          },
          progress_percent: 33,
          feedback: 'Phase output passed its runtime evaluation.',
          next_action: 'continue',
          result: { internal_runtime_data: true },
        })),
      },
    };

    expect(
      isApprovalCurrent('execution', buildExecutionApprovalSnapshot(progressed), approval)
    ).toBe(true);
  });
});
