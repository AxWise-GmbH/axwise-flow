function typedResearchContractGate(bundle, authority) {
  const contract = authority.contract;
  const issues = [];
  const add = (code, message, details = undefined) => {
    if (issues.some((item) => item.code === code)) return;
    issues.push({ code, message, ...(details === undefined ? {} : { details }) });
  };
  const requiredOutputs = contract.evidence.required_outputs;
  for (const output of requiredOutputs) {
    if (output === 'research_bundle') continue;
    if (!hasContent(bundle?.[output])) {
      add(
        `required_research_output_missing:${output}`,
        `The accepted scope contract requires a non-empty ${output} output.`
      );
    }
  }
  const quality = record(bundle?.quality);
  if (
    contract.evidence.grounding_required &&
    (quality.grounding_required !== true || quality.grounding_satisfied !== true)
  ) {
    add(
      'scope_contract_grounding_unsatisfied',
      'The accepted scope contract requires grounded external evidence.'
    );
  }

  const researchPrd = record(bundle?.research_prd);
  const prdType = String(first(researchPrd.prd_type, researchPrd.intent) || '').trim();
  if (requiredOutputs.includes('research_prd')) {
    if (prdType !== contract.document_intent) {
      add(
        'research_prd_type_mismatch',
        `Research PRD type must be ${contract.document_intent}; received ${prdType || 'missing'}.`
      );
    }
    if (
      !hasContent(researchPrd.content) ||
      !SHA256_RE.test(String(researchPrd.content_hash || '')) ||
      researchContextGateHash(researchPrd.content) !==
        String(researchPrd.content_hash || '').toLowerCase()
    ) {
      add(
        'research_prd_unpinned',
        'The required Research PRD must include content and a matching immutable content hash.'
      );
    }
  }

  const expectedRoles = contract.executor_role_slots.map((slot) => slot.role);
  const requestedRoles = stringList(
    first(
      quality.requested_execution_roles,
      quality.executor_role_coverage?.requested_roles,
      bundle?.persona_resolution?.required_execution_roles
    )
  );
  const returnedRoles = returnedExecutorRoles(bundle, quality).filter(Boolean);
  const executorPersonas = rows(bundle?.executor_personas);
  const personaRoles = executorPersonas.map((item) =>
    first(item.required_role, item.role, item.persona?.role, item.profile?.role)
  );
  if (
    !sameRoleSet(requestedRoles, expectedRoles) ||
    !sameRoleSet(returnedRoles, expectedRoles) ||
    executorPersonas.length !== expectedRoles.length ||
    !sameRoleSet(personaRoles, expectedRoles)
  ) {
    add(
      'executor_role_topology_mismatch',
      'Requested, returned, and persona executor roles must exactly match the accepted scope topology.',
      {
        expected_roles: expectedRoles,
        requested_roles: requestedRoles,
        returned_roles: returnedRoles,
        persona_roles: personaRoles.filter(Boolean),
      }
    );
  }
  return {
    version: 1,
    status: issues.length ? 'blocked' : 'ready',
    required: contract.evidence.mode !== 'none',
    intent: contract.document_intent,
    contract_hash: contract.contract_hash,
    scope_hash: authority.packet.scope_hash,
    executor_roles: {
      expected: expectedRoles,
      requested: requestedRoles,
      returned: returnedRoles,
    },
    issues,
  };
}

function blockedScopeContractGate(error) {
  return {
    version: 1,
    status: 'blocked',
    required: true,
    intent: null,
    issues: [
      {
        code: 'scope_contract_binding_invalid',
        message: error.message,
      },
    ],
  };
}

/**
 * Shared Orqaly contract for grounded commercial-market research.
 *
 * AxWise remains the producer and quality authority. Orqaly declares the
 * intended output and fails Gate 1 closed when the returned bundle cannot
 * prove that it met the approved commercial, customer, evidence, and
 * executor topology contract.
 */
import { createHash } from 'node:crypto';
import {
  canonicalContractHash,
  nativeAxwiseScopeContractBinding,
  validateNativeAxwiseDecisionContracts,
  validateNativeAxwiseScopeContractBinding,
  validateNativeAxwiseScopeRuntimeBinding,
  validateScopeResearchAcceptanceBinding,
} from '../../agent-handlers/compact-agent-contracts.js';
import { hasNativeAxwiseScopeMarkers } from '../../_shared/native-scope-approval.js';
import {
  AXWISE_RESEARCH_BUNDLE_V2,
  assertAxwiseEvidenceBundleV2,
  businessEvidenceProfileHash,
  executionRolesForEvidenceProfile,
} from './evidence-contract-v2.js';

export const COMMERCIAL_MARKET_LAUNCH_INTENT = 'commercial_market_launch';

export const COMMERCIAL_MARKET_LAUNCH_EXECUTION_ROLES = Object.freeze([
  'Marketing ICP Specialist',
  'Finance Pricing Specialist',
  'GDPR Legal Compliance Specialist',
  'Business Development Sales Specialist',
  'Commercial Risk Analyst',
]);

const COMMERCIAL_RESEARCH_PATTERN =
  /\b(commercial|customer|market|marketing|sales|revenue|pricing|package|outreach|lead(?:s| generation)?|conversion|funnel|go[- ]?to[- ]?market|gtm|buyer|competitor|icp|persona|market launch|market entry)\b/i;

const PRIMARY_BUYER_ROLES = new Set(['economic_buyer', 'decision_authority']);
const MATCHED_ASSIGNMENT_STATUSES = new Set([
  'matched',
  'matched_candidate',
  'approved',
  'authorized',
]);
const VERIFIED_CRITICAL_CLAIM_STATUSES = new Set([
  'verified_current_authoritative',
  'verified_traceable_calculation',
]);
const DIRECT_AUTHORITY_STATUSES = new Set([
  'direct_domain_verified',
  'official_registry_verified',
  'official_domain_verified',
  'publisher_domain_verified',
  'recognized_public_root_direct',
  'independently_attested_direct_domain',
]);
const DIRECT_PRIMARY_MARKET_STATUSES = new Set(['direct_primary_market_observation']);
const AUTHORITATIVE_SOURCE_TYPES = new Set(['official_public', 'official_registry', 'academic']);
const PRIMARY_MARKET_SOURCE_TYPES = new Set([
  ...AUTHORITATIVE_SOURCE_TYPES,
  'official_company',
  'first_party_catalog',
  'recognized_industry_body',
]);
const SHA256_RE = /^[a-f0-9]{64}$/i;

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function goalScopeResearchAuthority(goal, { required = true } = {}) {
  if (!hasNativeAxwiseScopeMarkers(goal)) {
    if (required) throw new Error('Accepted AxWise scope research contract is missing');
    return null;
  }
  const intelligence = record(goal?.data?.axwise_customer_intelligence);
  let handoff;
  try {
    handoff = validateNativeAxwiseDecisionContracts({
      scope_packet: intelligence.scope_packet,
      scope_validation: intelligence.scope_validation,
      scope_confirmation: intelligence.axwise_scope_confirmation,
      scope_contract_binding: intelligence.scope_contract_binding,
    });
  } catch (error) {
    throw new Error(`Accepted AxWise scope research contract is invalid: ${error.message}`);
  }
  if (!handoff?.scope_packet?.research_contract) {
    if (!required) return null;
    throw new Error('Accepted AxWise scope research contract is missing');
  }
  const admission = record(goal?.data?.scope_admission);
  if (
    admission.status !== 'accepted' ||
    admission.native_scope !== true ||
    admission.scope_hash !== handoff.scope_packet.scope_hash
  ) {
    throw new Error('Accepted AxWise scope admission is missing or stale');
  }
  const contract = handoff.scope_packet.research_contract;
  let researchAcceptance = null;
  if (contract.evidence.mode !== 'none') {
    if (
      !String(intelligence.proposal_decision_id || '').trim() ||
      !String(intelligence.research_execution_inputs_hash || '').trim()
    ) {
      throw new Error(
        'Accepted AxWise research contract is missing its durable proposal decision or execution inputs identity'
      );
    }
    if (
      intelligence.job_id &&
      String(intelligence.parent_decision_id || '') !== String(intelligence.proposal_decision_id)
    ) {
      throw new Error(
        'Accepted AxWise research job is not linked to the durable proposal decision'
      );
    }
    researchAcceptance = validateScopeResearchAcceptanceBinding(admission.research_acceptance, {
      goal,
      scopePacket: handoff.scope_packet,
      proposalDecisionId: intelligence.proposal_decision_id,
      executionInputsHash: intelligence.research_execution_inputs_hash,
    });
  }
  return {
    packet: handoff.scope_packet,
    contract,
    binding: nativeAxwiseScopeContractBinding(handoff.scope_packet),
    researchAcceptance,
  };
}

export function validateResearchScopeContractBindings(bundle, goal) {
  const authority = goalScopeResearchAuthority(goal);
  if (!authority) throw new Error('Accepted AxWise scope research contract is missing');
  const topLevel = bundle?.scope_contract_binding;
  const taskContext = bundle?.configuration?.task_context?.scope_contract_binding;
  if (!topLevel || !taskContext) {
    throw new Error('AxWise research bundle is missing the accepted scope contract binding echo');
  }
  const topBinding = validateNativeAxwiseScopeContractBinding(topLevel, authority.packet);
  const taskBinding = validateNativeAxwiseScopeContractBinding(taskContext, authority.packet);
  if (canonicalContractHash(topBinding) !== canonicalContractHash(taskBinding)) {
    throw new Error('AxWise research bundle scope contract binding echoes disagree');
  }
  const topRuntime = validateNativeAxwiseScopeRuntimeBinding(
    bundle?.scope_runtime_binding,
    authority.packet
  );
  const taskRuntime = validateNativeAxwiseScopeRuntimeBinding(
    bundle?.configuration?.task_context?.scope_runtime_binding,
    authority.packet
  );
  if (canonicalContractHash(topRuntime) !== canonicalContractHash(taskRuntime)) {
    throw new Error('AxWise research bundle scope runtime binding echoes disagree');
  }
  if (authority.researchAcceptance) {
    const topAcceptance = bundle?.scope_research_acceptance;
    const taskAcceptance = bundle?.configuration?.task_context?.scope_research_acceptance;
    if (!topAcceptance || !taskAcceptance) {
      throw new Error(
        'AxWise research bundle is missing the exact Orqaly scope research acceptance echo'
      );
    }
    const options = {
      goal,
      scopePacket: authority.packet,
      proposalDecisionId: authority.researchAcceptance.proposal_decision_id,
      executionInputsHash: authority.researchAcceptance.execution_inputs_hash,
      expected: authority.researchAcceptance,
    };
    const acceptedTop = validateScopeResearchAcceptanceBinding(topAcceptance, options);
    const acceptedTask = validateScopeResearchAcceptanceBinding(taskAcceptance, options);
    if (canonicalContractHash(acceptedTop) !== canonicalContractHash(acceptedTask)) {
      throw new Error('AxWise research bundle acceptance echoes disagree');
    }
  }
  return authority;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value)
    .sort()
    .reduce((result, key) => {
      if (value[key] !== undefined) result[key] = canonicalize(value[key]);
      return result;
    }, {});
}

export function researchContextGateHash(value) {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(value || {})))
    .digest('hex');
}

function rows(value) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') : [];
}

function hasContent(value) {
  if (typeof value === 'string') return Boolean(value.trim());
  if (Array.isArray(value)) return value.some(hasContent);
  if (value && typeof value === 'object') return Object.values(value).some(hasContent);
  return value !== null && value !== undefined;
}

const COMMERCIAL_PRD_SECTIONS = Object.freeze([
  'market_scope',
  'market_and_demand_assessment',
  'customer_segments',
  'buying_roles',
  'regulatory_checklist',
  'competitors',
  'suppliers_and_channels',
  'pricing_and_unit_economics',
  'go_to_market_plan_90_days',
  'risks_assumptions_and_validation',
]);

function hasStructuredSemanticContent(value) {
  if (typeof value === 'string') return Boolean(value.trim());
  if (Array.isArray(value)) return value.length > 0 && value.some(hasStructuredSemanticContent);
  if (value && typeof value === 'object') {
    const values = Object.values(value);
    return values.length > 0 && values.some(hasStructuredSemanticContent);
  }
  // Required PRD sections are structured research, not booleans or numeric
  // sentinels. In particular, `false` must never mean "section complete".
  return false;
}

function commercialPrdContentIssues(content) {
  if (!content || typeof content !== 'object' || Array.isArray(content)) {
    return ['commercial_prd_root_not_object'];
  }
  const commercial = content.commercial_prd;
  if (!commercial || typeof commercial !== 'object' || Array.isArray(commercial)) {
    return ['commercial_prd_missing'];
  }
  return COMMERCIAL_PRD_SECTIONS.flatMap((section) =>
    hasStructuredSemanticContent(commercial[section]) ? [] : [`commercial_section_empty:${section}`]
  );
}

function stringList(value) {
  const values = Array.isArray(value) ? value : value == null ? [] : [value];
  return values.map((item) => String(item || '').trim()).filter(Boolean);
}

function normalizedRole(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\band\b|&/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sameRoleSet(left, right) {
  const a = [...new Set(stringList(left).map(normalizedRole))].sort();
  const b = [...new Set(stringList(right).map(normalizedRole))].sort();
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

function sameExactStringSet(left, right) {
  const a = [...new Set(stringList(left))].sort();
  const b = [...new Set(stringList(right))].sort();
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

function duplicateIds(values, idOf) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    const id = String(idOf(value) || '');
    if (!id || seen.has(id)) duplicates.add(id || 'missing');
    seen.add(id);
  }
  return [...duplicates].sort();
}

export function isCanonicalCommercialExecutionRoleSet(value) {
  return (
    stringList(value).length === COMMERCIAL_MARKET_LAUNCH_EXECUTION_ROLES.length &&
    sameRoleSet(value, COMMERCIAL_MARKET_LAUNCH_EXECUTION_ROLES)
  );
}

function first(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '') ?? null;
}

function finite(...values) {
  const value = values.find(
    (candidate) =>
      candidate !== null && candidate !== undefined && Number.isFinite(Number(candidate))
  );
  return value === undefined ? null : Number(value);
}

function validDateTime(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  return Number.isFinite(Date.parse(value));
}

function evidenceIds(...values) {
  return [
    ...new Set(
      values
        .flatMap((value) => (Array.isArray(value) ? value : value == null ? [] : [value]))
        .map((value) => {
          if (value && typeof value === 'object') {
            return first(value.source_id, value.provider_source_id, value.evidence_id, value.id);
          }
          return value;
        })
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    ),
  ];
}

function hasDateEffectiveClaim(value) {
  return (
    validDateTime(value?.effective_at) ||
    validDateTime(value?.effective_date) ||
    validDateTime(value?.as_of) ||
    validDateTime(value?.published_at) ||
    /\b(?:19|20)\d{2}(?:-\d{2}-\d{2})?\b|\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+(?:19|20)\d{2}\b/i.test(
      String(first(value?.object, value?.text, value?.display_text) || '')
    )
  );
}

function evidenceDate(...owners) {
  for (const owner of owners) {
    for (const key of [
      'effective_or_observation_at',
      'effective_at',
      'effective_date',
      'observation_end',
      'observed_at',
      'as_of',
      'published_at',
    ]) {
      if (validDateTime(owner?.[key])) return Date.parse(owner[key]);
    }
  }
  return null;
}

function evidenceClassFreshnessPolicy(value, fallbackDays = 120) {
  const configured = record(value);
  const maxAge = (name, defaultDays) =>
    Math.max(
      1,
      Number(
        first(
          Number.isFinite(Number(configured[name])) ? Number(configured[name]) : null,
          configured[name]?.max_age_days,
          configured[name]?.freshness_days,
          defaultDays
        )
      ) || defaultDays
    );
  return {
    statutory_current: {
      max_age_days: maxAge('statutory_current', fallbackDays),
      require_effective_date: configured.statutory_current?.require_effective_date !== false,
    },
    official_statistic: {
      // Annual official releases are legitimate well beyond a universal 120-day
      // market-observation window. They still need an explicit observation date.
      max_age_days: maxAge('official_statistic', 730),
    },
    observed_primary_market: {
      max_age_days: maxAge('observed_primary_market', fallbackDays),
    },
  };
}

function directAuthorityArtifactIsValid(claim, source, ledgerSource) {
  const citation = record(claim?.citation_metadata);
  const artifact = record(claim?.provenance_artifact);
  const proof = record(source?.authority_proof);
  const direct = record(proof.direct);
  const document = record(first(source?.authority_document, source?.authority_document_artifact));
  const binding = record(artifact.claim_binding);
  const sourceId = String(first(source?.source_id, source?.id) || '');
  const signature = String(artifact.authority_proof_signature || '').toLowerCase();
  const proofSignature = String(proof.proof_signature || '').toLowerCase();
  const ledgerSignature = String(ledgerSource?.authority_proof_signature || '').toLowerCase();
  return (
    citation.span_target === 'direct_authority_document' &&
    String(citation.source_id || '') === sourceId &&
    artifact.artifact_type === 'direct_authority_document' &&
    String(artifact.source_id || '') === sourceId &&
    document.artifact_type === 'direct_authority_document' &&
    SHA256_RE.test(String(document.sha256 || '')) &&
    SHA256_RE.test(String(artifact.sha256 || '')) &&
    String(direct.content_sha256 || '').toLowerCase() === String(document.sha256).toLowerCase() &&
    String(artifact.direct_content_sha256 || '').toLowerCase() ===
      String(document.sha256).toLowerCase() &&
    binding.version === 'direct_authority_claim_span_v1' &&
    binding.signature_alg === 'hmac-sha256' &&
    SHA256_RE.test(String(binding.claim_proof_signature || '')) &&
    String(binding.source_id || '') === sourceId &&
    String(binding.source_url || '').replace(/\/$/, '') ===
      String(source?.url || '').replace(/\/$/, '') &&
    String(binding.excerpt_sha256 || '').toLowerCase() === String(artifact.sha256).toLowerCase() &&
    String(binding.direct_content_sha256 || '').toLowerCase() ===
      String(document.sha256).toLowerCase() &&
    SHA256_RE.test(signature) &&
    signature === proofSignature &&
    signature === ledgerSignature &&
    signature === String(document.authority_proof_signature || '').toLowerCase() &&
    signature === String(binding.authority_proof_signature || '').toLowerCase() &&
    validDateTime(artifact.retrieved_at) &&
    artifact.retrieved_at === proof.retrieved_at &&
    artifact.retrieved_at === document.retrieved_at &&
    artifact.retrieved_at === source.retrieved_at &&
    artifact.retrieved_at === binding.retrieved_at
  );
}

function exactClaimSpanIsValid(claim, source = null) {
  const citation = record(claim?.citation_metadata);
  const artifact = record(claim?.provenance_artifact);
  const start = citation.segment_start;
  const end = citation.segment_end;
  const spanTarget = String(citation.span_target || '');
  const artifactType = String(artifact.artifact_type || '');
  const offsetUnit = String(citation.offset_unit || 'unicode_codepoints');
  const claimText = String(first(claim?.object, claim?.text, claim?.display_text) || '');
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end <= start ||
    !spanTarget ||
    !claimText ||
    !['unicode_codepoints', 'utf8_bytes'].includes(offsetUnit)
  ) {
    return false;
  }
  if (artifactType === 'direct_authority_document') {
    if (spanTarget !== artifactType || offsetUnit !== 'unicode_codepoints') return false;
    const document = record(first(source?.authority_document, source?.authority_document_artifact));
    const proof = record(source?.authority_proof);
    const direct = record(proof.direct);
    const binding = record(artifact.claim_binding);
    const artifactText = artifact.text;
    const documentHash = String(document.sha256 || '').toLowerCase();
    const artifactHash = String(artifact.sha256 || '').toLowerCase();
    const artifactCodepoints = Array.from(typeof artifactText === 'string' ? artifactText : '');
    const documentStart = binding.document_start;
    const documentEnd = binding.document_end;
    if (
      typeof artifactText !== 'string' ||
      !SHA256_RE.test(documentHash) ||
      !SHA256_RE.test(artifactHash) ||
      createHash('sha256').update(artifactText, 'utf8').digest('hex') !== artifactHash ||
      String(direct.content_sha256 || '').toLowerCase() !== documentHash ||
      String(artifact.direct_content_sha256 || '').toLowerCase() !== documentHash ||
      String(binding.direct_content_sha256 || '').toLowerCase() !== documentHash ||
      String(binding.excerpt_sha256 || '').toLowerCase() !== artifactHash ||
      !Number.isInteger(documentStart) ||
      !Number.isInteger(documentEnd) ||
      documentStart < 0 ||
      documentEnd <= documentStart ||
      documentEnd - documentStart !== artifactCodepoints.length ||
      start !== binding.claim_start ||
      end !== binding.claim_end ||
      end > artifactCodepoints.length ||
      artifactCodepoints.slice(start, end).join('') !== claimText ||
      createHash('sha256').update(claimText, 'utf8').digest('hex') !==
        String(binding.claim_text_sha256 || '').toLowerCase()
    ) {
      return false;
    }
    return true;
  }
  const providerHash = String(claim?.provider_response_hash || '').toLowerCase();
  const artifactHash = String(artifact.sha256 || artifact.content_hash || '').toLowerCase();
  const artifactText = artifact.text;
  if (
    !SHA256_RE.test(providerHash) ||
    !SHA256_RE.test(artifactHash) ||
    typeof artifactText !== 'string' ||
    spanTarget !== artifactType ||
    createHash('sha256').update(artifactText, 'utf8').digest('hex') !== artifactHash
  ) {
    return false;
  }
  if (artifactType === 'provider_response_text' && artifactHash !== providerHash) return false;
  if (artifactType === 'provider_response_part') {
    const partIndex = citation.part_index;
    const partHashes = artifact.response_part_hashes;
    const responseParts = artifact.response_parts;
    const responseText = artifact.provider_response_text;
    const manifestHash = String(artifact.response_parts_sha256 || '').toLowerCase();
    if (
      offsetUnit !== 'utf8_bytes' ||
      !Number.isInteger(partIndex) ||
      partIndex < 0 ||
      citation.part_index !== artifact.part_index ||
      !Array.isArray(partHashes) ||
      !Array.isArray(responseParts) ||
      responseParts.length !== partHashes.length ||
      !responseParts.every((value) => typeof value === 'string') ||
      partIndex >= partHashes.length ||
      !partHashes.every((value) => SHA256_RE.test(String(value || ''))) ||
      String(partHashes[partIndex]).toLowerCase() !== artifactHash ||
      !responseParts.every(
        (value, index) =>
          createHash('sha256').update(value, 'utf8').digest('hex') ===
          String(partHashes[index]).toLowerCase()
      ) ||
      !SHA256_RE.test(manifestHash) ||
      createHash('sha256').update(partHashes.join('\n'), 'ascii').digest('hex') !== manifestHash ||
      typeof responseText !== 'string' ||
      responseParts.join('') !== responseText ||
      createHash('sha256').update(responseText, 'utf8').digest('hex') !== providerHash ||
      String(artifact.provider_response_sha256 || '').toLowerCase() !== providerHash
    ) {
      return false;
    }
  }
  if (offsetUnit === 'utf8_bytes') {
    const encoded = Buffer.from(artifactText, 'utf8');
    if (end > encoded.length) return false;
    try {
      return (
        new TextDecoder('utf-8', { fatal: true }).decode(encoded.subarray(start, end)) === claimText
      );
    } catch {
      return false;
    }
  }
  const codepoints = Array.from(artifactText);
  return end <= codepoints.length && codepoints.slice(start, end).join('') === claimText;
}

function criticalClaimProvenanceIssues(
  bundle,
  critical,
  totalCritical,
  { mandatoryClaimClasses = [], freshnessDays = 120, freshnessByClass = {} } = {}
) {
  const summaries = rows(first(critical.claims, critical.items));
  const rawClaims = rows(bundle?.market_claims);
  const rawById = new Map(
    rawClaims.map((claim) => [String(first(claim.claim_id, claim.id) || ''), claim])
  );
  const sources = rows(bundle?.market_sources);
  const sourceById = new Map(
    sources.map((source) => [String(first(source.source_id, source.id) || ''), source])
  );
  const ledgerRows = rows(first(critical.evidence_ledger, critical.ledger));
  const ledgerByClaimId = new Map(
    ledgerRows.map((entry) => [String(first(entry.claim_id, entry.id) || ''), entry])
  );
  const failures = [];
  for (const [kind, duplicates] of [
    ['critical_summary', duplicateIds(summaries, (item) => first(item.claim_id, item.id))],
    ['raw_claim', duplicateIds(rawClaims, (item) => first(item.claim_id, item.id))],
    ['critical_ledger', duplicateIds(ledgerRows, (item) => first(item.claim_id, item.id))],
    ['market_source', duplicateIds(sources, (item) => first(item.source_id, item.id))],
  ]) {
    if (duplicates.length) {
      failures.push({ reason: 'critical_evidence_duplicate_ids', kind, duplicate_ids: duplicates });
    }
  }
  const classFreshness = evidenceClassFreshnessPolicy(freshnessByClass, freshnessDays);
  if (totalCritical == null || summaries.length !== totalCritical) {
    failures.push({ reason: 'critical_claim_rows_do_not_match_summary' });
  }
  const verifiedClasses = new Set(
    summaries
      .filter((summary) =>
        VERIFIED_CRITICAL_CLAIM_STATUSES.has(
          String(first(summary.status, summary.validation_status) || '').toLowerCase()
        )
      )
      .map((summary) =>
        String(first(summary.evidence_class, summary.claim_class) || '')
          .trim()
          .toLowerCase()
      )
      .filter(Boolean)
  );
  const requestedClasses = stringList(critical.requested_claim_classes).map((value) =>
    value.toLowerCase()
  );
  const applicableClasses = stringList(critical.applicable_claim_classes).map((value) =>
    value.toLowerCase()
  );
  const notApplicableRows = rows(critical.not_applicable_claim_classes);
  const notApplicableClasses = notApplicableRows.map((item) =>
    String(first(item.evidence_class, item.claim_class) || '').toLowerCase()
  );
  const requestedSet = new Set(requestedClasses);
  const applicableSet = new Set(applicableClasses);
  const notApplicableSet = new Set(notApplicableClasses);
  const applicabilityPartitionReady =
    requestedClasses.length > 0 &&
    requestedSet.size === requestedClasses.length &&
    applicableSet.size === applicableClasses.length &&
    notApplicableSet.size === notApplicableClasses.length &&
    notApplicableRows.every(
      (item, index) =>
        Boolean(notApplicableClasses[index]) && Boolean(String(item.reason || '').trim())
    ) &&
    [...applicableSet].every((value) => requestedSet.has(value) && !notApplicableSet.has(value)) &&
    [...notApplicableSet].every((value) => requestedSet.has(value) && !applicableSet.has(value)) &&
    [...requestedSet].every((value) => applicableSet.has(value) || notApplicableSet.has(value)) &&
    sameExactStringSet(applicableClasses, mandatoryClaimClasses) &&
    [...applicableSet].every((value) => verifiedClasses.has(value));
  if (!applicabilityPartitionReady) {
    failures.push({
      reason: 'critical_claim_applicability_accounting_invalid',
      requested_claim_classes: requestedClasses,
      applicable_claim_classes: applicableClasses,
      not_applicable_claim_classes: notApplicableRows,
      mandatory_claim_classes: stringList(mandatoryClaimClasses),
    });
  }
  for (const requiredClass of stringList(mandatoryClaimClasses).map((value) =>
    value.toLowerCase()
  )) {
    if (!verifiedClasses.has(requiredClass)) {
      failures.push({ evidence_class: requiredClass, reason: 'mandatory_claim_class_missing' });
    }
  }
  for (const summary of summaries) {
    const claimId = String(first(summary.claim_id, summary.id) || '');
    const status = String(first(summary.status, summary.validation_status) || '').toLowerCase();
    const evidenceClass = String(first(summary.evidence_class, summary.claim_class) || '')
      .trim()
      .toLowerCase();
    const raw = rawById.get(claimId);
    const ledger = ledgerByClaimId.get(claimId);
    if (!claimId || !VERIFIED_CRITICAL_CLAIM_STATUSES.has(status) || !raw || !ledger) {
      failures.push({ claim_id: claimId || 'missing', reason: 'claim_not_verifiably_resolved' });
      continue;
    }
    const rawEvidenceClass = String(first(raw.evidence_class, raw.claim_class) || '')
      .trim()
      .toLowerCase();
    const ledgerEvidenceClass = String(first(ledger.evidence_class, ledger.claim_class) || '')
      .trim()
      .toLowerCase();
    const ledgerStatus = String(first(ledger.status, ledger.validation_status) || '').toLowerCase();
    const summarySourceIds = evidenceIds(summary.source_ids, summary.evidence_refs);
    const rawSourceIds = evidenceIds(raw.source_ids);
    const ledgerSourceIds = evidenceIds(ledger.source_ids);
    const summaryCountries = evidenceIds(summary.country_codes).map((value) => value.toUpperCase());
    const rawCountries = evidenceIds(raw.country_codes).map((value) => value.toUpperCase());
    const ledgerCountries = evidenceIds(ledger.country_codes).map((value) => value.toUpperCase());
    const ledgerSourceRows = rows(ledger.sources);
    const ledgerSourceRowIds = ledgerSourceRows.map((entry) =>
      String(first(entry.source_id, entry.id) || '')
    );
    const ledgerSourceRowsReady =
      ledgerSourceRowIds.every(Boolean) &&
      duplicateIds(ledgerSourceRows, (item) => first(item.source_id, item.id)).length === 0;
    const traceableCalculation = evidenceClass === 'traceable_calculation';
    const ownershipReady =
      rawEvidenceClass === evidenceClass &&
      ledgerEvidenceClass === evidenceClass &&
      ledgerStatus === status &&
      (traceableCalculation ||
        (summarySourceIds.length > 0 &&
          sameExactStringSet(summarySourceIds, rawSourceIds) &&
          sameExactStringSet(rawSourceIds, ledgerSourceIds) &&
          ledgerSourceRowsReady &&
          sameExactStringSet(ledgerSourceIds, ledgerSourceRowIds) &&
          summaryCountries.length > 0 &&
          sameExactStringSet(summaryCountries, rawCountries) &&
          sameExactStringSet(rawCountries, ledgerCountries)));
    if (!ownershipReady) {
      failures.push({
        claim_id: claimId,
        reason: 'critical_claim_ownership_mismatch',
        evidence_classes: {
          summary: evidenceClass,
          raw: rawEvidenceClass,
          ledger: ledgerEvidenceClass,
        },
        source_ids: {
          summary: summarySourceIds,
          raw: rawSourceIds,
          ledger: ledgerSourceIds,
          ledger_rows: ledgerSourceRowIds,
        },
        country_codes: {
          summary: summaryCountries,
          raw: rawCountries,
          ledger: ledgerCountries,
        },
      });
      continue;
    }
    const claimCountries = new Set(rawCountries);
    if (traceableCalculation) {
      if (!String(raw.formula || '').trim() || evidenceIds(raw.input_claim_ids).length < 1) {
        failures.push({ claim_id: claimId, reason: 'calculation_trace_missing' });
      }
      continue;
    }
    const evidenceAt = evidenceDate(summary, raw);
    const classPolicy = classFreshness[evidenceClass];
    if (evidenceClass === 'statutory_current') {
      if (
        classPolicy?.require_effective_date &&
        evidenceAt == null &&
        !hasDateEffectiveClaim(raw)
      ) {
        failures.push({ claim_id: claimId, reason: 'statutory_currency_unproven' });
      }
    } else if (classPolicy) {
      const age = evidenceAt == null ? Number.POSITIVE_INFINITY : Date.now() - evidenceAt;
      if (age < -300_000 || age > classPolicy.max_age_days * 86_400_000) {
        failures.push({
          claim_id: claimId,
          reason:
            evidenceClass === 'official_statistic'
              ? 'official_statistic_observation_date_stale_or_missing'
              : 'market_observation_stale',
        });
      }
    }
    const sourceIds = rawSourceIds;
    if (!sourceIds.length) {
      failures.push({ claim_id: claimId, reason: 'exact_claim_provenance_missing' });
      continue;
    }
    for (const sourceId of sourceIds) {
      const source = sourceById.get(sourceId);
      const ledgerSource = ledgerSourceRows.find(
        (entry) => String(first(entry.source_id, entry.id) || '') === sourceId
      );
      const citation = record(source?.citation_metadata);
      const queryAudit = evidenceIds(
        source?.provider_query_ids,
        source?.provider_query_id,
        source?.query_ids,
        source?.query_id
      );
      const rawQueries = stringList(source?.provider_queries || source?.queries);
      const sourceCountries = new Set(
        evidenceIds(source?.country_codes, source?.jurisdiction).map((value) => value.toUpperCase())
      );
      const retrievedAt = Date.parse(source?.retrieved_at || '');
      const evidenceAge = Date.now() - retrievedAt;
      const fresh =
        Number.isFinite(retrievedAt) &&
        evidenceAge >= -300_000 &&
        evidenceAge <= Math.max(1, Number(freshnessDays) || 120) * 86_400_000;
      const sourceAuthority = String(source?.source_authority || '')
        .trim()
        .toLowerCase();
      const authorityStatus = String(
        first(source?.authority_verification_status, source?.resolver_status) || ''
      )
        .trim()
        .toLowerCase();
      const proof = record(source?.authority_proof);
      const proofSignature = String(proof.proof_signature || '').toLowerCase();
      const ledgerSignature = String(ledgerSource?.authority_proof_signature || '').toLowerCase();
      const signedDirectAuthorityClassReady =
        (sourceAuthority === 'official_public' && DIRECT_AUTHORITY_STATUSES.has(authorityStatus)) ||
        (evidenceClass === 'observed_primary_market' &&
          sourceAuthority === 'first_party_catalog' &&
          DIRECT_PRIMARY_MARKET_STATUSES.has(authorityStatus));
      const signedDirectAuthorityProofReady =
        signedDirectAuthorityClassReady &&
        proof.signature_alg === 'hmac-sha256' &&
        SHA256_RE.test(proofSignature) &&
        proofSignature === ledgerSignature &&
        Boolean(ledgerSource);
      const registry = record(source?.registry);
      const registryProofReady =
        sourceAuthority === 'official_registry' &&
        String(source?.provider || '').toLowerCase() === 'openregister' &&
        Boolean(String(source?.provider_source_id || '').trim()) &&
        Boolean(
          String(first(registry.register_number, registry.registration_number) || '').trim()
        ) &&
        Boolean(ledgerSource);
      const permittedAuthorities =
        evidenceClass === 'observed_primary_market'
          ? PRIMARY_MARKET_SOURCE_TYPES
          : AUTHORITATIVE_SOURCE_TYPES;
      const jurisdictionMatches =
        claimCountries.size > 0 &&
        sourceCountries.size > 0 &&
        [...claimCountries].some((country) => sourceCountries.has(country));
      const directClaimBindingReady =
        registryProofReady || directAuthorityArtifactIsValid(raw, source, ledgerSource);
      const retrievalAuditReady =
        registryProofReady ||
        (Boolean(queryAudit.length || rawQueries.length) &&
          (Boolean(Object.keys(citation).length) || directClaimBindingReady));
      const exactSpanReady = exactClaimSpanIsValid(raw, source);
      if (
        !source ||
        !String(source.provider || source.source_provider || '').trim() ||
        !String(first(source.provider_source_id, source.source_id) || '').trim() ||
        !retrievalAuditReady ||
        !jurisdictionMatches ||
        !validDateTime(source.retrieved_at) ||
        !fresh ||
        !permittedAuthorities.has(sourceAuthority) ||
        !exactSpanReady ||
        !directClaimBindingReady ||
        (!signedDirectAuthorityProofReady && !registryProofReady)
      ) {
        failures.push({
          claim_id: claimId,
          source_id: sourceId,
          reason: 'source_audit_incomplete',
        });
      }
    }
  }
  return failures;
}

function criticalClaimText(value) {
  for (const field of ['object', 'text', 'display_text', 'statement', 'claim']) {
    const candidate = value?.[field];
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
    if (typeof candidate === 'number' && Number.isFinite(candidate)) return String(candidate);
  }
  return null;
}

/**
 * Revalidate the raw critical-claim ledger before any claim can cross the
 * planning trust boundary. A producer summary is not enough: every returned
 * claim must still resolve to the exact raw claim, current jurisdiction,
 * audited source, immutable source span and requested evidence class.
 */
export function assessVerifiedCriticalClaimContract(bundle, claimPolicy = {}) {
  const critical = record(
    first(
      bundle?.quality?.critical_claims,
      bundle?.quality?.critical_claim_validation,
      bundle?.critical_claims
    )
  );
  const criticalStatus = String(first(critical.status, critical.validation_status) || '')
    .trim()
    .toLowerCase();
  const totalCritical = finite(critical.total_count, critical.total, critical.claim_count);
  const verifiedCritical = finite(
    critical.verified_count,
    critical.validated_count,
    critical.verified
  );
  const blockedCritical = finite(
    critical.blocked_count,
    critical.invalid_count,
    critical.unresolved_count,
    critical.blocked
  );
  const conflictCritical = finite(critical.conflict_count, critical.conflicts);
  const staleCritical = finite(critical.stale_count, critical.stale);
  const issues = [];
  if (
    criticalStatus !== 'passed' ||
    totalCritical == null ||
    totalCritical < 1 ||
    verifiedCritical == null ||
    verifiedCritical !== totalCritical ||
    blockedCritical == null ||
    blockedCritical > 0 ||
    conflictCritical == null ||
    conflictCritical > 0 ||
    staleCritical == null ||
    staleCritical > 0
  ) {
    issues.push({
      code: 'critical_claim_validation_blocked',
      message: 'Critical commercial claims are missing, stale, conflicting, or not fully verified.',
      details: {
        status: criticalStatus || 'missing',
        total: totalCritical,
        verified: verifiedCritical,
        blocked: blockedCritical,
        conflicts: conflictCritical,
        stale: staleCritical,
      },
    });
  }

  const fallbackPolicy = commercialResearchPolicyContract({
    research_intent: COMMERCIAL_MARKET_LAUNCH_INTENT,
  }).critical_claim_policy;
  const requiredClaimClasses = stringList(claimPolicy.mandatory_claim_classes).length
    ? claimPolicy.mandatory_claim_classes
    : Array.isArray(critical.mandatory_claim_classes)
      ? critical.mandatory_claim_classes
      : fallbackPolicy.mandatory_claim_classes;
  const provenanceFailures = criticalClaimProvenanceIssues(bundle, critical, totalCritical, {
    mandatoryClaimClasses: requiredClaimClasses,
    freshnessDays: claimPolicy.freshness_days || fallbackPolicy.freshness_days,
    freshnessByClass: claimPolicy.freshness_by_class || fallbackPolicy.freshness_by_class,
  });
  if (provenanceFailures.length) {
    issues.push({
      code: 'critical_claim_provenance_incomplete',
      message:
        'Every verified critical claim must resolve to current, jurisdiction-matched source audit data and an immutable exact claim span.',
      details: provenanceFailures,
    });
  }
  if (issues.length) return { ok: false, issues, claims: [] };

  const rawClaims = new Map(
    rows(bundle?.market_claims).map((claim) => [
      String(first(claim.claim_id, claim.id) || ''),
      claim,
    ])
  );
  const ledgerRows = new Map(
    rows(first(critical.evidence_ledger, critical.ledger)).map((entry) => [
      String(first(entry.claim_id, entry.id) || ''),
      entry,
    ])
  );
  const sourceRows = new Map(
    rows(bundle?.market_sources).map((source) => [
      String(first(source.source_id, source.id) || ''),
      source,
    ])
  );
  const claims = rows(first(critical.claims, critical.items)).map((summary) => {
    const claimId = String(first(summary.claim_id, summary.id) || '');
    const raw = rawClaims.get(claimId);
    const ledger = ledgerRows.get(claimId);
    const sourceIds = evidenceIds(summary.source_ids, summary.evidence_refs, raw?.source_ids);
    const binding = record(raw?.provenance_artifact?.claim_binding);
    return {
      trust_status: 'verified_critical_claim',
      authoritative_for_factual_claims: true,
      claim_id: claimId,
      evidence_class: String(first(summary.evidence_class, summary.claim_class) || ''),
      verification_status: String(first(summary.status, summary.validation_status) || ''),
      claim_text: criticalClaimText(raw),
      subject: typeof raw?.subject === 'string' ? raw.subject : null,
      predicate: typeof raw?.predicate === 'string' ? raw.predicate : null,
      country_codes: evidenceIds(summary.country_codes, raw?.country_codes),
      effective_at: first(raw?.effective_at, raw?.effective_date, raw?.as_of) || null,
      observed_at: first(raw?.observation_end, raw?.observed_at, raw?.published_at) || null,
      source_ids: sourceIds,
      sources: sourceIds.map((sourceId) => {
        const source = sourceRows.get(sourceId);
        return {
          source_id: sourceId,
          url: source?.url || null,
          publisher: source?.publisher || source?.company_name || null,
          source_authority: source?.source_authority || null,
          retrieved_at: source?.retrieved_at || null,
        };
      }),
      ledger_source_ids: evidenceIds(ledger?.source_ids),
      claim_text_sha256: binding.claim_text_sha256 || null,
    };
  });
  return { ok: true, issues: [], claims };
}

export function isCommercialMarketLaunchRequest(value = {}) {
  const explicit =
    value?.research_intent || value?.intent || value?.data?.research_policy?.intent || null;
  if (explicit) return explicit === COMMERCIAL_MARKET_LAUNCH_INTENT;
  const category = String(value?.parsed_category || value?.category || '')
    .trim()
    .toLowerCase();
  if (['marketing', 'consulting', 'finance', 'sales', 'commerce', 'ecommerce'].includes(category)) {
    return true;
  }
  return COMMERCIAL_RESEARCH_PATTERN.test(
    [
      value?.title,
      value?.description,
      value?.parsed_requirements,
      value?.requirements,
      value?.goal,
      value?.challenges,
      value?.details,
    ]
      .filter(Boolean)
      .join(' ')
  );
}

export function commercialResearchPolicyContract(value = {}) {
  if (!isCommercialMarketLaunchRequest(value)) return null;
  return {
    intent: COMMERCIAL_MARKET_LAUNCH_INTENT,
    requested_execution_roles: [...COMMERCIAL_MARKET_LAUNCH_EXECUTION_ROLES],
    customer_role_contract: {
      primary_roles: ['economic_buyer', 'decision_authority'],
      secondary_roles: ['influencer', 'operational_user', 'beneficiary'],
      require_primary_buyer: true,
      ineligible_roles: [],
    },
    critical_claim_policy: {
      required: true,
      fail_closed: true,
      freshness_days: 120,
      // These are the requested grounding-class universe. AxWise resolves
      // applicability from the grounded corpus and returns the applicable
      // subset as `mandatory_claim_classes` plus reasoned N/A rows.
      mandatory_claim_classes: [
        'statutory_current',
        'official_statistic',
        'observed_primary_market',
      ],
      freshness_by_class: {
        official_statistic: 730,
        observed_primary_market: 120,
      },
      authoritative_current_source_required: true,
      conflict_resolution_required: true,
    },
  };
}

function selectedCustomer(bundle) {
  const resolution = record(bundle?.persona_resolution);
  const direct = record(resolution.customer_persona);
  const directProfile = record(direct.persona || direct.profile);
  const selectedId = String(
    first(
      direct.persona_id,
      resolution.customer_persona_id,
      Array.isArray(bundle?.selected_persona_ids) ? bundle.selected_persona_ids[0] : null
    ) || ''
  );
  const row = rows(bundle?.customer_personas).find(
    (item) => String(first(item.persona_id, item.id) || '') === selectedId
  );
  if (!row) return { ...directProfile, ...direct };
  return { ...record(row.persona || row.profile), ...row, ...directProfile, ...direct };
}

function returnedExecutorRoles(bundle, quality) {
  return stringList(
    first(
      quality.returned_execution_roles,
      quality.executor_role_coverage?.returned_roles,
      bundle?.persona_resolution?.returned_execution_roles
    )
  ).length
    ? stringList(
        first(
          quality.returned_execution_roles,
          quality.executor_role_coverage?.returned_roles,
          bundle?.persona_resolution?.returned_execution_roles
        )
      )
    : rows(bundle?.executor_personas).map((item) =>
        first(item.required_role, item.role, item.persona?.role, item.profile?.role)
      );
}

function evidencePersonaRoleSlot(persona) {
  const profile = record(first(persona?.persona, persona?.profile));
  return String(
    first(
      persona?.role_slot,
      persona?.required_role_slot,
      profile.role_slot,
      profile.required_role_slot
    ) || ''
  ).trim();
}

/**
 * V2 Gate 1 consumes the immutable typed-evidence contract without reviving
 * the legacy fixed-five topology. Commercial profiles add their independently
 * persisted buyer and critical-claim policies while role slots remain dynamic.
 */
function assessEvidenceContextGateV2(bundle, goal) {
  const policy = record(goal?.data?.research_policy);
  const expectedProfile = record(policy.business_evidence_profile);
  const expectedProfileHash = String(policy.business_evidence_profile_hash || '');
  const issues = [];
  const add = (code, message, details = undefined) => {
    if (issues.some((item) => item.code === code)) return;
    issues.push({ code, message, ...(details === undefined ? {} : { details }) });
  };

  if (!Object.keys(expectedProfile).length || !SHA256_RE.test(expectedProfileHash)) {
    add(
      'business_evidence_profile_missing',
      'The v2 research bundle is not bound to a goal-pinned business evidence profile.'
    );
  } else {
    try {
      if (businessEvidenceProfileHash(expectedProfile) !== expectedProfileHash) {
        add(
          'business_evidence_profile_tampered',
          'The goal-pinned business evidence profile hash does not match its content.'
        );
      }
    } catch (error) {
      add('business_evidence_profile_invalid', 'The goal-pinned evidence profile is invalid.', {
        message: error.message,
      });
    }
  }

  try {
    assertAxwiseEvidenceBundleV2(bundle, {
      expectedProfile: Object.keys(expectedProfile).length ? expectedProfile : undefined,
      expectedProfileHash: expectedProfileHash || undefined,
    });
  } catch (error) {
    add(
      'business_evidence_contract_invalid',
      'The immutable typed facts, calculations, quality coverage, or manifests failed validation.',
      Array.isArray(error.issues)
        ? error.issues.map(({ path, code, message }) => ({ path, code, message }))
        : [{ message: error.message }]
    );
  }

  const profile = Object.keys(expectedProfile).length
    ? expectedProfile
    : record(bundle?.evidence_profile);
  const commercial = profile.intent === COMMERCIAL_MARKET_LAUNCH_INTENT;
  const expectedSlots = stringList(profile.required_role_slots).sort();
  const executorPersonaRows = rows(bundle?.executor_personas);
  const returnedSlots = executorPersonaRows.map(evidencePersonaRoleSlot).filter(Boolean).sort();
  const uniqueReturnedSlots = [...new Set(returnedSlots)];
  if (
    returnedSlots.length !== uniqueReturnedSlots.length ||
    expectedSlots.length !== uniqueReturnedSlots.length ||
    expectedSlots.some((slot, index) => slot !== uniqueReturnedSlots[index])
  ) {
    add(
      'executor_role_slot_coverage_mismatch',
      'AxWise must return exactly one executor persona for every requested evidence role slot.',
      { expected_role_slots: expectedSlots, returned_role_slots: uniqueReturnedSlots }
    );
  }
  const incompleteExecutorPersonas = executorPersonaRows.filter((item) => {
    const container = record(first(item.persona, item.profile));
    const details = { ...container, ...record(container.profile) };
    return (
      !String(first(item.persona_id, item.id) || '').trim() ||
      !String(first(item.name, details.name) || '').trim() ||
      !evidencePersonaRoleSlot(item)
    );
  });
  if (incompleteExecutorPersonas.length) {
    add(
      'executor_persona_contract_incomplete',
      'Every requested v2 role slot must resolve to one named executor persona.',
      {
        incomplete_persona_ids: incompleteExecutorPersonas.map((item) =>
          first(item.persona_id, item.id, 'missing')
        ),
      }
    );
  }

  const evidenceQuality = record(bundle?.quality?.evidence_contract);
  if (evidenceQuality.status !== 'passed') {
    add(
      'business_evidence_contract_blocked',
      'The typed business evidence contract did not satisfy every required item.'
    );
  }

  const customerRoleContract = record(policy.customer_role_contract);
  if (commercial) {
    const primaryRoles = stringList(customerRoleContract.primary_roles).map((value) =>
      value.toLowerCase()
    );
    if (!primaryRoles.length || customerRoleContract.require_primary_buyer !== true) {
      add(
        'customer_role_contract_missing',
        'Commercial v2 research must retain its approved primary-buyer contract.'
      );
    }
    const customer = selectedCustomer(bundle);
    const customerProfile = record(customer.profile || customer.persona);
    const decisionRole = String(
      first(
        customer.decision_role,
        customer.buyer_role_classification,
        customerProfile.decision_role,
        customerProfile.buyer_role_classification
      ) || ''
    )
      .trim()
      .toLowerCase();
    const buyerRole =
      first(
        customer.buyer_role,
        customer.is_buyer,
        customer.primary_buyer,
        customerProfile.buyer_role,
        customerProfile.is_buyer
      ) === true;
    const eligibility = String(
      first(
        customer.selection_eligibility,
        customer.eligibility_status,
        customerProfile.selection_eligibility,
        customerProfile.eligibility_status
      ) || ''
    )
      .trim()
      .toLowerCase();
    const ineligibleRoles = new Set(
      stringList(customerRoleContract.ineligible_roles).map((value) => value.toLowerCase())
    );
    if (
      !buyerRole ||
      !primaryRoles.includes(decisionRole) ||
      ineligibleRoles.has(decisionRole) ||
      eligibility !== 'eligible_primary'
    ) {
      add(
        'primary_customer_ineligible',
        'The selected commercial v2 customer must satisfy the approved primary-buyer contract.',
        {
          decision_role: decisionRole || 'missing',
          buyer_role: buyerRole,
          eligibility: eligibility || 'missing',
        }
      );
    }

    const selectedCustomerId = String(first(customer.persona_id, customer.id) || '');
    const marketEvidenceIds = new Set([
      ...rows(bundle?.market_sources).map((item) => String(first(item.source_id, item.id) || '')),
      ...rows(bundle?.market_claims).map((item) => String(first(item.claim_id, item.id) || '')),
    ]);
    marketEvidenceIds.delete('');
    const customerRefs = evidenceIds(
      customer.evidence_refs,
      customerProfile.evidence_refs,
      bundle?.research_context?.selected_customer?.evidence_refs
    );
    const customerEvidenceReady = customerRefs.some((ref) => marketEvidenceIds.has(ref));
    const executorFailures = executorPersonaRows
      .map((item) => {
        const container = record(first(item.persona, item.profile));
        const details = { ...container, ...record(container.profile) };
        const refs = evidenceIds(
          item.evidence_refs,
          details.evidence_refs,
          details.research_context?.source_ids,
          details.research_context?.claim_refs
        );
        const marketReady = refs.some((ref) => marketEvidenceIds.has(ref));
        const customerReady = Boolean(selectedCustomerId && refs.includes(selectedCustomerId));
        return marketReady && customerReady
          ? null
          : {
              persona_id: first(item.persona_id, item.id, 'missing'),
              role_slot: evidencePersonaRoleSlot(item) || 'missing',
              missing_market_evidence: !marketReady,
              missing_selected_customer: !customerReady,
            };
      })
      .filter(Boolean);
    if (!selectedCustomerId || !customerEvidenceReady || executorFailures.length) {
      add(
        'persona_evidence_contract_incomplete',
        'The selected commercial customer and every dynamic executor persona must retain evidence linkage.',
        {
          selected_customer_id: selectedCustomerId || 'missing',
          customer_market_evidence_resolved: customerEvidenceReady,
          executor_failures: executorFailures,
        }
      );
    }
  }

  const persistedCriticalClaimPolicy = record(policy.critical_claim_policy);
  const effectiveCriticalClaimPolicy = commercial
    ? {
        ...commercialResearchPolicyContract({
          research_intent: COMMERCIAL_MARKET_LAUNCH_INTENT,
        }).critical_claim_policy,
        ...persistedCriticalClaimPolicy,
      }
    : persistedCriticalClaimPolicy;
  if (commercial && persistedCriticalClaimPolicy.required !== true) {
    add(
      'critical_claim_policy_missing',
      'Commercial v2 research must retain its approved fail-closed critical-claim policy.'
    );
  }
  if (commercial || effectiveCriticalClaimPolicy.required === true) {
    const criticalAssessment = assessVerifiedCriticalClaimContract(
      bundle,
      effectiveCriticalClaimPolicy
    );
    for (const issue of criticalAssessment.issues) {
      add(issue.code, issue.message, issue.details);
    }
  }

  let expectedRoles = [];
  let roleBySlot = new Map();
  try {
    expectedRoles = executionRolesForEvidenceProfile(profile);
    roleBySlot = new Map(
      stringList(profile.required_role_slots).map((slot, index) => [slot, expectedRoles[index]])
    );
  } catch {
    // The invalid profile issue above is authoritative; keep the gate shape
    // serializable while approval remains blocked.
  }
  return {
    version: 2,
    status: issues.length ? 'blocked' : 'ready',
    required: true,
    intent: profile.intent || null,
    economic_model: profile.economic_model || null,
    evidence_profile_hash: bundle?.evidence_profile_hash || null,
    fact_manifest_hash: bundle?.fact_manifest_hash || null,
    calculation_manifest_hash: bundle?.calculation_manifest_hash || null,
    required_role_slots: expectedSlots,
    executor_role_slots: {
      expected: expectedSlots,
      returned: uniqueReturnedSlots,
    },
    executor_roles: {
      expected: expectedRoles,
      returned: uniqueReturnedSlots.map((slot) => roleBySlot.get(slot) || slot),
    },
    issues,
  };
}

/**
 * Produce a compact, serializable Gate 1 verdict. Semantic failures are not
 * import failures: keeping the immutable bundle inspectable lets the user see
 * why approval is blocked and request a targeted AxWise correction.
 */
export function assessResearchContextGate(bundle, goal = {}) {
  let scopeAuthority = null;
  try {
    scopeAuthority = validateResearchScopeContractBindings(bundle, goal);
  } catch (error) {
    return blockedScopeContractGate(error);
  }
  if (bundle?.version === AXWISE_RESEARCH_BUNDLE_V2) {
    const gate = assessEvidenceContextGateV2(bundle, goal);
    if (!scopeAuthority) return gate;
    const typedGate = typedResearchContractGate(bundle, scopeAuthority);
    const issues = [...typedGate.issues, ...gate.issues].filter(
      (issue, index, all) => all.findIndex((item) => item.code === issue.code) === index
    );
    return {
      ...gate,
      status: issues.length ? 'blocked' : 'ready',
      required: typedGate.required,
      intent: typedGate.intent,
      contract_hash: typedGate.contract_hash,
      scope_hash: typedGate.scope_hash,
      executor_roles: typedGate.executor_roles,
      issues,
    };
  }
  const typedGate = scopeAuthority ? typedResearchContractGate(bundle, scopeAuthority) : null;
  const policy = record(goal?.data?.research_policy);
  const required = typedGate.required;
  const intent = typedGate.intent;
  const commercial = intent === COMMERCIAL_MARKET_LAUNCH_INTENT;
  if (!required || !commercial) {
    return (
      typedGate || { version: 1, status: 'ready', required, intent: intent || null, issues: [] }
    );
  }

  const issues = [...(typedGate?.issues || [])];
  const add = (code, message, details = undefined) => {
    if (issues.some((item) => item.code === code)) return;
    issues.push({ code, message, ...(details === undefined ? {} : { details }) });
  };
  const researchPrd = record(bundle?.research_prd);
  const prdType = String(first(researchPrd.prd_type, researchPrd.intent) || '').trim();
  const prdValidation = record(
    first(researchPrd.validation, researchPrd.content?.metadata?.validation)
  );
  const prdValidationStatus = String(prdValidation.status || '')
    .trim()
    .toLowerCase();
  const prdValidationIssueCount = finite(prdValidation.issue_count);
  if (prdType !== COMMERCIAL_MARKET_LAUNCH_INTENT) {
    add(
      'research_prd_type_mismatch',
      `Research PRD type must be ${COMMERCIAL_MARKET_LAUNCH_INTENT}; received ${prdType || 'missing'}.`
    );
  }
  const prdContentIssues = commercialPrdContentIssues(researchPrd.content);
  if (
    !hasContent(researchPrd.content) ||
    prdContentIssues.length > 0 ||
    !String(researchPrd.content_hash || '').match(/^[a-f0-9]{64}$/i) ||
    researchContextGateHash(researchPrd.content) !==
      String(researchPrd.content_hash || '').toLowerCase()
  ) {
    add(
      'research_prd_unpinned',
      'The commercial Research PRD must include every typed commercial section and a matching content hash.',
      prdContentIssues
    );
  }
  if (
    prdValidationStatus !== 'passed' ||
    prdValidationIssueCount !== 0 ||
    !Array.isArray(prdValidation.issues) ||
    prdValidation.issues.length > 0
  ) {
    add(
      'research_prd_validation_blocked',
      'The commercial Research PRD must carry a passed zero-issue producer validation verdict.',
      {
        status: prdValidationStatus || 'missing',
        issue_count: prdValidationIssueCount,
        issues: rows(prdValidation.issues),
      }
    );
  }
  const quality = record(bundle?.quality);
  const critical = record(
    first(quality.critical_claims, quality.critical_claim_validation, bundle?.critical_claims)
  );
  const criticalStatus = String(first(critical.status, critical.validation_status) || '')
    .trim()
    .toLowerCase();
  const totalCritical = finite(critical.total_count, critical.total, critical.claim_count);
  const verifiedCritical = finite(
    critical.verified_count,
    critical.validated_count,
    critical.verified
  );
  const blockedCritical = finite(
    critical.blocked_count,
    critical.invalid_count,
    critical.unresolved_count,
    critical.blocked
  );
  const conflictCritical = finite(critical.conflict_count, critical.conflicts);
  const staleCritical = finite(critical.stale_count, critical.stale);
  if (
    criticalStatus !== 'passed' ||
    totalCritical == null ||
    totalCritical < 1 ||
    verifiedCritical == null ||
    verifiedCritical !== totalCritical ||
    blockedCritical == null ||
    blockedCritical > 0 ||
    conflictCritical == null ||
    conflictCritical > 0 ||
    staleCritical == null ||
    staleCritical > 0
  ) {
    add(
      'critical_claim_validation_blocked',
      'Critical commercial claims are missing, stale, conflicting, or not fully verified.',
      {
        status: criticalStatus || 'missing',
        total: totalCritical,
        verified: verifiedCritical,
        blocked: blockedCritical,
        conflicts: conflictCritical,
        stale: staleCritical,
      }
    );
  }
  const claimPolicy = record(policy.critical_claim_policy);
  const provenanceFailures = criticalClaimProvenanceIssues(bundle, critical, totalCritical, {
    mandatoryClaimClasses: Array.isArray(critical.mandatory_claim_classes)
      ? critical.mandatory_claim_classes
      : claimPolicy.mandatory_claim_classes ||
        commercialResearchPolicyContract({ research_intent: COMMERCIAL_MARKET_LAUNCH_INTENT })
          .critical_claim_policy.mandatory_claim_classes,
    freshnessDays: claimPolicy.freshness_days || 120,
    freshnessByClass:
      claimPolicy.freshness_by_class ||
      commercialResearchPolicyContract({ research_intent: COMMERCIAL_MARKET_LAUNCH_INTENT })
        .critical_claim_policy.freshness_by_class,
  });
  if (provenanceFailures.length) {
    add(
      'critical_claim_provenance_incomplete',
      'Every verified critical claim must resolve to current, jurisdiction-matched source audit data and an immutable exact claim span.',
      provenanceFailures
    );
  }

  const customer = selectedCustomer(bundle);
  const customerProfile = record(customer.profile || customer.persona);
  const decisionRole = String(
    first(
      customer.decision_role,
      customer.buyer_role_classification,
      customerProfile.decision_role,
      customerProfile.buyer_role_classification
    ) || ''
  )
    .trim()
    .toLowerCase();
  const buyerRole =
    first(
      customer.buyer_role,
      customer.is_buyer,
      customer.primary_buyer,
      customerProfile.buyer_role,
      customerProfile.is_buyer
    ) === true;
  const eligibility = String(
    first(
      customer.selection_eligibility,
      customer.eligibility_status,
      customerProfile.selection_eligibility,
      customerProfile.eligibility_status
    ) || ''
  )
    .trim()
    .toLowerCase();
  if (!buyerRole || !PRIMARY_BUYER_ROLES.has(decisionRole) || eligibility !== 'eligible_primary') {
    add(
      'primary_customer_ineligible',
      'The selected primary customer must be an eligible economic buyer or decision authority.',
      {
        decision_role: decisionRole || 'missing',
        buyer_role: buyerRole,
        eligibility: eligibility || 'missing',
      }
    );
  }

  const selectedCustomerId = String(first(customer.persona_id, customer.id) || '');
  const marketEvidenceIds = new Set([
    ...rows(bundle?.market_sources).map((item) => String(first(item.source_id, item.id) || '')),
    ...rows(bundle?.market_claims).map((item) => String(first(item.claim_id, item.id) || '')),
  ]);
  marketEvidenceIds.delete('');
  const customerEvidenceRefs = evidenceIds(
    customer.evidence_refs,
    customerProfile.evidence_refs,
    bundle?.research_context?.selected_customer?.evidence_refs
  );
  const customerEvidenceReady = customerEvidenceRefs.some((ref) => marketEvidenceIds.has(ref));

  const expectedRoles = stringList(
    scopeAuthority
      ? scopeAuthority.contract.executor_role_slots.map((slot) => slot.role)
      : policy.requested_execution_roles?.length
        ? policy.requested_execution_roles
        : COMMERCIAL_MARKET_LAUNCH_EXECUTION_ROLES
  );
  const requestedRoles = stringList(
    first(
      quality.requested_execution_roles,
      quality.executor_role_coverage?.requested_roles,
      bundle?.persona_resolution?.required_execution_roles
    )
  );
  const returnedRoles = returnedExecutorRoles(bundle, quality).filter(Boolean);
  const executorPersonas = rows(bundle?.executor_personas);
  const executorPersonaRoles = executorPersonas.map((item) =>
    first(item.required_role, item.role, item.persona?.role, item.profile?.role)
  );
  const incompleteExecutorPersonas = executorPersonas.filter((item) => {
    const container = record(item.persona || item.profile);
    const profile = { ...container, ...record(container.profile) };
    return (
      !first(item.name, profile.name) ||
      !first(item.required_role, item.role, profile.role) ||
      !hasContent(
        first(
          profile.mission,
          profile.description,
          profile.summary,
          profile.relevant_experience,
          profile.domain_knowledge,
          profile.capabilities,
          profile.methods
        )
      )
    );
  });
  const executorEvidenceFailures = executorPersonas
    .map((item) => {
      const container = record(item.persona || item.profile);
      const profile = { ...container, ...record(container.profile) };
      const refs = evidenceIds(
        item.evidence_refs,
        profile.evidence_refs,
        profile.research_context?.source_ids,
        profile.research_context?.claim_refs
      );
      const hasEvidence = refs.some((ref) => marketEvidenceIds.has(ref));
      const hasCustomer = Boolean(selectedCustomerId && refs.includes(selectedCustomerId));
      return hasEvidence && hasCustomer
        ? null
        : {
            persona_id: first(item.persona_id, item.id, 'unknown persona'),
            role: first(item.required_role, item.role, profile.role, 'unknown role'),
            missing_market_evidence: !hasEvidence,
            missing_selected_customer: !hasCustomer,
          };
    })
    .filter(Boolean);
  const coverage = record(quality.executor_role_coverage);
  const coverageStatus = String(first(coverage.status, coverage.coverage_status) || '')
    .trim()
    .toLowerCase();
  const missingRoles = stringList(coverage.missing_roles);
  const unexpectedRoles = stringList(coverage.unexpected_roles);
  const requestedCount = finite(coverage.requested_count, requestedRoles.length);
  const returnedCount = finite(coverage.returned_count, returnedRoles.length);
  const roleMatches = rows(coverage.role_matches);
  const exactRoleMatches =
    roleMatches.length === expectedRoles.length &&
    roleMatches.every(
      (item) =>
        item.covered === true &&
        normalizedRole(item.requested_role) === normalizedRole(item.returned_role)
    ) &&
    sameRoleSet(
      roleMatches.map((item) => item.requested_role),
      expectedRoles
    );
  if (
    expectedRoles.length === 0 ||
    coverageStatus !== 'complete' ||
    requestedCount !== expectedRoles.length ||
    returnedCount !== expectedRoles.length ||
    missingRoles.length > 0 ||
    unexpectedRoles.length > 0 ||
    !exactRoleMatches ||
    !sameRoleSet(requestedRoles, expectedRoles) ||
    !sameRoleSet(returnedRoles, expectedRoles)
  ) {
    add(
      'executor_role_coverage_mismatch',
      'AxWise must return exactly the accepted commercial executor roles with no omissions or additions.',
      {
        expected_roles: expectedRoles,
        requested_roles: requestedRoles,
        returned_roles: returnedRoles,
        missing_roles: missingRoles,
        unexpected_roles: unexpectedRoles,
        role_matches: roleMatches,
        status: coverageStatus || 'missing',
      }
    );
  }
  if (!customerEvidenceReady || executorEvidenceFailures.length) {
    add(
      'persona_evidence_contract_incomplete',
      'The selected customer and every executor persona must cite stable market evidence; executors must also reference the selected customer persona.',
      {
        selected_customer_id: selectedCustomerId || 'missing',
        selected_customer_evidence_refs: customerEvidenceRefs,
        customer_market_evidence_resolved: customerEvidenceReady,
        executor_failures: executorEvidenceFailures,
      }
    );
  }
  if (
    executorPersonas.length !== expectedRoles.length ||
    incompleteExecutorPersonas.length > 0 ||
    !sameRoleSet(executorPersonaRoles, expectedRoles)
  ) {
    add(
      'executor_persona_topology_incomplete',
      'Gate 1 requires one named executor persona profile for each accepted executor role.',
      {
        expected_roles: expectedRoles,
        persona_roles: executorPersonaRoles.filter(Boolean),
        persona_count: executorPersonas.length,
        incomplete_persona_ids: incompleteExecutorPersonas.map((item) =>
          first(item.persona_id, item.id, 'unknown persona')
        ),
      }
    );
  }

  const assignmentRows = rows(bundle?.agent_assignments || bundle?.persona_assignments);
  const incompatibleAssignments = assignmentRows.filter((item) => {
    const status = String(first(item.role_match_status, item.assignment_status, item.status) || '')
      .trim()
      .toLowerCase();
    // A null `role_match_pending` is expected before Orqaly materializes or
    // reuses a persistent specialist. An asserted agent binding, however,
    // must already be a compatible match; Gate 2 later requires all five
    // durable IDs and exact task coverage.
    return Boolean(item.agent_id) && !MATCHED_ASSIGNMENT_STATUSES.has(status);
  });
  if (incompatibleAssignments.length > 0) {
    add(
      'executor_assignment_incompatible',
      'An asserted Agent Hub assignment is not a compatible role match.',
      {
        assignment_count: assignmentRows.length,
        incompatible_roles: incompatibleAssignments.map((item) =>
          first(item.assignment_role, item.required_role, item.role, 'unknown role')
        ),
      }
    );
  }

  return {
    version: 1,
    status: issues.length ? 'blocked' : 'ready',
    required: true,
    intent: intent || COMMERCIAL_MARKET_LAUNCH_INTENT,
    ...(scopeAuthority
      ? {
          contract_hash: scopeAuthority.contract.contract_hash,
          scope_hash: scopeAuthority.packet.scope_hash,
        }
      : {}),
    prd_type: prdType || null,
    selected_customer_role: decisionRole || null,
    critical_claims: {
      status: criticalStatus || 'missing',
      total: totalCritical,
      verified: verifiedCritical,
      blocked: blockedCritical,
      conflicts: conflictCritical,
      stale: staleCritical,
    },
    executor_roles: {
      expected: expectedRoles,
      requested: requestedRoles,
      returned: returnedRoles,
      matched: assignmentRows.filter(
        (item) =>
          item.agent_id &&
          MATCHED_ASSIGNMENT_STATUSES.has(
            String(first(item.role_match_status, item.assignment_status, item.status) || '')
              .trim()
              .toLowerCase()
          )
      ).length,
    },
    issues,
  };
}

export function goalResearchContextGate(goal) {
  const policy = record(goal?.data?.research_policy);
  const pointer = record(goal?.data?.axwise_customer_intelligence?.research_bundle);
  const hasResearchPointer = Boolean(
    pointer.run_id || pointer.bundle_hash || pointer.context_gate_hash
  );
  const legacyResearchRequired =
    policy.required === true ||
    policy.grounding_required === true ||
    String(policy.research_mode || '').startsWith('grounded_');
  if (!hasResearchPointer && !legacyResearchRequired && !hasNativeAxwiseScopeMarkers(goal)) {
    return { version: 1, status: 'ready', required: false, issues: [] };
  }
  let scopeAuthority = null;
  try {
    scopeAuthority = goalScopeResearchAuthority(goal);
  } catch (error) {
    return blockedScopeContractGate(error);
  }
  const researchRequired = scopeAuthority.contract.evidence.mode !== 'none';
  // Fail-closed is a failure posture, not a command to create a run. It makes
  // an optional run strict only after AxWise selected and imported one.
  const selectedFailClosedResearch =
    policy.research_fail_closed === true &&
    Boolean(pointer.run_id || pointer.bundle_hash || pointer.context_gate_hash);
  const required = researchRequired || selectedFailClosedResearch;
  if (!required) return { version: 1, status: 'ready', required: false, issues: [] };
  if (
    scopeAuthority &&
    (pointer.scope_contract_hash !== scopeAuthority.contract.contract_hash ||
      pointer.scope_hash !== scopeAuthority.packet.scope_hash ||
      (scopeAuthority.researchAcceptance &&
        pointer.scope_research_acceptance_hash !== scopeAuthority.researchAcceptance.binding_hash))
  ) {
    return {
      version: 1,
      status: 'blocked',
      required: true,
      intent: scopeAuthority.contract.document_intent,
      contract_hash: scopeAuthority.contract.contract_hash,
      scope_hash: scopeAuthority.packet.scope_hash,
      issues: [
        {
          code: 'research_bundle_scope_contract_stale',
          message: 'The research bundle is not bound to the current accepted scope contract.',
        },
      ],
    };
  }
  if (!SHA256_RE.test(String(pointer.bundle_hash || ''))) {
    return {
      version: 1,
      status: 'blocked',
      required: true,
      issues: [
        {
          code: 'research_bundle_identity_invalid',
          message: 'The required research bundle is not pinned to a valid immutable hash.',
        },
      ],
    };
  }
  const gate = record(pointer.context_gate || pointer.approval_gate || pointer.quality_gate);
  if (!Object.keys(gate).length) {
    return {
      version: 1,
      status: 'blocked',
      required: true,
      issues: [
        {
          code: 'research_quality_gate_missing',
          message: 'The required AxWise research quality verdict is missing.',
        },
      ],
    };
  }
  if (
    scopeAuthority &&
    (gate.contract_hash !== scopeAuthority.contract.contract_hash ||
      gate.scope_hash !== scopeAuthority.packet.scope_hash ||
      gate.intent !== scopeAuthority.contract.document_intent)
  ) {
    return {
      version: 1,
      status: 'blocked',
      required: true,
      intent: scopeAuthority.contract.document_intent,
      contract_hash: scopeAuthority.contract.contract_hash,
      scope_hash: scopeAuthority.packet.scope_hash,
      issues: [
        {
          code: 'research_gate_scope_contract_stale',
          message:
            'The persisted Gate 1 verdict is not bound to the current accepted scope contract.',
        },
      ],
    };
  }
  if (
    !String(pointer.context_gate_hash || '').match(/^[a-f0-9]{64}$/i) ||
    researchContextGateHash(gate) !== pointer.context_gate_hash
  ) {
    return {
      version: 1,
      status: 'blocked',
      required: true,
      issues: [
        {
          code: 'research_quality_gate_tampered',
          message: 'The AxWise research quality verdict is not bound to the imported bundle.',
        },
      ],
    };
  }
  return gate.status === 'ready'
    ? gate
    : {
        ...gate,
        status: 'blocked',
        issues: Array.isArray(gate.issues) ? gate.issues : [],
      };
}

/** Recompute the verdict from the immutable current bundle at approval time. */
export async function verifyGoalResearchContextGate(admin, goal) {
  const compact = goalResearchContextGate(goal);
  if (compact.status !== 'ready' || compact.required !== true) return compact;
  const pointer = record(goal?.data?.axwise_customer_intelligence?.research_bundle);
  if (!pointer.run_id || !pointer.bundle_hash || !goal?.user_id || !goal?.org_id) {
    return {
      version: 1,
      status: 'blocked',
      required: true,
      issues: [
        {
          code: 'research_bundle_identity_missing',
          message: 'The current research bundle identity is incomplete.',
        },
      ],
    };
  }
  const { data: run, error } = await admin
    .from('goal_research_runs')
    .select('id, bundle_hash, version_status, raw_bundle')
    .eq('id', pointer.run_id)
    .eq('goal_id', goal.id)
    .eq('user_id', goal.user_id)
    .eq('org_id', goal.org_id)
    .eq('version_status', 'current')
    .maybeSingle();
  const rawBundle = record(run?.raw_bundle);
  const withoutEmbeddedHash = { ...rawBundle };
  delete withoutEmbeddedHash.bundle_hash;
  const computedBundleHash = researchContextGateHash(withoutEmbeddedHash);
  if (
    error ||
    !run ||
    run.bundle_hash !== pointer.bundle_hash ||
    !rawBundle.version ||
    computedBundleHash !== run.bundle_hash
  ) {
    return {
      version: 1,
      status: 'blocked',
      required: true,
      issues: [
        {
          code: 'research_bundle_not_current',
          message:
            'The approved research pointer does not resolve to the immutable current bundle.',
        },
      ],
    };
  }
  const recomputed = assessResearchContextGate(rawBundle, goal);
  if (
    recomputed.status !== 'ready' ||
    researchContextGateHash(recomputed) !== pointer.context_gate_hash
  ) {
    return recomputed.status === 'ready'
      ? {
          version: 1,
          status: 'blocked',
          required: true,
          issues: [
            {
              code: 'research_quality_gate_stale',
              message: 'The displayed research verdict differs from the immutable imported bundle.',
            },
          ],
        }
      : recomputed;
  }
  return recomputed;
}
