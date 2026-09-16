import { cleanGeneratedPresentationText } from '../../utils/generatedPresentationText.js';

const EMPTY_COUNTS = Object.freeze({
  sources: 0,
  personas: 0,
  customerPersonas: 0,
  participants: 0,
  interviews: 0,
  executorPersonas: 0,
  artifacts: 0,
  facts: 0,
  calculations: 0,
});

const AXWISE_RESEARCH_BUNDLE_V2 = 'axwise_research_bundle_v2';
const EVIDENCE_FACT_VERSION = 'evidence_fact_v1';
const EVIDENCE_CALCULATION_VERSION = 'evidence_calculation_v1';
const EVIDENCE_FACT_KINDS = new Set([
  'physical_product_offer',
  'subscription_plan',
  'usage_tariff',
  'project_service_quote',
]);
const EVIDENCE_CALCULATION_KINDS = new Set([
  'physical_offer_price_difference',
  'subscription_rate_difference',
  'usage_tariff_rate_difference',
  'project_quote_rate_difference',
]);
const BUSINESS_ECONOMIC_MODELS = new Set([
  'physical_product',
  'subscription',
  'usage_based',
  'project_service',
  'none',
]);

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function array(...values) {
  const value =
    values.find((candidate) => Array.isArray(candidate) && candidate.length) ||
    values.find(Array.isArray);
  return value ? value.filter(Boolean) : [];
}

function record(...values) {
  const value = values.find(
    (candidate) =>
      candidate &&
      typeof candidate === 'object' &&
      !Array.isArray(candidate) &&
      Object.keys(candidate).length
  );
  return object(value);
}

function first(...values) {
  return (
    values.find(
      (value) =>
        value !== undefined &&
        value !== null &&
        value !== '' &&
        !(typeof value === 'string' && /^(?:null|undefined|\[object object\])$/i.test(value.trim()))
    ) ?? null
  );
}

function finite(...values) {
  const value = values.find(
    (candidate) =>
      candidate !== null &&
      candidate !== undefined &&
      candidate !== '' &&
      Number.isFinite(Number(candidate))
  );
  return value === undefined ? null : Number(value);
}

function typedText(value, maximum = 1_000) {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) return null;
  // Typed evidence is already validated and hash-bound at the import boundary.
  // Preserve its signed display surface instead of applying prose/markup cleanup.
  return value;
}

function typedStringArray(value, pattern = null) {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .map((item) => typedText(item, 512))
        .filter((item) => item && (!pattern || pattern.test(item)))
    ),
  ];
}

function normalizeTypedMoney(value) {
  const item = object(value);
  const amount =
    typeof item.amount === 'string' && /^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(item.amount)
      ? item.amount
      : null;
  const currency =
    typeof item.currency === 'string' && /^[A-Z]{3}$/.test(item.currency) ? item.currency : null;
  const taxBasis = ['gross', 'net', 'unknown'].includes(item.tax_basis) ? item.tax_basis : null;
  return amount && currency ? { amount, currency, taxBasis } : null;
}

function normalizeTypedBasis(value) {
  const item = object(value);
  const quantity =
    typeof item.quantity === 'string' && /^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(item.quantity)
      ? item.quantity
      : null;
  const unit = typedText(item.unit, 80);
  return quantity && unit ? { quantity, unit } : null;
}

function normalizeTypedFactPayload(kind, value) {
  const payload = object(value);
  const shared = {
    price: normalizeTypedMoney(payload.price),
    basis: normalizeTypedBasis(payload.basis),
  };
  if (kind === 'physical_product_offer') {
    return {
      ...shared,
      merchant: typedText(payload.merchant),
      merchantDomain: typedText(payload.merchant_domain, 253),
      productName: typedText(payload.product_name),
      brand: typedText(payload.brand, 512),
      sku: typedText(payload.sku, 512),
      pack: normalizeTypedBasis(payload.pack),
    };
  }

  // These contract variants are persisted for forward compatibility, but are
  // not exposed as a raw object. Their human-review views will be enabled with
  // each model-specific rollout.
  return null;
}

function normalizeTypedEvidenceFact(value) {
  const item = object(value);
  const kind = typedText(first(item.kind, item.fact_kind), 120);
  if (item.schema_version !== EVIDENCE_FACT_VERSION || !EVIDENCE_FACT_KINDS.has(kind)) {
    return null;
  }
  const id = typedText(first(item.fact_id, item.external_fact_id), 512);
  if (!id) return null;
  const payload = record(item.data, item.payload);
  return {
    id,
    kind,
    verificationStatus: typedText(item.verification_status, 120),
    sourceIds: typedStringArray(item.source_ids),
    countryCodes: typedStringArray(item.country_codes, /^[A-Z]{2}$/),
    observedAt: typedText(item.observed_at, 80),
    payload: normalizeTypedFactPayload(kind, payload),
    reviewSupported: kind === 'physical_product_offer',
  };
}

function normalizeTypedEvidenceCalculation(value) {
  const item = object(value);
  const canonical = record(item.data, item.payload);
  const kind = typedText(first(item.kind, item.calculation_kind, canonical.kind), 120);
  const schemaVersion = first(item.schema_version, canonical.schema_version);
  if (schemaVersion !== EVIDENCE_CALCULATION_VERSION || !EVIDENCE_CALCULATION_KINDS.has(kind)) {
    return null;
  }
  const id = typedText(
    first(item.calculation_id, item.external_calculation_id, canonical.calculation_id),
    512
  );
  if (!id) return null;
  const bindings = object(canonical.input_bindings);
  const storedInputIds = typedStringArray(item.input_fact_ids);
  return {
    id,
    kind,
    verificationStatus: typedText(
      first(item.verification_status, canonical.verification_status),
      120
    ),
    inputFactIds: {
      higher: typedText(object(bindings.higher).fact_id, 512) || storedInputIds[0] || null,
      lower: typedText(object(bindings.lower).fact_id, 512) || storedInputIds[1] || null,
    },
    targetBasis: normalizeTypedBasis(first(item.target_basis, canonical.target_basis)),
    result: normalizeTypedMoney(first(item.result, canonical.result)),
    countryCodes: typedStringArray(
      first(item.country_codes, canonical.country_codes),
      /^[A-Z]{2}$/
    ),
    reviewSupported: kind === 'physical_offer_price_difference',
  };
}

function normalizeEvidenceProfile(value, fallbackVersion = null) {
  const profile = object(value);
  const economicModel = BUSINESS_ECONOMIC_MODELS.has(profile.economic_model)
    ? profile.economic_model
    : null;
  return {
    version: typedText(first(profile.version, fallbackVersion), 120),
    intent: typedText(profile.intent, 120),
    economicModel,
  };
}

function presentationText(value, fallback = '') {
  if (typeof value === 'string') return cleanGeneratedPresentationText(value) || fallback;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value
      .map((item) => presentationText(item, ''))
      .filter(Boolean)
      .join('; ');
  }
  if (value && typeof value === 'object') {
    const preferred = first(
      value.name,
      value.title,
      value.label,
      value.role,
      value.value,
      value.summary,
      value.description
    );
    if (preferred !== null && preferred !== value) return presentationText(preferred, fallback);
    return (
      Object.entries(value)
        .filter(([key, item]) => !key.startsWith('_') && item != null && item !== '')
        .map(([key, item]) => {
          const rendered = presentationText(item, '');
          return rendered ? `${key.replaceAll('_', ' ')}: ${rendered}` : '';
        })
        .filter(Boolean)
        .join(' · ') || fallback
    );
  }
  return fallback;
}

export function researchConfidencePercent(value) {
  const numeric = finite(value);
  if (numeric == null) return null;
  const percent = numeric >= 0 && numeric <= 1 ? numeric * 100 : numeric;
  return Math.max(0, Math.min(100, Math.round(percent)));
}

function normalizeStage(stage, index) {
  if (typeof stage === 'string') {
    return {
      id: `stage-${index + 1}`,
      name: presentationText(stage, `Stage ${index + 1}`),
      status: 'unknown',
      count: null,
    };
  }
  const item = object(stage);
  return {
    ...item,
    id: String(first(item.id, item.key, item.stage_id, `stage-${index + 1}`)),
    name: presentationText(
      first(item.name, item.label, item.stage, item.title),
      `Stage ${index + 1}`
    ),
    status: presentationText(first(item.status, item.state, item.result), 'unknown'),
    count: finite(item.count, item.item_count, item.source_count),
  };
}

function normalizeStages(summary, bundle, run) {
  const explicit = array(
    summary.stages,
    summary.research_stages,
    summary.stage_progress,
    bundle.stages,
    bundle.research_stages,
    bundle.stage_results,
    run.stages
  );
  if (explicit.length) return explicit.map(normalizeStage);

  const stageCounts = object(first(summary.stage_counts, bundle.stage_counts));
  return Object.entries(stageCounts).map(([name, value], index) =>
    normalizeStage({ name, count: finite(value), status: 'complete' }, index)
  );
}

function itemLabel(item, fallback) {
  if (typeof item === 'string') return presentationText(item, fallback);
  const value = object(item);
  return presentationText(
    first(value.name, value.title, value.label, value.role, value.url, value.reference_id),
    fallback
  );
}

function normalizeItems(items, prefix) {
  return items.map((item, index) => {
    if (typeof item === 'string') {
      return {
        id: `${prefix}-${index + 1}`,
        name: presentationText(item, `${prefix} ${index + 1}`),
        description: '',
      };
    }
    const value = object(item);
    const normalizedPresentationFields = {
      ...(value.title !== undefined ? { title: presentationText(value.title, '') } : {}),
      ...(value.label !== undefined ? { label: presentationText(value.label, '') } : {}),
      ...(value.summary !== undefined ? { summary: presentationText(value.summary, '') } : {}),
      ...(value.description !== undefined
        ? { description: presentationText(value.description, '') }
        : {}),
    };
    return {
      ...value,
      ...normalizedPresentationFields,
      id: String(
        first(
          value.persona_id,
          value.source_id,
          value.artifact_id,
          value.external_persona_id,
          value.external_source_id,
          value.external_artifact_id,
          value.id,
          `${prefix}-${index + 1}`
        )
      ),
      name: itemLabel(value, `${prefix} ${index + 1}`),
      description: presentationText(
        first(value.description, value.summary, value.rationale, value.problem)
      ),
    };
  });
}

function personaProfile(item) {
  const value = object(item);
  const data = object(value.data);
  const payload = object(value.payload);
  const base = record(
    value.profile,
    value.persona,
    data.persona,
    payload.persona,
    data.profile,
    payload.profile
  );
  const resolved = record(
    value.resolved_customer_persona,
    data.resolved_customer_persona,
    payload.resolved_customer_persona
  );
  return {
    ...record(base.profile),
    ...base,
    ...record(resolved.profile),
    ...resolved,
  };
}

function enrichPersonaItems(items) {
  return items.map((item) => {
    const profile = personaProfile(item);
    return {
      ...item,
      profile,
      name: presentationText(
        first(profile.name, profile.persona_name, item.role, profile.role, item.name, item.id),
        item.id
      ),
      role: presentationText(first(item.role, item.required_role, profile.role, profile.title)),
      description: presentationText(
        first(
          item.description,
          item.summary,
          profile.summary,
          profile.professional_summary,
          profile.background
        ) || ''
      ),
    };
  });
}

function unwrapRows(rows, payloadKeys = []) {
  return array(rows).map((row) => {
    const item = object(row);
    const payload = record(
      ...payloadKeys.map((key) => item[key]),
      item.data,
      item.payload,
      item.content
    );
    return { ...item, ...payload };
  });
}

function normalizeCoverage(summary, bundle) {
  const raw = first(
    summary.coverage,
    summary.research_coverage,
    bundle.coverage,
    bundle.research_coverage
  );
  if (raw == null) return { percent: null, dimensions: [] };
  if (typeof raw === 'number' || typeof raw === 'string') {
    return { percent: researchConfidencePercent(raw), dimensions: [] };
  }
  const coverage = object(raw);
  const dimensions = array(coverage.dimensions, coverage.items, coverage.criteria).map(
    (item, index) => {
      if (typeof item === 'string')
        return { id: `coverage-${index + 1}`, label: item, value: null };
      const value = object(item);
      return {
        ...value,
        id: String(first(value.id, value.key, `coverage-${index + 1}`)),
        label: String(first(value.label, value.name, value.dimension, `Dimension ${index + 1}`)),
        value: researchConfidencePercent(first(value.value, value.score, value.coverage)),
      };
    }
  );
  return {
    ...coverage,
    percent: researchConfidencePercent(first(coverage.percent, coverage.score, coverage.overall)),
    dimensions,
  };
}

/**
 * True only for an explicit external verification assertion. AxWise's legacy
 * `verified` flag may merely mean a quote matched a transcript span, so it is
 * deliberately not accepted here.
 */
export function isExternallyVerifiedResearchSource(source) {
  const item = object(source);
  if (item.externally_verified === true || item.external_verified === true) return true;
  const scope = String(
    first(item.verification_scope, item.verification_type, item.verification_kind, '')
  )
    .trim()
    .toLowerCase();
  return ['external', 'third_party', 'third-party', 'primary_source', 'market_source'].includes(
    scope
  );
}

export function hasTranscriptSpan(source) {
  const item = object(source);
  return (
    item.start_char !== null &&
    item.start_char !== undefined &&
    item.start_char !== '' &&
    item.end_char !== null &&
    item.end_char !== undefined &&
    item.end_char !== '' &&
    Number.isFinite(Number(item.start_char)) &&
    Number.isFinite(Number(item.end_char))
  );
}

/**
 * Normalizes both the compact goal pointer and axwise_research_bundle_v1.
 * Missing legacy fields remain absent/zero: presentation code must not invent
 * stages, sources, interviews, or confidence.
 */
export function getGoalResearchBundle(goal, loadedBundle = null) {
  const intelligence = object(goal?.data?.axwise_customer_intelligence);
  const pointer = object(intelligence.research_bundle);
  const loadedResponse = object(loadedBundle);
  const summary = record(
    loadedResponse.summary,
    intelligence.research_bundle_summary,
    pointer.summary
  );
  const embeddedFull = record(
    intelligence.research_bundle_full,
    intelligence.full_research_bundle,
    intelligence.research_bundle_data,
    pointer.bundle
  );
  const loadedCore = record(
    loadedResponse.bundle,
    loadedResponse.version ||
      loadedResponse.schema_version ||
      loadedResponse.market_sources ||
      loadedResponse.customer_personas
      ? loadedResponse
      : null
  );
  const bundle = { ...embeddedFull, ...loadedCore };
  const hasLoadedDetail = Boolean(
    loadedBundle &&
    (Object.keys(loadedCore).length ||
      Array.isArray(loadedResponse.personas) ||
      Array.isArray(loadedResponse.sources) ||
      Array.isArray(loadedResponse.artifacts) ||
      Array.isArray(loadedResponse.facts) ||
      Array.isArray(loadedResponse.calculations))
  );
  const run = record(loadedResponse.run, bundle.run, summary.run);
  const declaredBundleVersion = first(
    run.bundle_version,
    loadedCore.version,
    loadedCore.schema_version,
    embeddedFull.version,
    embeddedFull.schema_version,
    pointer.bundle_version
  );
  const loadedVersionSignals = [
    object(loadedResponse.run).bundle_version,
    object(loadedResponse.bundle).version,
    object(loadedResponse.bundle).schema_version,
    loadedResponse.version,
    loadedResponse.schema_version,
  ].filter((value) => value != null && value !== '');
  const typedEvidenceResponse = Boolean(
    loadedBundle &&
    loadedVersionSignals.length > 0 &&
    loadedVersionSignals.every((version) => version === AXWISE_RESEARCH_BUNDLE_V2)
  );
  const typedEvidence = declaredBundleVersion === AXWISE_RESEARCH_BUNDLE_V2;
  const databasePersonas = unwrapRows(loadedResponse.personas, ['persona', 'persona_data']);
  const databaseSources = unwrapRows(loadedResponse.sources, ['source', 'source_data']);
  const databaseArtifacts = unwrapRows(loadedResponse.artifacts, ['artifact', 'artifact_data']);
  const assignments = unwrapRows(loadedResponse.assignments, ['assignment', 'assignment_data']);
  const customerPersonaRows = databasePersonas.filter(
    (item) =>
      !['executor', 'agent', 'execution'].includes(
        String(first(item.persona_type, item.type, '')).toLowerCase()
      )
  );
  const executorPersonaRows = databasePersonas.filter((item) =>
    ['executor', 'agent', 'execution'].includes(
      String(first(item.persona_type, item.type, '')).toLowerCase()
    )
  );

  const customerPersonas = enrichPersonaItems(
    normalizeItems(
      array(
        customerPersonaRows,
        bundle.customer_personas,
        bundle.personas,
        summary.customer_personas
      ),
      'persona'
    )
  );
  const participants = normalizeItems(
    array(
      bundle.synthetic_participants,
      bundle.participants,
      bundle.respondents,
      summary.synthetic_participants,
      summary.participants
    ),
    'participant'
  );
  const interviews = normalizeItems(
    array(bundle.interviews, bundle.synthetic_interviews, summary.interviews),
    'interview'
  );
  const marketSources = normalizeItems(
    array(
      databaseSources,
      bundle.market_sources,
      bundle.sources,
      summary.market_sources,
      summary.sources
    ),
    'source'
  );
  const executorPersonas = enrichPersonaItems(
    normalizeItems(
      array(
        executorPersonaRows,
        bundle.executor_personas,
        bundle.ideal_executor_personas,
        summary.executor_personas
      ),
      'executor'
    )
  );
  const artifacts = normalizeItems(
    array(databaseArtifacts, bundle.artifacts, summary.artifacts),
    'artifact'
  );
  const facts = typedEvidenceResponse
    ? array(loadedResponse.facts).map(normalizeTypedEvidenceFact).filter(Boolean)
    : [];
  const calculations = typedEvidenceResponse
    ? array(loadedResponse.calculations).map(normalizeTypedEvidenceCalculation).filter(Boolean)
    : [];
  const evidenceProfile = normalizeEvidenceProfile(
    typedEvidenceResponse ? loadedCore.evidence_profile : null,
    typedEvidence ? first(run.evidence_profile_version, pointer.evidence_profile_version) : null
  );
  const evidenceContract = typedEvidenceResponse
    ? {
        status: typedText(object(object(loadedCore.quality).evidence_contract).status, 120),
      }
    : { status: null };
  const expectedFactCount = typedEvidence ? finite(run.fact_count, pointer.fact_count) : 0;
  const expectedCalculationCount = typedEvidence
    ? finite(run.calculation_count, pointer.calculation_count)
    : 0;
  const typedEvidenceDetailsLoaded = Boolean(
    typedEvidenceResponse &&
    Array.isArray(loadedResponse.facts) &&
    Array.isArray(loadedResponse.calculations) &&
    expectedFactCount != null &&
    expectedCalculationCount != null &&
    evidenceProfile.version &&
    evidenceProfile.intent &&
    evidenceProfile.economicModel &&
    evidenceContract.status &&
    loadedResponse.facts.length === facts.length &&
    loadedResponse.calculations.length === calculations.length &&
    facts.length === expectedFactCount &&
    calculations.length === expectedCalculationCount
  );

  const counts = {
    sources: hasLoadedDetail
      ? marketSources.length
      : (finite(
          summary.source_count,
          pointer.source_count,
          run.source_count,
          marketSources.length
        ) ?? 0),
    personas: hasLoadedDetail
      ? customerPersonas.length + executorPersonas.length
      : (finite(
          summary.persona_count,
          pointer.persona_count,
          run.persona_count,
          customerPersonas.length + executorPersonas.length
        ) ?? 0),
    customerPersonas: hasLoadedDetail
      ? customerPersonas.length
      : (finite(
          summary.customer_persona_count,
          pointer.customer_persona_count,
          run.customer_persona_count,
          customerPersonas.length
        ) ?? 0),
    participants: hasLoadedDetail
      ? participants.length
      : (finite(
          summary.participant_count,
          pointer.participant_count,
          run.participant_count,
          participants.length
        ) ?? 0),
    interviews: hasLoadedDetail
      ? interviews.length
      : (finite(
          summary.interview_count,
          pointer.interview_count,
          run.interview_count,
          interviews.length
        ) ?? 0),
    executorPersonas: hasLoadedDetail
      ? executorPersonas.length
      : (finite(
          summary.executor_persona_count,
          pointer.executor_persona_count,
          run.executor_persona_count,
          executorPersonas.length
        ) ?? 0),
    artifacts: hasLoadedDetail
      ? artifacts.length
      : (finite(
          summary.artifact_count,
          pointer.artifact_count,
          run.artifact_count,
          artifacts.length
        ) ?? 0),
    facts: expectedFactCount ?? 0,
    calculations: expectedCalculationCount ?? 0,
  };

  let stages = normalizeStages(summary, bundle, run);
  let inferredOutputStages = false;
  const selectedPersonaIds = array(
    summary.selected_persona_ids,
    pointer.selected_persona_ids,
    bundle.selected_persona_ids,
    bundle.persona_selection?.selected_persona_ids
  ).map(String);
  const contradictions = array(
    bundle.contradictions,
    summary.contradictions,
    bundle.findings?.contradictions
  );
  const limitations = array(
    bundle.limitations,
    summary.limitations,
    bundle.method?.limitations,
    bundle.methodology?.limitations
  );
  const researchPrdArtifact = artifacts.find((artifact) =>
    /research[_ -]?prd|research[_ -]?brief/i.test(
      String(first(artifact.artifact_type, artifact.type, artifact.name, ''))
    )
  );
  const researchPrd = first(
    bundle.research_prd,
    bundle.prd,
    bundle.brief,
    summary.research_prd,
    researchPrdArtifact?.document,
    researchPrdArtifact?.content,
    researchPrdArtifact?.body
  );
  const method = record(bundle.method, bundle.methodology, summary.method, summary.methodology);
  const configuration = record(bundle.configuration, summary.configuration, run.configuration);
  const quality = record(bundle.quality, summary.quality, run.quality);
  const performance = record(bundle.performance, summary.performance, run.performance);
  const marketScope = record(
    bundle.market_scope,
    summary.market_scope,
    run.raw_bundle?.market_scope,
    goal?.data?.research_policy?.market_scope
  );
  const researchCells = array(
    bundle.research_cells,
    summary.research_cells,
    run.raw_bundle?.research_cells
  );
  const cellCoverage = array(
    bundle.cell_coverage,
    summary.cell_coverage,
    run.raw_bundle?.cell_coverage
  );
  const confidence = researchConfidencePercent(
    first(
      quality.confidence,
      quality.confidence_score,
      summary.confidence,
      summary.confidence_score,
      bundle.confidence,
      bundle.confidence_score,
      method.confidence
    )
  );
  let coverage = normalizeCoverage(
    { ...summary, coverage: first(quality.coverage, quality.research_coverage, summary.coverage) },
    bundle
  );
  if (coverage.percent == null && cellCoverage.length > 0) {
    const completedCells = cellCoverage.filter((cell) =>
      ['complete', 'completed'].includes(String(cell?.status || '').toLowerCase())
    ).length;
    coverage = {
      ...coverage,
      percent: Math.round((completedCells / cellCoverage.length) * 100),
      basis: 'market_cells',
    };
  }
  if (!stages.length && (pointer.run_id || Object.keys(bundle).length)) {
    inferredOutputStages = true;
    const complete = 'completed';
    const inferredFromImportedArtifacts = [
      {
        id: 'market-sources',
        name: 'Imported market sources',
        status: complete,
        count: counts.sources,
        present:
          counts.sources > 0 ||
          array(bundle.market_sources).length > 0 ||
          array(bundle.market_claims).length > 0,
      },
      {
        id: 'participants-interviews',
        name: 'Imported participants & interviews',
        status: complete,
        count: counts.interviews || counts.participants,
        present:
          Object.prototype.hasOwnProperty.call(bundle, 'synthetic_participants') ||
          Object.prototype.hasOwnProperty.call(bundle, 'interviews') ||
          counts.interviews > 0 ||
          counts.participants > 0,
      },
      {
        id: 'persona-synthesis',
        name: 'Imported persona records',
        status: complete,
        count: counts.personas,
        present:
          counts.personas > 0 ||
          Object.prototype.hasOwnProperty.call(bundle, 'customer_personas') ||
          Object.prototype.hasOwnProperty.call(bundle, 'executor_personas') ||
          Object.prototype.hasOwnProperty.call(bundle, 'persona_resolution'),
      },
      {
        id: 'research-prd',
        name: 'Imported Research PRD',
        status: complete,
        count: researchPrd ? 1 : 0,
        present: Boolean(pointer.research_prd_hash || researchPrd || researchPrdArtifact),
      },
    ];
    stages = inferredFromImportedArtifacts
      .filter((stage) => stage.present)
      .map(({ present: _present, ...stage }) => stage);
  }
  const completedStages = stages.filter((stage) =>
    ['complete', 'completed', 'done', 'passed', 'success'].includes(stage.status.toLowerCase())
  ).length;
  const runId = first(summary.run_id, pointer.run_id, run.id, run.run_id, bundle.run_id);
  const bundleId = first(summary.bundle_id, bundle.id, bundle.bundle_id);
  const schemaVersion = first(
    bundle.schema_version,
    bundle.version,
    summary.schema_version,
    pointer.bundle_version
  );
  const status = String(
    first(summary.status, run.status, bundle.status, intelligence.status, 'unknown')
  );

  const available = Boolean(
    runId ||
    bundleId ||
    Object.keys(summary).length ||
    Object.keys(bundle).length ||
    stages.length ||
    Object.values(counts).some(Boolean)
  );

  return {
    available,
    pointer,
    summary,
    bundle,
    run,
    runId: runId ? String(runId) : null,
    bundleId: bundleId ? String(bundleId) : null,
    schemaVersion: schemaVersion ? String(schemaVersion) : null,
    status,
    mode: first(
      configuration.research_mode,
      configuration.mode,
      object(configuration.grounding_policy).requested_mode,
      summary.research_mode,
      run.research_mode,
      bundle.research_mode,
      goal?.research_mode
    ),
    performanceProfile: first(
      configuration.performance_profile,
      object(configuration.simulation).performance_profile,
      summary.performance_profile
    ),
    stages,
    stageLabel: inferredOutputStages ? 'Imported outputs' : 'Research stages',
    hasProviderStageTelemetry: stages.length > 0 && !inferredOutputStages,
    completedStages,
    counts: { ...EMPTY_COUNTS, ...counts },
    confidence,
    coverage,
    customerPersonas,
    participants,
    interviews,
    marketSources,
    executorPersonas,
    artifacts,
    assignments,
    typedEvidence,
    typedEvidenceDetailsLoaded,
    evidenceProfile,
    evidenceContract,
    facts,
    calculations,
    selectedPersonaIds,
    personaSelection: object(first(bundle.persona_selection, summary.persona_selection)),
    researchPrd,
    method,
    configuration,
    quality,
    contextGate: record(
      pointer.context_gate,
      pointer.approval_gate,
      pointer.quality_gate,
      quality.context_gate
    ),
    criticalClaims: record(
      quality.critical_claims,
      quality.critical_claim_validation,
      bundle.critical_claims
    ),
    performance,
    marketClaims: array(bundle.market_claims, summary.market_claims),
    marketScope,
    researchCells,
    cellCoverage,
    patterns: array(bundle.patterns, summary.patterns),
    contradictions,
    limitations,
  };
}
