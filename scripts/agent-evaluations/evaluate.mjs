import { createHash } from 'node:crypto';

const MAX_OUTPUT_CHARACTERS = 24_000;
const MAX_SOURCE_BYTES = 2 * 1024 * 1024;
const MAX_SOURCE_EXCERPT_CHARACTERS = 2_400;
const MAX_SOURCES = 3;
const MAX_REDIRECTS = 3;
const SOURCE_TIMEOUT_MS = 8_000;
const MAX_JUDGE_INPUT_CHARACTERS = 16_000;

const OFFICIAL_HOSTS = Object.freeze({
  'search-node-abort-timeout': new Set(['nodejs.org']),
  'search-python-json-ascii': new Set(['docs.python.org']),
  'search-sqlite-journal-mode': new Set(['sqlite.org', 'www.sqlite.org']),
  'research-node-streams': new Set(['nodejs.org']),
  'research-postgres-indexes': new Set(['postgresql.org', 'www.postgresql.org']),
  'research-browser-storage': new Set(['developer.mozilla.org']),
});

const SOURCE_RELEVANCE_TERMS = Object.freeze({
  'search-node-abort-timeout': ['AbortSignal.timeout', 'timeout(delay)'],
  'search-python-json-ascii': ['ensure_ascii'],
  'search-sqlite-journal-mode': ['journal_mode', 'journal mode'],
  'research-node-streams': ['stream.pipeline', 'readable.pipe'],
  'research-postgres-indexes': ['BRIN', 'B-tree'],
  'research-browser-storage': ['IndexedDB', 'localStorage'],
});

function result(id, passed, reason) {
  return { id, passed, ...(!passed && reason !== undefined ? { reason } : {}) };
}

function failEvaluation(checks, reason) {
  return {
    verdict: 'failed',
    criteriaResults: checks.map((check) => ({
      criterion: check.id,
      passed: check.passed,
      ...(check.reason === undefined ? {} : { reason: check.reason }),
    })),
    reason,
  };
}

function notEvaluated(reason, checks = []) {
  return {
    verdict: 'not_evaluated',
    ...(checks.length === 0 ? {} : {
      criteriaResults: checks.map((check) => ({
        criterion: check.id,
        passed: check.passed,
        ...(check.reason === undefined ? {} : { reason: check.reason }),
      })),
    }),
    reason,
  };
}

function wordCount(value) {
  const trimmed = value.trim();
  return trimmed === '' ? 0 : trimmed.split(/\s+/u).length;
}

function sentenceCount(value) {
  const stripped = value.replace(/\b(?:[A-Z]\.){2,}/g, 'abbreviation');
  return (stripped.match(/[.!?](?=\s|$)/g) ?? []).length;
}

function messageChecks(caseData, output) {
  if (caseData.templateId === 'message-json-normalization') {
    let parsed;
    try {
      parsed = JSON.parse(output);
    } catch {
      return [result('valid_json_only', false, 'Response is not standalone valid JSON.')];
    }
    const keys = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? Object.keys(parsed).sort() : [];
    return [
      result('valid_json_only', true),
      result('exact_json_keys', JSON.stringify(keys) === JSON.stringify(['owner', 'priorities', 'project']), 'JSON keys must be exactly owner, priorities, and project.'),
      result(
        'exact_json_values',
        parsed?.project === 'Northstar'
          && parsed?.owner === 'Mina'
          && JSON.stringify(parsed?.priorities) === JSON.stringify(['accessibility', 'observability', 'reliability']),
        'JSON values or priority order do not match the task.',
      ),
    ];
  }

  if (caseData.templateId === 'message-constraint-summary') {
    const normalized = output.trim();
    return [
      result('exactly_two_sentences', sentenceCount(normalized) === 2 && !/^\s*[-*]/m.test(normalized), 'Response must be exactly two sentences without bullets.'),
      result('cause_details_present', /cache saturation/i.test(normalized) && /latency/i.test(normalized), 'Cause sentence omits cache saturation or latency.'),
      result('recovery_details_present', /resiz/i.test(normalized) && /09:24\s*UTC/i.test(normalized), 'Remediation or recovery time is missing.'),
    ];
  }

  if (caseData.templateId === 'message-table-transformation') {
    const lines = output.trim().split(/\r?\n/);
    const tableLines = lines.filter((line) => line.includes('|'));
    const afterTable = lines.slice(lines.lastIndexOf(tableLines.at(-1)) + 1).filter((line) => line.trim() !== '');
    const compact = tableLines.map((line) => line.split('|').map((cell) => cell.trim()).filter(Boolean));
    const dataRows = compact.filter((cells) => !cells.every((cell) => /^:?-{3,}:?$/.test(cell)));
    return [
      result('exact_table_header', JSON.stringify(dataRows[0]) === JSON.stringify(['Name', 'Status', 'Retries']), 'Markdown table header is not exact.'),
      result(
        'exact_table_rows',
        JSON.stringify(dataRows.slice(1)) === JSON.stringify([['Ada', 'ready', '0'], ['Lin', 'blocked', '2'], ['Sol', 'ready', '1']]),
        'Markdown table rows are missing, reordered, or changed.',
      ),
      result('exact_trailing_sentence', afterTable.length === 1 && afterTable[0].trim() === 'Blocked items: 1.', 'Required trailing sentence is not exact.'),
    ];
  }

  return [result('known_message_template', false, 'Message template is not supported by this evaluator version.')];
}

function extractUrls(output) {
  const matches = output.match(/https:\/\/[^\s<>{}\[\]"']+/gi) ?? [];
  return [...new Set(matches.map((match) => match.replace(/[),.;:!?]+$/g, '')))];
}

function parseOfficialSource(value, allowedHosts) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const hostname = url.hostname.toLowerCase();
  if (
    url.protocol !== 'https:'
    || (url.port !== '' && url.port !== '443')
    || url.username !== ''
    || url.password !== ''
    || !allowedHosts.has(hostname)
  ) {
    return null;
  }
  const citationUrl = url.toString();
  const encodedFragment = url.hash.slice(1);
  let fragment = encodedFragment;
  try { fragment = decodeURIComponent(encodedFragment); } catch {}
  url.hash = '';
  return { citationUrl, requestUrl: url.toString(), fragment };
}

function structuredSourceUrls(sources) {
  return sources.flatMap((source) => {
    if (typeof source === 'string') return [source];
    return source && typeof source === 'object' && typeof source.url === 'string' ? [source.url] : [];
  });
}

function sourceChecks(caseData, output, sources) {
  const allowedHosts = OFFICIAL_HOSTS[caseData.templateId];
  if (allowedHosts === undefined) {
    return {
      checks: [result('known_source_template', false, 'Source template is not supported by this evaluator version.')],
      targets: [],
      allowedHosts: new Set(),
      relevanceTerms: [],
    };
  }
  const cited = [...new Set([...extractUrls(output), ...structuredSourceUrls(sources)])];
  const parsed = cited.map((url) => parseOfficialSource(url, allowedHosts));
  const approved = parsed.filter(Boolean);
  const official = [...new Map(approved.map((target) => [target.citationUrl, target])).values()];
  const maximumWords = caseData.category === 'search'
    ? (caseData.templateId === 'search-sqlite-journal-mode' ? 140 : 120)
    : 220;
  const checks = [
    result('word_limit', wordCount(output) <= maximumWords, `Response exceeds the ${maximumWords}-word limit.`),
    result('official_source_cited', official.length > 0, 'No allowed official HTTPS documentation URL was cited.'),
  ];
  if (caseData.category === 'search') {
    checks.push(result('official_sources_only', approved.length === cited.length, 'Search answer cites a URL outside the allowed official documentation host.'));
  }
  return {
    checks,
    targets: official.slice(0, MAX_SOURCES),
    allowedHosts,
    relevanceTerms: SOURCE_RELEVANCE_TERMS[caseData.templateId] ?? [],
  };
}

const PLAN_CONCEPTS = Object.freeze({
  'plan-idempotency-key': [
    ['schema', 'table', 'database'], ['request'], ['concurr', 'race', 'lock'], ['expir', 'ttl'], ['rollout', 'deploy'], ['observ', 'metric', 'log'], ['test'],
  ],
  'plan-webhook-retries': [
    ['persist', 'queue', 'outbox'], ['sign', 'hmac'], ['retry', 'backoff'], ['terminal', 'dead-letter', 'dead letter'], ['observ', 'metric', 'log'], ['rollout', 'deploy'], ['test'],
  ],
  'plan-cache-migration': [
    ['key'], ['invalidat'], ['fail', 'fallback', 'degrad'], ['rollout'], ['rollback'], ['observ', 'metric', 'log'], ['test'],
  ],
});

function countNonGoals(output) {
  const labeled = output.match(/^\s*(?:[-*]\s*)?non-goal\s*\d*\s*:/gim) ?? [];
  if (labeled.length > 0) return labeled.length;
  const headings = output.match(/^\s*#{1,6}\s+non-goal\s+\d+\b/gim) ?? [];
  if (headings.length > 0) return headings.length;
  const section = output.match(/(?:^|\n)\s*#{0,3}\s*non-goals?\s*:?\s*\n([\s\S]*?)(?=\n\s*#{1,3}\s|$)/i);
  if (!section) return 0;
  return (section[1].match(/^\s*(?:[-*]|\d+[.)])\s+\S+/gm) ?? []).length;
}

function planChecks(caseData, output) {
  const concepts = PLAN_CONCEPTS[caseData.templateId];
  if (concepts === undefined) return [result('known_plan_template', false, 'Plan template is not supported by this evaluator version.')];
  const numberedSteps = output.match(/^\s*\d+[.)]\s+\S+/gm) ?? [];
  const headingSteps = output.match(/^\s*#{1,6}\s+Step\s+\d+\b.*$/gim) ?? [];
  const orderedStepCount = numberedSteps.length + headingSteps.length;
  const nonGoalCount = countNonGoals(output);
  const lower = output.toLowerCase();
  const missingConcepts = concepts.filter((alternatives) => !alternatives.some((term) => lower.includes(term)));
  return [
    result('bounded_ordered_steps', orderedStepCount >= 4 && orderedStepCount <= 8, 'Plan must contain between 4 and 8 ordered steps.'),
    nonGoalCount === 0
      ? result('non_goal_count_deferred_to_jev', true)
      : result('exactly_two_non_goals', nonGoalCount === 2, 'Plan must state exactly two non-goals.'),
    result('required_topics_present', missingConcepts.length === 0, `Plan omits required topic groups: ${missingConcepts.map((group) => group.join('/')).join(', ')}`),
    result('plan_word_limit', wordCount(output) <= 700, 'Plan exceeds the explicit 700-word limit.'),
  ];
}

function deterministicChecks(caseData, output, sources) {
  const initial = [result('bounded_output', output.length > 0, 'Output is empty.')];
  if (!initial[0].passed) return { checks: initial, sourcePlan: null };
  if (caseData.category === 'message') return { checks: [...initial, ...messageChecks(caseData, output)], sourcePlan: null };
  if (caseData.category === 'search' || caseData.category === 'research') {
    const sourcePlan = sourceChecks(caseData, output, sources);
    return { checks: [...initial, ...sourcePlan.checks], sourcePlan };
  }
  if (caseData.category === 'plan') return { checks: [...initial, ...planChecks(caseData, output)], sourcePlan: null };
  return { checks: [...initial, result('supported_category', false, 'Category is not supported by this evaluator.')], sourcePlan: null };
}

function stripHtml(value) {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function selectSourceExcerpt(value, contentType, fragment, relevanceTerms) {
  let section = value;
  let anchored = false;
  if (contentType === 'text/html' && fragment) {
    const escaped = fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const anchor = new RegExp(
      `\\b(?:id|name)\\s*=\\s*(?:"${escaped}"|'${escaped}'|${escaped}(?=[\\s>]))`,
      'i',
    ).exec(value);
    if (anchor) {
      const anchorIndex = anchor.index;
      const lower = value.toLowerCase();
      const headingStart = Math.max(...[1, 2, 3, 4, 5, 6].map((level) => lower.lastIndexOf(`<h${level}`, anchorIndex)));
      const anchorTagStart = Math.max(0, value.lastIndexOf('<', anchorIndex));
      const anchorIsInsideHeading = headingStart >= 0
        && !lower.slice(headingStart, anchorIndex).includes('</h');
      const start = anchorIsInsideHeading ? headingStart : anchorTagStart;
      section = value.slice(start, Math.min(value.length, anchorIndex + 120_000));
      anchored = true;
    }
  }

  const plain = contentType === 'text/html' ? stripHtml(section) : section.replace(/\s+/g, ' ').trim();
  if (plain === '') return '';
  if (anchored) return plain.slice(0, MAX_SOURCE_EXCERPT_CHARACTERS);

  const lower = plain.toLowerCase();
  const termIndex = relevanceTerms
    .map((term) => lower.indexOf(term.toLowerCase()))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0];
  if (termIndex !== undefined) {
    const start = Math.max(0, termIndex - 240);
    return plain.slice(start, start + MAX_SOURCE_EXCERPT_CHARACTERS);
  }
  if (plain.length <= MAX_SOURCE_EXCERPT_CHARACTERS) return plain;
  throw new Error('source_relevant_section_not_found');
}

async function readLimitedBody(response) {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_SOURCE_BYTES) throw new Error('source_too_large');
  if (response.body?.getReader === undefined) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > MAX_SOURCE_BYTES) throw new Error('source_too_large');
    return buffer.toString('utf8');
  }
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_SOURCE_BYTES) throw new Error('source_too_large');
      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    await reader.cancel(error).catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString('utf8');
}

function boundedSignal(parentSignal) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error('source_timeout')), SOURCE_TIMEOUT_MS);
  const abort = () => controller.abort(parentSignal.reason);
  if (parentSignal) {
    if (parentSignal.aborted) abort();
    else parentSignal.addEventListener('abort', abort, { once: true });
  }
  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timeout);
      parentSignal?.removeEventListener('abort', abort);
    },
  };
}

async function fetchOfficialSource(initialTarget, allowedHosts, relevanceTerms, fetchImpl, signal) {
  let currentTarget = initialTarget;
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const normalized = parseOfficialSource(currentTarget.citationUrl, allowedHosts);
    if (normalized === null) throw new Error('source_redirect_not_allowed');
    const bounded = boundedSignal(signal);
    try {
      const response = await fetchImpl(normalized.requestUrl, {
        method: 'GET',
        redirect: 'manual',
        signal: bounded.signal,
        headers: { accept: 'text/html, text/plain;q=0.9' },
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (location === null || redirects === MAX_REDIRECTS) throw new Error('source_redirect_invalid');
        const redirected = new URL(location, normalized.requestUrl);
        if (!redirected.hash && normalized.fragment) redirected.hash = `#${normalized.fragment}`;
        currentTarget = { citationUrl: redirected.toString() };
        continue;
      }
      if (!response.ok) throw new Error(`source_http_${response.status}`);
      const contentType = (response.headers.get('content-type') ?? '').split(';', 1)[0].trim().toLowerCase();
      if (contentType !== 'text/html' && contentType !== 'text/plain') throw new Error('source_content_type_not_allowed');
      const text = await readLimitedBody(response);
      const excerpt = selectSourceExcerpt(text, contentType, normalized.fragment, relevanceTerms);
      if (excerpt === '') throw new Error('source_empty');
      return {
        url: initialTarget.citationUrl,
        finalUrl: normalized.citationUrl,
        status: response.status,
        contentType,
        excerpt,
        excerptHash: createHash('sha256').update(excerpt).digest('hex'),
      };
    } finally {
      bounded.dispose();
    }
  }
  throw new Error('source_redirect_invalid');
}

function sanitizeJudgeReceipt(receipt, expectedCriteria, expectedIdentity) {
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) return null;
  if (!['passed', 'failed', 'not_evaluated'].includes(receipt.verdict)) return null;
  if (receipt.advisory !== true || receipt.provider !== 'typesafe') return null;
  if (receipt.runId !== expectedIdentity.runId || receipt.category !== expectedIdentity.category) return null;
  if (!Array.isArray(receipt.criteriaResults) || receipt.criteriaResults.length !== expectedCriteria.length) return null;
  const criteriaResults = [];
  for (let index = 0; index < receipt.criteriaResults.length; index += 1) {
    const item = receipt.criteriaResults[index];
    if (!item || typeof item !== 'object' || item.criterion !== expectedCriteria[index] || typeof item.passed !== 'boolean') return null;
    criteriaResults.push({
      criterion: item.criterion,
      passed: item.passed,
      ...(typeof item.reason === 'string' && item.reason !== '' ? { reason: item.reason } : {}),
    });
  }
  const overallProbability = Number.isFinite(receipt.overallProbability)
    && receipt.overallProbability >= 0 && receipt.overallProbability <= 1
    ? receipt.overallProbability : null;
  if (receipt.verdict !== 'not_evaluated') {
    if (overallProbability === null) return null;
    const passed = overallProbability >= 0.6 && criteriaResults.every((item) => item.passed);
    if ((receipt.verdict === 'passed') !== passed) return null;
  }
  return {
    evaluation: {
      verdict: receipt.verdict,
      criteriaResults,
      ...(typeof receipt.reason === 'string' && receipt.reason !== '' ? { reason: receipt.reason } : {}),
    },
    evidence: {
      receiptId: typeof receipt.receiptId === 'string' ? receipt.receiptId : null,
      advisory: true,
      provider: 'typesafe',
      model: typeof receipt.model === 'string' ? receipt.model : null,
      overallProbability,
      perCriterion: Array.isArray(receipt.perCriterion)
        ? receipt.perCriterion.slice(0, expectedCriteria.length).map((item) => ({
          criterion: typeof item?.criterion === 'string' ? item.criterion : null,
          probability: Number.isFinite(item?.probability) ? item.probability : null,
        }))
        : null,
      evidenceHash: typeof receipt.evidenceHash === 'string' ? receipt.evidenceHash : null,
      evaluatedAt: typeof receipt.evaluatedAt === 'string' ? receipt.evaluatedAt : null,
    },
  };
}

export async function evaluateOutput({ caseData, output, sources = [], runId, judge, fetchImpl = globalThis.fetch, signal } = {}) {
  if (!caseData || typeof caseData !== 'object') throw new TypeError('caseData must be an evaluation case object');
  if (typeof caseData.category !== 'string' || typeof caseData.templateId !== 'string') {
    throw new TypeError('caseData must include category and templateId');
  }
  if (!Array.isArray(caseData.criteria) || caseData.criteria.some((criterion) => typeof criterion !== 'string' || criterion === '')) {
    throw new TypeError('caseData.criteria must be an array of non-empty strings');
  }
  if (typeof output !== 'string') throw new TypeError('output must be a string');
  if (!Array.isArray(sources)) throw new TypeError('sources must be an array');
  if (typeof runId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(runId)) {
    throw new TypeError('runId must be a version 4 UUID');
  }

  if (caseData.category === 'coding') {
    return {
      evaluation: notEvaluated('Coding requires isolated fixture execution and hidden test evidence.'),
      evidence: { deterministicChecks: [], sources: [], declaredSourceCount: sources.length, judge: null },
    };
  }

  if (output.length > MAX_OUTPUT_CHARACTERS) {
    const technicalCheck = result(
      'bounded_output',
      false,
      `Output exceeds the evaluator's ${MAX_OUTPUT_CHARACTERS}-character technical input limit.`,
    );
    return {
      evaluation: notEvaluated('Output exceeds the evaluator technical input limit.', [technicalCheck]),
      evidence: { deterministicChecks: [technicalCheck], sources: [], declaredSourceCount: sources.length, judge: null },
    };
  }

  const { checks, sourcePlan } = deterministicChecks(caseData, output.trim(), sources);
  if (checks.some(({ passed }) => !passed)) {
    return {
      evaluation: failEvaluation(checks, 'One or more deterministic requirements failed.'),
      evidence: { deterministicChecks: checks, sources: [], declaredSourceCount: sources.length, judge: null },
    };
  }

  const sourceEvidence = [];
  if (sourcePlan !== null) {
    for (const target of sourcePlan.targets) {
      try {
        sourceEvidence.push(await fetchOfficialSource(
          target,
          sourcePlan.allowedHosts,
          sourcePlan.relevanceTerms,
          fetchImpl,
          signal,
        ));
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'source_fetch_failed';
        const deterministicSourceFailure = reason.startsWith('source_http_')
          || reason === 'source_redirect_not_allowed'
          || reason === 'source_redirect_invalid'
          || reason === 'source_content_type_not_allowed'
          || reason === 'source_relevant_section_not_found'
          || reason === 'source_empty';
        return {
          evaluation: deterministicSourceFailure
            ? failEvaluation([...checks, result('official_source_fetched', false, reason)], 'Cited official source could not provide supporting evidence.')
            : notEvaluated('Official source evidence could not be retrieved.', checks),
          evidence: { deterministicChecks: checks, sources: sourceEvidence, declaredSourceCount: sources.length, judge: null },
        };
      }
    }
    if (sourceEvidence.length === 0) {
      return {
        evaluation: failEvaluation([...checks, result('official_source_fetched', false, 'No official source evidence was retrieved.')], 'Official source evidence is required.'),
        evidence: { deterministicChecks: checks, sources: [], declaredSourceCount: sources.length, judge: null },
      };
    }
  }

  if (typeof judge !== 'function') {
    return {
      evaluation: notEvaluated('Jev advisory evaluation is unavailable.', checks),
      evidence: { deterministicChecks: checks, sources: sourceEvidence, declaredSourceCount: sources.length, judge: null },
    };
  }

  const judgeInput = {
    runId,
    category: caseData.category,
    criteria: [...caseData.criteria],
    output: output.trim(),
    sources: sourceEvidence.map(({ finalUrl, excerpt, excerptHash }) => ({
      url: finalUrl,
      excerpt,
      contentHash: excerptHash,
    })),
  };
  if (JSON.stringify(judgeInput).length > MAX_JUDGE_INPUT_CHARACTERS) {
    return {
      evaluation: notEvaluated('Bounded Jev advisory input could not be constructed.', checks),
      evidence: { deterministicChecks: checks, sources: sourceEvidence, declaredSourceCount: sources.length, judge: null },
    };
  }

  let receipt;
  try {
    receipt = await judge(judgeInput);
  } catch {
    return {
      evaluation: notEvaluated('Jev advisory evaluation is unavailable.', checks),
      evidence: { deterministicChecks: checks, sources: sourceEvidence, declaredSourceCount: sources.length, judge: null },
    };
  }

  const sanitized = sanitizeJudgeReceipt(receipt, caseData.criteria, { runId, category: caseData.category });
  if (sanitized === null) {
    return {
      evaluation: notEvaluated('Jev advisory receipt was malformed or unsupported.', checks),
      evidence: { deterministicChecks: checks, sources: sourceEvidence, declaredSourceCount: sources.length, judge: null },
    };
  }

  return {
    evaluation: sanitized.evaluation,
    evidence: {
      deterministicChecks: checks,
      sources: sourceEvidence,
      declaredSourceCount: sources.length,
      judge: sanitized.evidence,
    },
  };
}
