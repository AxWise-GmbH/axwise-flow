import { createHash } from 'node:crypto';

export const BUSINESS_EVIDENCE_PROFILE_VERSION = 'business_evidence_profile_v1';
export const AXWISE_RESEARCH_BUNDLE_V2 = 'axwise_research_bundle_v2';
export const EVIDENCE_FACT_VERSION = 'evidence_fact_v1';
export const EVIDENCE_CALCULATION_VERSION = 'evidence_calculation_v1';
export const EVIDENCE_CONTRACT_QUALITY_VERSION = 'evidence_contract_quality_v1';

export const BUSINESS_EVIDENCE_INTENTS = Object.freeze([
  'commercial_market_launch',
  'operational_process',
  'product_strategy',
  'software_product',
]);

export const BUSINESS_ECONOMIC_MODELS = Object.freeze([
  'physical_product',
  'subscription',
  'usage_based',
  'project_service',
  'none',
]);

export const EVIDENCE_FACT_KINDS = Object.freeze([
  'physical_product_offer',
  'subscription_plan',
  'usage_tariff',
  'project_service_quote',
]);

export const EVIDENCE_CALCULATION_KINDS = Object.freeze([
  'physical_offer_price_difference',
  'subscription_rate_difference',
  'usage_tariff_rate_difference',
  'project_quote_rate_difference',
]);

export const EVIDENCE_REQUIREMENT_APPLICABILITY = Object.freeze([
  'required',
  'required_when_applicable',
  'optional',
]);

export const EVIDENCE_ROLE_SLOTS = Object.freeze([
  'customer_market',
  'pricing_finance',
  'legal_compliance',
  'sales_distribution',
  'risk_operations',
  'domain_delivery',
]);

export const EVIDENCE_ROLE_SLOT_LABELS = Object.freeze({
  customer_market: 'Marketing ICP Specialist',
  pricing_finance: 'Finance Pricing Specialist',
  legal_compliance: 'GDPR Legal Compliance Specialist',
  sales_distribution: 'Business Development Sales Specialist',
  risk_operations: 'Commercial Risk Analyst',
  domain_delivery: 'Domain Delivery Specialist',
});

export const PHYSICAL_BASIS_UNITS = Object.freeze([
  'item',
  'package',
  'kilogram',
  'gram',
  'liter',
  'milliliter',
]);
export const SUBSCRIPTION_BASIS_UNITS = Object.freeze([
  'plan_month',
  'plan_year',
  'seat_month',
  'seat_year',
]);
export const USAGE_BASIS_UNITS = Object.freeze([
  'cycle',
  'load',
  'machine_hour',
  'kilowatt_hour',
  'request',
  'thousand_requests',
  'gigabyte_month',
]);
export const PROJECT_BASIS_UNITS = Object.freeze([
  'project',
  'job',
  'square_meter',
  'hour',
  'day',
  'sprint',
  'milestone',
]);
export const MONEY_TAX_BASES = Object.freeze(['gross', 'net', 'unknown']);
export const EVIDENCE_FACT_VERIFICATION_STATUS = 'verified_current_authoritative';
export const EVIDENCE_CALCULATION_VERIFICATION_STATUS = 'verified_traceable_calculation';
export const EVIDENCE_REQUIREMENT_STATUSES = Object.freeze([
  'satisfied',
  'not_applicable',
  'insufficient_evidence',
]);
export const EVIDENCE_NOT_APPLICABLE_REASON_CODES = Object.freeze([
  'business_model_not_in_scope',
  'pricing_decision_not_in_scope',
]);

const PROFILE_FIELDS = new Set([
  'version',
  'intent',
  'economic_model',
  'market_scope_hash',
  'fact_requirements',
  'calculation_requirements',
  'required_role_slots',
]);
const REQUIREMENT_FIELDS = new Set(['kind', 'minimum_verified', 'applicability']);
const SHA256_RE = /^[a-f0-9]{64}$/;
const UUID_RE = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;

const FACT_KIND_BY_MODEL = Object.freeze({
  physical_product: 'physical_product_offer',
  subscription: 'subscription_plan',
  usage_based: 'usage_tariff',
  project_service: 'project_service_quote',
  none: null,
});
const CALCULATION_KIND_BY_MODEL = Object.freeze({
  physical_product: 'physical_offer_price_difference',
  subscription: 'subscription_rate_difference',
  usage_based: 'usage_tariff_rate_difference',
  project_service: 'project_quote_rate_difference',
  none: null,
});

const FACT_FIELDS = new Set([
  'schema_version',
  'kind',
  'fact_id',
  'claim_id',
  'source_ids',
  'country_codes',
  'observed_at',
  'market_scope_hash',
  'topic_seed_sha256',
  'comparison_scope_hash',
  'verification_status',
  'payload',
  'fact_hash',
]);
const CALCULATION_FIELDS = new Set([
  'schema_version',
  'kind',
  'calculation_id',
  'formula_version',
  'input_bindings',
  'target_basis',
  'normalized_inputs',
  'result',
  'country_codes',
  'comparison_scope_hash',
  'verification_status',
  'calculation_hash',
]);
const MONEY_FIELDS = new Set(['amount', 'currency', 'tax_basis']);
const BASIS_FIELDS = new Set(['quantity', 'unit']);
const BINDING_FIELDS = new Set(['fact_id', 'claim_id']);
const COVERAGE_FIELDS = new Set([
  'version',
  'status',
  'profile_hash',
  'fact_manifest_hash',
  'calculation_manifest_hash',
  'fact_requirements',
  'calculation_requirements',
]);
const COVERAGE_REQUIREMENT_FIELDS = new Set([
  'kind',
  'status',
  'satisfied_count',
  'fact_ids',
  'calculation_ids',
  'reason_code',
  'validation_plan',
]);
const DECIMAL_RE = /^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;
const COUNTRY_CODE_RE = /^[A-Z]{2}$/;

const FACT_SPEC = Object.freeze({
  physical_product_offer: {
    units: PHYSICAL_BASIS_UNITS,
    calculationKind: 'physical_offer_price_difference',
    payloadFields: [
      'merchant',
      'merchant_domain',
      'offer_id',
      'product_name',
      'brand',
      'sku',
      'pack',
      'price',
      'basis',
    ],
    requiredStrings: ['merchant', 'merchant_domain', 'product_name'],
  },
  subscription_plan: {
    units: SUBSCRIPTION_BASIS_UNITS,
    calculationKind: 'subscription_rate_difference',
    payloadFields: [
      'provider',
      'provider_domain',
      'plan_id',
      'plan_name',
      'price',
      'basis',
      'included_seats',
      'minimum_seats',
    ],
    requiredStrings: ['provider', 'provider_domain', 'plan_name'],
  },
  usage_tariff: {
    units: USAGE_BASIS_UNITS,
    calculationKind: 'usage_tariff_rate_difference',
    payloadFields: [
      'provider',
      'provider_domain',
      'tariff_id',
      'tariff_name',
      'service_name',
      'price',
      'basis',
      'fixed_fee',
    ],
    requiredStrings: ['provider', 'provider_domain', 'tariff_name', 'service_name'],
  },
  project_service_quote: {
    units: PROJECT_BASIS_UNITS,
    calculationKind: 'project_quote_rate_difference',
    payloadFields: [
      'provider',
      'provider_domain',
      'quote_id',
      'service_name',
      'scope_hash',
      'price',
      'basis',
      'labour_included',
      'materials_included',
      'valid_until',
    ],
    requiredStrings: ['provider', 'quote_id', 'service_name'],
  },
});

const FACT_KIND_BY_CALCULATION = Object.freeze(
  Object.fromEntries(
    Object.entries(FACT_SPEC).map(([factKind, spec]) => [spec.calculationKind, factKind])
  )
);

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

function hashValue(value) {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(value)))
    .digest('hex');
}

export function hashEvidenceContractValue(value) {
  return hashValue(value);
}

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function issue(issues, path, code, message) {
  issues.push({ path, code, message });
}

function validateRequirementList(value, { path, allowedKinds, expectedKind }, issues) {
  if (!Array.isArray(value)) {
    issue(issues, path, 'array_required', `${path} must be an array`);
    return;
  }
  const seen = new Set();
  for (const [index, raw] of value.entries()) {
    const itemPath = `${path}[${index}]`;
    const item = plainObject(raw);
    if (!item) {
      issue(issues, itemPath, 'object_required', `${itemPath} must be an object`);
      continue;
    }
    for (const key of Object.keys(item)) {
      if (!REQUIREMENT_FIELDS.has(key)) {
        issue(issues, `${itemPath}.${key}`, 'unknown_field', `${itemPath}.${key} is unsupported`);
      }
    }
    if (!allowedKinds.includes(item.kind)) {
      issue(issues, `${itemPath}.kind`, 'unsupported_kind', `${itemPath}.kind is unsupported`);
    } else if (seen.has(item.kind)) {
      issue(issues, `${itemPath}.kind`, 'duplicate_kind', `${item.kind} is duplicated`);
    }
    seen.add(item.kind);
    if (
      !Number.isInteger(item.minimum_verified) ||
      item.minimum_verified < 0 ||
      item.minimum_verified > 100
    ) {
      issue(
        issues,
        `${itemPath}.minimum_verified`,
        'invalid_minimum',
        `${itemPath}.minimum_verified must be an integer from 0 to 100`
      );
    }
    if (!EVIDENCE_REQUIREMENT_APPLICABILITY.includes(item.applicability)) {
      issue(
        issues,
        `${itemPath}.applicability`,
        'unsupported_applicability',
        `${itemPath}.applicability is unsupported`
      );
    }
    if (item.applicability === 'required' && item.minimum_verified < 1) {
      issue(
        issues,
        `${itemPath}.minimum_verified`,
        'required_minimum_zero',
        'A required evidence item must require at least one verified record'
      );
    }
    if (expectedKind === null) {
      issue(
        issues,
        itemPath,
        'economic_model_mismatch',
        `${path} must be empty when economic_model is none`
      );
    } else if (item.kind && item.kind !== expectedKind) {
      issue(
        issues,
        `${itemPath}.kind`,
        'economic_model_mismatch',
        `${item.kind} is incompatible with the selected economic model`
      );
    }
  }
}

/** Validate the exact, versioned Orqaly -> AxWise v2 request profile. */
export function validateBusinessEvidenceProfile(value, { expectedMarketScopeHash } = {}) {
  const issues = [];
  const profile = plainObject(value);
  if (!profile) {
    issue(
      issues,
      'business_evidence_profile',
      'object_required',
      'business_evidence_profile must be an object'
    );
    return { ok: false, issues };
  }
  for (const key of Object.keys(profile)) {
    if (!PROFILE_FIELDS.has(key)) {
      issue(issues, key, 'unknown_field', `business_evidence_profile.${key} is unsupported`);
    }
  }
  if (profile.version !== BUSINESS_EVIDENCE_PROFILE_VERSION) {
    issue(
      issues,
      'version',
      'unsupported_version',
      `version must be ${BUSINESS_EVIDENCE_PROFILE_VERSION}`
    );
  }
  if (!BUSINESS_EVIDENCE_INTENTS.includes(profile.intent)) {
    issue(issues, 'intent', 'unsupported_intent', 'intent is unsupported');
  }
  if (!BUSINESS_ECONOMIC_MODELS.includes(profile.economic_model)) {
    issue(issues, 'economic_model', 'unsupported_economic_model', 'economic_model is unsupported');
  }
  if (
    profile.market_scope_hash !== null &&
    !SHA256_RE.test(String(profile.market_scope_hash || ''))
  ) {
    issue(
      issues,
      'market_scope_hash',
      'invalid_hash',
      'market_scope_hash must be null or a SHA-256 hash'
    );
  }
  if (profile.economic_model !== 'none' && profile.market_scope_hash === null) {
    issue(
      issues,
      'market_scope_hash',
      'market_scope_required',
      'market_scope_hash is required for an evidence-bearing economic model'
    );
  }
  if (
    expectedMarketScopeHash !== undefined &&
    (profile.market_scope_hash || null) !== (expectedMarketScopeHash || null)
  ) {
    issue(
      issues,
      'market_scope_hash',
      'market_scope_mismatch',
      'market_scope_hash does not match the resolved research market'
    );
  }
  const expectedFactKind = FACT_KIND_BY_MODEL[profile.economic_model];
  const expectedCalculationKind = CALCULATION_KIND_BY_MODEL[profile.economic_model];
  validateRequirementList(
    profile.fact_requirements,
    {
      path: 'fact_requirements',
      allowedKinds: EVIDENCE_FACT_KINDS,
      expectedKind: expectedFactKind,
    },
    issues
  );
  validateRequirementList(
    profile.calculation_requirements,
    {
      path: 'calculation_requirements',
      allowedKinds: EVIDENCE_CALCULATION_KINDS,
      expectedKind: expectedCalculationKind,
    },
    issues
  );
  if (!Array.isArray(profile.required_role_slots)) {
    issue(issues, 'required_role_slots', 'array_required', 'required_role_slots must be an array');
  } else {
    const seen = new Set();
    if (profile.required_role_slots.length > EVIDENCE_ROLE_SLOTS.length) {
      issue(
        issues,
        'required_role_slots',
        'too_many_roles',
        'required_role_slots exceeds the supported role-slot limit'
      );
    }
    for (const [index, slot] of profile.required_role_slots.entries()) {
      if (!EVIDENCE_ROLE_SLOTS.includes(slot)) {
        issue(
          issues,
          `required_role_slots[${index}]`,
          'unsupported_role_slot',
          `${slot} is not a supported role slot`
        );
      } else if (seen.has(slot)) {
        issue(
          issues,
          `required_role_slots[${index}]`,
          'duplicate_role_slot',
          `${slot} is duplicated`
        );
      }
      seen.add(slot);
    }
  }
  return { ok: issues.length === 0, issues };
}

export function assertBusinessEvidenceProfile(value, options) {
  const result = validateBusinessEvidenceProfile(value, options);
  if (!result.ok) {
    const error = new Error(result.issues.map((item) => item.message).join('; '));
    error.code = 'invalid_business_evidence_profile';
    error.issues = result.issues;
    throw error;
  }
  return value;
}

/** Build the canonical request profile so hashes do not depend on caller array ordering. */
export function createBusinessEvidenceProfile(input = {}, { marketScopeHash } = {}) {
  const inputObject = plainObject(input);
  if (!inputObject) {
    throw new Error('business_evidence_profile must be an object');
  }
  const unknownFields = Object.keys(inputObject).filter((key) => !PROFILE_FIELDS.has(key));
  if (unknownFields.length) {
    throw new Error(`Unsupported business_evidence_profile field: ${unknownFields[0]}`);
  }
  if (
    marketScopeHash !== undefined &&
    inputObject.market_scope_hash !== undefined &&
    (inputObject.market_scope_hash || null) !== (marketScopeHash || null)
  ) {
    throw new Error('market_scope_hash does not match the resolved research market');
  }
  const roleOrder = new Map(EVIDENCE_ROLE_SLOTS.map((slot, index) => [slot, index]));
  const profile = {
    version: BUSINESS_EVIDENCE_PROFILE_VERSION,
    intent: inputObject.intent,
    economic_model: inputObject.economic_model,
    market_scope_hash:
      marketScopeHash !== undefined
        ? marketScopeHash || null
        : inputObject.market_scope_hash || null,
    fact_requirements: Array.isArray(inputObject.fact_requirements)
      ? inputObject.fact_requirements
          .map((item) => ({
            kind: item?.kind,
            minimum_verified: item?.minimum_verified,
            applicability: item?.applicability,
          }))
          .sort((left, right) => String(left.kind).localeCompare(String(right.kind)))
      : inputObject.fact_requirements,
    calculation_requirements: Array.isArray(inputObject.calculation_requirements)
      ? inputObject.calculation_requirements
          .map((item) => ({
            kind: item?.kind,
            minimum_verified: item?.minimum_verified,
            applicability: item?.applicability,
          }))
          .sort((left, right) => String(left.kind).localeCompare(String(right.kind)))
      : inputObject.calculation_requirements,
    required_role_slots: Array.isArray(inputObject.required_role_slots)
      ? [...inputObject.required_role_slots].sort(
          (left, right) => (roleOrder.get(left) ?? 999) - (roleOrder.get(right) ?? 999)
        )
      : inputObject.required_role_slots,
  };
  assertBusinessEvidenceProfile(profile, {
    expectedMarketScopeHash: marketScopeHash === undefined ? undefined : marketScopeHash || null,
  });
  return profile;
}

export function businessEvidenceProfileHash(profile) {
  assertBusinessEvidenceProfile(profile);
  return hashValue(profile);
}

export function evidenceProfileV2Enabled(env = process.env) {
  return /^(?:1|true|yes|on)$/i.test(String(env?.AXWISE_EVIDENCE_PROFILE_V2_ENABLED || '').trim());
}

/**
 * Parse the closed economic-model rollout list. Any malformed or duplicated
 * token invalidates the whole list so a typo can never broaden admission.
 */
function parseEvidenceProfileV2ModelList(env, variableName) {
  const raw = String(env?.[variableName] || '').trim();
  if (!raw) return { ok: true, models: [], errors: [] };

  const tokens = raw.split(',').map((token) => token.trim());
  const seen = new Set();
  const errors = [];
  for (const token of tokens) {
    if (!BUSINESS_ECONOMIC_MODELS.includes(token)) {
      errors.push(token ? `unsupported:${token}` : 'empty_token');
    } else if (seen.has(token)) {
      errors.push(`duplicate:${token}`);
    }
    seen.add(token);
  }
  return {
    ok: errors.length === 0,
    models: errors.length === 0 ? tokens : [],
    errors,
  };
}

export function parseEvidenceProfileV2EnabledModels(env = process.env) {
  return parseEvidenceProfileV2ModelList(env, 'AXWISE_EVIDENCE_PROFILE_V2_ENABLED_MODELS');
}

export function parseEvidenceProfileV2ExecutionModels(env = process.env) {
  return parseEvidenceProfileV2ModelList(env, 'AXWISE_EVIDENCE_PROFILE_V2_EXECUTION_MODELS');
}

export function validateEvidenceProfileV2Rollout(env = process.env) {
  const admission = parseEvidenceProfileV2EnabledModels(env);
  const execution = parseEvidenceProfileV2ExecutionModels(env);
  const missingExecutionModels =
    admission.ok && execution.ok
      ? admission.models.filter((model) => !execution.models.includes(model))
      : [];
  return {
    ok: admission.ok && execution.ok && missingExecutionModels.length === 0,
    admissionModels: admission.models,
    executionModels: execution.models,
    missingExecutionModels,
  };
}

export function parseEvidenceProfileV2AdmissionOrgIds(env = process.env) {
  const raw = String(env?.AXWISE_EVIDENCE_PROFILE_V2_ADMISSION_ORG_IDS || '').trim();
  if (!raw) return { ok: true, orgIds: [], errors: [] };

  const tokens = raw.split(',').map((token) => token.trim());
  const seen = new Set();
  const errors = [];
  for (const token of tokens) {
    if (!UUID_RE.test(token)) {
      errors.push(token ? `invalid_uuid:${token}` : 'empty_token');
    } else if (seen.has(token)) {
      errors.push(`duplicate:${token}`);
    }
    seen.add(token);
  }
  return {
    ok: errors.length === 0,
    orgIds: errors.length === 0 ? tokens : [],
    errors,
  };
}

export function evidenceProfileV2EnabledForModel(economicModel, env = process.env) {
  if (!evidenceProfileV2Enabled(env) || !BUSINESS_ECONOMIC_MODELS.includes(economicModel)) {
    return false;
  }
  const rollout = validateEvidenceProfileV2Rollout(env);
  return rollout.ok && rollout.admissionModels.includes(economicModel);
}

export function evidenceProfileV2ExecutionEnabledForModel(economicModel, env = process.env) {
  if (!evidenceProfileV2Enabled(env) || !BUSINESS_ECONOMIC_MODELS.includes(economicModel)) {
    return false;
  }
  const rollout = parseEvidenceProfileV2ExecutionModels(env);
  return rollout.ok && rollout.models.includes(economicModel);
}

export function evidenceProfileV2AdmissionEnabledForOrg(orgId, env = process.env) {
  if (!evidenceProfileV2Enabled(env) || !UUID_RE.test(String(orgId || ''))) return false;
  const rollout = parseEvidenceProfileV2AdmissionOrgIds(env);
  return rollout.ok && rollout.orgIds.includes(String(orgId));
}

export function executionRolesForEvidenceProfile(profile) {
  assertBusinessEvidenceProfile(profile);
  return profile.required_role_slots.map((slot) => EVIDENCE_ROLE_SLOT_LABELS[slot]);
}

function validateExactFields(value, allowed, path, issues) {
  const item = plainObject(value);
  if (!item) {
    issue(issues, path, 'object_required', `${path} must be an object`);
    return null;
  }
  for (const key of Object.keys(item)) {
    if (!allowed.has(key)) {
      issue(issues, `${path}.${key}`, 'unknown_field', `${path}.${key} is unsupported`);
    }
  }
  return item;
}

function requiredText(value, path, issues, maximum = 1_000) {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) {
    issue(issues, path, 'invalid_text', `${path} must be a non-empty bounded string`);
    return null;
  }
  return value;
}

function nullableText(value, path, issues, maximum = 1_000) {
  if (value === null) return null;
  return requiredText(value, path, issues, maximum);
}

function validateDomain(value, path, issues, { nullable = false } = {}) {
  if (nullable && value === null) return true;
  if (
    typeof value !== 'string' ||
    value !== value.toLowerCase() ||
    value.length > 253 ||
    !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value)
  ) {
    issue(issues, path, 'invalid_domain', `${path} must be a lowercase DNS name`);
    return false;
  }
  return true;
}

function validateHash(value, path, issues) {
  if (typeof value !== 'string' || !SHA256_RE.test(value)) {
    issue(issues, path, 'invalid_hash', `${path} must be a lowercase SHA-256 hash`);
    return false;
  }
  return true;
}

function isRfc3339Timestamp(value) {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function validateTimestamp(value, path, issues, { nullable = false } = {}) {
  if (nullable && value === null) return true;
  if (!isRfc3339Timestamp(value)) {
    issue(issues, path, 'invalid_timestamp', `${path} must be an RFC3339 timestamp`);
    return false;
  }
  return true;
}

function validateDecimal(value, path, issues, { positive = false } = {}) {
  const canonical =
    typeof value === 'string' && value.length <= 128 && DECIMAL_RE.test(value)
      ? (() => {
          const [whole, fraction = ''] = value.split('.');
          const trimmed = fraction.replace(/0+$/, '');
          return trimmed ? `${whole}.${trimmed}` : whole;
        })()
      : null;
  if (canonical === null || canonical !== value) {
    issue(issues, path, 'invalid_decimal', `${path} must be a canonical decimal string`);
    return false;
  }
  if (positive && value === '0') {
    issue(issues, path, 'nonpositive_decimal', `${path} must be greater than zero`);
    return false;
  }
  return true;
}

function validateMoney(value, path, issues) {
  const money = validateExactFields(value, MONEY_FIELDS, path, issues);
  if (!money) return null;
  validateDecimal(money.amount, `${path}.amount`, issues);
  if (typeof money.currency !== 'string' || !/^[A-Z]{3}$/.test(money.currency)) {
    issue(
      issues,
      `${path}.currency`,
      'invalid_currency',
      `${path}.currency must be uppercase ISO-4217`
    );
  }
  if (!MONEY_TAX_BASES.includes(money.tax_basis)) {
    issue(issues, `${path}.tax_basis`, 'invalid_tax_basis', `${path}.tax_basis is unsupported`);
  }
  return money;
}

function validateBasis(value, path, units, issues) {
  const basis = validateExactFields(value, BASIS_FIELDS, path, issues);
  if (!basis) return null;
  validateDecimal(basis.quantity, `${path}.quantity`, issues, { positive: true });
  if (!units.includes(basis.unit)) {
    issue(issues, `${path}.unit`, 'invalid_basis_unit', `${path}.unit is unsupported`);
  }
  return basis;
}

function validateStringArray(value, path, issues, { pattern, minimum = 0, maximum = 100 } = {}) {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    issue(issues, path, 'invalid_array', `${path} must contain ${minimum}-${maximum} values`);
    return [];
  }
  const seen = new Set();
  for (const [index, item] of value.entries()) {
    if (typeof item !== 'string' || !item || (pattern && !pattern.test(item))) {
      issue(issues, `${path}[${index}]`, 'invalid_value', `${path}[${index}] is invalid`);
    } else if (seen.has(item)) {
      issue(issues, `${path}[${index}]`, 'duplicate_value', `${path}[${index}] is duplicated`);
    }
    seen.add(item);
  }
  return value;
}

function validateFactPayload(fact, path, issues) {
  const spec = FACT_SPEC[fact.kind];
  if (!spec) return null;
  const allowed = new Set(spec.payloadFields);
  const payload = validateExactFields(fact.payload, allowed, `${path}.payload`, issues);
  if (!payload) return null;
  for (const key of spec.requiredStrings) {
    requiredText(payload[key], `${path}.payload.${key}`, issues);
  }
  validateMoney(payload.price, `${path}.payload.price`, issues);
  validateBasis(payload.basis, `${path}.payload.basis`, spec.units, issues);

  if (fact.kind === 'physical_product_offer') {
    validateDomain(payload.merchant_domain, `${path}.payload.merchant_domain`, issues);
    nullableText(payload.offer_id, `${path}.payload.offer_id`, issues, 512);
    nullableText(payload.brand, `${path}.payload.brand`, issues, 512);
    nullableText(payload.sku, `${path}.payload.sku`, issues, 512);
    validateBasis(payload.pack, `${path}.payload.pack`, PHYSICAL_BASIS_UNITS, issues);
  } else if (fact.kind === 'subscription_plan') {
    validateDomain(payload.provider_domain, `${path}.payload.provider_domain`, issues);
    nullableText(payload.plan_id, `${path}.payload.plan_id`, issues, 512);
    for (const key of ['included_seats', 'minimum_seats']) {
      if (payload[key] !== null && (!Number.isInteger(payload[key]) || payload[key] < 1)) {
        issue(
          issues,
          `${path}.payload.${key}`,
          'invalid_integer',
          `${path}.payload.${key} must be null or a positive integer`
        );
      }
    }
  } else if (fact.kind === 'usage_tariff') {
    validateDomain(payload.provider_domain, `${path}.payload.provider_domain`, issues);
    nullableText(payload.tariff_id, `${path}.payload.tariff_id`, issues, 512);
    if (payload.fixed_fee !== null) {
      validateMoney(payload.fixed_fee, `${path}.payload.fixed_fee`, issues);
    }
  } else if (fact.kind === 'project_service_quote') {
    validateDomain(payload.provider_domain, `${path}.payload.provider_domain`, issues, {
      nullable: true,
    });
    validateHash(payload.scope_hash, `${path}.payload.scope_hash`, issues);
    if (typeof payload.labour_included !== 'boolean') {
      issue(
        issues,
        `${path}.payload.labour_included`,
        'invalid_boolean',
        'labour_included must be boolean'
      );
    }
    if (typeof payload.materials_included !== 'boolean') {
      issue(
        issues,
        `${path}.payload.materials_included`,
        'invalid_boolean',
        'materials_included must be boolean'
      );
    }
    validateTimestamp(payload.valid_until, `${path}.payload.valid_until`, issues, {
      nullable: true,
    });
  }
  return payload;
}

export function evidenceFactHash(fact) {
  const value = { ...(fact || {}) };
  delete value.fact_hash;
  return hashValue(value);
}

export function evidenceCalculationHash(calculation) {
  const value = { ...(calculation || {}) };
  delete value.calculation_hash;
  return hashValue(value);
}

export function evidenceCalculationIdentityHash(calculation) {
  return hashValue({
    kind: calculation?.kind,
    higher: {
      fact_id: calculation?.input_bindings?.higher?.fact_id,
      claim_id: calculation?.input_bindings?.higher?.claim_id,
    },
    lower: {
      fact_id: calculation?.input_bindings?.lower?.fact_id,
      claim_id: calculation?.input_bindings?.lower?.claim_id,
    },
    comparison_scope_hash: calculation?.comparison_scope_hash,
  });
}

export function evidenceCalculationDerivedIds(calculation) {
  const identityHash = evidenceCalculationIdentityHash(calculation);
  const suffix = identityHash.slice(0, 32);
  return {
    calculation_id: `evidence-calculation-${suffix}`,
  };
}

function ordinalTextCompare(left, right) {
  const leftText = String(left);
  const rightText = String(right);
  return leftText < rightText ? -1 : leftText > rightText ? 1 : 0;
}

export function evidenceFactManifestHash(facts) {
  return hashValue(
    [...(Array.isArray(facts) ? facts : [])]
      .map((fact) => ({ fact_id: fact.fact_id, fact_hash: fact.fact_hash }))
      .sort((left, right) => ordinalTextCompare(left.fact_id, right.fact_id))
  );
}

export function evidenceCalculationManifestHash(calculations) {
  return hashValue(
    [...(Array.isArray(calculations) ? calculations : [])]
      .map((item) => ({
        calculation_id: item.calculation_id,
        calculation_hash: item.calculation_hash,
      }))
      .sort((left, right) => ordinalTextCompare(left.calculation_id, right.calculation_id))
  );
}

export function validateEvidenceFact(value, { path = 'fact', expectedProfile } = {}) {
  const issues = [];
  const fact = validateExactFields(value, FACT_FIELDS, path, issues);
  if (!fact) return { ok: false, issues };
  if (fact.schema_version !== EVIDENCE_FACT_VERSION) {
    issue(
      issues,
      `${path}.schema_version`,
      'unsupported_version',
      'Unsupported evidence fact version'
    );
  }
  if (!EVIDENCE_FACT_KINDS.includes(fact.kind)) {
    issue(issues, `${path}.kind`, 'unsupported_kind', 'Unsupported evidence fact kind');
  }
  requiredText(fact.fact_id, `${path}.fact_id`, issues, 512);
  requiredText(fact.claim_id, `${path}.claim_id`, issues, 512);
  validateStringArray(fact.source_ids, `${path}.source_ids`, issues, { minimum: 1, maximum: 100 });
  validateStringArray(fact.country_codes, `${path}.country_codes`, issues, {
    pattern: COUNTRY_CODE_RE,
    minimum: 1,
    maximum: 250,
  });
  validateTimestamp(fact.observed_at, `${path}.observed_at`, issues);
  validateHash(fact.market_scope_hash, `${path}.market_scope_hash`, issues);
  validateHash(fact.topic_seed_sha256, `${path}.topic_seed_sha256`, issues);
  validateHash(fact.comparison_scope_hash, `${path}.comparison_scope_hash`, issues);
  if (fact.verification_status !== EVIDENCE_FACT_VERIFICATION_STATUS) {
    issue(
      issues,
      `${path}.verification_status`,
      'unverified_fact',
      'Only verified facts are allowed'
    );
  }
  validateFactPayload(fact, path, issues);
  if (expectedProfile) {
    const expectedKind = FACT_KIND_BY_MODEL[expectedProfile.economic_model];
    if (fact.kind !== expectedKind) {
      issue(
        issues,
        `${path}.kind`,
        'profile_kind_mismatch',
        'Fact kind does not match the evidence profile'
      );
    }
    if (fact.market_scope_hash !== expectedProfile.market_scope_hash) {
      issue(
        issues,
        `${path}.market_scope_hash`,
        'profile_scope_mismatch',
        'Fact market scope does not match the evidence profile'
      );
    }
  }
  if (
    !validateHash(fact.fact_hash, `${path}.fact_hash`, issues) ||
    fact.fact_hash !== evidenceFactHash(fact)
  ) {
    issue(issues, `${path}.fact_hash`, 'fact_hash_mismatch', 'Fact hash does not match the fact');
  }
  return { ok: issues.length === 0, issues };
}

function validateBinding(value, path, issues) {
  const binding = validateExactFields(value, BINDING_FIELDS, path, issues);
  if (!binding) return null;
  requiredText(binding.fact_id, `${path}.fact_id`, issues, 512);
  requiredText(binding.claim_id, `${path}.claim_id`, issues, 512);
  return binding;
}

function decimalDifference(higher, lower) {
  const scale = Math.max((higher.split('.')[1] || '').length, (lower.split('.')[1] || '').length);
  const factor = 10n ** BigInt(scale);
  const integer = (value) => {
    const [whole, fraction = ''] = value.split('.');
    return BigInt(whole) * factor + BigInt(fraction.padEnd(scale, '0') || '0');
  };
  const result = integer(higher) - integer(lower);
  if (result < 0n) return null;
  const whole = result / factor;
  const fraction = String(result % factor)
    .padStart(scale, '0')
    .replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : String(whole);
}

export function validateEvidenceCalculation(value, { path = 'calculation', facts = [] } = {}) {
  const issues = [];
  const calculation = validateExactFields(value, CALCULATION_FIELDS, path, issues);
  if (!calculation) return { ok: false, issues };
  if (calculation.schema_version !== EVIDENCE_CALCULATION_VERSION) {
    issue(
      issues,
      `${path}.schema_version`,
      'unsupported_version',
      'Unsupported evidence calculation version'
    );
  }
  if (!EVIDENCE_CALCULATION_KINDS.includes(calculation.kind)) {
    issue(issues, `${path}.kind`, 'unsupported_kind', 'Unsupported evidence calculation kind');
  }
  requiredText(calculation.calculation_id, `${path}.calculation_id`, issues, 512);
  if (calculation.formula_version !== `${calculation.kind}_v1`) {
    issue(
      issues,
      `${path}.formula_version`,
      'formula_version_mismatch',
      'Formula version does not match calculation kind'
    );
  }
  const bindings = validateExactFields(
    calculation.input_bindings,
    new Set(['higher', 'lower']),
    `${path}.input_bindings`,
    issues
  );
  const higherBinding = bindings
    ? validateBinding(bindings.higher, `${path}.input_bindings.higher`, issues)
    : null;
  const lowerBinding = bindings
    ? validateBinding(bindings.lower, `${path}.input_bindings.lower`, issues)
    : null;
  if (bindings && higherBinding && lowerBinding) {
    const expectedIds = evidenceCalculationDerivedIds(calculation);
    if (calculation.calculation_id !== expectedIds.calculation_id) {
      issue(
        issues,
        `${path}.calculation_id`,
        'calculation_id_mismatch',
        'Calculation id does not match its canonical typed inputs'
      );
    }
  }
  if (higherBinding && lowerBinding && higherBinding.fact_id === lowerBinding.fact_id) {
    issue(
      issues,
      `${path}.input_bindings`,
      'duplicate_input_fact',
      'Calculation inputs must be distinct facts'
    );
  }
  const expectedFactKind = FACT_KIND_BY_CALCULATION[calculation.kind];
  const expectedUnits = FACT_SPEC[expectedFactKind]?.units || [];
  const targetBasis = validateBasis(
    calculation.target_basis,
    `${path}.target_basis`,
    expectedUnits,
    issues
  );
  const normalized = validateExactFields(
    calculation.normalized_inputs,
    new Set(['higher', 'lower']),
    `${path}.normalized_inputs`,
    issues
  );
  const higherMoney = normalized
    ? validateMoney(normalized.higher, `${path}.normalized_inputs.higher`, issues)
    : null;
  const lowerMoney = normalized
    ? validateMoney(normalized.lower, `${path}.normalized_inputs.lower`, issues)
    : null;
  const result = validateMoney(calculation.result, `${path}.result`, issues);
  validateStringArray(calculation.country_codes, `${path}.country_codes`, issues, {
    pattern: COUNTRY_CODE_RE,
    minimum: 1,
    maximum: 250,
  });
  validateHash(calculation.comparison_scope_hash, `${path}.comparison_scope_hash`, issues);
  if (calculation.verification_status !== EVIDENCE_CALCULATION_VERIFICATION_STATUS) {
    issue(
      issues,
      `${path}.verification_status`,
      'unverified_calculation',
      'Calculation is not verified'
    );
  }

  const factMap = new Map((Array.isArray(facts) ? facts : []).map((fact) => [fact.fact_id, fact]));
  const higherFact = higherBinding ? factMap.get(higherBinding.fact_id) : null;
  const lowerFact = lowerBinding ? factMap.get(lowerBinding.fact_id) : null;
  for (const [role, binding, fact] of [
    ['higher', higherBinding, higherFact],
    ['lower', lowerBinding, lowerFact],
  ]) {
    if (!binding) continue;
    if (!fact) {
      issue(
        issues,
        `${path}.input_bindings.${role}.fact_id`,
        'missing_input_fact',
        'Calculation input fact is missing'
      );
      continue;
    }
    if (binding.claim_id !== fact.claim_id) {
      issue(
        issues,
        `${path}.input_bindings.${role}.claim_id`,
        'fact_claim_mismatch',
        'Calculation binding does not own the fact'
      );
    }
    if (fact.kind !== expectedFactKind) {
      issue(
        issues,
        `${path}.input_bindings.${role}.fact_id`,
        'fact_kind_mismatch',
        'Calculation input fact kind is incompatible'
      );
    }
  }
  if (higherFact && lowerFact) {
    const higherPrice = higherFact.payload?.price;
    const lowerPrice = lowerFact.payload?.price;
    const comparable =
      JSON.stringify(higherFact.payload?.basis) === JSON.stringify(lowerFact.payload?.basis) &&
      JSON.stringify(higherFact.country_codes) === JSON.stringify(lowerFact.country_codes) &&
      higherFact.comparison_scope_hash === lowerFact.comparison_scope_hash &&
      higherPrice?.currency === lowerPrice?.currency &&
      higherPrice?.tax_basis === lowerPrice?.tax_basis;
    if (!comparable) {
      issue(
        issues,
        path,
        'incomparable_inputs',
        'Calculation inputs do not share country, currency, tax, basis and comparison scope'
      );
    }
    if (calculation.kind === 'project_quote_rate_difference') {
      for (const key of ['scope_hash', 'labour_included', 'materials_included']) {
        if (higherFact.payload?.[key] !== lowerFact.payload?.[key]) {
          issue(
            issues,
            path,
            'project_scope_mismatch',
            'Project quote inputs do not share the same scope and inclusions'
          );
          break;
        }
      }
    }
    if (targetBasis && JSON.stringify(targetBasis) !== JSON.stringify(higherFact.payload?.basis)) {
      issue(
        issues,
        `${path}.target_basis`,
        'target_basis_mismatch',
        'Target basis does not match the verified facts'
      );
    }
    if (
      higherMoney &&
      lowerMoney &&
      (JSON.stringify(higherMoney) !== JSON.stringify(higherPrice) ||
        JSON.stringify(lowerMoney) !== JSON.stringify(lowerPrice))
    ) {
      issue(
        issues,
        `${path}.normalized_inputs`,
        'normalized_input_mismatch',
        'Normalized inputs do not match verified fact prices'
      );
    }
    if (higherMoney && lowerMoney && result) {
      const expected = decimalDifference(higherMoney.amount, lowerMoney.amount);
      if (!expected || expected === '0') {
        issue(
          issues,
          `${path}.normalized_inputs`,
          'invalid_order',
          'Higher input must be greater than lower input'
        );
      } else if (
        result.amount !== expected ||
        result.currency !== higherMoney.currency ||
        result.tax_basis !== higherMoney.tax_basis
      ) {
        issue(
          issues,
          `${path}.result`,
          'result_mismatch',
          'Calculation result does not equal higher minus lower'
        );
      }
    }
    if (
      calculation.comparison_scope_hash !== higherFact.comparison_scope_hash ||
      JSON.stringify(calculation.country_codes) !== JSON.stringify(higherFact.country_codes)
    ) {
      issue(
        issues,
        path,
        'calculation_scope_mismatch',
        'Calculation scope does not match its verified facts'
      );
    }
  }
  if (
    !validateHash(calculation.calculation_hash, `${path}.calculation_hash`, issues) ||
    calculation.calculation_hash !== evidenceCalculationHash(calculation)
  ) {
    issue(
      issues,
      `${path}.calculation_hash`,
      'calculation_hash_mismatch',
      'Calculation hash does not match the calculation'
    );
  }
  return { ok: issues.length === 0, issues };
}

function validateCoverageRequirements(
  values,
  profileRequirements,
  { path, idField, availableIdsByKind },
  issues
) {
  if (!Array.isArray(values)) {
    issue(issues, path, 'array_required', `${path} must be an array`);
    return;
  }
  const profileMap = new Map((profileRequirements || []).map((item) => [item.kind, item]));
  const seen = new Set();
  for (const [index, raw] of values.entries()) {
    const itemPath = `${path}[${index}]`;
    const item = validateExactFields(raw, COVERAGE_REQUIREMENT_FIELDS, itemPath, issues);
    if (!item) continue;
    const expected = profileMap.get(item.kind);
    if (!expected) {
      issue(
        issues,
        `${itemPath}.kind`,
        'unexpected_requirement',
        'Coverage requirement is not in the profile'
      );
    }
    if (seen.has(item.kind)) {
      issue(
        issues,
        `${itemPath}.kind`,
        'duplicate_requirement',
        'Coverage requirement is duplicated'
      );
    }
    seen.add(item.kind);
    if (!EVIDENCE_REQUIREMENT_STATUSES.includes(item.status)) {
      issue(
        issues,
        `${itemPath}.status`,
        'invalid_coverage_status',
        'Coverage status is unsupported'
      );
    }
    if (!Number.isInteger(item.satisfied_count) || item.satisfied_count < 0) {
      issue(
        issues,
        `${itemPath}.satisfied_count`,
        'invalid_count',
        'satisfied_count must be a nonnegative integer'
      );
    }
    const otherIdField = idField === 'fact_ids' ? 'calculation_ids' : 'fact_ids';
    if (Object.prototype.hasOwnProperty.call(item, otherIdField)) {
      issue(
        issues,
        `${itemPath}.${otherIdField}`,
        'wrong_coverage_record_type',
        `${itemPath} cannot contain ${otherIdField}`
      );
    }
    const ids = validateStringArray(item[idField], `${itemPath}.${idField}`, issues, {
      minimum: 0,
      maximum: 2_000,
    });
    if (item.satisfied_count !== ids.length) {
      issue(
        issues,
        `${itemPath}.satisfied_count`,
        'count_mismatch',
        'satisfied_count does not match referenced records'
      );
    }
    const available = availableIdsByKind.get(item.kind) || new Set();
    for (const id of ids) {
      if (!available.has(id)) {
        issue(
          issues,
          `${itemPath}.${idField}`,
          'unknown_coverage_record',
          'Coverage references an unavailable record'
        );
      }
    }
    if (item.status === 'satisfied') {
      if (!expected || ids.length < expected.minimum_verified) {
        issue(
          issues,
          itemPath,
          'requirement_not_satisfied',
          'Satisfied coverage is below the profile minimum'
        );
      }
      if (item.reason_code !== null || item.validation_plan !== null) {
        issue(
          issues,
          itemPath,
          'unexpected_coverage_explanation',
          'Satisfied coverage cannot carry a reason or validation plan'
        );
      }
    } else if (item.status === 'not_applicable') {
      if (expected?.applicability === 'required') {
        issue(
          issues,
          itemPath,
          'required_marked_not_applicable',
          'A required requirement cannot be not applicable'
        );
      }
      if (!EVIDENCE_NOT_APPLICABLE_REASON_CODES.includes(item.reason_code)) {
        issue(
          issues,
          `${itemPath}.reason_code`,
          'invalid_not_applicable_reason',
          'Not-applicable coverage requires a reviewed reason'
        );
      }
      if (item.validation_plan !== null || ids.length !== 0) {
        issue(
          issues,
          itemPath,
          'invalid_not_applicable_shape',
          'Not-applicable coverage cannot reference records or a validation plan'
        );
      }
    } else if (item.status === 'insufficient_evidence') {
      if (typeof item.validation_plan !== 'string' || !item.validation_plan.trim()) {
        issue(
          issues,
          `${itemPath}.validation_plan`,
          'validation_plan_required',
          'Insufficient evidence requires a validation plan'
        );
      }
      if (item.reason_code !== null) {
        issue(
          issues,
          `${itemPath}.reason_code`,
          'unexpected_reason_code',
          'Insufficient evidence is not not-applicable'
        );
      }
    }
  }
  for (const requirement of profileRequirements || []) {
    if (!seen.has(requirement.kind)) {
      issue(
        issues,
        path,
        'coverage_requirement_missing',
        `Coverage is missing ${requirement.kind}`
      );
    }
  }
}

export function validateEvidenceContractQuality(
  value,
  { profile, profileHash, facts, calculations, factManifestHash, calculationManifestHash } = {}
) {
  const issues = [];
  const quality = validateExactFields(value, COVERAGE_FIELDS, 'quality.evidence_contract', issues);
  if (!quality) return { ok: false, issues };
  if (quality.version !== EVIDENCE_CONTRACT_QUALITY_VERSION) {
    issue(
      issues,
      'quality.evidence_contract.version',
      'unsupported_version',
      'Unsupported evidence quality version'
    );
  }
  if (!['passed', 'blocked'].includes(quality.status)) {
    issue(
      issues,
      'quality.evidence_contract.status',
      'invalid_status',
      'Evidence contract status is unsupported'
    );
  }
  for (const [field, expected] of [
    ['profile_hash', profileHash],
    ['fact_manifest_hash', factManifestHash],
    ['calculation_manifest_hash', calculationManifestHash],
  ]) {
    validateHash(quality[field], `quality.evidence_contract.${field}`, issues);
    if (expected && quality[field] !== expected) {
      issue(
        issues,
        `quality.evidence_contract.${field}`,
        'quality_hash_mismatch',
        `${field} does not match the bundle`
      );
    }
  }
  const factIds = new Map();
  for (const fact of facts || []) {
    if (!factIds.has(fact.kind)) factIds.set(fact.kind, new Set());
    factIds.get(fact.kind).add(fact.fact_id);
  }
  const calculationIds = new Map();
  for (const calculation of calculations || []) {
    if (!calculationIds.has(calculation.kind)) calculationIds.set(calculation.kind, new Set());
    calculationIds.get(calculation.kind).add(calculation.calculation_id);
  }
  validateCoverageRequirements(
    quality.fact_requirements,
    profile?.fact_requirements,
    {
      path: 'quality.evidence_contract.fact_requirements',
      idField: 'fact_ids',
      availableIdsByKind: factIds,
    },
    issues
  );
  validateCoverageRequirements(
    quality.calculation_requirements,
    profile?.calculation_requirements,
    {
      path: 'quality.evidence_contract.calculation_requirements',
      idField: 'calculation_ids',
      availableIdsByKind: calculationIds,
    },
    issues
  );
  const anyBlocking = [
    ...(quality.fact_requirements || []),
    ...(quality.calculation_requirements || []),
  ].some((item) => {
    const requirement = [
      ...(profile?.fact_requirements || []),
      ...(profile?.calculation_requirements || []),
    ].find((candidate) => candidate.kind === item?.kind);
    if (item?.status === 'insufficient_evidence') {
      return requirement?.applicability !== 'optional';
    }
    return item?.status === 'not_applicable' && requirement?.applicability === 'required';
  });
  if ((quality.status === 'passed') === anyBlocking) {
    issue(
      issues,
      'quality.evidence_contract.status',
      'quality_status_mismatch',
      'Evidence contract status does not match requirement coverage'
    );
  }
  return { ok: issues.length === 0, issues };
}

function qualityLedgerFactIds(bundle) {
  const critical = plainObject(bundle?.quality?.critical_claims) || {};
  const ledgers = Array.isArray(critical.evidence_ledger) ? critical.evidence_ledger : [];
  const result = new Map();
  for (const row of ledgers) {
    if (!row || typeof row !== 'object') continue;
    if (row.status !== EVIDENCE_FACT_VERIFICATION_STATUS) continue;
    for (const fact of Array.isArray(row.facts) ? row.facts : []) {
      if (fact?.fact_id) {
        const factId = String(fact.fact_id);
        const previous = result.get(factId);
        result.set(factId, {
          claimId: String(row.claim_id || ''),
          nestedClaimId: String(fact.claim_id || ''),
          sourceIds: [...new Set((row.source_ids || []).map(String))].sort(),
          countryCodes: [...new Set((row.country_codes || []).map(String))].sort(),
          observedAt: String(row.effective_or_observation_at || ''),
          topicSeedSha256: String(fact.topic_seed_sha256 || critical.topic_seed_sha256 || ''),
          duplicate: Boolean(previous),
        });
      }
    }
  }
  return result;
}

/** Strict consumer validation for the additive v2 bundle fields. */
export function validateAxwiseEvidenceBundleV2(
  bundle,
  { expectedProfile, expectedProfileHash } = {}
) {
  const issues = [];
  if (!plainObject(bundle)) {
    return {
      ok: false,
      issues: [{ path: 'bundle', code: 'object_required', message: 'Bundle must be an object' }],
    };
  }
  if (bundle.version !== AXWISE_RESEARCH_BUNDLE_V2) {
    issue(issues, 'version', 'unsupported_version', `version must be ${AXWISE_RESEARCH_BUNDLE_V2}`);
  }
  const profileResult = validateBusinessEvidenceProfile(bundle.evidence_profile);
  issues.push(
    ...profileResult.issues.map((item) => ({ ...item, path: `evidence_profile.${item.path}` }))
  );
  const profile = bundle.evidence_profile;
  validateHash(bundle.evidence_profile_hash, 'evidence_profile_hash', issues);
  const computedProfileHash = plainObject(profile) ? hashValue(profile) : null;
  if (computedProfileHash && bundle.evidence_profile_hash !== computedProfileHash) {
    issue(
      issues,
      'evidence_profile_hash',
      'profile_hash_mismatch',
      'Evidence profile hash does not match the profile'
    );
  }
  if (expectedProfile && hashValue(expectedProfile) !== computedProfileHash) {
    issue(
      issues,
      'evidence_profile',
      'requested_profile_mismatch',
      'Returned evidence profile does not match the goal request'
    );
  }
  if (expectedProfileHash && bundle.evidence_profile_hash !== expectedProfileHash) {
    issue(
      issues,
      'evidence_profile_hash',
      'requested_profile_hash_mismatch',
      'Returned profile hash does not match the goal request'
    );
  }

  const facts = Array.isArray(bundle.facts) ? bundle.facts : [];
  if (!Array.isArray(bundle.facts) || facts.length > 2_000) {
    issue(issues, 'facts', 'invalid_array', 'facts must be a bounded array');
  }
  const factIds = new Set();
  for (const [index, fact] of facts.entries()) {
    if (factIds.has(fact?.fact_id)) {
      issue(issues, `facts[${index}].fact_id`, 'duplicate_fact_id', 'Fact id is duplicated');
    }
    factIds.add(fact?.fact_id);
    const result = validateEvidenceFact(fact, {
      path: `facts[${index}]`,
      expectedProfile: profile,
    });
    issues.push(...result.issues);
  }
  validateHash(bundle.fact_manifest_hash, 'fact_manifest_hash', issues);
  if (bundle.fact_manifest_hash !== evidenceFactManifestHash(facts)) {
    issue(
      issues,
      'fact_manifest_hash',
      'manifest_hash_mismatch',
      'Fact manifest hash does not match facts'
    );
  }

  const calculations = Array.isArray(bundle.calculations) ? bundle.calculations : [];
  if (!Array.isArray(bundle.calculations) || calculations.length > 2_000) {
    issue(issues, 'calculations', 'invalid_array', 'calculations must be a bounded array');
  }
  const calculationIds = new Set();
  for (const [index, calculation] of calculations.entries()) {
    if (calculationIds.has(calculation?.calculation_id)) {
      issue(
        issues,
        `calculations[${index}].calculation_id`,
        'duplicate_calculation_id',
        'Calculation id is duplicated'
      );
    }
    calculationIds.add(calculation?.calculation_id);
    const result = validateEvidenceCalculation(calculation, {
      path: `calculations[${index}]`,
      facts,
    });
    issues.push(...result.issues);
  }
  validateHash(bundle.calculation_manifest_hash, 'calculation_manifest_hash', issues);
  if (bundle.calculation_manifest_hash !== evidenceCalculationManifestHash(calculations)) {
    issue(
      issues,
      'calculation_manifest_hash',
      'manifest_hash_mismatch',
      'Calculation manifest hash does not match calculations'
    );
  }

  const sourceIds = new Set();
  for (const [index, source] of (bundle.market_sources || []).entries()) {
    const sourceId = String(source?.source_id || '');
    if (sourceId && sourceIds.has(sourceId)) {
      issue(
        issues,
        `market_sources[${index}].source_id`,
        'duplicate_source_id',
        'Market source id is duplicated'
      );
    }
    if (sourceId) sourceIds.add(sourceId);
  }
  const claimMap = new Map();
  for (const [index, claim] of (bundle.market_claims || []).entries()) {
    const claimId = String(claim?.claim_id || '');
    if (claimId && claimMap.has(claimId)) {
      issue(
        issues,
        `market_claims[${index}].claim_id`,
        'duplicate_claim_id',
        'Market claim id is duplicated'
      );
    }
    if (claimId) claimMap.set(claimId, claim);
  }
  const ledgerFactIds = qualityLedgerFactIds(bundle);
  for (const [index, fact] of facts.entries()) {
    const claim = claimMap.get(String(fact.claim_id));
    // V2 fact ownership is the strict verified evidence-ledger row above.
    // market_claims remains an optional v1 narrative projection and is not
    // authoritative for typed evidence ownership.
    const claimSources = claim ? new Set((claim.source_ids || []).map(String)) : null;
    for (const sourceId of fact.source_ids || []) {
      if (!sourceIds.has(String(sourceId))) {
        issue(
          issues,
          `facts[${index}].source_ids`,
          'missing_source',
          'Fact source is missing from market_sources'
        );
      }
      if (claimSources && !claimSources.has(String(sourceId))) {
        issue(
          issues,
          `facts[${index}].source_ids`,
          'claim_source_mismatch',
          'Fact source is not owned by its claim'
        );
      }
    }
    const ledgerFact = ledgerFactIds.get(String(fact.fact_id));
    const expectedSourceIds = [...new Set((fact.source_ids || []).map(String))].sort();
    const expectedCountryCodes = [...new Set((fact.country_codes || []).map(String))].sort();
    if (
      !ledgerFact ||
      ledgerFact.claimId !== String(fact.claim_id) ||
      ledgerFact.nestedClaimId !== String(fact.claim_id) ||
      ledgerFact.duplicate === true ||
      JSON.stringify(ledgerFact.sourceIds) !== JSON.stringify(expectedSourceIds) ||
      JSON.stringify(ledgerFact.countryCodes) !== JSON.stringify(expectedCountryCodes) ||
      !isRfc3339Timestamp(ledgerFact.observedAt) ||
      Date.parse(ledgerFact.observedAt) !== Date.parse(fact.observed_at) ||
      ledgerFact.topicSeedSha256 !== String(fact.topic_seed_sha256)
    ) {
      issue(
        issues,
        `facts[${index}].fact_id`,
        'unverified_ledger_fact',
        'Fact is not owned by a verified quality-ledger claim'
      );
    }
  }

  const qualityResult = validateEvidenceContractQuality(bundle.quality?.evidence_contract, {
    profile,
    profileHash: bundle.evidence_profile_hash,
    facts,
    calculations,
    factManifestHash: bundle.fact_manifest_hash,
    calculationManifestHash: bundle.calculation_manifest_hash,
  });
  issues.push(...qualityResult.issues);
  return { ok: issues.length === 0, issues, facts, calculations };
}

export function assertAxwiseEvidenceBundleV2(bundle, options) {
  const result = validateAxwiseEvidenceBundleV2(bundle, options);
  if (!result.ok) {
    const error = new Error(
      result.issues.map((item) => `${item.path}: ${item.message}`).join('; ')
    );
    error.code = 'invalid_axwise_evidence_bundle_v2';
    error.issues = result.issues;
    throw error;
  }
  return result;
}
