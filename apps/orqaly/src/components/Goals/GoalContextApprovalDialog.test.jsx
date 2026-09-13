import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../services/goalService', () => ({
  approveGoalContext: vi.fn(async () => ({})),
  getGoalResearchBundle: vi.fn(() => new Promise(() => {})),
  requestGoalContextEvidence: vi.fn(async () => ({})),
  reviseGoalContext: vi.fn(async () => ({})),
}));

import GoalContextApprovalDialog from './GoalContextApprovalDialog';
import {
  approveGoalContext,
  requestGoalContextEvidence,
  reviseGoalContext,
} from '../../services/goalService';

const goal = {
  id: 'goal-1',
  title: 'Reduce missed appointments',
  tech_doc: {
    target_audience: 'Clinic operations manager',
    problem_statement: 'No-shows leave clinical capacity unused.',
    success_criteria: ['Reduce no-shows by 20%'],
  },
  data: {
    axwise_customer_intelligence: {
      decision_id: 'decision-1',
      routing_mode: 'evidence_assisted',
      persona_resolution: {
        customer_persona: {
          name: 'Clinic operations manager',
          profile: { role: 'Capacity owner', problem: 'Unused appointment slots' },
          trust: { status: 'evidence_supported', verified: true },
          evidence: [{ reference_id: 'appointments-1', verified: true }],
        },
        ideal_agent_persona: {
          role: 'Healthcare operations specialist',
          required_capabilities: ['workflow analysis'],
        },
      },
    },
  },
};

const SCOPE_HASH = 'a'.repeat(64);
const CONTRACT_HASH = 'b'.repeat(64);
const EXECUTION_INPUTS_HASH = 'c'.repeat(64);
const CONTEXT_SNAPSHOT_HASH = 'd'.repeat(64);
const RESEARCH_DATA_CATEGORIES = [
  'Accepted goal/task prose and typed scope/constraints',
  'Business/research brief, questions, geography, and evidence requirements',
  'Executor candidate role/profile/capability fields needed for matching',
  'Generated synthetic participant/interview/persona/PRD content',
  'Public-source snippets and grounded evidence',
];
const RESEARCH_EXCLUDED_CATEGORIES = [
  'Credentials and API secrets',
  'Payment data',
  'Raw auth/session tokens',
  'Unrelated goals',
];

function typedResearchGoal(mode, { tamperPreview = false } = {}) {
  const startsResearch = mode === 'grounded' || mode === 'synthetic';
  const typedGoal = structuredClone(goal);
  Object.assign(typedGoal, {
    org_id: 'org-1',
    user_id: 'user-1',
    status: 'awaiting_context_approval',
  });
  typedGoal.data.research_policy = {
    required: startsResearch,
    grounding_required: mode === 'grounded',
    research_fail_closed: startsResearch,
  };
  typedGoal.data.goal_approvals = {
    context: { status: 'pending', snapshot_hash: CONTEXT_SNAPSHOT_HASH },
  };
  typedGoal.data.scope_admission = {
    native_scope: true,
    status: 'awaiting_confirmation',
    scope_hash: SCOPE_HASH,
  };
  Object.assign(typedGoal.data.axwise_customer_intelligence, {
    status: 'scope_proposed',
    generation: 4,
    updated_at: '2026-08-24T12:00:00.000Z',
    research_execution_inputs_hash: EXECUTION_INPUTS_HASH,
    scope_packet: {
      version: 'axwise_scope_packet_v1',
      scope_hash: SCOPE_HASH,
      intent: {
        objective: 'Plan an Estonia market launch.',
        problem: 'The route to market is unverified.',
        desired_outcome: 'A decision-ready distribution plan.',
        non_goals: [],
      },
      ledger: { requirements: [] },
      admission: { work_types: ['strategy_planning'] },
      deliverable: { type: 'markdown', count: 1, required_sections: [] },
      research_contract: {
        version: 'axwise_scope_research_contract_v1',
        contract_hash: CONTRACT_HASH,
        document_intent: 'commercial_market_launch',
        work_types: ['procurement_sourcing', 'research_analysis', 'strategy_planning'],
        geographies: ['EE'],
        evidence: {
          mode,
          grounding_required: mode === 'grounded',
          external_sources_required: mode === 'grounded',
          required_outputs:
            mode === 'none' ? [] : ['market_sources', 'persona_resolution', 'research_prd'],
        },
        executor_role_slots: [
          { slot_id: 'role-1111111111111111', role: 'Market Research Lead', required: true },
          { slot_id: 'role-2222222222222222', role: 'Distribution Strategist', required: true },
        ],
      },
      runtime: {
        provider: 'google',
        model: 'gemini-3.8-flash',
        reasoning_mode: 'high',
        output_policy: 'provider_maximum_no_workflow_cap',
      },
    },
    scope_validation: {
      version: 'axwise_scope_validation_v1',
      scope_hash: SCOPE_HASH,
      valid: true,
      ready_for_synthesis: true,
    },
    axwise_scope_confirmation: {
      status: 'proceed_or_edit',
      primary_action: 'proceed',
      scope_hash: SCOPE_HASH,
    },
    ...(startsResearch
      ? {
          research_execution_preview: {
            version: 'orqaly_scope_research_execution_preview_v1',
            proposal_decision_id: 'decision-1',
            scope_hash: SCOPE_HASH,
            contract_hash: CONTRACT_HASH,
            research_execution_inputs_hash: tamperPreview ? 'f'.repeat(64) : EXECUTION_INPUTS_HASH,
            destination: 'Google Gemini API',
            purpose: 'Scope-bound customer, executor, and evidence research',
            data_categories: [...RESEARCH_DATA_CATEGORIES],
            excluded_categories: [...RESEARCH_EXCLUDED_CATEGORIES],
            model: 'gemini-3.8-flash',
            maximum_cost_usd: 5,
            estimated_cost_usd: 1,
            maximum_latency_ms: 1_200_000,
            estimated_latency_ms: 300_000,
          },
        }
      : {}),
  });
  return typedGoal;
}

beforeEach(() => vi.clearAllMocks());

describe('GoalContextApprovalDialog', () => {
  it('shows the exact grounded Gemini contract and bounded limits before one confirmation', async () => {
    const groundedGoal = typedResearchGoal('grounded');
    render(<GoalContextApprovalDialog open goal={groundedGoal} onClose={() => {}} />);

    const contract = screen.getByRole('region', {
      name: /research contract you are confirming/i,
    });
    expect(within(contract).getByText('Evidence: grounded')).toBeInTheDocument();
    expect(within(contract).getByText(/Provider: google/)).toBeInTheDocument();
    expect(within(contract).getByText(/Model: gemini-3\.8-flash/)).toBeInTheDocument();
    expect(within(contract).getByText(/Reasoning: high/)).toBeInTheDocument();
    expect(
      within(contract).getByText(/Output policy: provider_maximum_no_workflow_cap/)
    ).toBeInTheDocument();
    expect(within(contract).getByText('EE')).toBeInTheDocument();
    expect(within(contract).getByText(/market_sources/)).toBeInTheDocument();
    expect(
      within(contract).getByText(/Market Research Lead · role-1111111111111111/)
    ).toBeInTheDocument();
    expect(within(contract).getByText(/Maximum cost: \$5\.00 USD/)).toBeInTheDocument();
    expect(
      within(contract).getByText(/Maximum latency: 1,200,000 ms \(20 min\)/)
    ).toBeInTheDocument();
    const dataConsent = within(contract).getByRole('region', {
      name: /data sent to google gemini/i,
    });
    expect(within(dataConsent).getByText('Google Gemini API')).toBeInTheDocument();
    expect(
      within(dataConsent).getByText(
        /solely for Scope-bound customer, executor, and evidence research/
      )
    ).toBeInTheDocument();
    expect(
      within(dataConsent).getByText(/Accepted goal\/task prose and typed scope\/constraints/)
    ).toBeInTheDocument();
    expect(within(dataConsent).getByText(/Credentials and API secrets/)).toBeInTheDocument();
    expect(screen.queryByText(/Confirm & plan is blocked/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /confirm & start research/i }));

    await waitFor(() =>
      expect(approveGoalContext).toHaveBeenCalledWith('goal-1', {
        version: 'orqaly_native_scope_action_binding_v1',
        org_id: 'org-1',
        user_id: 'user-1',
        scope_hash: SCOPE_HASH,
        research_contract_hash: CONTRACT_HASH,
        research_execution_inputs_hash: EXECUTION_INPUTS_HASH,
        generation: '4',
        scope_updated_at: '2026-08-24T12:00:00.000Z',
        context_snapshot_hash: CONTEXT_SNAPSHOT_HASH,
      })
    );
  });

  it('shows synthetic research without claiming external grounding', () => {
    render(
      <GoalContextApprovalDialog open goal={typedResearchGoal('synthetic')} onClose={() => {}} />
    );

    const contract = screen.getByRole('region', {
      name: /research contract you are confirming/i,
    });
    expect(within(contract).getByText('Evidence: synthetic')).toBeInTheDocument();
    expect(within(contract).getByText(/Grounding required: No/)).toBeInTheDocument();
    expect(within(contract).getByText(/External sources required: No/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /confirm & start research/i })).toBeEnabled();
  });

  it('sends an evidence-none scope directly to planning', () => {
    render(<GoalContextApprovalDialog open goal={typedResearchGoal('none')} onClose={() => {}} />);

    const contract = screen.getByRole('region', {
      name: /research contract you are confirming/i,
    });
    expect(within(contract).getByText('Evidence: none')).toBeInTheDocument();
    expect(within(contract).getByText('No research run is proposed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /confirm & plan/i })).toBeEnabled();
    expect(
      screen.queryByRole('button', { name: /confirm & start research/i })
    ).not.toBeInTheDocument();
  });

  it('blocks the reserved existing-evidence mode until it has a portable contract', () => {
    render(
      <GoalContextApprovalDialog open goal={typedResearchGoal('existing')} onClose={() => {}} />
    );

    expect(
      screen.getByText(/Existing-evidence research is not supported yet/i)
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /research mode unavailable/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /request changes/i })).toBeEnabled();
  });

  it('fails closed when the durable preview was tampered with or belongs to a stale scope', () => {
    render(
      <GoalContextApprovalDialog
        open
        goal={typedResearchGoal('grounded', { tamperPreview: true })}
        onClose={() => {}}
      />
    );

    expect(
      screen.getByText(/Research authorization details are missing or stale/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/does not match this scope/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /confirm & start research/i })).toBeDisabled();
    expect(approveGoalContext).not.toHaveBeenCalled();
  });

  it.each([
    [
      'proposal decision identity',
      (preview) => {
        preview.proposal_decision_id = 'decision-stale';
      },
    ],
    [
      'scope identity',
      (preview) => {
        preview.scope_hash = 'e'.repeat(64);
      },
    ],
    [
      'research contract identity',
      (preview) => {
        delete preview.contract_hash;
      },
    ],
    [
      'destination',
      (preview) => {
        delete preview.destination;
      },
    ],
    [
      'purpose',
      (preview) => {
        preview.purpose = 'A broader secondary purpose';
      },
    ],
    [
      'included data categories',
      (preview) => {
        preview.data_categories = preview.data_categories.slice(1);
      },
    ],
    [
      'excluded data categories',
      (preview) => {
        preview.excluded_categories = [...preview.excluded_categories, 'A new exclusion'];
      },
    ],
  ])('blocks confirmation when the proposal-bound %s are absent or tampered', (_, tamper) => {
    const tamperedGoal = typedResearchGoal('grounded');
    tamper(tamperedGoal.data.axwise_customer_intelligence.research_execution_preview);

    render(<GoalContextApprovalDialog open goal={tamperedGoal} onClose={() => {}} />);

    expect(
      screen.getByText(/Research authorization details are missing or stale/i)
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /confirm & start research/i })).toBeDisabled();
    expect(
      screen.queryByRole('region', { name: /data sent to google gemini/i })
    ).not.toBeInTheDocument();
    expect(approveGoalContext).not.toHaveBeenCalled();
  });

  it('keeps the dialog open and surfaces a server stale-action CAS rejection', async () => {
    const onAction = vi.fn();
    const onClose = vi.fn();
    approveGoalContext.mockRejectedValueOnce(
      new Error('This scope changed after it was displayed. Refresh and confirm the current scope.')
    );
    render(
      <GoalContextApprovalDialog
        open
        goal={typedResearchGoal('grounded')}
        onClose={onClose}
        onAction={onAction}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /confirm & start research/i }));

    expect(
      await screen.findByText(/This scope changed after it was displayed/i)
    ).toBeInTheDocument();
    expect(onAction).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows the AxWise context and confirms it before planning', async () => {
    const onAction = vi.fn();
    render(<GoalContextApprovalDialog open goal={goal} onClose={() => {}} onAction={onAction} />);

    expect(screen.getByText('Clinic operations manager')).toBeInTheDocument();
    expect(screen.getByText('Healthcare operations specialist')).toBeInTheDocument();
    expect(screen.getByText('Not externally verified')).toBeInTheDocument();
    expect(screen.queryByText(/\(verified\)/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /confirm & plan/i }));

    await waitFor(() => expect(approveGoalContext).toHaveBeenCalledWith('goal-1'));
    expect(onAction).toHaveBeenCalledWith('approved');
  });

  it.each(['auto', 'instant'])(
    'keeps direct fail-closed %s context confirmable without a research bundle',
    (researchMode) => {
      const directGoal = structuredClone(goal);
      directGoal.data.research_policy = {
        research_mode: researchMode,
        grounding_required: false,
        research_fail_closed: true,
      };

      render(<GoalContextApprovalDialog open goal={directGoal} onClose={() => {}} />);

      expect(screen.getByRole('button', { name: /confirm & plan/i })).toBeEnabled();
      expect(screen.queryByText(/Confirm & plan is blocked/i)).not.toBeInTheDocument();
    }
  );

  it('shows exactly one native material question and keeps only answer available for approval', async () => {
    const blockedGoal = structuredClone(goal);
    const scopeHash = 'a'.repeat(64);
    const materialQuestion = 'Which approved customer segment should receive the pilot?';
    blockedGoal.org_id = 'org-1';
    blockedGoal.user_id = 'user-1';
    Object.assign(blockedGoal.data.axwise_customer_intelligence, {
      generation: 3,
      updated_at: '2026-08-24T08:02:00.000Z',
      research_execution_inputs_hash: EXECUTION_INPUTS_HASH,
      scope_packet: {
        version: 'axwise_scope_packet_v1',
        scope_hash: scopeHash,
        research_contract: { contract_hash: CONTRACT_HASH },
      },
      scope_validation: {
        version: 'axwise_scope_validation_v1',
        scope_hash: scopeHash,
        valid: true,
        ready_for_synthesis: false,
      },
      axwise_scope_confirmation: {
        status: 'needs_material_input',
        primary_action: 'answer',
        material_question: materialQuestion,
        scope_hash: scopeHash,
      },
    });
    blockedGoal.data.goal_approvals = {
      context: { status: 'pending', snapshot_hash: 'c'.repeat(64) },
    };

    render(<GoalContextApprovalDialog open goal={blockedGoal} onClose={() => {}} />);

    expect(screen.getAllByText(materialQuestion)).toHaveLength(1);
    expect(screen.getByRole('button', { name: /confirm & plan/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /answer axwise/i })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: /answer axwise/i }));
    fireEvent.change(screen.getByLabelText(/your answer to axwise/i), {
      target: { value: 'Start with existing Berlin clinic customers.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send answer/i }));

    await waitFor(() =>
      expect(reviseGoalContext).toHaveBeenCalledWith(
        'goal-1',
        'Start with existing Berlin clinic customers.',
        {
          version: 'orqaly_native_scope_action_binding_v1',
          org_id: 'org-1',
          user_id: 'user-1',
          scope_hash: scopeHash,
          research_contract_hash: CONTRACT_HASH,
          research_execution_inputs_hash: EXECUTION_INPUTS_HASH,
          generation: '3',
          scope_updated_at: '2026-08-24T08:02:00.000Z',
          context_snapshot_hash: 'c'.repeat(64),
        }
      )
    );
    expect(approveGoalContext).not.toHaveBeenCalled();
  });

  it('shows the canonical requirements, non-goals, work shape and deliverable before approval', () => {
    const nativeGoal = structuredClone(goal);
    const scopeHash = 'b'.repeat(64);
    Object.assign(nativeGoal.data.axwise_customer_intelligence, {
      scope_packet: {
        version: 'axwise_scope_packet_v1',
        scope_hash: scopeHash,
        intent: {
          objective: 'Launch a 90-day physical-retail pilot.',
          problem: 'No local distribution channel exists.',
          desired_outcome: 'Validate independent pet-shop distribution.',
          non_goals: ['No ecommerce buildout', 'No shipment execution'],
        },
        admission: {
          work_types: ['logistics_distribution'],
          success_criteria: ['A decision-ready operating plan'],
        },
        deliverable: {
          type: 'markdown',
          count: 1,
          title_prefix: '# Estonia Cat-Food Distribution Pilot',
          required_sections: ['Scope and Assumptions', '90-Day Pilot Roadmap'],
        },
        ledger: {
          requirements: [
            { requirement_id: 'req-1', text: 'Limit the pilot to Tallinn and Tartu.' },
          ],
        },
      },
      scope_validation: {
        version: 'axwise_scope_validation_v1',
        scope_hash: scopeHash,
        valid: true,
        ready_for_synthesis: true,
      },
      axwise_scope_confirmation: {
        status: 'proceed_or_edit',
        primary_action: 'proceed',
        scope_hash: scopeHash,
      },
    });

    render(<GoalContextApprovalDialog open goal={nativeGoal} onClose={() => {}} />);

    expect(screen.getByText('Canonical AxWise scope')).toBeInTheDocument();
    expect(screen.getByText('Launch a 90-day physical-retail pilot.')).toBeInTheDocument();
    expect(screen.getByText(/Limit the pilot to Tallinn and Tartu/)).toBeInTheDocument();
    expect(screen.getByText(/No ecommerce buildout/)).toBeInTheDocument();
    expect(screen.getByText('logistics_distribution')).toBeInTheDocument();
    expect(screen.getByText(/Estonia Cat-Food Distribution Pilot/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /confirm & plan/i })).toBeEnabled();
  });

  it('opens the imported research bundle from Gate 1 and labels transcript spans precisely', () => {
    const researchedGoal = structuredClone(goal);
    researchedGoal.data.axwise_customer_intelligence.research_bundle = {
      run_id: 'run-bremen',
      bundle_version: 'axwise_research_bundle_v1',
      source_count: 3,
      persona_count: 2,
      selected_persona_ids: ['persona-owner'],
    };
    researchedGoal.data.axwise_customer_intelligence.research_bundle_summary = {
      status: 'completed',
      coverage: 0.8,
      confidence: 0.76,
      stages: [{ id: 'sources', name: 'Source review', status: 'completed' }],
    };
    researchedGoal.data.axwise_customer_intelligence.persona_resolution.customer_persona.evidence =
      [
        {
          reference_id: 'transcript-1',
          quote: 'Local proof reduces perceived risk.',
          verified: true,
          start_char: 20,
          end_char: 57,
        },
      ];

    render(
      <GoalContextApprovalDialog
        open
        goal={researchedGoal}
        onClose={() => {}}
        researchBundleLoader={() => new Promise(() => {})}
      />
    );

    expect(screen.getByText(/1\/1 stages complete/i)).toBeInTheDocument();
    expect(screen.getByText('Transcript span checked')).toBeInTheDocument();
    expect(screen.getByText('Not externally verified')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /view research details/i }));
    expect(screen.getByRole('tablist', { name: /research detail sections/i })).toBeInTheDocument();
  });

  it('closes research details without closing the customer-context dialog', async () => {
    const onClose = vi.fn();
    const researchedGoal = structuredClone(goal);
    researchedGoal.data.axwise_customer_intelligence.research_bundle = {
      run_id: 'run-bremen',
      bundle_version: 'axwise_research_bundle_v1',
      source_count: 3,
    };

    render(
      <GoalContextApprovalDialog
        open
        goal={researchedGoal}
        onClose={onClose}
        researchBundleLoader={() => new Promise(() => {})}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /view research details/i }));
    const stackedDialogs = screen.getAllByRole('dialog', { hidden: true });
    expect(stackedDialogs).toHaveLength(2);

    const researchDialog = stackedDialogs.at(-1);
    fireEvent.click(within(researchDialog).getAllByRole('button', { name: 'Close' })[0]);

    await waitFor(() =>
      expect(
        screen.queryByRole('tablist', { name: /research detail sections/i })
      ).not.toBeInTheDocument()
    );
    expect(screen.getByText('Confirm the proposed scope')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not leave research details open when its parent closes', async () => {
    const researchedGoal = structuredClone(goal);
    researchedGoal.data.axwise_customer_intelligence.research_bundle = {
      run_id: 'run-bremen',
      bundle_version: 'axwise_research_bundle_v1',
      source_count: 3,
    };
    const { rerender } = render(
      <GoalContextApprovalDialog
        open
        goal={researchedGoal}
        onClose={() => {}}
        researchBundleLoader={() => new Promise(() => {})}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /view research details/i }));
    expect(screen.getByRole('tablist', { name: /research detail sections/i })).toBeInTheDocument();

    rerender(
      <GoalContextApprovalDialog
        open={false}
        goal={researchedGoal}
        onClose={() => {}}
        researchBundleLoader={() => new Promise(() => {})}
      />
    );

    await waitFor(() =>
      expect(
        screen.queryByRole('tablist', { name: /research detail sections/i })
      ).not.toBeInTheDocument()
    );
  });

  it('labels evidence omitted from the compact summary and links to the full report', () => {
    const researchedGoal = structuredClone(goal);
    researchedGoal.data.axwise_customer_intelligence.research_bundle = {
      run_id: 'run-bremen',
      bundle_version: 'axwise_research_bundle_v1',
      source_count: 10,
    };
    researchedGoal.data.axwise_customer_intelligence.persona_resolution.customer_persona.evidence =
      Array.from({ length: 10 }, (_, index) => ({
        reference_id: `evidence-${index + 1}`,
        quote: `Evidence statement ${index + 1}`,
      }));

    render(
      <GoalContextApprovalDialog
        open
        goal={researchedGoal}
        onClose={() => {}}
        researchBundleLoader={() => new Promise(() => {})}
      />
    );

    expect(
      screen.getByText('+2 more evidence items not shown in this summary.')
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /view full research details/i })).toHaveLength(1);
  });

  it('sends a human evidence request back through AxWise routing', async () => {
    render(<GoalContextApprovalDialog open goal={goal} onClose={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: /ask for evidence/i }));
    fireEvent.change(screen.getByLabelText(/what needs stronger evidence/i), {
      target: { value: 'Verify the no-show baseline.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send evidence request/i }));

    await waitFor(() =>
      expect(requestGoalContextEvidence).toHaveBeenCalledWith(
        'goal-1',
        'Verify the no-show baseline.'
      )
    );
  });

  it('keeps v2 approval blocked until persisted typed evidence rows load', async () => {
    const v2Goal = structuredClone(goal);
    v2Goal.data.research_policy = {
      research_mode: 'grounded_deep',
      grounding_required: true,
      research_fail_closed: true,
    };
    v2Goal.data.axwise_customer_intelligence.research_bundle = {
      run_id: 'run-v2',
      bundle_version: 'axwise_research_bundle_v2',
      fact_count: 0,
      calculation_count: 0,
      evidence_profile_version: 'business_evidence_profile_v1',
      context_gate: { status: 'ready', issues: [] },
    };
    let resolveBundle;
    const researchBundleLoader = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveBundle = resolve;
        })
    );

    render(
      <GoalContextApprovalDialog
        open
        goal={v2Goal}
        onClose={() => {}}
        researchBundleLoader={researchBundleLoader}
      />
    );

    expect(screen.getByRole('button', { name: /confirm & plan/i })).toBeDisabled();
    expect(
      screen.getByText(/Persisted typed facts and calculations must load/i)
    ).toBeInTheDocument();

    resolveBundle({
      run: {
        id: 'run-v2',
        bundle_version: 'axwise_research_bundle_v2',
        evidence_profile_version: 'business_evidence_profile_v1',
        fact_count: 0,
        calculation_count: 0,
      },
      bundle: {
        version: 'axwise_research_bundle_v2',
        status: 'completed',
        evidence_profile: {
          version: 'business_evidence_profile_v1',
          intent: 'commercial_market_launch',
          economic_model: 'none',
        },
        quality: { evidence_contract: { status: 'passed' } },
      },
      sources: [],
      personas: [],
      artifacts: [],
      assignments: [],
      facts: [],
      calculations: [],
    });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /confirm & plan/i })).toBeEnabled()
    );
    expect(
      screen.queryByText(/Persisted typed facts and calculations must load/i)
    ).not.toBeInTheDocument();
  });

  it('blocks confirmation but leaves correction and evidence actions available when Gate 1 fails', () => {
    const blockedGoal = structuredClone(goal);
    blockedGoal.data.research_policy = {
      research_mode: 'grounded_deep',
      grounding_required: true,
      research_fail_closed: true,
    };
    blockedGoal.data.axwise_customer_intelligence.research_bundle = {
      run_id: 'run-blocked',
      bundle_hash: 'a'.repeat(64),
    };

    render(<GoalContextApprovalDialog open goal={blockedGoal} onClose={() => {}} />);

    expect(screen.getByText(/Confirm & plan is blocked/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /confirm & plan/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /request changes/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /ask for evidence/i })).toBeEnabled();
  });

  it('labels degraded context as an Orqaly fallback instead of an AxWise result', () => {
    const degradedGoal = structuredClone(goal);
    degradedGoal.data.axwise_customer_intelligence = {
      status: 'degraded',
      degraded: true,
      error_code: 'AXWISE_HTTP_404',
      reason: 'AxWise orchestration API error: HTTP 404',
    };

    render(<GoalContextApprovalDialog open goal={degradedGoal} onClose={() => {}} />);

    expect(screen.getByText('AxWise unavailable — Orqaly fallback')).toBeInTheDocument();
    expect(screen.getByText(/AxWise did not produce a signed scope/i)).toBeInTheDocument();
    expect(screen.queryByText('AxWise: degraded fallback')).not.toBeInTheDocument();
  });
});
