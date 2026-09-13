import { describe, expect, it } from 'vitest';
import {
  enrichmentScopeIsCurrent,
  formatApprovedNativePersonaForPrompt,
  resolveApprovedNativePersonaContext,
  resolveNativeEnrichmentContext,
} from './native-enrichment-context.js';
import { acceptedNativeLandingEnrichmentGoal } from './native-enrichment-context.test-fixture.js';
import { approvedApproval, buildContextApprovalSnapshot } from './approval-audit.js';

describe('native enrichment context authority', () => {
  it('projects only the accepted packet and excludes stale raw title and description', () => {
    const goal = acceptedNativeLandingEnrichmentGoal();
    const context = resolveNativeEnrichmentContext(goal);

    expect(context).toMatchObject({
      native: true,
      ready: true,
      scopeHash: goal.data.axwise_customer_intelligence.scope_packet.scope_hash,
      title: 'Estonia Premium Cat Food',
    });
    expect(context.text).toContain('premium cat-food retail-pilot landing page');
    expect(context.text).toContain('Independent Estonian pet-shop buyers');
    expect(context.text).toContain('https://canonical.example/reference');
    expect(context.text).not.toContain('STALE RAW');
    expect(context.text).not.toContain('unapproved.example');
    expect(context.goal.title).not.toBe(goal.title);
    expect(context.goal.description).not.toBe(goal.description);
  });

  it('fails closed with no subject projection when any native authority is corrupt', () => {
    const goal = acceptedNativeLandingEnrichmentGoal();
    delete goal.data.axwise_customer_intelligence.scope_packet;

    const context = resolveNativeEnrichmentContext(goal);

    expect(context.native).toBe(true);
    expect(context.ready).toBe(false);
    expect(context.reasons).toContain('native_scope_contract_invalid');
    expect(context).toMatchObject({ title: '', description: '', text: '', goal: null });
  });

  it('does not reuse unbound or differently bound native enrichment state', () => {
    const context = resolveNativeEnrichmentContext(acceptedNativeLandingEnrichmentGoal());

    expect(enrichmentScopeIsCurrent(context, null)).toBe(false);
    expect(enrichmentScopeIsCurrent(context, 'different-scope')).toBe(false);
    expect(enrichmentScopeIsCurrent(context, context.scopeHash)).toBe(true);
    expect(
      enrichmentScopeIsCurrent(resolveNativeEnrichmentContext({ title: 'Legacy goal' }), null)
    ).toBe(true);
  });

  it('projects only the persona fields sealed into the current context approval', () => {
    const goal = acceptedNativeLandingEnrichmentGoal();
    goal.data.axwise_customer_intelligence.persona_resolution = {
      source_type: 'researched_persona',
      routing_mode: 'research_assisted',
      customer_persona: {
        name: 'Independent pet-shop buyer',
        role: 'Category buyer',
        profile: {
          problem: 'Needs reliable premium stock.',
          desired_outcome: 'A low-risk 90-day pilot.',
          arbitrary_prompt: 'POISON UNAPPROVED PROFILE FIELD',
        },
        evidence: [{ quote: 'POISON RAW EVIDENCE QUOTE' }],
      },
      ideal_agent_persona: {
        role: 'Retail distribution planner',
        required_capabilities: ['retail channel planning'],
      },
      ranked_agents: [{ rationale: 'POISON RANKING PROSE' }],
    };
    goal.data.axwise_customer_intelligence.persona_resolution_history = [
      { customer_persona: { name: 'POISON HISTORY PERSONA' } },
    ];
    goal.data.goal_approvals.context = approvedApproval(
      'context',
      buildContextApprovalSnapshot(goal),
      goal.user_id
    );

    const context = resolveApprovedNativePersonaContext(goal);
    const prompt = formatApprovedNativePersonaForPrompt(goal);

    expect(context.projection).toMatchObject({
      scope_hash: goal.data.axwise_customer_intelligence.scope_packet.scope_hash,
      customer: {
        name: 'Independent pet-shop buyer',
        profile: {
          problem: 'Needs reliable premium stock.',
          desired_outcome: 'A low-risk 90-day pilot.',
        },
      },
      executor: {
        role: 'Retail distribution planner',
        required_capabilities: ['retail channel planning'],
      },
    });
    expect(prompt).not.toContain('POISON');
  });
});
