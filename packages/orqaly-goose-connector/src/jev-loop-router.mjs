/**
 * TypeSafe Jev System One fast decision router for Goose conversation loops
 * and artifact safety evaluation (<350ms latency).
 *
 * Eliminates multi-second autoregressive reasoning overhead for intent triage,
 * capability selection, and artifact safety verification.
 */

const ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
const DEFAULT_TIMEOUT_MS = 2000;

export const GOOSE_LANES = Object.freeze({
  QUICK_INFO: 'quick_info',
  RESEARCH: 'research',
  LOCAL_ENGINEERING: 'local_engineering',
  CONVERSATION: 'conversation',
});

export const THINKING_EFFORTS = Object.freeze({
  OFF: 'off',
  LOW: 'low',
  HIGH: 'high',
});

const LANE_CRITERIA = Object.freeze({
  quick_info:
    'A narrow current public-information lookup: weather, currency rates, news, local venue hours, opening status, or short event lists.',
  research:
    'Needs qualitative market analysis, customer interviews, synthetic personas, PRDs, delivery briefs, or deep multi-source strategy.',
  local_engineering:
    'Needs local files, repository inspection, code editing, terminal commands, scripts, or git workspace operations.',
  conversation:
    'Casual dialogue, advice, or stable conceptual knowledge that does not require local files, web searches, or specialized tools.',
});

/**
 * Triage user turn intent in sub-350ms using Jev choice decision.
 */
export async function triageTurnIntentWithJev({
  message,
  apiKey = process.env.TYPESAFE_API_KEY,
  signal,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  hasProjectContext = false,
}) {
  const key = apiKey || process.env.TYPESAFE_API_KEY;
  if (!key || !message || typeof message !== 'string') {
    return {
      evaluated: false,
      reason: !key ? 'MISSING_API_KEY' : 'EMPTY_MESSAGE',
      route: GOOSE_LANES.CONVERSATION,
      confidence: 0,
      probabilities: {},
    };
  }

  const payload = {
    model: 'jev-latest',
    state: {
      message: message.slice(0, 16_000),
      hasProjectContext: Boolean(hasProjectContext),
    },
    questions: {
      route: {
        type: 'choice',
        instructions: 'Choose the single safest handling lane for this user request.',
        criteria: LANE_CRITERIA,
      },
      thinking_effort: {
        type: 'choice',
        instructions: 'Select the optimal reasoning effort level required for an LLM to accurately solve this request.',
        criteria: {
          off: 'Trivial short lookup, acknowledgement, yes, proceed, weather, currency, simple greeting',
          low: 'Light single-turn question, bugfix, or direct explanation',
          high: 'Deep multi-domain planning, complex valuation modeling, architectural design, or legal compliance analysis',
        },
      },
    },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('JEV_ROUTER_TIMEOUT')), timeoutMs);
  const combinedSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;

  const t0 = performance.now();
  try {
    const res = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: combinedSignal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      return {
        evaluated: false,
        reason: `HTTP_${res.status}`,
        route: GOOSE_LANES.RESEARCH,
        thinkingEffort: THINKING_EFFORTS.HIGH,
        confidence: 0,
        probabilities: {},
      };
    }

    const data = await res.json();
    const latencyMs = Math.round(performance.now() - t0);
    const ans = data.answers?.route;
    const thinkingAns = data.answers?.thinking_effort;

    if (!ans || ans.type !== 'choice') {
      return {
        evaluated: false,
        reason: 'INVALID_JEV_RESPONSE',
        route: GOOSE_LANES.RESEARCH,
        thinkingEffort: THINKING_EFFORTS.HIGH,
        confidence: 0,
        probabilities: {},
      };
    }

    return {
      evaluated: true,
      route: ans.choice,
      thinkingEffort: thinkingAns?.choice || THINKING_EFFORTS.HIGH,
      confidence: ans.confidence || 0,
      probabilities: ans.probabilities || {},
      latencyMs,
      model: data.model || 'jev-latest',
    };
  } catch (err) {
    clearTimeout(timer);
    return {
      evaluated: false,
      reason: err.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR',
      route: GOOSE_LANES.RESEARCH,
      thinkingEffort: THINKING_EFFORTS.HIGH,
      confidence: 0,
      probabilities: {},
    };
  }
}

/**
 * Fast-path artifact safety gate before writing to local disk or SQLite.
 */
export async function evaluateArtifactSafetyWithJev({
  content,
  apiKey = process.env.TYPESAFE_API_KEY,
  signal,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const key = apiKey || process.env.TYPESAFE_API_KEY;
  if (!key || !content || typeof content !== 'string') {
    return {
      evaluated: false,
      reason: !key ? 'MISSING_API_KEY' : 'EMPTY_CONTENT',
      passed: true,
      violations: [],
    };
  }

  const payload = {
    model: 'jev-latest',
    state: {
      artifact_text: content.slice(0, 24_000),
    },
    questions: {
      contains_hardcoded_secrets: {
        type: 'noul',
        instructions:
          'Does this document or code snippet contain hardcoded API keys, private passwords, tokens, or unmasked credentials?',
      },
      is_production_ready: {
        type: 'noul',
        instructions:
          'Is this document clean, free of severe formatting corruption, and safe for artifact persistence?',
      },
    },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('JEV_SAFETY_TIMEOUT')), timeoutMs);
  const combinedSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;

  const t0 = performance.now();
  try {
    const res = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: combinedSignal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      return {
        evaluated: false,
        reason: `HTTP_${res.status}`,
        passed: true,
        violations: [],
      };
    }

    const data = await res.json();
    const latencyMs = Math.round(performance.now() - t0);
    const answers = data.answers || {};

    const secretScore = answers.contains_hardcoded_secrets?.noul ?? 0.0;
    const readyScore = answers.is_production_ready?.noul ?? 1.0;

    const violations = [];
    if (secretScore >= 0.8) {
      violations.push({
        rule: 'contains_hardcoded_secrets',
        confidence: secretScore,
        severity: 'error',
      });
    }

    return {
      evaluated: true,
      passed: violations.length === 0,
      violations,
      secretScore,
      readyScore,
      latencyMs,
      model: data.model || 'jev-latest',
    };
  } catch (err) {
    clearTimeout(timer);
    return {
      evaluated: false,
      reason: err.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR',
      passed: true,
      violations: [],
    };
  }
}
