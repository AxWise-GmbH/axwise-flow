/**
 * Heuristic detector for prompt-injection / jailbreak attempts in user text.
 *
 * Two tiers:
 *  - HIGH   (block): exact known jailbreak phrases, ChatML role smuggling
 *  - MEDIUM (warn):  suspicious roleplay patterns, fake-system-prompt markdown
 *
 * Pure pattern matching — no LLM calls, no network. Fast enough to run on
 * every user message. False positives are expected on edge cases; caller
 * can downgrade via feature flag.
 *
 * Returns { severity: 'none'|'medium'|'high', matches: ['injection:*'] }.
 */

// ── HIGH severity: known jailbreak / exfil phrases ──────────────────────────
// Case- and whitespace-insensitive. Only fire when the phrase is clearly
// imperative (at the start of input OR after a period / colon / line break).

const HIGH_PATTERNS = [
  {
    id: 'injection:ignore-previous',
    re: /(?:^|[.!?\n:;]\s*)\s*ignore\s+(?:(?:all|the|any|your)\s+){0,3}(?:previous|above|prior|earlier|former)\s+(?:instructions?|prompts?|rules?|messages?|context)/i,
  },
  {
    id: 'injection:disregard-previous',
    re: /(?:^|[.!?\n:;]\s*)\s*disregard\s+(?:(?:all|the|any|your)\s+){0,3}(?:previous|above|prior|system|earlier)/i,
  },
  {
    id: 'injection:forget-previous',
    re: /(?:^|[.!?\n:;]\s*)\s*forget\s+(?:(?:all|the|any|your)\s+){0,3}(?:previous|above|prior|prior\s+instructions?|system\s+prompt)/i,
  },
  {
    id: 'injection:dan-persona',
    re: /\byou\s+are\s+(?:now\s+|actually\s+)?(?:DAN|dan\b|developer\s+mode|unrestricted|jailbroken|unfiltered)/i,
  },
  {
    id: 'injection:dev-mode',
    re: /\b(?:enable|activate|enter)\s+(?:developer\s+mode|dev\s+mode|jailbreak\s+mode|god\s+mode)/i,
  },
  {
    id: 'injection:reveal-system-prompt',
    re: /\b(?:print|show|reveal|display|output|reproduce|repeat)\s+(?:your\s+|the\s+)?(?:system\s+prompt|initial\s+(?:instructions|prompt)|hidden\s+prompt|original\s+(?:instructions|prompt))/i,
  },
  {
    id: 'injection:chatml-smuggle',
    re: /<\|im_(?:start|end)\|>|<\|system\|>|<\|assistant\|>|<\|user\|>/i,
  },
  {
    id: 'injection:fake-system-tag',
    // [[SYSTEM]] or [SYSTEM] or SYSTEM: at the start of a line
    re: /(?:^|\n)\s*\[?\[?SYSTEM\]?\]?\s*[:\n]/,
  },
  {
    id: 'injection:begin-jailbreak',
    re: /\bBEGIN\s+(?:JAILBREAK|UNRESTRICTED|DEVMODE)|DEVMODE\s+ENABLED\b/i,
  },
  {
    id: 'injection:role-override',
    re: /\bfrom\s+(?:now|this\s+point)\s+on[,\s]+you\s+(?:will|are|must|shall|should)\s+(?:act|behave|respond|pretend|ignore)/i,
  },
];

// ── MEDIUM severity: suspicious patterns ────────────────────────────────────

const MEDIUM_PATTERNS = [
  {
    id: 'injection:pretend-you-are',
    re: /\bpretend\s+(?:you\s+are|to\s+be)\s+(?:a|an|the)\s+\w+/i,
  },
  {
    id: 'injection:roleplay-as',
    re: /\broleplay\s+as\s+\w+/i,
  },
  {
    id: 'injection:new-rules-imperative',
    re: /(?:here\s+are|these\s+are)\s+(?:your\s+)?(?:new|updated)\s+(?:rules|instructions|guidelines|persona)/i,
  },
  {
    id: 'injection:paste-exfil-url',
    re: /\bhttps?:\/\/(?:pastebin\.com|hastebin\.com|gist\.github\.com|paste\.ee|rentry\.co|0x0\.st)\b/i,
  },
  {
    id: 'injection:fake-system-markdown',
    // 3+ hashes OR 3+ dashes on a line followed by imperative-looking SYSTEM/INSTRUCTION
    re: /\n\s*(?:#{3,}|-{3,}|={3,})\s*\n[^\n]*(?:SYSTEM|NEW\s+INSTRUCTIONS|OVERRIDE|PROMPT\s+INJECTION)/i,
  },
];

function stripFalsePositiveContext(text) {
  // Remove obvious quoted speech / code fences where false positives
  // most often appear. Conservative — we only strip inside triple-backtick
  // fences and single-line `code` spans.
  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`\n]{0,200}`/g, '');
}

/**
 * @param {string} text
 * @returns {{ severity: 'none'|'medium'|'high', matches: string[] }}
 */
export function detectPromptInjection(text) {
  if (!text || typeof text !== 'string') return { severity: 'none', matches: [] };

  const scrubbed = stripFalsePositiveContext(text);
  const matches = [];
  let severity = 'none';

  for (const p of HIGH_PATTERNS) {
    if (p.re.test(scrubbed)) { matches.push(p.id); severity = 'high'; }
  }
  if (severity !== 'high') {
    for (const p of MEDIUM_PATTERNS) {
      if (p.re.test(scrubbed)) { matches.push(p.id); severity = 'medium'; }
    }
  } else {
    // Still record medium-tier matches for the audit record
    for (const p of MEDIUM_PATTERNS) {
      if (p.re.test(scrubbed)) matches.push(p.id);
    }
  }

  return { severity, matches };
}

/**
 * Severity of an individual injection flag.
 */
export function severityOfFlag(flag) {
  if (!flag.startsWith('injection:')) return null;
  // Map by id — medium-tier flags are explicitly enumerated
  const mediumIds = new Set(MEDIUM_PATTERNS.map((p) => p.id));
  return mediumIds.has(flag) ? 'medium' : 'high';
}
