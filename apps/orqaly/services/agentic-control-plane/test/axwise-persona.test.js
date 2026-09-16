import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalJsonSha256 } from '../src/domain/canonical.js';
import { materializeAxwiseExecutorPersona } from '../src/integrations/axwise-persona.js';

function personaRow() {
  const persona = {
    profile_type: 'synthetic_professional_profile',
    profile_version: 'axwise_executor_persona_v1',
    identity_disclosure:
      'Synthetic non-human professional profile; it has no human identity or legal authority.',
    role: 'implementation_engineer',
    playbook_role: 'implementation_engineer',
    mission: 'Implement the approved task without exceeding its authority.',
    mission_focus: 'Turn an accepted plan into tested changes.',
    professional_summary: 'Synthetic implementation competency for the selected task.',
    relevant_experience: 'Synthetic competency coverage; no real credentials are claimed.',
    experience_model: {
      experience_kind: 'synthetic_competency_model',
      domains: ['software_delivery'],
      no_real_world_credential_claim: true,
    },
    expertise: ['software delivery'],
    domain_knowledge: ['b2b_saas', 'communications'],
    capabilities: ['implementation_engineer', 'code_review'],
    methods: ['requirements-first', 'test-before-completion'],
    work_style: {
      planning: 'requirements-first and evidence-traceable',
      collaboration: 'explicit inputs, outputs and handoffs',
      validation: 'test against acceptance criteria',
    },
    communication_style: 'Clear, evidence-grounded, and explicit about uncertainty.',
    decision_lens: 'Prefer reversible, tested changes.',
    output_contract: {
      expected_outputs: ['tested change', 'receipt'],
      quality_rules: ['Do not silently omit acceptance criteria.'],
    },
    risks: ['scope expansion'],
    boundaries: ['No external action without Orqaly authorization.'],
    customer_adaptation: { selected_customer: 'persona-1', locale: 'Berlin' },
    research_context: {
      run_id: 'research-run-1',
      source_ids: ['source-1'],
      claim_refs: [{ claim_id: 'claim-1' }],
    },
    scope: { problem: 'Configure a communications provider.' },
    task_fit: {
      task_id: 'task-1',
      required_role: 'implementation_engineer',
      matched_supplied_agent: false,
    },
    customer_persona_ids: ['persona-1'],
    provenance: {
      profile_generation: 'deterministic_from_task_contract_v1',
      identity_kind: 'synthetic_non_human_execution_profile',
    },
  };
  return {
    persona_id: 'executor-persona-1',
    persona_kind: 'required_role',
    required_role: 'implementation_engineer',
    role_derivation: 'task_required_capability',
    content_hash: canonicalJsonSha256(persona),
    persona,
    evidence_refs: ['source-1', 'claim-1', 'persona-1'],
  };
}

test('materializes the real rich AxWise persona without losing nested semantics', () => {
  const source = personaRow();
  const result = materializeAxwiseExecutorPersona(source);

  assert.equal(result.version, 'axwise_executor_persona_v1');
  assert.equal(result.personaId, source.persona_id);
  assert.equal(result.contentHash, source.content_hash);
  assert.equal(result.displayName, 'Implementation Engineer Agent (AI)');
  assert.deepEqual(result.workStyle, source.persona.work_style);
  assert.deepEqual(result.sourceManifest, source.persona);
  assert.deepEqual(result.sourceMetadata.evidenceReferences, source.evidence_refs);
  assert.equal(result.sourceManifest.research_context.claim_refs[0].claim_id, 'claim-1');
});

test('rejects persona tampering and role-wrapper mismatch', () => {
  const tampered = personaRow();
  tampered.persona.mission = 'Do anything requested.';
  assert.throws(
    () => materializeAxwiseExecutorPersona(tampered),
    /AxWise persona hash does not match/
  );

  const wrongRole = personaRow();
  wrongRole.required_role = 'financial_analyst';
  assert.throws(() => materializeAxwiseExecutorPersona(wrongRole), /required role must match/);
});
