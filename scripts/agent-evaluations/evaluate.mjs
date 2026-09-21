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

// Root documentation URLs are common in grounded product output. Pin each
// catalog template to the actual sections that support its claims so a table
// of contents occurrence cannot become the evidence excerpt.
const SOURCE_SECTION_HINTS = Object.freeze({
  'search-node-abort-timeout': [
    { pathSuffix: '/api/globals.html', fragment: 'static-method-abortsignaltimeoutdelay', focusTerms: ['number of milliseconds', 'Returns a new AbortSignal'] },
  ],
  'search-python-json-ascii': [
    { pathSuffix: '/3/library/json.html', fragment: 'json.dump', focusTerms: ['If ensure_ascii is true', 'escaped'] },
    { pathSuffix: '/3/library/json.html', fragment: 'json.dumps', focusTerms: ['ensure_ascii = True', 'same meaning'] },
  ],
  'search-sqlite-journal-mode': [
    { pathSuffix: '/pragma.html', fragment: 'pragma_journal_mode', focusTerms: ['DELETE | TRUNCATE | PERSIST | MEMORY | WAL | OFF', 'WAL journaling mode is persistent'] },
  ],
  'research-node-streams': [
    { pathSuffix: '/api/stream.html', fragment: 'streampipelinesource-transforms-destination-callback', focusTerms: ['forwarding errors', 'destroy(err)'] },
    { pathSuffix: '/api/stream.html', fragment: 'readablepipedestination-options', focusTerms: ['not closed automatically', 'prevent memory leaks'] },
  ],
  'research-postgres-indexes': [
    { pathSuffix: '/indexes-types.html', fragment: 'INDEXES-TYPES-BTREE', focusTerms: ['equality and range queries', 'sorted order'] },
    { pathSuffix: '/brin.html', fragment: 'BRIN-INTRO', focusTerms: ['block ranges', 'physical order'] },
  ],
  'research-browser-storage': [
    { pathSuffix: '/Web/API/IndexedDB_API', fragment: 'key_concepts_and_usage', focusTerms: ['structured data', 'asynchronously'] },
    { pathSuffix: '/Web/API/Window/localStorage', fragment: 'content', focusTerms: ['saved across browser sessions', 'UTF-16'] },
  ],
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
    return [result('known_message_template', true)];
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
      sectionHints: [],
    };
  }
  const cited = [...new Set([...extractUrls(output), ...structuredSourceUrls(sources)])];
  const parsed = cited.map((url) => parseOfficialSource(url, allowedHosts));
  const approved = parsed.filter(Boolean);
  const uniqueOfficial = [...new Map(approved.map((target) => [target.citationUrl, target])).values()];
  const byDocument = new Map();
  for (const target of uniqueOfficial) {
    const group = byDocument.get(target.requestUrl) ?? [];
    group.push(target);
    byDocument.set(target.requestUrl, group);
  }
  const official = [...byDocument.values()].flatMap((targets) => {
    const root = targets.find(({ fragment }) => fragment === '');
    return root === undefined ? targets : [root];
  });
  const checks = [
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
    sectionHints: SOURCE_SECTION_HINTS[caseData.templateId] ?? [],
  };
}

const PLAN_TEMPLATE_IDS = new Set([
  'plan-idempotency-key',
  'plan-webhook-retries',
  'plan-cache-migration',
]);

function planChecks(caseData) {
  return [result(
    'known_plan_template',
    PLAN_TEMPLATE_IDS.has(caseData.templateId),
    'Plan template is not supported by this evaluator version.',
  )];
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

function anchoredHtmlSection(value, fragment) {
  const escaped = fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const attributeValue = `(?:"${escaped}"|'${escaped}'|${escaped}(?=[\\s>]))`;
  const idAnchor = new RegExp(`<[^>]+\\bid\\s*=\\s*${attributeValue}[^>]*>`, 'i').exec(value);
  const namedAnchor = new RegExp(`<a\\b[^>]*\\bname\\s*=\\s*${attributeValue}[^>]*>`, 'i').exec(value);
  const anchor = [idAnchor, namedAnchor]
    .filter(Boolean)
    .sort((left, right) => left.index - right.index)[0];
  if (!anchor) return null;

  const anchorIndex = anchor.index;
  const lower = value.toLowerCase();
  const headingStart = Math.max(...[1, 2, 3, 4, 5, 6].map((level) => lower.lastIndexOf(`<h${level}`, anchorIndex)));
  const anchorTagStart = Math.max(0, value.lastIndexOf('<', anchorIndex));
  const anchorIsInsideHeading = headingStart >= 0
    && !lower.slice(headingStart, anchorIndex).includes('</h');
  const start = anchorIsInsideHeading ? headingStart : anchorTagStart;
  return stripHtml(value.slice(start, Math.min(value.length, anchorIndex + 120_000)));
}

function boundedSectionExcerpt(plain, focusTerms, budget) {
  const prefixLength = Math.min(800, Math.max(320, Math.floor(budget * 0.45)));
  const pieces = [plain.slice(0, prefixLength).trim()];
  const lower = plain.toLowerCase();
  const unseenFocuses = [...new Set(focusTerms
    .map((term) => lower.indexOf(term.toLowerCase(), prefixLength))
    .filter((index) => index >= prefixLength))]
    .sort((left, right) => left - right)
    .filter((index, position, indexes) => position === 0 || index - indexes[position - 1] >= 320);
  const separatorLength = 3 * unseenFocuses.length;
  const remaining = Math.max(0, budget - pieces[0].length - separatorLength);
  const snippetLength = unseenFocuses.length === 0 ? 0 : Math.min(700, Math.floor(remaining / unseenFocuses.length));
  for (const index of unseenFocuses) {
    const start = Math.max(prefixLength, index - Math.min(180, Math.floor(snippetLength / 3)));
    pieces.push(plain.slice(start, start + snippetLength).trim());
  }
  return pieces.filter(Boolean).join(' … ').slice(0, budget);
}

function selectSourceExcerpt(value, contentType, fragment, relevanceTerms, sectionHints, pathname) {
  if (contentType === 'text/html') {
    const matchingHints = sectionHints.filter((hint) => pathname.endsWith(hint.pathSuffix));
    const selectedHints = fragment
      ? [{
        fragment,
        focusTerms: matchingHints.find((hint) => hint.fragment.toLowerCase() === fragment.toLowerCase())?.focusTerms
          ?? relevanceTerms,
      }]
      : matchingHints;
    if (selectedHints.length > 0) {
      const sections = selectedHints
        .map((hint) => ({ ...hint, plain: anchoredHtmlSection(value, hint.fragment) }))
        .filter(({ plain }) => plain !== null && plain !== '');
      if (sections.length === 0) throw new Error('source_relevant_section_not_found');
      const separators = 2 * (sections.length - 1);
      const budget = Math.floor((MAX_SOURCE_EXCERPT_CHARACTERS - separators) / sections.length);
      return sections
        .map(({ plain, focusTerms }) => boundedSectionExcerpt(plain, focusTerms, budget))
        .join('\n\n')
        .slice(0, MAX_SOURCE_EXCERPT_CHARACTERS);
    }
  }

  const plain = contentType === 'text/html' ? stripHtml(value) : value.replace(/\s+/g, ' ').trim();
  if (plain === '') return '';

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

async function fetchOfficialSource(initialTarget, allowedHosts, relevanceTerms, sectionHints, fetchImpl, signal) {
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
      const pathname = new URL(normalized.requestUrl).pathname;
      const excerpt = selectSourceExcerpt(text, contentType, normalized.fragment, relevanceTerms, sectionHints, pathname);
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

function semanticJudgeRequirements(caseData) {
  return { criteria: [...caseData.criteria], verifiedChecks: [] };
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
          sourcePlan.sectionHints,
          fetchImpl,
          signal,
        ));
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'source_fetch_failed';
        const httpStatus = /^source_http_(\d{3})$/.exec(reason)?.[1];
        const transientHttpStatus = httpStatus !== undefined
          && ([403, 408, 429].includes(Number(httpStatus)) || Number(httpStatus) >= 500);
        const evaluatorUnavailable = transientHttpStatus || reason === 'source_relevant_section_not_found';
        const deterministicSourceFailure = reason.startsWith('source_http_')
          || reason === 'source_redirect_not_allowed'
          || reason === 'source_redirect_invalid'
          || reason === 'source_content_type_not_allowed'
          || reason === 'source_empty';
        return {
          evaluation: deterministicSourceFailure && !evaluatorUnavailable
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

  const requirements = semanticJudgeRequirements(caseData, output.trim(), checks);
  const judgeInput = {
    runId,
    category: caseData.category,
    prompt: caseData.prompt,
    criteria: requirements.criteria,
    verifiedChecks: requirements.verifiedChecks,
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

  const sanitized = sanitizeJudgeReceipt(receipt, judgeInput.criteria, { runId, category: caseData.category });
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
      verifiedChecks: judgeInput.verifiedChecks,
      semanticCriteria: judgeInput.criteria,
      sources: sourceEvidence,
      declaredSourceCount: sources.length,
      judge: sanitized.evidence,
    },
  };
}
