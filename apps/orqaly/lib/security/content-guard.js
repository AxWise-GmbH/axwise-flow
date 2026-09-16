/**
 * Single entry point for user-content safety at API boundaries.
 * Composes unicode sanitizer + malware scanner + prompt-injection detector.
 *
 *   const { cleaned, severity, action, flags } = guardUserContent(text, { context });
 *
 *   action='allow' → proceed
 *   action='warn'  → proceed with `cleaned` text, log SECURITY_WARNED
 *   action='block' → return HTTP 400, log SECURITY_BLOCKED, do not proceed
 *
 * Feature flag: SECURITY_GUARD_ENFORCE=false downgrades every `block` → `warn`.
 * Lets us ship in log-only mode, watch audit_log for a week, then flip on.
 */
import { sanitizeText, severityOfFlag as uniSev } from './input-sanitizer.js';
import { scanMalwarePatterns, severityOfFlag as malSev } from './malware-patterns.js';
import { detectPromptInjection, severityOfFlag as injSev } from './prompt-injection-detector.js';

const ORDER = { none: 0, low: 1, medium: 2, high: 3 };

function severityOfAny(flag) {
  return uniSev(flag) || malSev(flag) || injSev(flag) || 'low';
}

function worstSeverity(flags) {
  let worst = 'none';
  for (const f of flags) {
    const s = severityOfAny(f);
    if (ORDER[s] > ORDER[worst]) worst = s;
  }
  return worst;
}

export function shouldEnforce() {
  return process.env.SECURITY_GUARD_ENFORCE !== 'false';
}

function decideAction(severity, enforce) {
  if (severity === 'high') return enforce ? 'block' : 'warn';
  if (severity === 'medium') return 'warn';
  if (severity === 'low') return 'allow'; // logged but not user-facing
  return 'allow';
}

/**
 * @param {string} raw
 * @param {{ context?: string, maxLength?: number, enforce?: boolean }} [opts]
 * @returns {{ cleaned: string, severity: 'none'|'low'|'medium'|'high', action: 'allow'|'warn'|'block', flags: string[] }}
 */
export function guardUserContent(raw, { context, maxLength, enforce = shouldEnforce() } = {}) {
  const san = sanitizeText(raw, maxLength ? { maxLength } : undefined);
  const mal = scanMalwarePatterns(san.cleaned);
  const inj = detectPromptInjection(san.cleaned);

  const flags = [...san.flags, ...mal.matches, ...inj.matches];
  const severity = worstSeverity(flags);
  const action = decideAction(severity, enforce);

  return { cleaned: san.cleaned, severity, action, flags, context };
}

/**
 * Small helper for handlers to return a 400 with a consistent shape when
 * content-guard says block.
 */
export function blockedResponse(res, guardResult, message = 'Content blocked by security review') {
  return res.status(400).json({
    success: false,
    error: message,
    securityBlocked: true,
    severity: guardResult.severity,
    flags: guardResult.flags,
  });
}
