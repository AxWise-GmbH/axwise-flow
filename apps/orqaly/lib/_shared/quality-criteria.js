/**
 * Quality criteria helper — load and format the criteria docs that get
 * injected into PM and execute-phase agent prompts.
 *
 * Criteria are stored as knowledge_documents rows with category='quality_criteria'
 * and metadata.deliverable_type. There's exactly one row per deliverable type.
 *
 * The criteria are written by the calibration stage (lib/goal-handlers/stages/library-calibration.js)
 * after the user walks through the wizard. They're consumed by pm-planning.js
 * and execute-phase.js to give agents library-aligned standards upfront.
 */

const DELIVERABLE_TYPES = [
  'landing_page',
  'presentation',
  'smm_banner',
  'document_template',
  'table_structure',
  'code',
  'nda',
];

const TYPE_LABELS = {
  landing_page: 'Landing pages',
  presentation: 'Presentations',
  smm_banner: 'Banners and social media images',
  document_template: 'Documents and templates',
  table_structure: 'Tables and structured data',
  code: 'Code and starter projects',
  nda: 'NDAs and legal documents',
};

// Module-level cache: criteria don't change mid-request, and are loaded
// many times per goal (PM + every execute-phase agent). Each tenant scope has
// its own entry; sharing one process-wide value would leak one user's criteria
// into another user's prompts on a warm serverless instance.
const _cacheByScope = new Map();
const CACHE_TTL_MS = 60 * 1000; // 1 minute

function normalizedScope({ userId, organizationId = null } = {}) {
  const owner = typeof userId === 'string' ? userId.trim() : '';
  if (!owner) return null;
  return { userId: owner, organizationId: organizationId || null };
}

function scopeKey(scope) {
  return `${scope.userId}:${scope.organizationId || 'personal'}`;
}

function emptyCriteria() {
  return Object.fromEntries(DELIVERABLE_TYPES.map((type) => [type, null]));
}

/**
 * Load all 6 quality_criteria rows. Returns a map keyed by deliverable_type
 * with the body text as value. Missing types resolve to null.
 *
 * @param {object} admin - Supabase client
 * @param {{ userId: string, organizationId?: string|null }} scope
 * @returns {Promise<{ [deliverableType: string]: string|null }>}
 */
export async function loadAllCriteria(admin, scopeInput = {}) {
  const scope = normalizedScope(scopeInput);
  if (!scope) return emptyCriteria();

  const key = scopeKey(scope);
  const cached = _cacheByScope.get(key);
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
    return cached.criteria;
  }

  let query = admin
    .from('knowledge_documents')
    .select('content, metadata')
    .eq('category', 'quality_criteria')
    .eq('user_id', scope.userId);
  query = scope.organizationId
    ? query.eq('organization_id', scope.organizationId)
    : query.is('organization_id', null);
  const { data, error } = await query;

  if (error) {
    return emptyCriteria();
  }

  const map = emptyCriteria();
  for (const row of data || []) {
    const t = row.metadata?.deliverable_type;
    if (t && DELIVERABLE_TYPES.includes(t)) {
      map[t] = row.content || null;
    }
  }

  _cacheByScope.set(key, { criteria: map, loadedAt: Date.now() });
  return map;
}

/**
 * Format the criteria map as a markdown block for prompt injection.
 * Returns null if no criteria exist (calibration hasn't run yet).
 */
export function formatCriteriaForPrompt(criteriaMap) {
  if (!criteriaMap) return null;

  const sections = [];
  for (const type of DELIVERABLE_TYPES) {
    const text = criteriaMap[type];
    if (!text) continue;
    sections.push(`### ${TYPE_LABELS[type]}\n${text.trim()}`);
  }

  if (sections.length === 0) return null;

  return [
    '## Quality Standards (mandatory — every deliverable you produce is measured against these)',
    '',
    'These standards were extracted from a curated library of best-in-class examples',
    'and refined with human feedback. Treat them as hard requirements, not suggestions.',
    '',
    sections.join('\n\n'),
  ].join('\n');
}

/**
 * Convenience: load and format in one call. Returns the markdown block or null.
 */
export async function loadAndFormatCriteria(admin, scope) {
  const map = await loadAllCriteria(admin, scope);
  return formatCriteriaForPrompt(map);
}

/**
 * Force-clear the cache. Useful right after calibration writes new criteria
 * so the next pm-planning call picks them up immediately.
 */
export function clearCriteriaCache(scopeInput = null) {
  if (!scopeInput) {
    _cacheByScope.clear();
    return;
  }
  const scope = normalizedScope(scopeInput);
  if (scope) _cacheByScope.delete(scopeKey(scope));
}

export { DELIVERABLE_TYPES, TYPE_LABELS };
