/**
 * Skill content validation — defends against prompt-injection in user-authored
 * and imported skills before they are concatenated into an agent system prompt.
 *
 * Pure module. No I/O. Call from every create/update/import path.
 */

export const MAX_SKILL_CONTENT_LENGTH = 5000;
export const MAX_SKILL_NAME_LENGTH = 120;
export const MAX_SKILL_DESCRIPTION_LENGTH = 500;

/**
 * Phrases known to be used for prompt-injection. Matched case-insensitively.
 * The list is data, not hard-coded logic, so it grows as we see new attacks.
 * Each entry: { id, pattern (RegExp), reason }.
 */
export const INJECTION_PATTERNS = [
  { id: 'ignore-previous', pattern: /\bignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|rules?|directives?)\b/i, reason: 'Attempts to override prior instructions' },
  { id: 'disregard-instructions', pattern: /\bdisregard\s+(all\s+)?(previous|prior|your|the)\s+(instructions?|prompts?|rules?)\b/i, reason: 'Attempts to discard prior instructions' },
  { id: 'forget-instructions', pattern: /\bforget\s+(everything|all|what|your)\s+(above|previous|prior|you\s+(were\s+)?told|instructions?)\b/i, reason: 'Attempts to make the model forget prior instructions' },
  { id: 'you-are-now', pattern: /\byou\s+are\s+now\s+(?!part\s+of|assisting|helping|in\s+(a\s+)?(conversation|chat|discussion))/i, reason: 'Attempts to redefine agent identity' },
  { id: 'new-role', pattern: /\byour\s+new\s+(role|identity|persona|purpose|instructions?)\b/i, reason: 'Attempts to reassign agent role' },
  { id: 'act-as', pattern: /\bact\s+as\s+(a\s+)?(different|new|dan|jailbroken|unrestricted)\b/i, reason: 'Classic jailbreak phrasing' },
  { id: 'system-prefix', pattern: /^\s*system\s*:\s*/im, reason: 'Fakes a system-role message' },
  { id: 'assistant-prefix', pattern: /^\s*assistant\s*:\s*/im, reason: 'Fakes an assistant-role message' },
  { id: 'reveal-prompt', pattern: /\b(reveal|show|print|output|tell\s+me|repeat)\s+(your|the|me\s+the)\s+(system\s+)?(prompt|instructions?|rules|directives)\b/i, reason: 'Attempts to exfiltrate the system prompt' },
  { id: 'break-closing-tag', pattern: /<\/\s*skill\s*>/i, reason: 'Closes the skill sandbox early' },
  { id: 'special-token', pattern: /<\|[^|]{1,40}\|>/i, reason: 'Embeds model special tokens' },
  { id: 'skill-open-tag', pattern: /<\s*skill(\s|>)/i, reason: 'Opens a new sandbox block' },
  { id: 'developer-mode', pattern: /\b(developer|admin|root|god)\s+mode\b/i, reason: 'Jailbreak role escalation' },
  { id: 'tool-exec-verb', pattern: /\b(execute|run)\W+(shell|bash|os\.system|rm\s+-rf|sudo)\b/i, reason: 'Attempts to trigger shell execution' },
  { id: 'shell-danger', pattern: /\b(sudo|rm\s+-rf|os\.system|subprocess\.|eval\s*\()/i, reason: 'Contains dangerous shell / code-exec tokens' },
];

/**
 * @param {string} content
 * @returns {{ ok: true } | { ok: false, reason: string, rule: string, excerpt?: string }}
 */
export function validateSkillContent(content) {
  if (typeof content !== 'string') {
    return { ok: false, reason: 'Content must be a string', rule: 'type' };
  }
  const trimmed = content.trim();
  if (!trimmed) {
    return { ok: false, reason: 'Content cannot be empty', rule: 'empty' };
  }
  if (content.length > MAX_SKILL_CONTENT_LENGTH) {
    return { ok: false, reason: `Content exceeds ${MAX_SKILL_CONTENT_LENGTH} characters (got ${content.length})`, rule: 'length' };
  }
  for (const { id, pattern, reason } of INJECTION_PATTERNS) {
    const m = pattern.exec(content);
    if (m) {
      const idx = m.index ?? 0;
      const excerpt = content.slice(Math.max(0, idx - 20), Math.min(content.length, idx + m[0].length + 20));
      return { ok: false, reason, rule: id, excerpt };
    }
  }
  return { ok: true };
}

/**
 * @param {string} name
 * @returns {{ ok: true } | { ok: false, reason: string, rule: string }}
 */
export function validateSkillName(name) {
  if (typeof name !== 'string' || !name.trim()) {
    return { ok: false, reason: 'Name is required', rule: 'name-empty' };
  }
  if (name.length > MAX_SKILL_NAME_LENGTH) {
    return { ok: false, reason: `Name exceeds ${MAX_SKILL_NAME_LENGTH} characters`, rule: 'name-length' };
  }
  return { ok: true };
}

/**
 * @param {string|undefined} description
 * @returns {{ ok: true } | { ok: false, reason: string, rule: string }}
 */
export function validateSkillDescription(description) {
  if (description == null) return { ok: true };
  if (typeof description !== 'string') {
    return { ok: false, reason: 'Description must be a string', rule: 'desc-type' };
  }
  if (description.length > MAX_SKILL_DESCRIPTION_LENGTH) {
    return { ok: false, reason: `Description exceeds ${MAX_SKILL_DESCRIPTION_LENGTH} characters`, rule: 'desc-length' };
  }
  return { ok: true };
}

/**
 * Runs all validators in order. Returns the first failure or ok.
 * @param {{ name?: string, description?: string, content?: string }} skill
 */
export function validateSkill(skill) {
  const name = validateSkillName(skill?.name);
  if (!name.ok) return name;
  const desc = validateSkillDescription(skill?.description);
  if (!desc.ok) return desc;
  const content = validateSkillContent(skill?.content);
  if (!content.ok) return content;
  return { ok: true };
}

export const VALIDATOR_VERSION = 'v1';

/**
 * Build the persisted scan_report JSONB for a skill's content.
 * Shape matches the `agent_skill_packs.scan_report` column.
 * Optional `forge` summary is merged in for Forge-generated skills.
 *
 * @param {string} content
 * @param {{ red_team_safe?: number, red_team_total?: number, behaviour_pass?: number, behaviour_total?: number }} [forgeSummary]
 * @returns {{ at: string, validator_version: string, passed: boolean, rule: string|null, excerpt: string|null, forge?: object }}
 */
export function buildScanReport(content, forgeSummary) {
  const v = validateSkillContent(content);
  const base = {
    at: new Date().toISOString(),
    validator_version: VALIDATOR_VERSION,
    passed: v.ok === true,
    rule: v.ok ? null : (v.rule || null),
    excerpt: v.ok ? null : (v.excerpt || null),
  };
  if (forgeSummary && typeof forgeSummary === 'object') {
    base.forge = {
      red_team_safe: forgeSummary.red_team_safe ?? null,
      red_team_total: forgeSummary.red_team_total ?? null,
      behaviour_pass: forgeSummary.behaviour_pass ?? null,
      behaviour_total: forgeSummary.behaviour_total ?? null,
    };
  }
  return base;
}
