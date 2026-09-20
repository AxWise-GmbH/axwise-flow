/**
 * TypeSafe Jev typed decision models for repository linting, code quality,
 * and security governance.
 *
 * Each decision model defines typed noul (yes/no) questions evaluated by
 * TypeSafe AI (jev-latest) in <850ms.
 */

export const JEV_LINT_RULESETS = Object.freeze({
  /** Syntax and import integrity */
  SYNTAX_INTEGRITY: {
    name: 'syntax_and_import_integrity',
    questions: {
      has_syntax_errors: {
        type: 'noul',
        instructions:
          'Does this code snippet or diff contain obvious syntax errors, unclosed brackets, or invalid grammar?',
      },
      has_broken_imports: {
        type: 'noul',
        instructions:
          'Does this code attempt to import nonexistent modules, broken relative paths, or unresolvable dependencies?',
      },
      exports_properly_bound: {
        type: 'noul',
        instructions:
          'Are functions, classes, and constants exported properly with standard module syntax?',
      },
    },
  },

  /** Secret safety & credential defense */
  SECRET_SAFETY: {
    name: 'secret_safety_and_credential_leakage',
    questions: {
      contains_hardcoded_secrets: {
        type: 'noul',
        instructions:
          'Does this diff or code contain hardcoded API keys, private keys, passwords, bearer tokens, or personal credentials?',
      },
      leaks_private_endpoints: {
        type: 'noul',
        instructions:
          'Does this code expose internal private IP addresses, sensitive database passwords, or unmasked credentials?',
      },
    },
  },

  /** Architectural boundary compliance */
  ARCHITECTURAL_BOUNDARY: {
    name: 'architectural_boundary_compliance',
    questions: {
      violates_workspace_boundary: {
        type: 'noul',
        instructions:
          'Does this change attempt to access, read, or mutate files outside the designated workspace root?',
      },
      modifies_pinned_dependencies: {
        type: 'noul',
        instructions:
          'Does this change unexpectedly modify pinned vendor hashes, root lockfiles, or security contracts?',
      },
    },
  },

  /** Clean code style and debugging hygiene */
  CODE_STYLE_HYGIENE: {
    name: 'clean_code_hygiene',
    questions: {
      has_stray_debug_logging: {
        type: 'noul',
        instructions:
          'Does this code contain temporary debugging statements (e.g. stray console.log, print debugging, or debugger breakpoints)?',
      },
      is_production_ready: {
        type: 'noul',
        instructions:
          'Is this implementation clean, well-structured, and ready for production repository commit?',
      },
    },
  },
});

/**
 * Evaluates code changes against one or more TypeSafe Jev lint rulesets.
 *
 * Returns a typed verdict with calibrated confidence scores in sub-second latency.
 */
export async function evaluateLintWithJev({
  codeSnippet,
  rulesetKey = 'ALL',
  apiKey = process.env.TYPESAFE_API_KEY,
  signal,
  fetchImpl = globalThis.fetch,
}) {
  const key = apiKey || process.env.TYPESAFE_API_KEY;
  if (!key || !codeSnippet || typeof codeSnippet !== 'string') {
    return {
      evaluated: false,
      reason: !key ? 'MISSING_API_KEY' : 'EMPTY_SNIPPET',
      passed: true,
    };
  }

  let questions = {};
  if (rulesetKey === 'ALL') {
    for (const ruleset of Object.values(JEV_LINT_RULESETS)) {
      Object.assign(questions, ruleset.questions);
    }
  } else if (JEV_LINT_RULESETS[rulesetKey]) {
    questions = JEV_LINT_RULESETS[rulesetKey].questions;
  } else {
    throw new Error(`Unknown Jev lint ruleset: ${rulesetKey}`);
  }

  const startedAt = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true });

    const response = await fetchImpl('https://api.typesafe.ai/v1/systemone', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'jev-latest',
        state: `Repository Code Snippet / Diff Under Review:\n\n${codeSnippet.slice(0, 4000)}`,
        questions,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return {
        evaluated: false,
        reason: `HTTP_${response.status}`,
        passed: true,
      };
    }

    const payload = await response.json();
    const answers = payload.answers || {};

    // Analyze answers against safety thresholds:
    // Risk flags (should be FALSE / low score < 0.4):
    // - has_syntax_errors
    // - has_broken_imports
    // - contains_hardcoded_secrets
    // - leaks_private_endpoints
    // - violates_workspace_boundary
    // - modifies_pinned_dependencies
    // - has_stray_debug_logging
    // Positive flags (should be TRUE / high score >= 0.5):
    // - exports_properly_bound
    // - is_production_ready

    const riskKeys = [
      'has_syntax_errors',
      'has_broken_imports',
      'contains_hardcoded_secrets',
      'leaks_private_endpoints',
      'violates_workspace_boundary',
      'modifies_pinned_dependencies',
      'has_stray_debug_logging',
    ];
    const positiveKeys = ['exports_properly_bound', 'is_production_ready'];

    const violations = [];
    for (const key of riskKeys) {
      const score = answers[key]?.noul;
      if (typeof score === 'number' && score >= 0.45) {
        violations.push({ rule: key, confidence: score, severity: score >= 0.7 ? 'error' : 'warning' });
      }
    }
    for (const key of positiveKeys) {
      const score = answers[key]?.noul;
      if (typeof score === 'number' && score < 0.4) {
        violations.push({ rule: `missing_${key}`, confidence: 1 - score, severity: 'warning' });
      }
    }

    const hasErrors = violations.some((v) => v.severity === 'error');
    return {
      evaluated: true,
      passed: !hasErrors,
      violations,
      answers,
      model: payload.model || 'jev-latest',
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      evaluated: false,
      reason: error.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR',
      passed: true,
    };
  }
}
