import { caseInputHash, EVALUATION_CATEGORIES, SLOT_SECONDS } from './catalog.mjs';

export const RECORD_SCHEMA_VERSION = 'orqanix.agent-evaluation.v1';
export const SUMMARY_SCHEMA_VERSION = 'orqanix.agent-evaluation-summary.v1';
export const STALE_AFTER_SECONDS = 30 * 60;

const ARM_NAMES = Object.freeze(['orqanix', 'vanilla']);
const ARM_STATUSES = new Set(['completed', 'failed', 'not_evaluated']);
const VERDICTS = new Set(['passed', 'failed', 'not_evaluated']);
const CATEGORY_IDS = EVALUATION_CATEGORIES.map(({ id }) => id);
const CATEGORY_LABELS = Object.fromEntries(EVALUATION_CATEGORIES.map(({ id, label }) => [id, label]));

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function timestampMs(value) {
  if (typeof value !== 'string') return Number.NaN;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value
    ? milliseconds
    : Number.NaN;
}

function validateUsage(usage, path, errors) {
  if (usage === undefined) return;
  if (!isObject(usage)) {
    errors.push(`${path} must be an object when present`);
    return;
  }
  for (const field of ['inputTokens', 'outputTokens', 'totalTokens']) {
    if (!Number.isSafeInteger(usage[field]) || usage[field] < 0) {
      errors.push(`${path}.${field} must be a non-negative integer`);
    }
  }
}

function validateEvaluation(evaluation, path, errors) {
  if (!isObject(evaluation)) {
    errors.push(`${path} must be an object`);
    return;
  }
  if (!VERDICTS.has(evaluation.verdict)) {
    errors.push(`${path}.verdict must be passed, failed, or not_evaluated`);
  }
  if (evaluation.reason !== undefined && !isNonEmptyString(evaluation.reason)) {
    errors.push(`${path}.reason must be a non-empty string when present`);
  }
  if (evaluation.criteriaResults !== undefined) {
    if (!Array.isArray(evaluation.criteriaResults)) {
      errors.push(`${path}.criteriaResults must be an array when present`);
    } else {
      evaluation.criteriaResults.forEach((result, index) => {
        const resultPath = `${path}.criteriaResults[${index}]`;
        if (!isObject(result)) {
          errors.push(`${resultPath} must be an object`);
          return;
        }
        if (!isNonEmptyString(result.criterion)) {
          errors.push(`${resultPath}.criterion must be a non-empty string`);
        }
        if (typeof result.passed !== 'boolean') {
          errors.push(`${resultPath}.passed must be boolean`);
        }
        if (result.reason !== undefined && !isNonEmptyString(result.reason)) {
          errors.push(`${resultPath}.reason must be a non-empty string when present`);
        }
      });
    }
  }
}

function validateArm(arm, path, errors) {
  if (!isObject(arm)) {
    errors.push(`${path} must be an object`);
    return;
  }
  if (!ARM_STATUSES.has(arm.status)) {
    errors.push(`${path}.status must be completed, failed, or not_evaluated`);
  }
  if (!isNonEmptyString(arm.model)) errors.push(`${path}.model must be a non-empty string`);
  if (arm.resolvedModel !== undefined && !isNonEmptyString(arm.resolvedModel)) {
    errors.push(`${path}.resolvedModel must be a non-empty string when present`);
  }
  if (!isNonEmptyString(arm.endpoint)) errors.push(`${path}.endpoint must be a non-empty string`);

  const startedAt = timestampMs(arm.startedAt);
  const finishedAt = timestampMs(arm.finishedAt);
  if (!Number.isFinite(startedAt)) errors.push(`${path}.startedAt must be a canonical ISO timestamp`);
  if (!Number.isFinite(finishedAt)) errors.push(`${path}.finishedAt must be a canonical ISO timestamp`);
  if (Number.isFinite(startedAt) && Number.isFinite(finishedAt) && finishedAt < startedAt) {
    errors.push(`${path}.finishedAt must not precede startedAt`);
  }
  if (!Number.isFinite(arm.elapsedMs) || arm.elapsedMs < 0) {
    errors.push(`${path}.elapsedMs must be a non-negative finite number`);
  }

  validateEvaluation(arm.evaluation, `${path}.evaluation`, errors);
  validateUsage(arm.usage, `${path}.usage`, errors);

  if (arm.status === 'completed') {
    if (!isNonEmptyString(arm.outputRef)) errors.push(`${path}.outputRef is required for completed arms`);
    if (typeof arm.outputHash !== 'string' || !/^[a-f0-9]{64}$/i.test(arm.outputHash)) {
      errors.push(`${path}.outputHash must be a SHA-256 hex digest for completed arms`);
    }
  } else if (arm.evaluation?.verdict === 'passed') {
    errors.push(`${path}.evaluation.verdict cannot be passed when execution did not complete`);
  }
  if (arm.error !== undefined && !isNonEmptyString(arm.error)) {
    errors.push(`${path}.error must be a non-empty string when present`);
  }
}

function validateCase(evaluationCase, path, errors) {
  if (!isObject(evaluationCase)) {
    errors.push(`${path} must be an object`);
    return;
  }
  if (!CATEGORY_IDS.includes(evaluationCase.category)) {
    errors.push(`${path}.category is not supported`);
  }
  if (!isNonEmptyString(evaluationCase.label)) errors.push(`${path}.label must be a non-empty string`);
  if (!isNonEmptyString(evaluationCase.prompt)) errors.push(`${path}.prompt must be a non-empty string`);
  if (!isNonEmptyString(evaluationCase.templateId)) errors.push(`${path}.templateId must be a non-empty string`);
  if (!Number.isSafeInteger(evaluationCase.templateVersion) || evaluationCase.templateVersion < 1) {
    errors.push(`${path}.templateVersion must be a positive integer`);
  }
  if (!isNonEmptyString(evaluationCase.seed)) errors.push(`${path}.seed must be a non-empty string`);
  if (!Array.isArray(evaluationCase.criteria) || evaluationCase.criteria.length === 0 || evaluationCase.criteria.some((criterion) => !isNonEmptyString(criterion))) {
    errors.push(`${path}.criteria must be a non-empty array of non-empty strings`);
  }
  if (evaluationCase.fixture !== undefined && !isObject(evaluationCase.fixture)) {
    errors.push(`${path}.fixture must be an object when present`);
  }
  if (typeof evaluationCase.inputHash !== 'string' || !/^[a-f0-9]{64}$/i.test(evaluationCase.inputHash)) {
    errors.push(`${path}.inputHash must be a SHA-256 hex digest`);
  } else if (
    isNonEmptyString(evaluationCase.category)
    && isNonEmptyString(evaluationCase.templateId)
    && Number.isSafeInteger(evaluationCase.templateVersion)
    && isNonEmptyString(evaluationCase.seed)
    && isNonEmptyString(evaluationCase.prompt)
    && Array.isArray(evaluationCase.criteria)
    && caseInputHash(evaluationCase) !== evaluationCase.inputHash.toLowerCase()
  ) {
    errors.push(`${path}.inputHash does not match the canonical case input`);
  }
  if (!isObject(evaluationCase.arms)) {
    errors.push(`${path}.arms must be an object`);
  } else {
    for (const armName of ARM_NAMES) validateArm(evaluationCase.arms[armName], `${path}.arms.${armName}`, errors);
  }
}

export function validateAgentEvaluationRecord(record) {
  const errors = [];
  if (!isObject(record)) return { valid: false, errors: ['record must be an object'] };
  if (record.schemaVersion !== RECORD_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${RECORD_SCHEMA_VERSION}`);
  }
  if (record.executionMode !== 'live') errors.push('executionMode must be live');
  if (!isNonEmptyString(record.runId)) errors.push('runId must be a non-empty string');
  if (!isNonEmptyString(record.runnerRevision) || !/^[a-f0-9]{7,64}$/i.test(record.runnerRevision)) {
    errors.push('runnerRevision must be an immutable commit hash');
  }

  const slot = timestampMs(record.slot);
  if (!Number.isFinite(slot) || slot % (SLOT_SECONDS * 1000) !== 0) {
    errors.push('slot must be a canonical ISO timestamp aligned to 15 minutes');
  }
  const startedAt = timestampMs(record.startedAt);
  const finishedAt = timestampMs(record.finishedAt);
  if (!Number.isFinite(startedAt)) errors.push('startedAt must be a canonical ISO timestamp');
  if (!Number.isFinite(finishedAt)) errors.push('finishedAt must be a canonical ISO timestamp');
  if (Number.isFinite(startedAt) && Number.isFinite(finishedAt) && finishedAt < startedAt) {
    errors.push('finishedAt must not precede startedAt');
  }

  if (!Array.isArray(record.cases) || record.cases.length !== CATEGORY_IDS.length) {
    errors.push(`cases must contain exactly ${CATEGORY_IDS.length} entries`);
  } else {
    record.cases.forEach((evaluationCase, index) => validateCase(evaluationCase, `cases[${index}]`, errors));
    const categories = record.cases.map(({ category }) => category);
    for (const category of CATEGORY_IDS) {
      if (categories.filter((candidate) => candidate === category).length !== 1) {
        errors.push(`cases must contain category ${category} exactly once`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

function normalizeEvaluation(evaluation) {
  return {
    verdict: evaluation.verdict,
    ...(evaluation.criteriaResults === undefined ? {} : {
      criteriaResults: evaluation.criteriaResults.map((result) => ({
        criterion: result.criterion,
        passed: result.passed,
        ...(result.reason === undefined ? {} : { reason: result.reason }),
      })),
    }),
    ...(evaluation.reason === undefined ? {} : { reason: evaluation.reason }),
  };
}

function normalizeArm(arm) {
  return {
    status: arm.status,
    startedAt: arm.startedAt,
    finishedAt: arm.finishedAt,
    elapsedMs: arm.elapsedMs,
    model: arm.model,
    ...(arm.resolvedModel === undefined ? {} : { resolvedModel: arm.resolvedModel }),
    endpoint: arm.endpoint,
    ...(arm.outputHash === undefined ? {} : { outputHash: arm.outputHash.toLowerCase() }),
    ...(arm.outputRef === undefined ? {} : { outputRef: arm.outputRef }),
    ...(arm.usage === undefined ? {} : { usage: { ...arm.usage } }),
    evaluation: normalizeEvaluation(arm.evaluation),
    ...(arm.error === undefined ? {} : { error: arm.error }),
  };
}

export function normalizeAgentEvaluationRecord(record) {
  const validation = validateAgentEvaluationRecord(record);
  if (!validation.valid) {
    throw new TypeError(`Invalid ${RECORD_SCHEMA_VERSION} record: ${validation.errors.join('; ')}`);
  }
  return {
    schemaVersion: RECORD_SCHEMA_VERSION,
    executionMode: 'live',
    runId: record.runId,
    slot: record.slot,
    startedAt: record.startedAt,
    finishedAt: record.finishedAt,
    runnerRevision: record.runnerRevision.toLowerCase(),
    cases: record.cases.map((evaluationCase) => ({
      category: evaluationCase.category,
      label: evaluationCase.label,
      prompt: evaluationCase.prompt,
      templateId: evaluationCase.templateId,
      templateVersion: evaluationCase.templateVersion,
      seed: evaluationCase.seed,
      criteria: [...evaluationCase.criteria],
      ...(evaluationCase.fixture === undefined ? {} : { fixture: structuredClone(evaluationCase.fixture) }),
      inputHash: evaluationCase.inputHash.toLowerCase(),
      arms: {
        orqanix: normalizeArm(evaluationCase.arms.orqanix),
        vanilla: normalizeArm(evaluationCase.arms.vanilla),
      },
    })),
  };
}

function percentile(values, percentileValue) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length === 1) return sorted[0];
  const index = (sorted.length - 1) * percentileValue;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + ((sorted[upper] - sorted[lower]) * (index - lower));
}

function emptyCount() {
  return { completed: 0, failed: 0, notEvaluated: 0 };
}

function emptyVerdicts() {
  return { passed: 0, failed: 0, notEvaluated: 0 };
}

function emptyTerminal() {
  return { passed: 0, failed: 0, incomplete: 0 };
}

function publicStatusKey(status) {
  return status === 'not_evaluated' ? 'notEvaluated' : status;
}

function emptyCategory(category) {
  return {
    label: CATEGORY_LABELS[category],
    sampleCount: 0,
    execution: { orqanix: emptyCount(), vanilla: emptyCount() },
    evaluation: { orqanix: emptyVerdicts(), vanilla: emptyVerdicts() },
    terminal: { orqanix: emptyTerminal(), vanilla: emptyTerminal() },
    latencyMs: {
      orqanix: { sampleCount: 0, p50: null, p95: null },
      vanilla: { sampleCount: 0, p50: null, p95: null },
    },
    usage: { orqanix: null, vanilla: null },
    comparison: {
      pairedSuccessfulCount: 0,
      latencyRatioSampleCount: 0,
      orqanixToVanillaLatencyRatioP50: null,
    },
  };
}

function modelIdentity(arm) {
  return arm.resolvedModel ?? arm.model;
}

// Historical receipts stay immutable. Retired formatting/keyword checks cannot
// establish task failure, and removing them cannot establish a semantic pass.
function publicEvaluation(arm) {
  const evaluation = arm.evaluation;
  const retired = new Set([
    'bounded_ordered_steps', 'exactly_two_non_goals', 'plan_word_limit',
    'word_limit', 'required_topics_present', 'exactly_two_sentences',
    'cause_details_present', 'recovery_details_present',
  ]);
  const failures = (evaluation.criteriaResults ?? []).filter((item) => !item.passed);
  if (arm.status === 'completed' && evaluation.verdict === 'failed' &&
      failures.length > 0 && failures.every((item) => retired.has(item.criterion))) {
    return {
      ...evaluation,
      verdict: 'not_evaluated',
      originalEvaluationVerdict: evaluation.verdict,
      evaluationNotice: 'Earlier review rejected only retired formatting or keyword checks. Task quality needs reevaluation; the original receipt is retained.',
    };
  }
  return evaluation;
}

function evaluationKind(evaluation) {
  return evaluation.reason === 'advisory_review' ||
    /^jev_review_/.test(evaluation.reason ?? '') ||
    evaluation.criteriaResults?.some((item) => item.criterion === 'jev_review_passed')
    ? 'advisory' : 'checks';
}

function summarizeWindow(records, nowMs, durationSeconds) {
  const sinceMs = nowMs - (durationSeconds * 1000);
  const included = records.filter((record) => {
    const finishedAt = Date.parse(record.finishedAt);
    return finishedAt >= sinceMs && finishedAt <= nowMs;
  });
  const categories = Object.fromEntries(CATEGORY_IDS.map((category) => [category, emptyCategory(category)]));
  const latencySamples = Object.fromEntries(CATEGORY_IDS.map((category) => [category, { orqanix: [], vanilla: [] }]));
  const usageSamples = Object.fromEntries(CATEGORY_IDS.map((category) => [category, { orqanix: [], vanilla: [] }]));
  const ratios = Object.fromEntries(CATEGORY_IDS.map((category) => [category, []]));

  for (const record of included) {
    for (const evaluationCase of record.cases) {
      const category = categories[evaluationCase.category];
      category.sampleCount += 1;
      for (const armName of ARM_NAMES) {
        const arm = evaluationCase.arms[armName];
        const evaluation = publicEvaluation(arm);
        category.execution[armName][publicStatusKey(arm.status)] += 1;
        category.evaluation[armName][publicStatusKey(evaluation.verdict)] += 1;
        if (arm.status === 'completed' && evaluation.verdict === 'passed') {
          category.terminal[armName].passed += 1;
        } else if (arm.status === 'completed' && evaluation.verdict === 'failed') {
          category.terminal[armName].failed += 1;
        } else {
          category.terminal[armName].incomplete += 1;
        }
        if (arm.status === 'completed') latencySamples[evaluationCase.category][armName].push(arm.elapsedMs);
        if (arm.usage !== undefined) usageSamples[evaluationCase.category][armName].push(arm.usage);
      }

      const { orqanix, vanilla } = evaluationCase.arms;
      if (
        orqanix.status === 'completed'
        && vanilla.status === 'completed'
        && typeof orqanix.resolvedModel === 'string'
        && typeof vanilla.resolvedModel === 'string'
        && modelIdentity(orqanix) === modelIdentity(vanilla)
      ) {
        category.comparison.pairedSuccessfulCount += 1;
        if (vanilla.elapsedMs > 0) ratios[evaluationCase.category].push(orqanix.elapsedMs / vanilla.elapsedMs);
      }
    }
  }

  for (const categoryId of CATEGORY_IDS) {
    const category = categories[categoryId];
    for (const armName of ARM_NAMES) {
      const latencies = latencySamples[categoryId][armName];
      category.latencyMs[armName] = {
        sampleCount: latencies.length,
        p50: percentile(latencies, 0.5),
        p95: percentile(latencies, 0.95),
      };
      const usages = usageSamples[categoryId][armName];
      category.usage[armName] = usages.length === 0 ? null : {
        sampleCount: usages.length,
        inputTokens: usages.reduce((sum, usage) => sum + usage.inputTokens, 0),
        outputTokens: usages.reduce((sum, usage) => sum + usage.outputTokens, 0),
        totalTokens: usages.reduce((sum, usage) => sum + usage.totalTokens, 0),
      };
    }
    category.comparison.latencyRatioSampleCount = ratios[categoryId].length;
    category.comparison.orqanixToVanillaLatencyRatioP50 = percentile(ratios[categoryId], 0.5);
  }

  return {
    durationSeconds,
    since: new Date(sinceMs).toISOString(),
    until: new Date(nowMs).toISOString(),
    runCount: included.length,
    caseCount: included.reduce((sum, record) => sum + record.cases.length, 0),
    categories,
  };
}

function latestArm(arm) {
  const evaluation = publicEvaluation(arm);
  return {
    status: arm.status,
    model: arm.model,
    ...(arm.resolvedModel === undefined ? {} : { resolvedModel: arm.resolvedModel }),
    endpoint: arm.endpoint,
    elapsedMs: arm.elapsedMs,
    evaluationVerdict: evaluation.verdict,
    evaluationKind: evaluationKind(evaluation),
    ...(evaluation.evaluationNotice === undefined ? {} : {
      originalEvaluationVerdict: evaluation.originalEvaluationVerdict,
      evaluationNotice: evaluation.evaluationNotice,
    }),
    ...(arm.evaluation.reason === undefined ? {} : { evaluationReason: arm.evaluation.reason }),
    ...(arm.error === undefined ? {} : { error: arm.error }),
    ...(arm.evaluation.criteriaResults === undefined ? {} : {
      criteriaResults: arm.evaluation.criteriaResults.map((item) => ({ ...item })),
    }),
    evidenceId: arm.outputRef ?? null,
    outputHash: arm.outputHash ?? null,
    usage: arm.usage === undefined ? null : { ...arm.usage },
  };
}

function latestSummary(record) {
  if (record === null) return null;
  return {
    runId: record.runId,
    slot: record.slot,
    finishedAt: record.finishedAt,
    runnerRevision: record.runnerRevision,
    cases: record.cases.map((evaluationCase) => ({
      category: evaluationCase.category,
      label: evaluationCase.label,
      templateId: evaluationCase.templateId,
      templateVersion: evaluationCase.templateVersion,
      seed: evaluationCase.seed,
      inputHash: evaluationCase.inputHash,
      prompt: evaluationCase.prompt,
      criteria: [...evaluationCase.criteria],
      arms: {
        orqanix: latestArm(evaluationCase.arms.orqanix),
        vanilla: latestArm(evaluationCase.arms.vanilla),
      },
    })),
  };
}

export function buildPublicSummary(records, { now = new Date() } = {}) {
  if (!Array.isArray(records)) throw new TypeError('records must be an array');
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  if (!Number.isFinite(nowMs)) throw new TypeError('now must be a valid date or ISO timestamp');

  const byRunId = new Map();
  for (const record of records) {
    const validation = validateAgentEvaluationRecord(record);
    if (!validation.valid) continue;
    const normalized = normalizeAgentEvaluationRecord(record);
    const finishedAt = Date.parse(normalized.finishedAt);
    if (finishedAt > nowMs || finishedAt < nowMs - (24 * 60 * 60 * 1000)) continue;
    const existing = byRunId.get(normalized.runId);
    if (!existing || Date.parse(existing.finishedAt) < finishedAt) byRunId.set(normalized.runId, normalized);
  }
  const retained = [...byRunId.values()].sort((left, right) => Date.parse(left.finishedAt) - Date.parse(right.finishedAt));
  const latest = retained.at(-1) ?? null;
  const latestFinishedMs = latest === null ? null : Date.parse(latest.finishedAt);
  const ageSeconds = latestFinishedMs === null ? null : Math.max(0, (nowMs - latestFinishedMs) / 1000);

  return {
    schemaVersion: SUMMARY_SCHEMA_VERSION,
    generatedAt: new Date(nowMs).toISOString(),
    windows: {
      '15m': summarizeWindow(retained, nowMs, 15 * 60),
      '3h': summarizeWindow(retained, nowMs, 3 * 60 * 60),
      '24h': summarizeWindow(retained, nowMs, 24 * 60 * 60),
    },
    freshness: {
      latestFinishedAt: latest?.finishedAt ?? null,
      ageSeconds,
      staleAfterSeconds: STALE_AFTER_SECONDS,
      status: latest === null ? 'unavailable' : ageSeconds > STALE_AFTER_SECONDS ? 'stale' : 'fresh',
    },
    latest: latestSummary(latest),
    history: retained.slice(-96).reverse().map(latestSummary),
  };
}
