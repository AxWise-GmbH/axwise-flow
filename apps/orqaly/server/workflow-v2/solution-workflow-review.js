import { canonicalJsonSha256 } from '../../services/agentic-control-plane/src/domain/canonical.js';
import { SolutionSpecSchema } from '../../shared/workflow-v2/solution-contracts.js';
import { compileSolutionWorkflow } from './solution-compiler.js';

const TOP_LEVEL_KEYS = new Set([
  'name',
  'nodes',
  'connections',
  'settings',
  'id',
  'versionId',
  'activeVersionId',
  'versionCounter',
  'createdAt',
  'updatedAt',
  'triggerCount',
  'tags',
  'meta',
  'pinData',
  'staticData',
  'active',
  'isArchived',
  'description',
  'parentFolderId',
  'shared',
  'scopes',
  'homeProject',
  'versionMetadata',
]);
const NODE_KEYS = new Set([
  'id',
  'name',
  'type',
  'typeVersion',
  'position',
  'parameters',
  'webhookId',
  'disabled',
  'alwaysOutputData',
  'executeOnce',
  'retryOnFail',
  'continueOnFail',
  'onError',
  'notes',
  'notesInFlow',
]);
const FALSE_NODE_FLAGS = [
  'disabled',
  'alwaysOutputData',
  'executeOnce',
  'retryOnFail',
  'continueOnFail',
];
const TRANSFORMS = { trim: 'trim', toLowerCase: 'lowercase', toUpperCase: 'uppercase' };
const FIELD = '[A-Za-z][A-Za-z0-9_]{0,63}';
// Deliberately a small grammar, not a JavaScript parser/evaluator. Quoted keys
// cannot contain escapes, interpolation, property access, or function calls.
const ACCESS = `\\$json\\.body\\.input\\[\\s*(?<sourceQuote>["'])(?<source>${FIELD})\\k<sourceQuote>\\s*\\](?:\\s*\\.\\s*(?<method>trim|toLowerCase|toUpperCase)\\s*\\(\\s*\\))?`;
const RAW_ENTRY = new RegExp(
  `^\\s*(?<targetQuote>["'])(?<target>${FIELD})\\k<targetQuote>\\s*:\\s*${ACCESS}\\s*(?<separator>,|$)`
);
const MANUAL_VALUE = new RegExp(`^=\\{\\{\\s*${ACCESS}\\s*\\}\\}$`);

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const same = (left, right) => canonicalJsonSha256(left) === canonicalJsonSha256(right);
const emptyRecord = (value) => isRecord(value) && Object.keys(value).length === 0;
const knownKeys = (value, allowed) =>
  isRecord(value) && Object.keys(value).every((key) => allowed.has(key));
const has = (value, key) => Object.hasOwn(value, key);

class InvalidWorkflow extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
function requireSafe(condition, code, message) {
  if (!condition) throw new InvalidWorkflow(code, message);
}

// Public callers supply JSON. Bound its shape before hashing or traversing it,
// including callers outside HTTP, so malformed drafts cannot exhaust review.
function requireBoundedJson(value) {
  let entries = 0;
  let textSize = 0;
  const seen = new Set();
  function visit(item, depth) {
    requireSafe(
      depth <= 16 && ++entries <= 4000,
      'WORKFLOW_TOO_LARGE',
      'The workflow exceeds the review size limit.'
    );
    if (typeof item === 'string') {
      textSize += item.length;
      requireSafe(
        textSize <= 64000,
        'WORKFLOW_TOO_LARGE',
        'The workflow exceeds the review size limit.'
      );
      return;
    }
    if (item === null || typeof item === 'boolean') return;
    if (typeof item === 'number') {
      requireSafe(
        Number.isFinite(item),
        'INVALID_WORKFLOW',
        'The workflow must contain finite JSON values.'
      );
      return;
    }
    requireSafe(
      typeof item === 'object' && !seen.has(item),
      'INVALID_WORKFLOW',
      'The workflow must be a JSON object without cycles.'
    );
    requireSafe(
      Array.isArray(item) || [Object.prototype, null].includes(Object.getPrototypeOf(item)),
      'INVALID_WORKFLOW',
      'The workflow must contain plain JSON objects.'
    );
    requireSafe(
      !Array.isArray(item) ||
        (Object.keys(item).length === item.length &&
          Object.keys(item).every((key, index) => key === String(index))),
      'INVALID_WORKFLOW',
      'The workflow must contain ordinary JSON arrays.'
    );
    seen.add(item);
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(item))) {
      if (Array.isArray(item) && key === 'length') continue;
      requireSafe(
        !['__proto__', 'constructor', 'prototype'].includes(key) && has(descriptor, 'value'),
        'INVALID_WORKFLOW',
        'The workflow contains an unsupported property.'
      );
      textSize += key.length;
      visit(descriptor.value, depth + 1);
    }
    seen.delete(item);
  }
  visit(value, 0);
}

function parseRawFields(jsonOutput) {
  requireSafe(
    typeof jsonOutput === 'string',
    'UNSUPPORTED_EXPRESSION',
    'JSON output must use the supported input-field mapping expression.'
  );
  const outer = /^=\{\{\s*\{([\s\S]*)\}\s*\}\}$/.exec(jsonOutput);
  requireSafe(
    outer,
    'UNSUPPORTED_EXPRESSION',
    'Only an object of input-field mappings is supported in JSON mode.'
  );
  let remaining = outer[1];
  const fields = [];
  while (remaining.trim()) {
    const entry = RAW_ENTRY.exec(remaining);
    requireSafe(
      entry,
      'UNSUPPORTED_EXPRESSION',
      'Mappings may only read an input field and apply copy, trim, lowercase, or uppercase.'
    );
    fields.push({
      source: entry.groups.source,
      target: entry.groups.target,
      transform: TRANSFORMS[entry.groups.method] ?? 'copy',
    });
    requireSafe(
      fields.length <= 12,
      'INVALID_MAPPINGS',
      'A solution can return at most 12 mapped fields.'
    );
    remaining = remaining.slice(entry[0].length);
    // A trailing comma is valid JavaScript, but accepting it is unnecessary for
    // the explicitly supported expression grammar.
    requireSafe(
      entry.groups.separator !== ',' || remaining.trim(),
      'UNSUPPORTED_EXPRESSION',
      'Remove the trailing comma from the mapping expression.'
    );
  }
  return fields;
}

function parseManualFields(assignments) {
  requireSafe(
    knownKeys(assignments, new Set(['assignments'])) && Array.isArray(assignments.assignments),
    'INVALID_MAPPINGS',
    'Manual mode must contain a field-assignment list.'
  );
  requireSafe(
    assignments.assignments.length <= 12,
    'INVALID_MAPPINGS',
    'A solution can return at most 12 mapped fields.'
  );
  return assignments.assignments.map((item) => {
    requireSafe(
      knownKeys(item, new Set(['id', 'name', 'value', 'type'])),
      'INVALID_MAPPINGS',
      'A manual mapping contains unsupported configuration.'
    );
    requireSafe(
      !has(item, 'id') || (typeof item.id === 'string' && item.id.length <= 128),
      'INVALID_MAPPINGS',
      'A manual mapping has an invalid editor identifier.'
    );
    const match = typeof item.value === 'string' && MANUAL_VALUE.exec(item.value);
    requireSafe(
      match,
      'UNSUPPORTED_EXPRESSION',
      'Manual mappings may only read an input field and apply trim, lowercase, or uppercase.'
    );
    // n8n Set 3.4 manual assignments coerce to their declared type. A raw copy
    // preserves scalar input types, so treating a manual string copy as the same
    // spec would approve a different behavior from the one we execute/verify.
    requireSafe(
      item.type === 'string' && match.groups.method,
      'UNSUPPORTED_TYPE_CONVERSION',
      'Manual mappings must return text using trim, lowercase, or uppercase. Use JSON mode for copy mappings that preserve scalar types.'
    );
    return {
      source: match.groups.source,
      target: item.name,
      transform: TRANSFORMS[match.groups.method],
    };
  });
}

function reviewTransform(parameters) {
  requireSafe(
    knownKeys(
      parameters,
      new Set([
        'mode',
        'jsonOutput',
        'assignments',
        'options',
        'includeOtherFields',
        'duplicateItem',
      ])
    ),
    'UNSUPPORTED_NODE_CONFIGURATION',
    'Transform fields contains unsupported parameters.'
  );
  requireSafe(
    !has(parameters, 'includeOtherFields') || parameters.includeOtherFields === false,
    'UNSUPPORTED_DATA_FLOW',
    'Passing additional input fields is outside this solution’s approved mapping contract.'
  );
  requireSafe(
    !has(parameters, 'duplicateItem') || parameters.duplicateItem === false,
    'UNSUPPORTED_DATA_FLOW',
    'Duplicating input items is not supported by this solution.'
  );
  const options = parameters.options ?? {};
  requireSafe(
    knownKeys(options, new Set(['dotNotation', 'ignoreConversionErrors', 'stripBinary'])),
    'UNSUPPORTED_NODE_CONFIGURATION',
    'Transform fields contains unsupported options.'
  );
  requireSafe(
    !has(options, 'dotNotation') || typeof options.dotNotation === 'boolean',
    'UNSUPPORTED_NODE_CONFIGURATION',
    'Dot notation must be a fixed boolean.'
  );
  requireSafe(
    !has(options, 'ignoreConversionErrors') || options.ignoreConversionErrors === false,
    'UNSUPPORTED_TYPE_CONVERSION',
    'Ignoring type conversion errors is not supported.'
  );
  requireSafe(
    !has(options, 'stripBinary') || options.stripBinary === true,
    'UNSUPPORTED_DATA_FLOW',
    'Binary data cannot be retained by this solution.'
  );
  requireSafe(
    parameters.mode === 'raw' ||
      parameters.mode === 'manual' ||
      (!has(parameters, 'mode') && has(parameters, 'assignments')),
    'UNSUPPORTED_NODE_CONFIGURATION',
    'Use the native JSON or manual mapping mode.'
  );
  const manual = parameters.mode !== 'raw';
  requireSafe(
    manual ? !has(parameters, 'jsonOutput') : !has(parameters, 'assignments'),
    'UNSUPPORTED_NODE_CONFIGURATION',
    'Remove inactive mapping configuration before review.'
  );
  const fields = manual
    ? parseManualFields(parameters.assignments)
    : parseRawFields(parameters.jsonOutput);
  const specResult = SolutionSpecSchema.safeParse({ kind: 'webhook_transform_v1', fields });
  requireSafe(
    specResult.success,
    'INVALID_MAPPINGS',
    'Use 1–12 unique output names and simple input/output field names; reserved or nested names are not supported.'
  );
  return { spec: specResult.data, parameters: structuredClone(parameters) };
}

function safeNode(node, expected) {
  requireSafe(
    knownKeys(node, NODE_KEYS),
    has(node ?? {}, 'credentials') ? 'CREDENTIALS_NOT_SUPPORTED' : 'UNSUPPORTED_NODE_CONFIGURATION',
    'Nodes cannot add credentials or unsupported execution configuration.'
  );
  requireSafe(
    ['id', 'name', 'type', 'typeVersion'].every((key) => node[key] === expected[key]),
    'UNSUPPORTED_NODE',
    'Keep the existing Receive input, Transform fields, and Return result nodes, names, and versions.'
  );
  requireSafe(
    FALSE_NODE_FLAGS.every((key) => !has(node, key) || node[key] === false) &&
      (!has(node, 'onError') || node.onError === 'stopWorkflow'),
    'UNSUPPORTED_NODE_BEHAVIOR',
    'Nodes must remain enabled and stop on errors without retries, extra outputs, or changed execution behavior.'
  );
  requireSafe(
    Array.isArray(node.position) &&
      node.position.length === 2 &&
      node.position.every(
        (coordinate) =>
          typeof coordinate === 'number' &&
          Number.isFinite(coordinate) &&
          Math.abs(coordinate) <= 1000000
      ),
    'INVALID_NODE_POSITION',
    'Canvas positions must be two finite coordinates.'
  );
  requireSafe(
    !has(node, 'notes') || (typeof node.notes === 'string' && node.notes.length <= 4000),
    'INVALID_NODE_METADATA',
    'Node notes must be plain text within the size limit.'
  );
  requireSafe(
    !has(node, 'notesInFlow') || typeof node.notesInFlow === 'boolean',
    'INVALID_NODE_METADATA',
    'Node notes visibility must be a fixed boolean.'
  );
  requireSafe(
    expected.webhookId ? node.webhookId === expected.webhookId : !has(node, 'webhookId'),
    'TRIGGER_CHANGED',
    'The solution webhook identity cannot change in an editor draft.'
  );
  return { ...expected, position: [...node.position] };
}

function describeMapping(field) {
  const action = {
    copy: 'copies',
    trim: 'trims',
    lowercase: 'lowercases',
    uppercase: 'uppercases',
  }[field.transform];
  return `${action} input “${field.source}”`;
}

function semanticChanges(baseWorkflow, baseSpec, workflow, spec) {
  const changes = [];
  const before = new Map(baseSpec.fields.map((field) => [field.target, field]));
  const after = new Map(spec.fields.map((field) => [field.target, field]));
  for (const [target, field] of before) {
    if (!after.has(target))
      changes.push({ kind: 'mapping_removed', message: `Output “${target}” is removed.` });
    else if (!same(field, after.get(target)))
      changes.push({
        kind: 'mapping_changed',
        message: `Output “${target}” changes from “${describeMapping(field)}” to “${describeMapping(after.get(target))}”.`,
      });
  }
  for (const [target, field] of after) {
    if (!before.has(target))
      changes.push({
        kind: 'mapping_added',
        message: `Output “${target}” now ${describeMapping(field)}.`,
      });
  }
  if (baseWorkflow.name !== workflow.name)
    changes.push({ kind: 'name', message: 'The workflow display name changes.' });
  if (
    workflow.nodes.some((node) => {
      const prior = baseWorkflow.nodes.find((item) => item.id === node.id);
      return !prior || !same(node.position, prior.position);
    })
  )
    changes.push({
      kind: 'layout',
      message: 'The canvas layout changes without changing execution order.',
    });
  const priorTransform = baseWorkflow.nodes.find((node) => node.id === 'transform');
  if (
    !changes.some((change) => change.kind.startsWith('mapping_')) &&
    !same(priorTransform?.parameters ?? null, workflow.nodes[1].parameters)
  ) {
    changes.push({
      kind: 'representation',
      message:
        'Mapping configuration changes while preserving the same supported input/output behavior.',
    });
  }
  return changes;
}

/**
 * Deterministic capability/semantic review of an untrusted native n8n draft.
 * This is not an LLM/AxWise review and does not execute any submitted expression.
 * Only this returned snapshot may be hashed, approved, and sent to a runtime.
 */
export function reviewSolutionWorkflow({ solutionId, baseWorkflow, baseSpec, workflow }) {
  try {
    requireBoundedJson(workflow);
    requireSafe(
      typeof solutionId === 'string' &&
        /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(solutionId),
      'INVALID_SOLUTION',
      'The solution identity is invalid.'
    );
    const parsedBase = SolutionSpecSchema.safeParse(baseSpec);
    requireSafe(
      parsedBase.success && isRecord(baseWorkflow) && Array.isArray(baseWorkflow.nodes),
      'INVALID_BASELINE',
      'The stored solution baseline is invalid.'
    );
    const authority = compileSolutionWorkflow({ id: solutionId, spec: parsedBase.data }).workflow;
    requireSafe(
      knownKeys(workflow, TOP_LEVEL_KEYS),
      'UNSUPPORTED_WORKFLOW_CONFIGURATION',
      'The workflow contains unsupported configuration.'
    );
    requireSafe(
      typeof workflow.name === 'string' &&
        workflow.name.trim().length > 0 &&
        workflow.name.length <= 200 &&
        !Array.from(workflow.name).some((character) => character.charCodeAt(0) < 32),
      'INVALID_WORKFLOW_NAME',
      'Give the workflow a plain display name of at most 200 characters.'
    );
    requireSafe(
      (!has(workflow, 'active') || workflow.active === false) &&
        (!has(workflow, 'isArchived') || workflow.isArchived === false),
      'EDITOR_ACTIVATION_FORBIDDEN',
      'Keep the editor draft inactive. Activation happens after Orqaly approval.'
    );
    requireSafe(
      ['pinData', 'staticData'].every(
        (key) => !has(workflow, key) || workflow[key] === null || emptyRecord(workflow[key])
      ),
      'WORKFLOW_DATA_NOT_SUPPORTED',
      'Remove pinned execution data and workflow state before submitting the draft.'
    );
    requireSafe(
      !has(workflow, 'meta') ||
        workflow.meta === null ||
        knownKeys(
          workflow.meta,
          new Set(['instanceId', 'templateId', 'templateCredsSetupCompleted'])
        ),
      'UNSUPPORTED_WORKFLOW_METADATA',
      'The workflow contains unsupported native metadata.'
    );
    requireSafe(
      Array.isArray(workflow.nodes) &&
        workflow.nodes.length === 3 &&
        new Set(workflow.nodes.map((node) => node?.id)).size === 3,
      'UNSUPPORTED_NODE',
      'This solution supports exactly the existing webhook, field mapping, and response nodes.'
    );
    requireSafe(
      same(workflow.connections ?? null, authority.connections),
      'UNSUPPORTED_GRAPH',
      'Keep the single Receive input → Transform fields → Return result connection path.'
    );
    requireSafe(
      same(workflow.settings ?? null, authority.settings),
      'WORKFLOW_SETTINGS_CHANGED',
      'Execution, timeout, and data-retention settings must remain unchanged.'
    );
    let spec;
    const nodes = authority.nodes.map((expected) => {
      const node = workflow.nodes.find((item) => item?.id === expected.id);
      const safe = safeNode(node, expected);
      if (expected.id === 'transform') {
        const reviewed = reviewTransform(node.parameters);
        spec = reviewed.spec;
        safe.parameters = reviewed.parameters;
      } else {
        requireSafe(
          same(node.parameters ?? null, expected.parameters),
          expected.id === 'receive' ? 'TRIGGER_CHANGED' : 'RESPONSE_CHANGED',
          expected.id === 'receive'
            ? 'The webhook method, path, authentication, and response mode must remain unchanged.'
            : 'The response must preserve output, execution identity, invocation identity, and status code.'
        );
      }
      return safe;
    });
    // Compile the inferred spec as an independent contract check. The accepted
    // native configuration is retained (including safe manual mode), rather
    // than silently replacing customer edits with a newly generated workflow.
    compileSolutionWorkflow({ id: solutionId, spec });
    const snapshot = {
      name: workflow.name,
      nodes,
      connections: structuredClone(authority.connections),
      settings: structuredClone(authority.settings),
    };
    const changes = semanticChanges(baseWorkflow, parsedBase.data, snapshot, spec);
    const behaviorCount = changes.filter((change) => change.kind.startsWith('mapping_')).length;
    return {
      valid: true,
      issues: [],
      spec,
      workflow: snapshot,
      workflowHash: canonicalJsonSha256(snapshot),
      changes,
      summary: behaviorCount
        ? `${behaviorCount} mapping change${behaviorCount === 1 ? '' : 's'} validated within the webhook transformation capability.`
        : 'No execution behavior changed; the existing webhook transformation contract is preserved.',
    };
  } catch (error) {
    if (!(error instanceof InvalidWorkflow)) throw error;
    return {
      valid: false,
      issues: [{ code: error.code, message: error.message }],
      spec: null,
      workflow: null,
      workflowHash: null,
      changes: [],
      summary: 'This draft cannot be approved until the unsupported changes are resolved.',
    };
  }
}
