import { createHash } from 'node:crypto';

export const SLOT_SECONDS = 15 * 60;
export const CATALOG_TEMPLATE_VERSION = 1;

export const EVALUATION_CATEGORIES = Object.freeze([
  Object.freeze({ id: 'message', label: 'Message' }),
  Object.freeze({ id: 'coding', label: 'Coding' }),
  Object.freeze({ id: 'search', label: 'Search' }),
  Object.freeze({ id: 'research', label: 'Research' }),
  Object.freeze({ id: 'plan', label: 'Automated Plan' }),
]);

const TEMPLATES = Object.freeze({
  message: [
    {
      id: 'message-json-normalization',
      make: () => ({
        prompt: [
          'Return only valid JSON with exactly the keys "project", "priorities", and "owner".',
          'Use project "Northstar", owner "Mina", and priorities sorted alphabetically from:',
          'observability, accessibility, reliability.',
        ].join('\n'),
        criteria: [
          'The response is valid JSON and contains no surrounding prose or Markdown fence.',
          'It has exactly the keys project, priorities, and owner.',
          'project is Northstar, owner is Mina, and priorities are accessibility, observability, reliability in that order.',
        ],
      }),
    },
    {
      id: 'message-constraint-summary',
      make: () => ({
        prompt: [
          'Write exactly two sentences summarizing this incident:',
          'At 09:10 UTC, cache saturation raised API latency. At 09:18 UTC, the cache was resized. By 09:24 UTC, latency returned to normal.',
          'The first sentence must state the cause. The second must state both the remediation and recovery time. Do not use bullet points.',
        ].join('\n'),
        criteria: [
          'The response contains exactly two sentences and no bullet list.',
          'The first sentence attributes higher API latency to cache saturation.',
          'The second sentence states that the cache was resized and recovery occurred by 09:24 UTC.',
        ],
      }),
    },
    {
      id: 'message-table-transformation',
      make: () => ({
        prompt: [
          'Convert the following records into a Markdown table with columns Name, Status, and Retries, preserving the input order.',
          'Records: Ada|ready|0; Lin|blocked|2; Sol|ready|1.',
          'After the table, add exactly one sentence: "Blocked items: 1."',
        ].join('\n'),
        criteria: [
          'The Markdown table has exactly the columns Name, Status, and Retries.',
          'All three records and their values are present in the original order.',
          'The only text after the table is the sentence Blocked items: 1.',
        ],
      }),
    },
  ],
  coding: [
    {
      id: 'coding-clamp',
      make: () => ({
        prompt: [
          'Complete src/clamp.js by implementing clamp(value, min, max).',
          'Return min when value is below min, max when value is above max, and value otherwise.',
          'Throw a RangeError when min is greater than max. Keep the named export and do not add dependencies.',
        ].join('\n'),
        criteria: [
          'The implementation returns the lower bound, upper bound, or unchanged in-range value as specified.',
          'It throws RangeError when min is greater than max.',
          'The named export is preserved and no dependency is added.',
        ],
        fixture: {
          targetFilename: 'src/clamp.js',
          starter: 'export function clamp(value, min, max) {\n  // Implement me.\n}\n',
          tests: [
            { args: [-2, 0, 5], expected: 0 },
            { args: [8, 0, 5], expected: 5 },
            { args: [3, 0, 5], expected: 3 },
            { args: [3, 5, 0], throws: 'RangeError' },
          ],
        },
      }),
    },
    {
      id: 'coding-normalize-tags',
      make: () => ({
        prompt: [
          'Complete src/normalize-tags.js by implementing normalizeTags(tags).',
          'Trim each string, lowercase it, remove empty values and duplicates, then return the values in ascending lexical order.',
          'Do not mutate the input. Keep the named export and do not add dependencies.',
        ].join('\n'),
        criteria: [
          'The result contains trimmed lowercase non-empty unique strings in ascending lexical order.',
          'The input array is not mutated.',
          'The named export is preserved and no dependency is added.',
        ],
        fixture: {
          targetFilename: 'src/normalize-tags.js',
          starter: 'export function normalizeTags(tags) {\n  // Implement me.\n}\n',
          tests: [
            { args: [[' Beta ', 'alpha', 'ALPHA', '']], expected: ['alpha', 'beta'] },
            { args: [[]], expected: [] },
            { args: [[' z ', 'Y', 'x']], expected: ['x', 'y', 'z'] },
          ],
        },
      }),
    },
    {
      id: 'coding-chunk',
      make: () => ({
        prompt: [
          'Complete src/chunk.js by implementing chunk(items, size).',
          'Return consecutive arrays of at most size elements without mutating items.',
          'Throw a RangeError unless size is a positive integer. Keep the named export and do not add dependencies.',
        ].join('\n'),
        criteria: [
          'The result contains consecutive chunks of at most the requested size.',
          'The input array is not mutated.',
          'Non-positive or non-integer sizes throw RangeError, and the named export is preserved.',
        ],
        fixture: {
          targetFilename: 'src/chunk.js',
          starter: 'export function chunk(items, size) {\n  // Implement me.\n}\n',
          tests: [
            { args: [[1, 2, 3, 4, 5], 2], expected: [[1, 2], [3, 4], [5]] },
            { args: [[], 3], expected: [] },
            { args: [[1], 0], throws: 'RangeError' },
            { args: [[1], 1.5], throws: 'RangeError' },
          ],
        },
      }),
    },
  ],
  search: [
    {
      id: 'search-node-abort-timeout',
      make: () => ({
        prompt: [
          'Using only official Node.js documentation, find the current documented signature and behavior of AbortSignal.timeout(delay).',
          'Answer in at most 120 words and include the exact official documentation URL used.',
        ].join('\n'),
        criteria: [
          'The answer describes AbortSignal.timeout(delay) consistently with current official Node.js documentation.',
          'The answer cites an official nodejs.org documentation URL that supports the claim.',
          'The response is no more than 120 words.',
        ],
      }),
    },
    {
      id: 'search-python-json-ascii',
      make: () => ({
        prompt: [
          'Using only official Python documentation, explain what json.dumps ensure_ascii does and state its default value.',
          'Answer in at most 120 words and include the exact official documentation URL used.',
        ].join('\n'),
        criteria: [
          'The answer accurately states the behavior and default of ensure_ascii.',
          'The answer cites an official docs.python.org URL that supports the claim.',
          'The response is no more than 120 words.',
        ],
      }),
    },
    {
      id: 'search-sqlite-journal-mode',
      make: () => ({
        prompt: [
          'Using only official SQLite documentation, list the documented values accepted by PRAGMA journal_mode and identify which mode persists across database reopenings.',
          'Answer in at most 140 words and include the exact official documentation URL used.',
        ].join('\n'),
        criteria: [
          'The accepted journal_mode values are reported consistently with current official SQLite documentation.',
          'The persistence statement is supported by the cited official sqlite.org documentation URL.',
          'The response is no more than 140 words.',
        ],
      }),
    },
  ],
  research: [
    {
      id: 'research-node-streams',
      make: () => ({
        prompt: [
          'Compare Node.js stream.pipeline() and readable.pipe() for error handling and cleanup in a small production service.',
          'Use official Node.js documentation as the primary evidence. Give a recommendation, two concrete tradeoffs, and source URLs in at most 220 words.',
        ].join('\n'),
        criteria: [
          'The comparison accurately covers error forwarding or cleanup differences.',
          'A recommendation and at least two concrete tradeoffs are present.',
          'Claims are supported by exact official Node.js documentation URLs and the response is no more than 220 words.',
        ],
      }),
    },
    {
      id: 'research-postgres-indexes',
      make: () => ({
        prompt: [
          'Compare PostgreSQL B-tree and BRIN indexes for a large append-only events table ordered by timestamp.',
          'Use official PostgreSQL documentation as the primary evidence. Give a recommendation, two concrete tradeoffs, and source URLs in at most 220 words.',
        ].join('\n'),
        criteria: [
          'The comparison accurately describes relevant B-tree and BRIN characteristics.',
          'The recommendation is tied to table ordering, query needs, and index-size tradeoffs.',
          'Claims are supported by exact official PostgreSQL documentation URLs and the response is no more than 220 words.',
        ],
      }),
    },
    {
      id: 'research-browser-storage',
      make: () => ({
        prompt: [
          'Compare IndexedDB and localStorage for storing an offline-first queue of structured records in a browser application.',
          'Use MDN documentation as the primary evidence. Give a recommendation, two concrete tradeoffs, and source URLs in at most 220 words.',
        ].join('\n'),
        criteria: [
          'The comparison accurately covers data model, capacity or performance, and synchronous versus asynchronous access.',
          'A recommendation and at least two concrete tradeoffs are present.',
          'Claims are supported by exact MDN documentation URLs and the response is no more than 220 words.',
        ],
      }),
    },
  ],
  plan: [
    {
      id: 'plan-idempotency-key',
      make: () => ({
        prompt: [
          'Create a bounded implementation plan for adding idempotency-key handling to one POST /payments endpoint backed by PostgreSQL.',
          'The plan must include schema, request flow, concurrency behavior, expiry, rollout, observability, and tests. Limit it to 8 ordered steps and state two explicit non-goals.',
        ].join('\n'),
        criteria: [
          'The plan has no more than 8 ordered implementation steps and exactly two explicit non-goals.',
          'Schema, request flow, concurrency, expiry, rollout, observability, and tests are addressed.',
          'The plan identifies a safe response for concurrent requests sharing a key.',
        ],
      }),
    },
    {
      id: 'plan-webhook-retries',
      make: () => ({
        prompt: [
          'Create a bounded implementation plan for reliable webhook delivery from one service to third-party HTTPS endpoints.',
          'The plan must include persistence, signing, retry policy, terminal failure handling, observability, rollout, and tests. Limit it to 8 ordered steps and state two explicit non-goals.',
        ].join('\n'),
        criteria: [
          'The plan has no more than 8 ordered implementation steps and exactly two explicit non-goals.',
          'Persistence, signing, retries, terminal failures, observability, rollout, and tests are addressed.',
          'Retry behavior is bounded and distinguishes transient from terminal outcomes.',
        ],
      }),
    },
    {
      id: 'plan-cache-migration',
      make: () => ({
        prompt: [
          'Create a bounded implementation plan for moving one read-heavy product endpoint from process-local caching to Redis without downtime.',
          'The plan must include key design, invalidation, failure behavior, rollout, rollback, observability, and tests. Limit it to 8 ordered steps and state two explicit non-goals.',
        ].join('\n'),
        criteria: [
          'The plan has no more than 8 ordered implementation steps and exactly two explicit non-goals.',
          'Key design, invalidation, failure behavior, rollout, rollback, observability, and tests are addressed.',
          'The rollout includes a measurable staged comparison before full cutover.',
        ],
      }),
    },
  ],
});

function parseTime(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new TypeError('slot must be a valid date, timestamp, or ISO string');
  }
  return date;
}

export function evaluationSlot(value = new Date()) {
  const date = parseTime(value);
  const slotMs = SLOT_SECONDS * 1000;
  return new Date(Math.floor(date.getTime() / slotMs) * slotMs).toISOString();
}

function selectionIndex(seed, category, count) {
  const digest = createHash('sha256').update(`${seed}:${category}`).digest();
  return digest.readUInt32BE(0) % count;
}

export function canonicalCaseInput(evaluationCase) {
  return JSON.stringify({
    category: evaluationCase.category,
    templateId: evaluationCase.templateId,
    templateVersion: evaluationCase.templateVersion,
    seed: evaluationCase.seed,
    prompt: evaluationCase.prompt,
    criteria: evaluationCase.criteria,
    ...(evaluationCase.fixture === undefined ? {} : { fixture: evaluationCase.fixture }),
  });
}

export function caseInputHash(evaluationCase) {
  return createHash('sha256').update(canonicalCaseInput(evaluationCase)).digest('hex');
}

export function buildEvaluationCatalog({ slot = new Date(), templateVersion = CATALOG_TEMPLATE_VERSION } = {}) {
  if (!Number.isSafeInteger(templateVersion) || templateVersion < 1) {
    throw new TypeError('templateVersion must be a positive integer');
  }

  const normalizedSlot = evaluationSlot(slot);
  const seed = `${normalizedSlot}:v${templateVersion}`;
  const cases = EVALUATION_CATEGORIES.map(({ id: category, label }) => {
    const variants = TEMPLATES[category];
    const template = variants[selectionIndex(seed, category, variants.length)];
    const content = template.make();
    const evaluationCase = {
      category,
      label,
      prompt: content.fixture
        ? `${content.prompt}\n\nStarter file ${content.fixture.targetFilename}:\n${content.fixture.starter}\nWhen direct file editing is unavailable, return the complete contents of ${content.fixture.targetFilename} as JSON with exactly the keys filename and content, or one JavaScript code fence.`
        : content.prompt,
      templateId: template.id,
      templateVersion,
      seed,
      criteria: content.criteria,
      ...(content.fixture === undefined ? {} : { fixture: content.fixture }),
    };
    return { ...evaluationCase, inputHash: caseInputHash(evaluationCase) };
  });

  return { slot: normalizedSlot, seed, templateVersion, cases };
}
