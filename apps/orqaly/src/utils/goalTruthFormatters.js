export function normalizeOsjaReviewItem(item) {
  const row = item && typeof item === 'object' ? item : {};
  const changes = row.what_to_change || row.actionable_feedback || row.weaknesses || [];
  const rawVerdict = typeof row.verdict === 'string' ? row.verdict.trim().toLowerCase() : '';
  return {
    ...row,
    verdict: rawVerdict === 'keep' || rawVerdict === 'upgrade' ? rawVerdict : null,
    reasoning:
      row.reasoning ||
      row.summary ||
      row.explanation ||
      row.thought_process ||
      'No summary provided.',
    what_to_change: (Array.isArray(changes) ? changes : [changes]).filter(Boolean),
    alternative_mcps: Array.isArray(row.alternative_mcps) ? row.alternative_mcps : [],
  };
}

const INCOMPLETE_OSJA_STATUSES = new Set([
  'review_incomplete',
  'review_failed',
  'incomplete',
  'invalid',
]);

function finiteNonNegativeCount(value) {
  if (value == null || value === '') return null;
  const count = Number(value);
  return Number.isFinite(count) && count >= 0 ? Math.floor(count) : null;
}

/**
 * Derive the trust state shown by the Osja report UI. A report is incomplete
 * when either the aggregate state says so or any persisted item explicitly
 * failed schema validation. Incomplete reports never expose an aggregate grade
 * as if it represented all attempted reviews.
 */
export function getOsjaReviewDisplayState(review) {
  const report = review && typeof review === 'object' ? review : {};
  const rows = Array.isArray(report.reviews) ? report.reviews : [];
  const attemptedCount =
    finiteNonNegativeCount(report.review_count ?? report.attempted_review_count) ?? rows.length;
  const itemInvalidCount = rows.filter((row) => row?.review_validated === false).length;
  const reportedInvalidCountValue = finiteNonNegativeCount(
    report.invalid_review_count ?? report.invalid_count
  );
  const reportedInvalidCount = reportedInvalidCountValue ?? 0;
  const invalidCount = Math.max(itemInvalidCount, reportedInvalidCount);
  const status = String(report.status || report.quality_status || '')
    .trim()
    .toLowerCase();
  const rawGrade = report.overall_grade;
  const numericGrade = rawGrade == null || rawGrade === '' ? null : Number(rawGrade);
  const hasGrade = Number.isFinite(numericGrade) && numericGrade >= 0 && numericGrade <= 100;
  const reportedValidatedCount = finiteNonNegativeCount(
    report.validated_review_count ?? report.validated_count
  );
  const schemaVersion = Number(report.schema_version || 0);
  const hasPerItemValidationAccounting =
    rows.length === attemptedCount &&
    rows.every((row) => typeof row?.review_validated === 'boolean');
  const missingValidationAccounting =
    schemaVersion >= 2 &&
    attemptedCount > 0 &&
    reportedValidatedCount == null &&
    reportedInvalidCountValue == null &&
    !hasPerItemValidationAccounting;
  const incomplete =
    INCOMPLETE_OSJA_STATUSES.has(status) ||
    invalidCount > 0 ||
    !hasGrade ||
    missingValidationAccounting;
  const explicitValidatedCount = rows.filter((row) => row?.review_validated === true).length;
  const validatedCount =
    reportedValidatedCount ??
    (explicitValidatedCount > 0
      ? explicitValidatedCount
      : Math.max(0, attemptedCount - invalidCount));

  return {
    status,
    incomplete,
    attemptedCount,
    validatedCount: Math.min(attemptedCount, validatedCount),
    invalidCount,
    overallGrade: incomplete || !hasGrade ? null : numericGrade,
  };
}

/**
 * Resolve the badge/score state for one review item. New incomplete reports
 * must positively validate each row; legacy complete reports without the flag
 * may still show their canonical keep/upgrade verdict.
 */
export function getOsjaReviewItemDisplayState(item, { reportIncomplete = false } = {}) {
  const row = normalizeOsjaReviewItem(item);
  const hasCanonicalVerdict = row.verdict === 'keep' || row.verdict === 'upgrade';
  const valid =
    row.review_validated !== false &&
    hasCanonicalVerdict &&
    (!reportIncomplete || row.review_validated === true);
  const numericScore = row.score == null || row.score === '' ? null : Number(row.score);

  return {
    valid,
    verdict: valid ? row.verdict : null,
    score:
      valid && Number.isFinite(numericScore) && numericScore >= 0 && numericScore <= 100
        ? numericScore
        : null,
  };
}

export function getGoalQualityReviewNotice(qualityReview) {
  if (!qualityReview || typeof qualityReview !== 'object') return null;
  const status = String(qualityReview?.status || '')
    .trim()
    .toLowerCase();
  if (getOsjaReviewDisplayState(qualityReview).incomplete) {
    return {
      label: 'Quality review: incomplete',
      color: 'error',
      tooltip:
        'Execution finished, but one or more artifact reviews could not be validated. Re-run the quality review before relying on its grade or verdicts.',
    };
  }
  if (status === 'needs_revision') {
    return {
      label: 'Quality review: needs revision',
      color: 'warning',
      tooltip: 'Execution finished, but the independent artifact review found changes to make.',
    };
  }
  return null;
}

/** Return a normalized HTTPS URL, or null for unsafe/invalid alternatives. */
export function getSafeHttpsUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

export function formatStructuredValue(value) {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  if (typeof value !== 'object') return String(value);

  const main = value.test || value.text || value.description || value.title || value.name;
  if (!main) return JSON.stringify(value);
  const phase = value.phase != null ? `Phase ${value.phase}` : null;
  const type = value.type ? String(value.type).replaceAll('_', ' ') : null;
  return [phase ? `[${phase}]` : null, String(main), type ? `(${type})` : null]
    .filter(Boolean)
    .join(' ');
}

function formatList(values) {
  return (Array.isArray(values) ? values : [values])
    .map(formatStructuredValue)
    .filter(Boolean)
    .map((value) => `  • ${value}`)
    .join('\n');
}

export function formatTechDoc(techDoc) {
  if (!techDoc) return '';
  const lines = [];
  if (techDoc.objective) lines.push(`Objective:\n${techDoc.objective}`);
  if (techDoc.required_capabilities?.length) {
    lines.push(`\nRequired Capabilities:\n${formatList(techDoc.required_capabilities)}`);
  }
  if (techDoc.required_tools?.length) {
    lines.push(`\nTools Required:\n${formatList(techDoc.required_tools)}`);
  }
  if (techDoc.acceptance_tests?.length) {
    lines.push(`\nAcceptance Criteria:\n${formatList(techDoc.acceptance_tests)}`);
  }
  if (techDoc.requirements?.length) {
    lines.push(`\nRequirements:\n${formatList(techDoc.requirements)}`);
  }
  if (techDoc.constraints?.length) {
    lines.push(`\nConstraints:\n${formatList(techDoc.constraints)}`);
  }
  if (techDoc.complexity) lines.push(`\nComplexity: ${techDoc.complexity}`);
  if (techDoc.estimated_hours) lines.push(`Estimated Hours: ${techDoc.estimated_hours}h`);
  return lines.join('\n') || JSON.stringify(techDoc, null, 2);
}
