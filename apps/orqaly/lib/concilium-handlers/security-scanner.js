/**
 * Concilium security scanner.
 *
 * Scans prompts and LLM outputs for jailbreak patterns, prompt injection,
 * and spam/repetition. Logs incidents to concilium_security_events.
 *
 * Called before evaluation (on input) and after evaluation (on output).
 */
import { createLogger } from '../../api/_lib/logger.js';

const log = createLogger('concilium-security');

// ── Pattern definitions ──────────────────────────────────────────

const JAILBREAK_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|prompts|rules)/i,
  /you\s+are\s+now\s+(DAN|evil|unrestricted|jailbroken)/i,
  /pretend\s+(you\s+are|to\s+be)\s+(a\s+)?(different|new|unrestricted)/i,
  /bypass\s+(your\s+)?(safety|content|moderation)\s+(filters?|rules?|guidelines?)/i,
  /disregard\s+(your\s+)?(system|safety|content)\s+(prompt|instructions|rules)/i,
  /\bDAN\s+mode\b/i,
  /developer\s+mode\s+(enabled|activated|on)/i,
  /act\s+as\s+if\s+(you\s+have\s+)?no\s+(restrictions|limitations|filters)/i,
];

const PROMPT_INJECTION_PATTERNS = [
  /\[SYSTEM\]/i,
  /<<\s*SYS\s*>>/i,
  /\bsystem\s*:\s*(you\s+are|ignore|override|forget)/i,
  /\buser\s*:\s*\[inject/i,
  /\bassistant\s*:\s*\[inject/i,
  /override\s+system\s+prompt/i,
  /new\s+system\s+prompt\s*:/i,
  /\b(BEGIN|START)\s+INJECTION\b/i,
];

const SPAM_INDICATORS = {
  maxRepetitionRatio: 0.7,    // >70% of content is repeated phrases
  minContentLength: 5,         // Minimum meaningful content length
  maxIdenticalLines: 10,       // Max identical consecutive lines
};

// ── Public API ───────────────────────────────────────────────────

/**
 * Scan input content for security threats before evaluation.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {object} opts
 * @param {string} opts.content - The content to scan
 * @param {string} [opts.boardId] - Board ID for logging
 * @param {string} [opts.userId] - User ID for logging
 * @param {string} [opts.sourceIp] - Request source IP
 * @param {import('http').IncomingMessage} [opts.req]
 * @returns {Promise<{ safe: boolean, threats: Array<{ type: string, severity: string, detail: string }> }>}
 */
export async function scanInput(admin, { content, boardId, userId, sourceIp, req }) {
  if (!content || typeof content !== 'string') {
    return { safe: true, threats: [] };
  }

  const threats = [];

  // Check jailbreak patterns
  for (const pattern of JAILBREAK_PATTERNS) {
    if (pattern.test(content)) {
      threats.push({
        type: 'jailbreak_attempt',
        severity: 'high',
        detail: `Jailbreak pattern detected: ${pattern.source.slice(0, 50)}`,
      });
      break; // One jailbreak match is enough
    }
  }

  // Check prompt injection
  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    if (pattern.test(content)) {
      threats.push({
        type: 'prompt_injection',
        severity: 'critical',
        detail: `Prompt injection pattern detected: ${pattern.source.slice(0, 50)}`,
      });
      break;
    }
  }

  // Check spam/repetition
  const spamResult = detectSpam(content);
  if (spamResult.isSpam) {
    threats.push({
      type: 'spam_detected',
      severity: 'medium',
      detail: spamResult.reason,
    });
  }

  // Log threats to security events table
  if (threats.length > 0) {
    await logSecurityEvents(admin, threats, { boardId, userId, sourceIp, req });
  }

  return {
    safe: threats.length === 0,
    threats,
  };
}

/**
 * Scan LLM output for suspicious patterns (post-evaluation check).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {object} opts
 * @param {string} opts.content - LLM output to scan
 * @param {string} [opts.boardId]
 * @param {string} [opts.memberId]
 * @param {string} [opts.userId]
 * @param {import('http').IncomingMessage} [opts.req]
 * @returns {Promise<{ safe: boolean, threats: Array<{ type: string, severity: string, detail: string }> }>}
 */
export async function scanOutput(admin, { content, boardId, memberId, userId, req }) {
  if (!content || typeof content !== 'string') {
    return { safe: true, threats: [] };
  }

  const threats = [];

  // Check if LLM was jailbroken (output contains harmful patterns)
  for (const pattern of JAILBREAK_PATTERNS) {
    if (pattern.test(content)) {
      threats.push({
        type: 'suspicious_pattern',
        severity: 'high',
        detail: `LLM output contains jailbreak language: ${pattern.source.slice(0, 50)}`,
      });
      break;
    }
  }

  if (threats.length > 0) {
    await logSecurityEvents(admin, threats, { boardId, memberId, userId, req });
  }

  return {
    safe: threats.length === 0,
    threats,
  };
}

/**
 * Detect collusion between member responses (responses that are
 * suspiciously similar from different models).
 *
 * @param {Array<{ memberId: string, provider: string, content: string }>} responses
 * @returns {{ detected: boolean, pairs: Array<{ a: string, b: string, similarity: number }> }}
 */
export function detectCollusion(responses) {
  if (!responses || responses.length < 2) {
    return { detected: false, pairs: [] };
  }

  const SIMILARITY_THRESHOLD = 0.92;
  const pairs = [];

  for (let i = 0; i < responses.length; i++) {
    for (let j = i + 1; j < responses.length; j++) {
      const a = responses[i];
      const b = responses[j];

      // Only flag cross-provider collusion (same provider may produce similar outputs)
      if (a.provider === b.provider) continue;

      const similarity = computeSimilarity(a.content, b.content);
      if (similarity >= SIMILARITY_THRESHOLD) {
        pairs.push({
          a: a.memberId,
          b: b.memberId,
          similarity: Math.round(similarity * 100) / 100,
        });
      }
    }
  }

  return {
    detected: pairs.length > 0,
    pairs,
  };
}

// ── Internal helpers ─────────────────────────────────────────────

/**
 * Simple spam detection based on repetition analysis.
 */
function detectSpam(content) {
  if (content.length < SPAM_INDICATORS.minContentLength) {
    return { isSpam: true, reason: 'Content too short for meaningful evaluation' };
  }

  // Check consecutive identical lines
  const lines = content.split('\n');
  let consecutiveCount = 1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === lines[i - 1].trim() && lines[i].trim().length > 0) {
      consecutiveCount++;
      if (consecutiveCount >= SPAM_INDICATORS.maxIdenticalLines) {
        return { isSpam: true, reason: `${consecutiveCount} consecutive identical lines detected` };
      }
    } else {
      consecutiveCount = 1;
    }
  }

  // Check repetition ratio (trigram-based)
  const words = content.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length >= 20) {
    const trigrams = new Set();
    let total = 0;
    let unique = 0;
    for (let i = 0; i <= words.length - 3; i++) {
      const trigram = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
      total++;
      if (!trigrams.has(trigram)) {
        unique++;
        trigrams.add(trigram);
      }
    }
    const uniqueRatio = total > 0 ? unique / total : 1;
    if (uniqueRatio < (1 - SPAM_INDICATORS.maxRepetitionRatio)) {
      return { isSpam: true, reason: `High repetition ratio: ${Math.round((1 - uniqueRatio) * 100)}% repeated content` };
    }
  }

  return { isSpam: false, reason: '' };
}

/**
 * Compute Jaccard similarity between two text strings (word-level).
 * Returns 0.0 (no overlap) to 1.0 (identical).
 */
function computeSimilarity(textA, textB) {
  if (!textA || !textB) return 0;

  const wordsA = new Set(textA.toLowerCase().split(/\s+/).filter(Boolean));
  const wordsB = new Set(textB.toLowerCase().split(/\s+/).filter(Boolean));

  if (wordsA.size === 0 && wordsB.size === 0) return 1;
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) intersection++;
  }

  const union = wordsA.size + wordsB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * Log detected threats to the concilium_security_events table.
 */
async function logSecurityEvents(admin, threats, { boardId, memberId, userId, sourceIp, req }) {
  const rows = threats.map((t) => ({
    user_id: userId || null,
    board_id: boardId || null,
    member_id: memberId || null,
    event_type: t.type,
    severity: t.severity,
    description: t.detail,
    source_ip: sourceIp || null,
    detection_method: 'regex',
    auto_action_taken: t.severity === 'critical' ? 'quarantine' : 'log_only',
    human_review_required: t.severity === 'critical' || t.severity === 'high',
  }));

  const { error } = await admin.from('concilium_security_events').insert(rows);
  if (error) {
    log.warn(req, 'security_event.insert.error', { error: error.message, count: rows.length });
  }
}
