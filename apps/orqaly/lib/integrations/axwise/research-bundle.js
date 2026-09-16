/**
 * Durable AxWise research-bundle importer.
 *
 * AxWise owns bundle generation. Orqaly verifies the immutable bundle hash,
 * normalizes tenant-scoped records, persists an importing version, and only
 * then atomically activates it. Goal JSON receives a compact pointer rather
 * than another full copy of the potentially large research corpus.
 */
import { createHash } from 'node:crypto';
import {
  assessResearchContextGate,
  researchContextGateHash,
  validateResearchScopeContractBindings,
} from './research-contract.js';
import { AXWISE_RESEARCH_BUNDLE_V2, assertAxwiseEvidenceBundleV2 } from './evidence-contract-v2.js';

export const AXWISE_RESEARCH_BUNDLE_VERSION = 'axwise_research_bundle_v1';
export { AXWISE_RESEARCH_BUNDLE_V2 } from './evidence-contract-v2.js';

const MAX_RAW_BUNDLE_BYTES = 8 * 1024 * 1024;
const MAX_COLLECTION_ROWS = 2_000;
const SHA256_RE = /^[0-9a-f]{64}$/i;

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

function sha256(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

export function hashResearchValue(value) {
  return sha256(JSON.stringify(canonicalize(value)));
}

export function computeResearchBundleHash(bundle) {
  const withoutHash = { ...(bundle || {}) };
  delete withoutHash.bundle_hash;
  return hashResearchValue(withoutHash);
}

function text(value, maximum = 2_000) {
  const result = typeof value === 'string' ? value.trim() : '';
  return result ? result.slice(0, maximum) : null;
}

function artifactContentText(value) {
  if (typeof value === 'string') return text(value, MAX_RAW_BUNDLE_BYTES);
  if (!value || typeof value !== 'object') return null;
  try {
    return JSON.stringify(value, null, 2).slice(0, MAX_RAW_BUNDLE_BYTES) || null;
  } catch {
    return null;
  }
}

function rows(value, label) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error(`AxWise research ${label} must be an array`);
  if (value.length > MAX_COLLECTION_ROWS) {
    throw new Error(`AxWise research ${label} exceeds ${MAX_COLLECTION_ROWS} rows`);
  }
  return value.filter((item) => item && typeof item === 'object');
}

function externalId(item, fields, prefix) {
  for (const field of fields) {
    const value = text(item?.[field], 512);
    if (value) return value;
  }
  return `${prefix}-${hashResearchValue(item).slice(0, 32)}`;
}

function verifiedHash(value, fallbackValue, label) {
  const supplied = text(value, 64)?.toLowerCase();
  if (supplied && !SHA256_RE.test(supplied)) {
    throw new Error(`AxWise research ${label} is not a SHA-256 hash`);
  }
  return supplied || hashResearchValue(fallbackValue);
}

function sourceHash(item) {
  return verifiedHash(item.content_hash || item.source_hash, item, 'source hash');
}

function personaProfile(item) {
  const profile = item.profile ?? item.persona ?? item.data ?? {};
  return profile && typeof profile === 'object' ? profile : { value: String(profile || '') };
}

function personaRows(bundle) {
  return [
    ...rows(bundle.customer_personas, 'customer personas').map((item) => ({
      ...item,
      _normalized_persona_type: item.persona_type || 'customer',
    })),
    ...rows(bundle.executor_personas, 'executor personas').map((item) => ({
      ...item,
      _normalized_persona_type: item.persona_type || 'executor',
    })),
  ];
}

function artifactRows(bundle) {
  const researchPrd = bundle.research_prd;
  const artifacts = rows(bundle.artifacts, 'artifacts');
  if (
    !researchPrd ||
    typeof researchPrd !== 'object' ||
    (!researchPrd.content && !researchPrd.content_hash)
  ) {
    return artifacts;
  }
  const existingIndex = artifacts.findIndex(
    (artifact) => String(artifact.artifact_type || '').toLowerCase() === 'research_prd'
  );
  const prdArtifact = {
    ...(existingIndex >= 0 ? artifacts[existingIndex] : {}),
    artifact_id:
      (existingIndex >= 0 ? artifacts[existingIndex].artifact_id : null) ||
      researchPrd.cached_prd_id ||
      researchPrd.analysis_result_id ||
      'research-prd',
    artifact_type: 'research_prd',
    title: researchPrd.prd_type || 'Research PRD',
    mime_type: 'text/markdown',
    content_hash: researchPrd.content_hash,
    content: researchPrd.content,
    data: researchPrd,
  };
  if (existingIndex < 0) return [...artifacts, prdArtifact];
  return artifacts.map((artifact, index) => (index === existingIndex ? prdArtifact : artifact));
}

function selectedPersonaIds(bundle, personas) {
  if (bundle.selected_persona_ids != null && !Array.isArray(bundle.selected_persona_ids)) {
    throw new Error('AxWise research selected persona ids must be an array');
  }
  if ((bundle.selected_persona_ids || []).length > MAX_COLLECTION_ROWS) {
    throw new Error(`AxWise research selected persona ids exceeds ${MAX_COLLECTION_ROWS} rows`);
  }
  const supplied = [
    ...(Array.isArray(bundle.selected_persona_ids) ? bundle.selected_persona_ids : []),
    bundle.persona_resolution?.customer_persona?.persona_id,
    bundle.persona_resolution?.customer_persona_id,
  ];
  const selected = new Set(
    supplied
      .filter(Boolean)
      .map(String)
      .map((value) => value.trim())
      .filter(Boolean)
  );
  if ([...selected].some((value) => value.length > 512)) {
    throw new Error('AxWise research selected persona id exceeds 512 characters');
  }
  for (const persona of personas) {
    // AxWise's selected_persona_ids is the selected customer cohort. Executor
    // personas are role bindings and must never expand that customer contract.
    if (persona.selected === true && persona._normalized_persona_type === 'customer')
      selected.add(externalId(persona, ['persona_id', 'id'], 'persona'));
  }
  return [...selected].sort();
}

function candidateAssignments(bundle, personas) {
  const explicit = rows(
    bundle.persona_assignments || bundle.agent_persona_assignments,
    'assignments'
  );
  if (explicit.length) {
    // AxWise emits one role assignment per executor persona even when Orqaly
    // has not supplied a matching persistent agent. Those
    // `role_match_pending` records are valuable provenance in raw_bundle but
    // are not yet relational assignments. Team formation binds them later.
    return explicit.filter(
      (item) => text(item.agent_id, 512) && text(item.persona_id || item.external_persona_id, 512)
    );
  }

  const recommendedAgentId = text(bundle.persona_resolution?.recommended_agent?.agent_id, 512);
  if (!recommendedAgentId) return [];
  const recommendedExecutorId = text(
    bundle.persona_resolution?.ideal_agent_persona?.persona_id ||
      bundle.persona_resolution?.executor_persona_id,
    512
  );
  const executor = personas.find(
    (persona) =>
      persona._normalized_persona_type === 'executor' &&
      (recommendedExecutorId
        ? externalId(persona, ['persona_id', 'id'], 'persona') === recommendedExecutorId
        : persona.selected === true)
  );
  return executor
    ? [
        {
          agent_id: recommendedAgentId,
          persona_id: externalId(executor, ['persona_id', 'id'], 'persona'),
          assignment_role: 'recommended_executor',
        },
      ]
    : [];
}

function researchPrdHash(bundle, artifacts) {
  const suppliedBundleHash = text(bundle.research_prd_hash, 64)?.toLowerCase() || null;
  if (suppliedBundleHash && !SHA256_RE.test(suppliedBundleHash)) {
    throw new Error('AxWise research PRD hash is not a SHA-256 hash');
  }
  const prd = bundle.research_prd;
  let nestedHash = null;
  if (prd && typeof prd === 'object') {
    if (prd.content_hash) {
      nestedHash = verifiedHash(prd.content_hash, prd.content, 'PRD hash');
      if (prd.content !== undefined && nestedHash !== hashResearchValue(prd.content)) {
        throw new Error('AxWise research PRD content hash does not match its content');
      }
    } else if (prd.content) nestedHash = hashResearchValue(prd.content);
  }
  if (!nestedHash) {
    const artifact = artifacts.find(
      (item) => String(item.artifact_type || '').toLowerCase() === 'research_prd'
    );
    nestedHash = artifact
      ? verifiedHash(
          artifact.content_hash,
          artifact.content ?? artifact.data ?? artifact,
          'PRD hash'
        )
      : null;
  }
  if (suppliedBundleHash && nestedHash && suppliedBundleHash !== nestedHash) {
    throw new Error('AxWise research PRD hash does not match its artifact');
  }
  return suppliedBundleHash || nestedHash;
}

export function extractAxwiseResearchBundle(completedRun) {
  const candidates = [
    completedRun?.research_bundle,
    completedRun?.result?.research_bundle,
    completedRun?.data?.research_bundle,
    completedRun?.result?.data?.research_bundle,
  ];
  return candidates.find((candidate) => candidate && typeof candidate === 'object') || null;
}

/** Legacy v1 normalizer. Keep this path semantically isolated from v2. */
function normalizeAxwiseResearchBundleVersion(
  bundle,
  { goal, externalRunId } = {},
  expectedVersion = AXWISE_RESEARCH_BUNDLE_VERSION
) {
  if (!bundle || typeof bundle !== 'object') throw new Error('AxWise research bundle is missing');
  if (bundle.version !== expectedVersion) {
    throw new Error('AxWise research bundle version is unsupported');
  }
  if (!goal?.id || !goal?.user_id || !goal?.org_id) {
    throw new Error('Goal id, owner and organization are required for research import');
  }
  const scopeAuthority = validateResearchScopeContractBindings(bundle, goal);
  const researchPolicy = goal.data?.research_policy || {};
  const pinnedEvidence = scopeAuthority?.contract?.evidence || null;
  const grounded = pinnedEvidence
    ? pinnedEvidence.grounding_required
    : researchPolicy.grounding_required === true ||
      ['grounded_fast', 'grounded_deep'].includes(researchPolicy.research_mode);
  const failClosed = pinnedEvidence
    ? pinnedEvidence.mode !== 'none'
    : researchPolicy.research_fail_closed === true || researchPolicy.required === true || grounded;
  if (failClosed) {
    const requiredFields = pinnedEvidence
      ? [
          ...pinnedEvidence.required_outputs.filter((field) => field !== 'research_bundle'),
          ...(scopeAuthority.contract.executor_role_slots.length ? ['executor_personas'] : []),
        ]
      : [
          'market_sources',
          'market_claims',
          'synthetic_participants',
          'interviews',
          'customer_personas',
          'executor_personas',
          'persona_resolution',
          'research_prd',
        ];
    for (const field of [...new Set(requiredFields)]) {
      if (!Object.prototype.hasOwnProperty.call(bundle, field)) {
        throw new Error(`AxWise required research output is missing: ${field}`);
      }
    }
    for (const [field, label] of [
      ['synthetic_participants', 'synthetic participants'],
      ['interviews', 'interviews'],
      ['customer_personas', 'customer personas'],
      ['executor_personas', 'executor personas'],
    ]) {
      const emptyV2ExecutorContract =
        expectedVersion === AXWISE_RESEARCH_BUNDLE_V2 &&
        field === 'executor_personas' &&
        Array.isArray(researchPolicy.business_evidence_profile?.required_role_slots) &&
        researchPolicy.business_evidence_profile.required_role_slots.length === 0;
      if (emptyV2ExecutorContract) continue;
      if (requiredFields.includes(field) && rows(bundle[field], label).length === 0) {
        throw new Error(`AxWise required research output is empty: ${field}`);
      }
    }
    if (
      requiredFields.includes('persona_resolution') &&
      (!bundle.persona_resolution ||
        typeof bundle.persona_resolution !== 'object' ||
        Array.isArray(bundle.persona_resolution) ||
        Object.keys(bundle.persona_resolution).length === 0)
    ) {
      throw new Error('AxWise required research output is empty: persona_resolution');
    }
  }
  if (grounded) {
    if (rows(bundle.market_sources, 'market sources').length === 0) {
      throw new Error('AxWise required research output is empty: market_sources');
    }
    if (bundle.quality?.grounding_required !== true) {
      throw new Error('AxWise research bundle did not preserve required grounding policy');
    }
    if (bundle.quality?.grounding_satisfied !== true) {
      throw new Error('AxWise research bundle did not satisfy required grounding');
    }
    if (scopeAuthority) {
      const expectedCountries = [...scopeAuthority.contract.geographies].sort();
      const returnedCountries = [
        ...new Set(
          (bundle.market_scope?.resolved_scope?.countries || [])
            .map((item) =>
              String(typeof item === 'string' ? item : item?.country_code || '').toUpperCase()
            )
            .filter(Boolean)
        ),
      ].sort();
      if (
        expectedCountries.length !== returnedCountries.length ||
        expectedCountries.some((country, index) => country !== returnedCountries[index])
      ) {
        throw new Error(
          `AxWise research bundle geography does not match the accepted scope contract: expected ${expectedCountries.join(', ') || 'none'}; received ${returnedCountries.join(', ') || 'none'}`
        );
      }
    }
    const requestedScopeHash = text(researchPolicy.market_scope_hash, 64)?.toLowerCase();
    const returnedScopeHash = text(bundle.market_scope?.resolution_hash, 64)?.toLowerCase();
    if (requestedScopeHash && !returnedScopeHash) {
      throw new Error('AxWise research bundle is missing the requested market scope');
    }
    if (requestedScopeHash && returnedScopeHash !== requestedScopeHash) {
      throw new Error('AxWise research bundle market scope does not match the request');
    }
    const expectedMarkets = researchPolicy.market_scope?.resolved_scope?.countries || [];
    if (expectedMarkets.length > 1) {
      const completedCountries = new Set(
        rows(bundle.cell_coverage, 'market cell coverage')
          .filter((item) => ['complete', 'completed'].includes(item.status))
          .flatMap((item) => (Array.isArray(item.country_codes) ? item.country_codes : []))
          .map((code) => String(code).toUpperCase())
      );
      const missing = expectedMarkets
        .map((item) => String(item.country_code || '').toUpperCase())
        .filter((code) => code && !completedCountries.has(code));
      if (missing.length) {
        throw new Error(
          `AxWise research bundle is missing completed market cells: ${missing.join(', ')}`
        );
      }
    }
    const completedMode = text(bundle.configuration?.research_mode, 120);
    if (completedMode && !completedMode.startsWith('grounded')) {
      throw new Error('AxWise research bundle completed with a non-grounded mode');
    }
  }
  const rawBytes = Buffer.byteLength(JSON.stringify(bundle), 'utf8');
  if (rawBytes > MAX_RAW_BUNDLE_BYTES) throw new Error('AxWise research bundle exceeds 8 MiB');

  const computedBundleHash = computeResearchBundleHash(bundle);
  const providerBundleHash = text(bundle.bundle_hash, 64)?.toLowerCase() || null;
  if (providerBundleHash && !SHA256_RE.test(providerBundleHash)) {
    throw new Error('AxWise research bundle_hash is not a SHA-256 hash');
  }
  if (providerBundleHash && providerBundleHash !== computedBundleHash) {
    throw new Error('AxWise research bundle hash does not match its content');
  }

  const sources = rows(bundle.market_sources, 'sources').map((item) => ({
    external_source_id: externalId(item, ['source_id', 'id'], 'source'),
    source_hash: sourceHash(item),
    provider_source_hash: text(item.content_hash || item.source_hash, 64)?.toLowerCase() || null,
    source_type: text(item.source_type || item.type, 120),
    title: text(item.title, 1_000),
    url: text(item.url, 4_000),
    publisher: text(item.publisher || item.company_name, 1_000),
    observed_at: text(item.observed_at || item.published_at, 100),
    payload: item,
  }));
  const sourceHashById = new Map(
    sources.map((source) => [source.external_source_id, source.source_hash])
  );
  const personaInput = personaRows(bundle);
  const selectedIds = selectedPersonaIds(bundle, personaInput);
  const availablePersonaIds = new Set(
    personaInput.map((persona) => externalId(persona, ['persona_id', 'id'], 'persona'))
  );
  const customerPersonaIds = new Set(
    personaInput
      .filter((persona) => persona._normalized_persona_type === 'customer')
      .map((persona) => externalId(persona, ['persona_id', 'id'], 'persona'))
  );
  const missingPersonaId = selectedIds.find((personaId) => !availablePersonaIds.has(personaId));
  if (missingPersonaId) {
    throw new Error(`AxWise selected persona is missing from the bundle: ${missingPersonaId}`);
  }
  const nonCustomerPersonaId = selectedIds.find((personaId) => !customerPersonaIds.has(personaId));
  if (nonCustomerPersonaId) {
    throw new Error(
      `AxWise selected persona must reference a customer persona: ${nonCustomerPersonaId}`
    );
  }
  if (
    failClosed &&
    (!pinnedEvidence || pinnedEvidence.required_outputs.includes('customer_personas')) &&
    selectedIds.length === 0
  ) {
    throw new Error('AxWise required research selected customer persona is missing');
  }
  const personas = personaInput.map((item) => {
    const personaId = externalId(item, ['persona_id', 'id'], 'persona');
    const profile = personaProfile(item);
    return {
      external_persona_id: personaId,
      persona_hash: verifiedHash(item.content_hash || item.persona_hash, item, 'persona hash'),
      persona_type: text(item._normalized_persona_type || item.persona_type || item.type, 120),
      name: text(item.name || profile.name || profile.role, 1_000),
      role: text(item.role || profile.role, 1_000),
      stakeholder_type: text(item.stakeholder_type || profile.stakeholder_type, 500),
      selected: selectedIds.includes(personaId),
      source_hashes: [
        ...new Set(
          (Array.isArray(item.source_ids) ? item.source_ids : [])
            .map((sourceId) => sourceHashById.get(String(sourceId)))
            .filter(Boolean)
        ),
      ].sort(),
      profile,
      payload: Object.fromEntries(
        Object.entries(item).filter(([key]) => key !== '_normalized_persona_type')
      ),
    };
  });
  const artifactInput = artifactRows(bundle);
  const artifacts = artifactInput.map((item) => {
    const payload = item.data && typeof item.data === 'object' ? item.data : item;
    const content = artifactContentText(item.content ?? payload.content);
    return {
      external_artifact_id: externalId(item, ['artifact_id', 'record_id', 'id'], 'artifact'),
      artifact_type: text(item.artifact_type || item.type, 120),
      title: text(item.title, 1_000),
      mime_type: text(item.mime_type, 255),
      content_hash: verifiedHash(item.content_hash, content ?? payload, 'artifact hash'),
      content_text: content,
      payload,
    };
  });
  const assignments = candidateAssignments(bundle, personaInput).map((item) => ({
    agent_id: text(item.agent_id, 512),
    external_persona_id: text(item.persona_id || item.external_persona_id, 512),
    assignment_source: 'axwise',
    assignment_role: text(item.assignment_role || item.required_role || item.role, 255),
    payload: item,
  }));
  if (assignments.some((item) => !item.agent_id || !item.external_persona_id)) {
    throw new Error('AxWise research persona assignment is incomplete');
  }

  const qualityCounts = {
    source_count: rows(bundle.market_sources, 'sources').length,
    claim_count: rows(bundle.market_claims, 'market claims').length,
    participant_count: rows(bundle.synthetic_participants, 'synthetic participants').length,
    interview_count: rows(bundle.interviews, 'interviews').length,
    customer_persona_count: rows(bundle.customer_personas, 'customer personas').length,
    executor_persona_count: rows(bundle.executor_personas, 'executor personas').length,
    persona_assignment_count: rows(
      bundle.persona_assignments || bundle.agent_persona_assignments,
      'assignments'
    ).length,
    artifact_count: rows(bundle.artifacts, 'artifacts').length,
  };
  for (const [field, actual] of Object.entries(qualityCounts)) {
    if (bundle.quality?.[field] == null) continue;
    const reported = Number(bundle.quality[field]);
    if (!Number.isInteger(reported) || reported !== actual) {
      throw new Error(`AxWise research quality ${field} does not match the bundle`);
    }
  }

  const runId = text(bundle.run_id, 512);
  if (!runId) throw new Error('AxWise research bundle run_id is required');
  const expectedRunId = text(externalRunId, 512);
  if (expectedRunId && runId !== expectedRunId) {
    throw new Error('AxWise research bundle run_id does not match the durable provider job');
  }
  const prdHash = researchPrdHash(bundle, artifactInput);
  if (
    failClosed &&
    (!pinnedEvidence || pinnedEvidence.required_outputs.includes('research_prd')) &&
    !prdHash
  ) {
    throw new Error('AxWise required research PRD hash is missing');
  }

  return {
    contextGate: assessResearchContextGate(bundle, goal),
    run: {
      goal_id: goal.id,
      user_id: goal.user_id,
      org_id: goal.org_id,
      external_run_id: runId,
      external_decision_id: text(bundle.decision_id, 512),
      bundle_version: bundle.version,
      bundle_hash: computedBundleHash,
      provider_bundle_hash: providerBundleHash,
      research_prd_hash: prdHash,
      selected_persona_ids: selectedIds,
      run_status: text(bundle.status, 120),
      version_status: 'importing',
      source_count: sources.length,
      persona_count: personas.length,
      artifact_count: artifacts.length,
      raw_bundle: bundle,
    },
    sources,
    personas,
    artifacts,
    assignments,
  };
}

function evidencePersonaRoleSlot(persona) {
  const profile = personaProfile(persona);
  return text(
    persona?.role_slot ||
      persona?.required_role_slot ||
      profile.role_slot ||
      profile.required_role_slot,
    120
  );
}

function assertEvidenceRoleSlotCoverage(bundle, profile) {
  const expected = [...new Set(profile.required_role_slots || [])].sort();
  const returned = rows(bundle.executor_personas, 'executor personas')
    .map(evidencePersonaRoleSlot)
    .filter(Boolean)
    .sort();
  const uniqueReturned = [...new Set(returned)];
  if (
    returned.length !== uniqueReturned.length ||
    expected.length !== uniqueReturned.length ||
    expected.some((slot, index) => slot !== uniqueReturned[index])
  ) {
    throw new Error(
      `AxWise research v2 executor role_slot coverage does not match the requested profile: expected ${expected.join(', ') || 'none'}; received ${uniqueReturned.join(', ') || 'none'}`
    );
  }
  return uniqueReturned;
}

function normalizeEvidenceFactRows(facts, sourceHashById) {
  return facts.map((fact) => ({
    external_fact_id: fact.fact_id,
    claim_id: fact.claim_id,
    fact_kind: fact.kind,
    schema_version: fact.schema_version,
    fact_hash: fact.fact_hash,
    source_ids: [...new Set(fact.source_ids.map(String))].sort(),
    source_hashes: [...new Set(fact.source_ids.map((id) => sourceHashById.get(String(id))))]
      .filter(Boolean)
      .sort(),
    country_codes: [...new Set(fact.country_codes.map(String))].sort(),
    observed_at: fact.observed_at,
    market_scope_hash: fact.market_scope_hash,
    topic_seed_sha256: fact.topic_seed_sha256,
    comparison_scope_hash: fact.comparison_scope_hash,
    verification_status: fact.verification_status,
    payload: fact.payload,
  }));
}

function normalizeEvidenceCalculationRows(calculations) {
  return calculations.map((calculation) => ({
    external_calculation_id: calculation.calculation_id,
    calculation_kind: calculation.kind,
    schema_version: calculation.schema_version,
    formula_version: calculation.formula_version,
    calculation_hash: calculation.calculation_hash,
    input_fact_ids: [
      calculation.input_bindings.higher.fact_id,
      calculation.input_bindings.lower.fact_id,
    ],
    country_codes: [...new Set(calculation.country_codes.map(String))].sort(),
    comparison_scope_hash: calculation.comparison_scope_hash,
    verification_status: calculation.verification_status,
    target_basis: calculation.target_basis,
    result: calculation.result,
    payload: calculation,
  }));
}

/** Pure dual-read normalizer used by persistence, tests and future import tools. */
export function normalizeAxwiseResearchBundle(bundle, { goal, externalRunId } = {}) {
  const researchPolicy = goal?.data?.research_policy || {};
  const pinsEvidenceV2 = Boolean(
    researchPolicy.business_evidence_profile || researchPolicy.business_evidence_profile_hash
  );
  if (pinsEvidenceV2 && bundle?.version !== AXWISE_RESEARCH_BUNDLE_V2) {
    throw new Error('A goal-pinned business evidence profile requires an AxWise v2 bundle');
  }
  if (bundle?.version !== AXWISE_RESEARCH_BUNDLE_V2) {
    const reservedV2Fields = [
      'evidence_profile',
      'evidence_profile_hash',
      'facts',
      'calculations',
      'fact_manifest_hash',
      'calculation_manifest_hash',
    ];
    const smuggledField = reservedV2Fields.find((field) =>
      Object.prototype.hasOwnProperty.call(bundle || {}, field)
    );
    if (
      smuggledField ||
      Object.prototype.hasOwnProperty.call(bundle?.quality || {}, 'evidence_contract')
    ) {
      throw new Error(
        `AxWise v1 bundle cannot carry reserved v2 evidence fields${
          smuggledField ? `: ${smuggledField}` : ''
        }`
      );
    }
    return normalizeAxwiseResearchBundleVersion(bundle, { goal, externalRunId });
  }
  const expectedProfile = researchPolicy.business_evidence_profile;
  const expectedProfileHash = researchPolicy.business_evidence_profile_hash;
  if (!expectedProfile || !expectedProfileHash) {
    throw new Error('AxWise research v2 requires the goal-pinned business evidence profile');
  }
  const evidence = assertAxwiseEvidenceBundleV2(bundle, {
    expectedProfile,
    expectedProfileHash,
  });
  assertEvidenceRoleSlotCoverage(bundle, expectedProfile);
  const normalized = normalizeAxwiseResearchBundleVersion(
    bundle,
    { goal, externalRunId },
    AXWISE_RESEARCH_BUNDLE_V2
  );
  const sourceHashById = new Map(
    normalized.sources.map((source) => [source.external_source_id, source.source_hash])
  );
  normalized.facts = normalizeEvidenceFactRows(evidence.facts, sourceHashById);
  normalized.calculations = normalizeEvidenceCalculationRows(evidence.calculations);
  normalized.contextGate = assessResearchContextGate(bundle, goal);
  Object.assign(normalized.run, {
    evidence_profile_version: bundle.evidence_profile.version,
    evidence_profile_hash: bundle.evidence_profile_hash,
    fact_manifest_hash: bundle.fact_manifest_hash,
    calculation_manifest_hash: bundle.calculation_manifest_hash,
    fact_count: normalized.facts.length,
    calculation_count: normalized.calculations.length,
  });
  return normalized;
}

function childRows(items, run, researchRunId) {
  return items.map((item) => ({
    research_run_id: researchRunId,
    goal_id: run.goal_id,
    user_id: run.user_id,
    org_id: run.org_id,
    ...item,
  }));
}

async function querySingle(query, label) {
  const { data, error } = await query;
  if (error) throw new Error(`${label}: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error(`${label}: no row returned`);
  return row;
}

async function upsertChildren(admin, table, items, run, researchRunId, conflict) {
  if (!items.length) return;
  const { error } = await admin
    .from(table)
    .upsert(childRows(items, run, researchRunId), { onConflict: conflict });
  if (error) throw new Error(`Unable to persist ${table}: ${error.message}`);
}

export function researchBundlePointer(run, { contextGate = null } = {}) {
  if (!run) return null;
  const rawBundle = run.raw_bundle && typeof run.raw_bundle === 'object' ? run.raw_bundle : {};
  const marketScope = rawBundle.market_scope || null;
  const quality =
    rawBundle.quality && typeof rawBundle.quality === 'object' ? rawBundle.quality : {};
  const scopeBinding = rawBundle.scope_contract_binding;
  const scopeResearchAcceptance = rawBundle.scope_research_acceptance;
  return {
    run_id: run.id,
    external_run_id: run.external_run_id,
    bundle_version: run.bundle_version,
    bundle_hash: run.bundle_hash,
    research_prd_hash: run.research_prd_hash || null,
    selected_persona_ids: [...new Set(run.selected_persona_ids || [])].map(String).sort(),
    source_count: Number(run.source_count || 0),
    persona_count: Number(run.persona_count || 0),
    artifact_count: Number(run.artifact_count || 0),
    ...(scopeBinding
      ? {
          scope_contract_hash: scopeBinding.contract_hash,
          scope_hash: scopeBinding.scope_hash,
        }
      : {}),
    ...(scopeResearchAcceptance?.binding_hash
      ? { scope_research_acceptance_hash: scopeResearchAcceptance.binding_hash }
      : {}),
    ...(run.bundle_version === AXWISE_RESEARCH_BUNDLE_V2
      ? {
          evidence_profile_version:
            run.evidence_profile_version || rawBundle.evidence_profile?.version || null,
          evidence_profile_hash:
            run.evidence_profile_hash || rawBundle.evidence_profile_hash || null,
          fact_manifest_hash: run.fact_manifest_hash || rawBundle.fact_manifest_hash || null,
          calculation_manifest_hash:
            run.calculation_manifest_hash || rawBundle.calculation_manifest_hash || null,
          fact_count: Number(run.fact_count ?? rawBundle.facts?.length ?? 0),
          calculation_count: Number(run.calculation_count ?? rawBundle.calculations?.length ?? 0),
          required_role_slots: [
            ...new Set(rawBundle.evidence_profile?.required_role_slots || []),
          ].sort(),
        }
      : {}),
    ...(quality.customer_persona_count != null
      ? { customer_persona_count: Number(quality.customer_persona_count) }
      : {}),
    ...(quality.executor_persona_count != null
      ? { executor_persona_count: Number(quality.executor_persona_count) }
      : {}),
    ...(quality.participant_count != null
      ? { participant_count: Number(quality.participant_count) }
      : {}),
    ...(quality.interview_count != null
      ? { interview_count: Number(quality.interview_count) }
      : {}),
    ...(quality.claim_count != null ? { claim_count: Number(quality.claim_count) } : {}),
    ...(contextGate
      ? {
          context_gate: contextGate,
          context_gate_hash: researchContextGateHash(contextGate),
        }
      : {}),
    ...(marketScope
      ? {
          market_scope_hash: marketScope.resolution_hash || null,
          market_count: Number(marketScope.resolved_scope?.countries?.length || 0),
          research_cell_count: Number(rawBundle.research_cells?.length || 0),
        }
      : {}),
    imported_at: run.imported_at || null,
  };
}

/** Idempotently persist and activate a complete normalized bundle. */
export async function importGoalResearchBundle(admin, goal, bundle, { externalRunId } = {}) {
  if (!text(externalRunId, 512)) {
    throw new Error('AxWise research import requires the durable provider job identity');
  }
  const normalized = normalizeAxwiseResearchBundle(bundle, { goal, externalRunId });
  const typedCounts =
    normalized.run.bundle_version === AXWISE_RESEARCH_BUNDLE_V2
      ? {
          facts: normalized.facts.length,
          calculations: normalized.calculations.length,
        }
      : {};
  const { data: existingRun, error: existingRunError } = await admin
    .from('goal_research_runs')
    .select('*')
    .eq('goal_id', goal.id)
    .eq('user_id', goal.user_id)
    .eq('org_id', goal.org_id)
    .eq('bundle_hash', normalized.run.bundle_hash)
    .maybeSingle();
  if (existingRunError) {
    throw new Error(`Unable to inspect goal research run: ${existingRunError.message}`);
  }
  // The bundle hash covers the complete canonical payload. A current row with
  // that hash therefore proves the exact import already completed; avoid
  // demoting it back to `importing` or repeating child writes.
  if (existingRun?.version_status === 'current') {
    return {
      run: existingRun,
      pointer: researchBundlePointer(existingRun, { contextGate: normalized.contextGate }),
      counts: {
        sources: normalized.sources.length,
        personas: normalized.personas.length,
        artifacts: normalized.artifacts.length,
        assignments: normalized.assignments.length,
        ...typedCounts,
      },
      reused: true,
    };
  }
  const run = await querySingle(
    admin
      .from('goal_research_runs')
      .upsert(normalized.run, { onConflict: 'goal_id,bundle_hash' })
      .select('*')
      .single(),
    'Unable to persist goal research run'
  );

  await upsertChildren(
    admin,
    'goal_research_sources',
    normalized.sources,
    normalized.run,
    run.id,
    'research_run_id,external_source_id'
  );
  await upsertChildren(
    admin,
    'goal_research_personas',
    normalized.personas,
    normalized.run,
    run.id,
    'research_run_id,external_persona_id'
  );
  await upsertChildren(
    admin,
    'goal_research_artifacts',
    normalized.artifacts,
    normalized.run,
    run.id,
    'research_run_id,external_artifact_id'
  );
  await upsertChildren(
    admin,
    'goal_research_facts',
    normalized.facts || [],
    normalized.run,
    run.id,
    'research_run_id,external_fact_id'
  );
  await upsertChildren(
    admin,
    'goal_research_calculations',
    normalized.calculations || [],
    normalized.run,
    run.id,
    'research_run_id,external_calculation_id'
  );

  let persistedAssignments = [];
  if (normalized.assignments.length) {
    const { data: personaRows, error: personaError } = await admin
      .from('goal_research_personas')
      .select('id, external_persona_id')
      .eq('research_run_id', run.id)
      .eq('user_id', goal.user_id);
    if (personaError)
      throw new Error(`Unable to resolve persisted research personas: ${personaError.message}`);
    const personaIdByExternal = new Map(
      (personaRows || []).map((persona) => [persona.external_persona_id, persona.id])
    );
    persistedAssignments = normalized.assignments.map((assignment) => {
      const personaId = personaIdByExternal.get(assignment.external_persona_id);
      if (!personaId) throw new Error('Research assignment references an unknown persona');
      return { ...assignment, persona_id: personaId };
    });
    await upsertChildren(
      admin,
      'goal_agent_persona_assignments',
      persistedAssignments,
      normalized.run,
      run.id,
      'research_run_id,agent_id,persona_id,assignment_source'
    );
  }
  const activated = await querySingle(
    admin.rpc('activate_goal_research_run', { p_run_id: run.id, p_user_id: goal.user_id }),
    'Unable to activate goal research run'
  );
  return {
    run: activated,
    pointer: researchBundlePointer(activated, { contextGate: normalized.contextGate }),
    counts: {
      sources: normalized.sources.length,
      personas: normalized.personas.length,
      artifacts: normalized.artifacts.length,
      assignments: persistedAssignments.length,
      ...typedCounts,
    },
  };
}

async function queryRows(query, label) {
  const { data, error } = await query;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data || [];
}

function stableRowOrder(items, fields) {
  return [...items].sort((left, right) => {
    for (const field of fields) {
      const compared = String(left?.[field] || '').localeCompare(String(right?.[field] || ''));
      if (compared) return compared;
    }
    return 0;
  });
}

/**
 * Stable server-side loader contract for planning/team/execution consumers.
 * It never trusts a run id supplied by a browser; goal+owner+org+current are
 * the authorization and version boundaries.
 */
export async function loadGoalResearchBundle(admin, goal) {
  if (!goal?.id || !goal?.user_id || !goal?.org_id) return null;
  const { data: run, error: runError } = await admin
    .from('goal_research_runs')
    .select('*')
    .eq('goal_id', goal.id)
    .eq('user_id', goal.user_id)
    .eq('org_id', goal.org_id)
    .eq('version_status', 'current')
    .maybeSingle();
  if (runError) throw new Error(`Unable to load current goal research run: ${runError.message}`);
  if (!run) return null;

  const typedEvidence = run.bundle_version === AXWISE_RESEARCH_BUNDLE_V2;
  const [sources, personas, artifacts, assignments, facts, calculations] = await Promise.all([
    queryRows(
      admin
        .from('goal_research_sources')
        .select('*')
        .eq('research_run_id', run.id)
        .eq('goal_id', goal.id)
        .eq('user_id', goal.user_id)
        .eq('org_id', goal.org_id)
        .order('created_at', { ascending: true }),
      'Unable to load goal research sources'
    ),
    queryRows(
      admin
        .from('goal_research_personas')
        .select('*')
        .eq('research_run_id', run.id)
        .eq('goal_id', goal.id)
        .eq('user_id', goal.user_id)
        .eq('org_id', goal.org_id)
        .order('created_at', { ascending: true }),
      'Unable to load goal research personas'
    ),
    queryRows(
      admin
        .from('goal_research_artifacts')
        .select('*')
        .eq('research_run_id', run.id)
        .eq('goal_id', goal.id)
        .eq('user_id', goal.user_id)
        .eq('org_id', goal.org_id)
        .order('created_at', { ascending: true }),
      'Unable to load goal research artifacts'
    ),
    queryRows(
      admin
        .from('goal_agent_persona_assignments')
        .select('*')
        .eq('research_run_id', run.id)
        .eq('goal_id', goal.id)
        .eq('user_id', goal.user_id)
        .eq('org_id', goal.org_id)
        .order('created_at', { ascending: true }),
      'Unable to load goal-agent persona assignments'
    ),
    typedEvidence
      ? queryRows(
          admin
            .from('goal_research_facts')
            .select('*')
            .eq('research_run_id', run.id)
            .eq('goal_id', goal.id)
            .eq('user_id', goal.user_id)
            .eq('org_id', goal.org_id)
            .order('created_at', { ascending: true }),
          'Unable to load goal research facts'
        )
      : Promise.resolve([]),
    typedEvidence
      ? queryRows(
          admin
            .from('goal_research_calculations')
            .select('*')
            .eq('research_run_id', run.id)
            .eq('goal_id', goal.id)
            .eq('user_id', goal.user_id)
            .eq('org_id', goal.org_id)
            .order('created_at', { ascending: true }),
          'Unable to load goal research calculations'
        )
      : Promise.resolve([]),
  ]);

  return {
    run,
    sources: stableRowOrder(sources, ['external_source_id', 'id']),
    personas: stableRowOrder(personas, ['persona_type', 'external_persona_id', 'id']).map(
      (persona) => ({
        ...persona,
        persona_id: persona.external_persona_id,
        data: persona.payload,
      })
    ),
    artifacts: stableRowOrder(artifacts, ['artifact_type', 'external_artifact_id', 'id']).map(
      (artifact) => ({
        ...artifact,
        content: artifact.content_text,
        data: artifact.payload,
        hash: artifact.content_hash,
      })
    ),
    assignments: stableRowOrder(assignments, [
      'assignment_role',
      'agent_id',
      'external_persona_id',
      'id',
    ]),
    ...(typedEvidence
      ? {
          facts: stableRowOrder(facts, ['fact_kind', 'external_fact_id', 'id']).map((fact) => ({
            ...fact,
            fact_id: fact.external_fact_id,
            kind: fact.fact_kind,
            data: fact.payload,
          })),
          calculations: stableRowOrder(calculations, [
            'calculation_kind',
            'external_calculation_id',
            'id',
          ]).map((calculation) => ({
            ...calculation,
            calculation_id: calculation.external_calculation_id,
            kind: calculation.calculation_kind,
            data: calculation.payload,
          })),
        }
      : {}),
    bundle: run.raw_bundle,
  };
}
