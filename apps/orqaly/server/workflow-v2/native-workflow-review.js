import {
  NativeWorkflowSpecV2Schema,
  NativeDataSchema,
  isBoundedNativeJson,
} from '../../shared/workflow-v2/native-workflow-contracts.js';
import { containsSolutionBuildSecret } from '../../shared/workflow-v2/solution-build-secrets.js';
import {
  getNativeNodeDefinition,
  listNativeNodeDefinitions,
  nativeWorkflowHash,
  NATIVE_WORKFLOW_CATALOG_PIN,
} from './native-workflow-knowledge.js';
import { inspectNativeExpression } from './native-expression-policy.js';
import { bindNativeConnections, describeNativeConnection } from './native-workflow-connections.js';
import {
  BOUNDED_HTTP_NODE,
  BOUNDED_HTTP_DEFINITION,
  BOUNDED_HTTP_PACKAGE_HASH,
  isBoundedHttpPolicy,
  validateBoundedNodeParameters,
} from './native-outbound-policy.js';
import {
  nativeBundleHash,
  nativeBundleMembers,
  NATIVE_ERROR_HANDLER_TYPE,
} from './native-workflow-bundle.js';

const pureTypes = new Set([
  'webhook',
  'respondToWebhook',
  'set',
  'if',
  'switch',
  'filter',
  'merge',
  'aggregate',
  'splitOut',
  'sort',
  'limit',
  'noOp',
  'stopAndError',
  'stickyNote',
]);
const suffix = (type) => type.split('.').at(-1);
export const REQUEST_AUTOMATION_POLICY = Object.freeze({
  profile: 'request_automation',
  n8nVersion: '2.37.10',
  imageDigest: NATIVE_WORKFLOW_CATALOG_PIN.imageDigest,
  allowedNodes: Object.freeze(
    listNativeNodeDefinitions()
      .filter(
        (n) =>
          pureTypes.has(suffix(n.type)) &&
          (n.typeVersion === n.definition.defaultVersion ||
            (n.type === 'n8n-nodes-base.set' && n.typeVersion === 3.4) ||
            (n.type === 'n8n-nodes-base.webhook' && n.typeVersion === 2) ||
            (n.type === 'n8n-nodes-base.respondToWebhook' && n.typeVersion === 1.4))
      )
      .map(({ type, typeVersion }) => Object.freeze({ type, typeVersion }))
  ),
  expressionPolicy: 'pure-data-v1',
  maxNodes: 100,
  maxExecutionSeconds: 60,
  egress: 'deny',
  credentials: 'deny',
  code: false,
  durableTriggers: false,
});
export function createBoundedHttpPolicy({ imageDigest }) {
  if (!/^sha256:[a-f0-9]{64}$/.test(imageDigest ?? ''))
    throw new Error('bounded_outbound_image_digest_required');
  return {
    ...structuredClone(REQUEST_AUTOMATION_POLICY),
    imageDigest,
    allowedNodes: [
      ...structuredClone(REQUEST_AUTOMATION_POLICY.allowedNodes),
      { ...BOUNDED_HTTP_NODE },
    ],
    egress: 'bounded-https-post-v1',
    credentials: 'bound',
    outboundTransportVersion: 1,
    outboundPackageHash: BOUNDED_HTTP_PACKAGE_HASH,
  };
}
const nodeKeys = new Set([
  'id',
  'name',
  'type',
  'typeVersion',
  'position',
  'parameters',
  'credentials',
  'disabled',
  'notes',
  'notesInFlow',
  'webhookId',
  'executeOnce',
  'alwaysOutputData',
  'retryOnFail',
  'maxTries',
  'waitBetweenTries',
  'onError',
  'continueOnFail',
]);
const topKeys = new Set([
  'name',
  'description',
  'nodes',
  'connections',
  'settings',
  'active',
  'pinData',
  'staticData',
  'tags',
  'meta',
  'nodeGroups',
]);
const settingsKeys = new Set([
  'executionOrder',
  'executionTimeout',
  'saveDataSuccessExecution',
  'saveDataErrorExecution',
  'saveManualExecutions',
  'saveExecutionProgress',
  'callerPolicy',
  'availableInMCP',
  'timezone',
  'errorWorkflow',
  'binaryMode',
]);
// Pinned n8n-workflow/dist/cjs/node-parameters/filter-parameter.js operation
// switches. These are data-only names; native code is never evaluated here.
const filterOperations = {
  string: [
    'empty',
    'notEmpty',
    'equals',
    'notEquals',
    'contains',
    'notContains',
    'startsWith',
    'notStartsWith',
    'endsWith',
    'notEndsWith',
    'regex',
    'notRegex',
  ],
  number: ['empty', 'notEmpty', 'equals', 'notEquals', 'gt', 'lt', 'gte', 'lte'],
  dateTime: [
    'empty',
    'notEmpty',
    'equals',
    'notEquals',
    'after',
    'before',
    'afterOrEquals',
    'beforeOrEquals',
  ],
  boolean: ['empty', 'notEmpty', 'true', 'false', 'equals', 'notEquals'],
  array: [
    'empty',
    'notEmpty',
    'contains',
    'notContains',
    'lengthEquals',
    'lengthNotEquals',
    'lengthGt',
    'lengthLt',
    'lengthGte',
    'lengthLte',
  ],
  object: ['empty', 'notEmpty'],
};
const typeMatches = (value, type) =>
  type === 'null'
    ? value === null
    : type === 'array'
      ? Array.isArray(value)
      : type === 'object'
        ? value !== null && typeof value === 'object' && !Array.isArray(value)
        : type === 'integer'
          ? Number.isInteger(value)
          : typeof value === type;
const equal = (a, b) =>
  a !== undefined && b !== undefined && nativeWorkflowHash(a) === nativeWorkflowHash(b);
const issue = (code, message, nodeId) => ({ code, message, ...(nodeId ? { nodeId } : {}) });
const pointer = (value, path) => {
  let cursor = value;
  for (const key of path
    .split('/')
    .slice(1)
    .map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'))) {
    if (!cursor || typeof cursor !== 'object' || !Object.hasOwn(cursor, key))
      return { found: false };
    cursor = cursor[key];
  }
  return { found: true, value: cursor };
};

export function validateNativeWorkflowData({ schema, value, includePaths = false }) {
  const issues = [];
  const add = (code, message, path) =>
    issues.push({
      ...issue(code, message),
      ...(includePaths ? { dataPath: path || '/' } : {}),
    });
  if (
    !isBoundedNativeJson(schema, { maxBytes: 32000, maxDepth: 20 }) ||
    !isBoundedNativeJson(value, { maxBytes: 64000 })
  )
    return {
      valid: false,
      issues: [
        issue('DATA_BOUNDS', 'Input/output contract or value exceeds the bounded JSON limits'),
      ],
    };
  const parsed = NativeDataSchema.safeParse(schema);
  if (!parsed.success)
    return {
      valid: false,
      issues: [issue('DATA_SCHEMA', 'Unsupported or invalid input/output JSON Schema')],
    };
  const visit = (s, v, path) => {
    if (issues.length >= 40) return;
    if (!typeMatches(v, s.type)) {
      add('DATA_TYPE', `${path || '/'} must have type ${s.type}`, path);
      return;
    }
    if (Object.hasOwn(s, 'const') && !equal(v, s.const))
      add('DATA_CONST', `${path || '/'} does not match the required constant`, path);
    if (s.enum && !s.enum.some((item) => equal(item, v)))
      add('DATA_ENUM', `${path || '/'} is not an allowed value`, path);
    if (
      typeof v === 'number' &&
      ((s.minimum !== undefined && v < s.minimum) || (s.maximum !== undefined && v > s.maximum))
    )
      add('DATA_RANGE', `${path || '/'} is outside the allowed numeric range`, path);
    if (
      typeof v === 'string' &&
      ((s.minLength !== undefined && [...v].length < s.minLength) ||
        (s.maxLength !== undefined && [...v].length > s.maxLength))
    )
      add('DATA_LENGTH', `${path || '/'} is outside the allowed string length`, path);
    if (Array.isArray(v)) {
      if (
        (s.minItems !== undefined && v.length < s.minItems) ||
        (s.maxItems !== undefined && v.length > s.maxItems)
      )
        add('DATA_ITEMS', `${path || '/'} is outside the allowed item count`, path);
      v.forEach((item, i) => visit(s.items, item, `${path}/${i}`));
    } else if (v !== null && typeof v === 'object') {
      for (const key of s.required ?? [])
        if (!Object.hasOwn(v, key))
          add(
            'DATA_REQUIRED',
            `${path}/${key} is required`,
            `${path}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`
          );
      for (const [key, item] of Object.entries(v)) {
        const encoded = key.replace(/~/g, '~0').replace(/\//g, '~1');
        if (s.properties?.[key]) visit(s.properties[key], item, `${path}/${encoded}`);
        else if (s.additionalProperties === false)
          add(
            'DATA_PROPERTY',
            `${path}/${encoded} is not an allowed property`,
            `${path}/${encoded}`
          );
      }
    }
  };
  visit(parsed.data, value, '');
  return { valid: issues.length === 0, issues };
}

export function checkNativeWorkflowAcceptance({
  spec,
  input,
  output,
  caseId,
  responseStatus = 200,
}) {
  if (!isBoundedNativeJson(spec))
    return {
      passed: false,
      caseResults: [],
      issues: [issue('ACCEPTANCE_SPEC', 'Invalid bounded acceptance contract')],
    };
  const parsed = NativeWorkflowSpecV2Schema.safeParse(spec);
  if (!parsed.success)
    return {
      passed: false,
      caseResults: [],
      issues: [issue('ACCEPTANCE_SPEC', 'Invalid acceptance contract')],
    };
  const issues = [
    ...validateNativeWorkflowData({ schema: spec.inputSchema, value: input }).issues,
    ...validateNativeWorkflowData({ schema: spec.outputSchema, value: output }).issues,
  ];
  const cases = spec.acceptanceCases.filter((c) =>
    caseId ? c.id === caseId : equal(c.input, input)
  );
  if (!cases.length)
    issues.push(
      issue(
        'ACCEPTANCE_CASE_MISSING',
        'This input has no matching agreed acceptance case; schema conformity is not a passed test'
      )
    );
  const caseResults = cases.map((test) => {
    const failures = [];
    if (!equal(test.input, input))
      failures.push(
        issue('ACCEPTANCE_INPUT', 'The actual test input does not match the agreed case')
      );
    if (responseStatus !== (test.expectedStatus ?? 200))
      failures.push(
        issue('ACCEPTANCE_STATUS', 'The actual response status differs from the agreed case')
      );
    if (Object.hasOwn(test, 'expectedOutput') && !equal(test.expectedOutput, output))
      failures.push(
        issue('ACCEPTANCE_OUTPUT', 'The actual output differs from the agreed expected output')
      );
    for (const assertion of test.assertions) {
      const actual = pointer(output, assertion.path);
      const expected = assertion.value;
      const pass =
        assertion.operator === 'exists'
          ? actual.found
          : !actual.found
            ? false
            : assertion.operator === 'equals'
              ? equal(actual.value, expected)
              : assertion.operator === 'type'
                ? typeMatches(actual.value, expected)
                : assertion.operator === 'contains'
                  ? typeof actual.value === 'string' && typeof expected === 'string'
                    ? actual.value.includes(expected)
                    : Array.isArray(actual.value) &&
                      actual.value.some((item) => equal(item, expected))
                  : (typeof actual.value === 'string' || Array.isArray(actual.value)) &&
                    (assertion.operator === 'length_gte'
                      ? actual.value.length >= expected
                      : actual.value.length <= expected);
      if (!pass)
        failures.push(
          issue(
            'ACCEPTANCE_ASSERTION',
            `Assertion ${assertion.operator} failed at ${assertion.path || '/'}`
          )
        );
    }
    return { id: test.id, passed: failures.length === 0 && issues.length === 0, issues: failures };
  });
  return {
    passed: issues.length === 0 && caseResults.length > 0 && caseResults.every((c) => c.passed),
    caseResults,
    issues: [...issues, ...caseResults.flatMap((c) => c.issues)],
  };
}

function displayMatch(display, values, version) {
  const matches = (key, tests) => {
    const value =
      key === '@version'
        ? version
        : key.startsWith('/')
          ? pointer(values, key).value
          : key.split('.').reduce((v, k) => v?.[k], values);
    return tests.some((test) => {
      if (!test || typeof test !== 'object' || !test._cnd) return equal(test, value);
      return Object.entries(test._cnd).every(([op, expected]) =>
        op === 'eq'
          ? equal(value, expected)
          : op === 'not'
            ? !equal(value, expected)
            : op === 'gte'
              ? value >= expected
              : op === 'lte'
                ? value <= expected
                : op === 'gt'
                  ? value > expected
                  : op === 'lt'
                    ? value < expected
                    : op === 'exists'
                      ? (value !== undefined) === expected
                      : false
      );
    });
  };
  return (
    Object.entries(display?.show ?? {}).every(([key, tests]) => matches(key, tests)) &&
    Object.entries(display?.hide ?? {}).every(([key, tests]) => !matches(key, tests))
  );
}

function validateParameters(node, definition, issues, blocked) {
  const add = (code, message) => issues.push(issue(code, message, node.id));
  const validate = (parameters, properties, root, path = 'parameters') => {
    if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters)) {
      add('NODE_PARAMETERS', `${path} must be an object`);
      return;
    }
    const defaults = Object.fromEntries(
      properties.filter((p) => p.default !== undefined).map((p) => [p.name, p.default])
    );
    const values = { ...root, ...defaults, ...parameters };
    const shown = properties.filter((p) =>
      displayMatch(p.displayOptions, values, node.typeVersion)
    );
    for (const key of Object.keys(parameters)) {
      const variants = shown.filter((p) => p.name === key);
      if (!variants.length) {
        add(
          'NODE_PARAMETER_UNKNOWN',
          `${path}.${key} does not exist for this pinned operation/version`
        );
        continue;
      }
      const prop = variants[0];
      const value = parameters[key];
      const at = `${path}.${key}`;
      if (typeof value === 'string' && value.startsWith('=')) continue; // Type only known after real evaluation.
      if (
        [
          'string',
          'dateTime',
          'json',
          'hidden',
          'credentialsSelect',
          'notice',
          'curlImport',
        ].includes(prop.type)
      ) {
        if (prop.type !== 'hidden' && typeof value !== 'string')
          add('NODE_PARAMETER_TYPE', `${at} must be a string`);
        if (prop.type === 'json' && typeof value === 'string' && !value.includes('{{')) {
          try {
            JSON.parse(value);
          } catch {
            add('NODE_PARAMETER_JSON', `${at} is not valid JSON`);
          }
        }
      } else if (prop.type === 'number') {
        if (typeof value !== 'number' || !Number.isFinite(value))
          add('NODE_PARAMETER_TYPE', `${at} must be a finite number`);
      } else if (prop.type === 'boolean') {
        if (typeof value !== 'boolean') add('NODE_PARAMETER_TYPE', `${at} must be a boolean`);
      } else if (prop.type === 'options' || prop.type === 'multiOptions') {
        const candidates = (prop.options ?? [])
          .filter((o) => Object.hasOwn(o, 'value'))
          .map((o) => o.value);
        if (prop.type === 'multiOptions' && !Array.isArray(value))
          add('NODE_PARAMETER_TYPE', `${at} must be an array`);
        else if (
          candidates.length &&
          (prop.type === 'multiOptions' ? value : [value]).some(
            (item) => !candidates.some((option) => equal(option, item))
          )
        )
          add('NODE_PARAMETER_OPTION', `${at} is not a supported pinned option`);
      } else if (prop.type === 'collection') validate(value, prop.options ?? [], values, at);
      else if (prop.type === 'fixedCollection') {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
          add('NODE_PARAMETER_TYPE', `${at} must be an object`);
          continue;
        }
        for (const [group, entries] of Object.entries(value)) {
          const option = prop.options?.find((o) => o.name === group);
          if (!option) {
            add('NODE_PARAMETER_UNKNOWN', `${at}.${group} is not a supported collection`);
            continue;
          }
          const rows = prop.typeOptions?.multipleValues ? entries : [entries];
          if (!Array.isArray(rows) || rows.length > 1000) {
            add('NODE_PARAMETER_TYPE', `${at}.${group} has invalid collection entries`);
            continue;
          }
          for (const entry of rows) validate(entry, option.values ?? [], values, `${at}.${group}`);
        }
      } else if (prop.type === 'assignmentCollection') {
        if (
          !value ||
          !Array.isArray(value.assignments) ||
          Object.keys(value).some((k) => k !== 'assignments')
        )
          add('NODE_PARAMETER_ASSIGNMENTS', `${at} must contain native assignments`);
        else
          for (const item of value.assignments)
            if (
              !item ||
              typeof item.name !== 'string' ||
              !['string', 'number', 'boolean', 'object', 'array', 'binary'].includes(item.type) ||
              !Object.hasOwn(item, 'value') ||
              Object.keys(item).some((k) => !['id', 'name', 'type', 'value'].includes(k))
            )
              add('NODE_PARAMETER_ASSIGNMENTS', `${at} contains an invalid native assignment`);
      } else if (prop.type === 'filter') {
        if (
          !value ||
          !['and', 'or'].includes(value.combinator) ||
          !Array.isArray(value.conditions) ||
          value.conditions.length > 100 ||
          Object.keys(value).some((k) => !['options', 'combinator', 'conditions'].includes(k))
        )
          add('NODE_PARAMETER_FILTER', `${at} must contain native filter conditions`);
        else
          for (const condition of value.conditions) {
            if (
              !condition ||
              !Object.hasOwn(condition, 'leftValue') ||
              !condition.operator ||
              !filterOperations[condition.operator.type] ||
              ![...filterOperations[condition.operator.type], 'exists', 'notExists'].includes(
                condition.operator.operation
              ) ||
              Object.keys(condition).some(
                (k) => !['id', 'leftValue', 'rightValue', 'operator'].includes(k)
              ) ||
              Object.keys(condition.operator).some(
                (k) => !['type', 'operation', 'singleValue', 'rightType'].includes(k)
              )
            )
              add('NODE_PARAMETER_FILTER', `${at} contains an invalid native condition`);
            if (['regex', 'notRegex'].includes(condition?.operator?.operation))
              blocked.push(
                issue(
                  'FILTER_REGEX_REVIEW',
                  'Regex filters need separately bounded runtime validation',
                  node.id
                )
              );
          }
      } else if (['resourceLocator', 'workflowSelector'].includes(prop.type)) {
        if (
          !value ||
          typeof value !== 'object' ||
          !['id', 'list', 'url'].includes(value.mode) ||
          typeof value.value !== 'string'
        )
          add('NODE_PARAMETER_LOCATOR', `${at} requires an explicit native resource locator`);
      } else {
        blocked.push(
          issue(
            'PARAMETER_VALIDATION_REQUIRED',
            `${at} requires an additional pinned parameter validator before execution`,
            node.id
          )
        );
      }
      if (
        typeof value === 'number' &&
        ((prop.typeOptions?.minValue !== undefined && value < prop.typeOptions.minValue) ||
          (prop.typeOptions?.maxValue !== undefined && value > prop.typeOptions.maxValue))
      )
        add('NODE_PARAMETER_RANGE', `${at} is outside the pinned bounds`);
    }
    for (const prop of shown)
      if (
        prop.required &&
        !Object.hasOwn(parameters, prop.name) &&
        (prop.default === undefined || prop.default === '')
      )
        add('NODE_PARAMETER_REQUIRED', `${path}.${prop.name} is required for this operation`);
  };
  validate(node.parameters, definition.properties, {});
}

function ports(node, definition, direction) {
  const declared = definition[direction];
  if (Array.isArray(declared)) return declared.map((p) => (typeof p === 'string' ? p : p.type));
  // These are explicit translations of the pinned dynamic port definitions, not
  // evaluation of strings from the catalog or model.
  const name = suffix(node.type);
  const p = node.parameters;
  if (direction === 'inputs' && name === 'merge') return Array(p.numberInputs ?? 2).fill('main');
  if (direction === 'outputs' && name === 'webhook')
    return Array(Array.isArray(p.httpMethod) ? p.httpMethod.length : 1).fill('main');
  if (direction === 'outputs' && name === 'respondToWebhook')
    return Array(
      node.typeVersion === 1.3 || (node.typeVersion >= 1.4 && p.enableResponseOutput) ? 2 : 1
    ).fill('main');
  if (direction === 'outputs' && name === 'switch')
    return Array(
      p.mode === 'expression'
        ? (p.numberOutputs ?? 4)
        : (p.rules?.values?.length ?? 0) + (p.options?.fallbackOutput === 'extra' ? 1 : 0)
    ).fill('main');
  return null;
}

export function reviewNativeWorkflow({
  workflow,
  spec,
  baseWorkflow,
  runtimePolicy = null,
  connections = [],
  environmentId = null,
  workflowRole = 'main',
}) {
  const issues = [];
  const blocked = [];
  const dependencies = [];
  const capabilities = [];
  const changes = [];
  const fail = () => ({
    valid: false,
    issues,
    workflow: null,
    workflowHash: null,
    spec: null,
    capabilities,
    dependencies,
    execution: { allowed: false, reasons: [...issues, ...blocked] },
    changes,
    summary: 'Native workflow requires correction; no execution is authorized',
  });
  if (!isBoundedNativeJson(workflow) || !isBoundedNativeJson(spec)) {
    issues.push(issue('WORKFLOW_BOUNDS', 'Workflow/spec must be bounded plain finite JSON'));
    return fail();
  }
  const parsed = NativeWorkflowSpecV2Schema.safeParse(spec);
  if (!parsed.success) {
    issues.push(
      issue('WORKFLOW_SPEC', 'Invalid V2 requirements, contracts or fixed acceptance cases')
    );
    return fail();
  }
  // Execution validates the transport schema before n8n receives the body.
  // A business-error case (including HTTP400) must therefore still be admitted
  // by this input contract. Do not silently rewrite either schema or test case.
  for (const test of parsed.data.acceptanceCases) {
    const checked = validateNativeWorkflowData({
      schema: parsed.data.inputSchema,
      value: test.input,
      includePaths: true,
    });
    for (const problem of checked.issues) {
      const dataPath = (problem.dataPath || '/').slice(0, 1000);
      issues.push({
        ...issue(
          'ACCEPTANCE_INPUT_SCHEMA',
          `Acceptance case ${test.id} cannot reach n8n: input at ${dataPath} fails ${problem.code}. Correct the transport schema or agreed case explicitly; no execution is authorized.`
        ),
        caseId: test.id,
        dataPath,
        dataIssue: problem.code,
      });
      if (issues.length >= 40) break;
    }
    if (issues.length >= 40) break;
  }
  if (issues.length) return fail();
  const outboundPolicy = isBoundedHttpPolicy(runtimePolicy);
  const errorHandler = workflowRole === 'error_handler';
  const ownedHandlerAllowed =
    runtimePolicy?.ownedErrorHandlers === true &&
    runtimePolicy?.backgroundExecution === 'instance_cpu_always';
  let bundleHash = null;
  if (parsed.data.ownedDependencies?.length) {
    try {
      if (errorHandler) throw new Error('nested_owned_dependency');
      const members = nativeBundleMembers({ workflow, spec: parsed.data });
      bundleHash = nativeBundleHash({ workflow, spec: parsed.data });
      for (const member of members.filter((item) => item.dependencyId !== null)) {
        const childConnections = connections
          .filter((entry) => entry.dependency_id === member.dependencyId)
          .map((entry) => ({
            ...entry,
            requirement_id: entry.member_requirement_id ?? entry.requirement_id,
          }));
        const child = reviewNativeWorkflow({
          workflow: member.workflow,
          spec: member.spec,
          runtimePolicy,
          connections: childConnections,
          environmentId,
          workflowRole: 'error_handler',
        });
        issues.push(
          ...child.issues.map((entry) => ({ ...entry, dependencyId: member.dependencyId }))
        );
        blocked.push(
          ...child.execution.reasons
            .filter((entry) => !child.issues.includes(entry))
            .map((entry) => ({ ...entry, dependencyId: member.dependencyId }))
        );
        dependencies.push(
          ...child.dependencies.map((entry) => ({ ...entry, dependencyId: member.dependencyId }))
        );
        capabilities.push(
          ...child.capabilities.map((entry) => ({ ...entry, dependencyId: member.dependencyId }))
        );
      }
    } catch {
      issues.push(
        issue(
          'OWNED_DEPENDENCY_INVALID',
          'The owned error-handler bundle needs a valid logical reference and bounded child contract'
        )
      );
    }
  }
  if (!errorHandler) connections = connections.filter((entry) => entry.dependency_id == null);
  let trustedBound = null;
  try {
    if (outboundPolicy)
      trustedBound = bindNativeConnections(workflow, parsed.data, connections, environmentId);
  } catch {
    /* Invalid records never confer native authority. */
  }
  if (
    !workflow ||
    typeof workflow !== 'object' ||
    Array.isArray(workflow) ||
    !Array.isArray(workflow.nodes) ||
    workflow.nodes.length < 1 ||
    workflow.nodes.length > 100 ||
    !workflow.connections ||
    typeof workflow.connections !== 'object' ||
    Array.isArray(workflow.connections)
  ) {
    issues.push(
      issue('WORKFLOW_STRUCTURE', 'Workflow needs 1–100 native nodes and a connections object')
    );
    return fail();
  }
  if (containsSolutionBuildSecret(workflow)) {
    issues.push(
      issue('WORKFLOW_SECRET', 'Embedded credentials or secret values are not permitted')
    );
    return fail();
  }
  for (const key of Object.keys(workflow))
    if (!topKeys.has(key))
      issues.push(issue('WORKFLOW_FIELD', `Unsupported workflow field: ${key}`));
  if (typeof workflow.name !== 'string' || !workflow.name.trim() || workflow.name.length > 120)
    issues.push(issue('WORKFLOW_NAME', 'Workflow requires a bounded descriptive name'));
  for (const key of ['pinData', 'staticData', 'meta'])
    if (
      workflow[key] != null &&
      (typeof workflow[key] !== 'object' || Object.keys(workflow[key]).length)
    )
      issues.push(issue('WORKFLOW_STATE', `${key} cannot introduce hidden execution state`));
  if (workflow.active !== undefined && workflow.active !== false)
    issues.push(issue('WORKFLOW_ACTIVE', 'Candidates must be inactive drafts'));
  const settings = workflow.settings ?? {};
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    issues.push(issue('WORKFLOW_SETTINGS', 'Settings must be an object'));
    return fail();
  }
  for (const key of Object.keys(settings))
    if (!settingsKeys.has(key))
      blocked.push(
        issue('WORKFLOW_SETTINGS_REVIEW', `Setting ${key} needs explicit runtime review`)
      );
  if (settings.errorWorkflow && (!bundleHash || !ownedHandlerAllowed || errorHandler))
    blocked.push(
      issue(
        'SUBWORKFLOW_VERSION_REQUIRED',
        'Error workflows require owned immutable dependency version pins'
      )
    );
  if (
    settings.availableInMCP === true ||
    (settings.callerPolicy && settings.callerPolicy !== 'workflowsFromSameOwner')
  )
    blocked.push(
      issue('WORKFLOW_AUTHORITY', 'MCP visibility and broader workflow callers are not authorized')
    );
  if (
    (settings.executionOrder && settings.executionOrder !== 'v1') ||
    ['saveDataSuccessExecution', 'saveDataErrorExecution'].some(
      (key) => settings[key] !== undefined && settings[key] !== 'none'
    ) ||
    settings.saveManualExecutions === true ||
    settings.saveExecutionProgress === true
  )
    blocked.push(
      issue(
        'WORKFLOW_RETENTION',
        'Execution order/retention must match the reviewed private runtime policy'
      )
    );
  if (
    settings.executionTimeout !== undefined &&
    (!Number.isInteger(settings.executionTimeout) ||
      settings.executionTimeout < 1 ||
      settings.executionTimeout > 60)
  )
    blocked.push(
      issue(
        'WORKFLOW_TIMEOUT',
        'Execution timeout must be bounded to at most 60 seconds for this profile'
      )
    );
  const byName = new Map();
  const byId = new Map();
  const definitions = new Map();
  const inputPorts = new Map();
  const outputPorts = new Map();
  const expressions = [];
  for (const node of workflow.nodes) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) {
      issues.push(issue('NODE_STRUCTURE', 'Every node must be a native node object'));
      continue;
    }
    if (
      typeof node.id !== 'string' ||
      !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(node.id) ||
      byId.has(node.id)
    )
      issues.push(issue('NODE_ID', 'Node IDs must be unique bounded identifiers', node.id));
    if (
      typeof node.name !== 'string' ||
      !node.name.trim() ||
      node.name.length > 120 ||
      byName.has(node.name)
    )
      issues.push(issue('NODE_NAME', 'Node names must be unique and descriptive', node.id));
    if (
      typeof node.type !== 'string' ||
      !/^(?:@[A-Za-z0-9_-]+\/)?[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(node.type) ||
      !Number.isFinite(node.typeVersion) ||
      node.typeVersion <= 0
    ) {
      issues.push(issue('NODE_TYPE', 'Node type and version must be explicit', node.id));
      continue;
    }
    if (
      !Array.isArray(node.position) ||
      node.position.length !== 2 ||
      node.position.some((p) => !Number.isFinite(p) || Math.abs(p) > 100000)
    )
      issues.push(
        issue('NODE_POSITION', 'Node positions must be finite coordinate pairs', node.id)
      );
    if (!node.parameters || typeof node.parameters !== 'object' || Array.isArray(node.parameters)) {
      issues.push(issue('NODE_PARAMETERS', 'Node parameters must be an object', node.id));
      continue;
    }
    for (const key of Object.keys(node))
      if (!nodeKeys.has(key))
        issues.push(issue('NODE_FIELD', `Unsupported native node field: ${key}`, node.id));
    for (const key of [
      'disabled',
      'notesInFlow',
      'executeOnce',
      'alwaysOutputData',
      'retryOnFail',
      'continueOnFail',
    ])
      if (node[key] !== undefined && typeof node[key] !== 'boolean')
        issues.push(issue('NODE_SETTING_TYPE', `Native setting ${key} must be boolean`, node.id));
    byName.set(node.name, node);
    byId.set(node.id, node);
    if (
      node.credentials &&
      Object.keys(node.credentials).length &&
      !(
        outboundPolicy &&
        node.type === BOUNDED_HTTP_NODE.type &&
        equal(
          node.credentials,
          trustedBound?.nodes?.find((entry) => entry.id === node.id)?.credentials
        )
      )
    )
      issues.push(
        issue(
          'NODE_CREDENTIAL_AUTHORITY',
          'Candidate JSON must reference Orqaly connection requirements, not raw native credential IDs',
          node.id
        )
      );
    if (node.disabled)
      blocked.push(
        issue(
          'NODE_DISABLED',
          'Disabled nodes require explicit exclusion from runtime requirements and evidence',
          node.id
        )
      );
    if (
      node.retryOnFail ||
      node.continueOnFail ||
      (node.onError && node.onError !== 'stopWorkflow')
    )
      blocked.push(
        issue(
          'NODE_RETRY_POLICY',
          'Native retries/error-continuation need explicit effect and retry review',
          node.id
        )
      );
    const definition =
      node.type === BOUNDED_HTTP_NODE.type && node.typeVersion === 1
        ? BOUNDED_HTTP_DEFINITION
        : getNativeNodeDefinition(node.type, node.typeVersion)?.definition;
    if (!definition) {
      const known = listNativeNodeDefinitions().some((n) => n.type === node.type);
      if (known)
        issues.push(
          issue('NODE_VERSION', 'Node version does not exist in the pinned n8n catalog', node.id)
        );
      else
        dependencies.push({
          id: `node:${node.id}`,
          kind: 'node',
          nodeId: node.id,
          description: `Review/install ${node.type}@${node.typeVersion}; this draft is preserved but cannot execute`,
        });
      blocked.push(
        issue('NODE_UNAVAILABLE', 'An unknown node package/version cannot execute', node.id)
      );
    } else {
      definitions.set(node.name, definition);
      validateParameters(node, definition, issues, blocked);
      try {
        inputPorts.set(node.name, ports(node, definition, 'inputs'));
        outputPorts.set(node.name, ports(node, definition, 'outputs'));
      } catch {
        issues.push(issue('NODE_PORTS', 'Invalid dynamic input/output count', node.id));
      }
      if (!inputPorts.get(node.name) || !outputPorts.get(node.name))
        blocked.push(
          issue('NODE_PORT_REVIEW', 'Dynamic node ports require a reviewed resolver', node.id)
        );
    }
    const type = suffix(node.type);
    const capability = ['httpRequest', 'github', 'twilio', 'boundedHttp'].includes(type)
      ? 'external_action'
      : ['code', 'executeCommand'].includes(type)
        ? 'code_execution'
        : ['scheduleTrigger', 'wait'].includes(type)
          ? 'durable_trigger'
          : ['executeWorkflow', 'executeWorkflowTrigger'].includes(type)
            ? 'subworkflow'
            : pureTypes.has(type)
              ? 'pure_data'
              : errorHandler && node.type === NATIVE_ERROR_HANDLER_TYPE && node.typeVersion === 1
                ? 'owned_error_trigger'
                : 'unreviewed';
    capabilities.push({
      nodeId: node.id,
      type: node.type,
      typeVersion: node.typeVersion,
      capability,
    });
    if (node.type === BOUNDED_HTTP_NODE.type) {
      try {
        validateBoundedNodeParameters(node);
      } catch {
        blocked.push(
          issue(
            'OUTBOUND_NODE_POLICY',
            'This delivery requires one fixed public HTTPS POST and the reviewed non-retrying node mode',
            node.id
          )
        );
      }
    }
    if (
      capability !== 'pure_data' &&
      !(outboundPolicy && node.type === BOUNDED_HTTP_NODE.type) &&
      !(ownedHandlerAllowed && errorHandler && capability === 'owned_error_trigger')
    )
      blocked.push(
        issue(
          'RUNTIME_CAPABILITY',
          `${capability} needs a separately reviewed runtime/connection boundary`,
          node.id
        )
      );
    if (
      (type === 'sort' && node.parameters.type === 'code') ||
      (type === 'merge' && node.parameters.mode === 'combineBySql')
    )
      blocked.push(
        issue(
          'NODE_CODE_MODE',
          'Custom code/SQL modes require a separate execution policy',
          node.id
        )
      );
    const walk = (value) => {
      if (typeof value === 'string' && value.includes('{{'))
        expressions.push({ node, expression: value });
      else if (value && typeof value === 'object') Object.values(value).forEach(walk);
    };
    walk(node.parameters);
  }
  if (
    issues.some((i) =>
      ['NODE_STRUCTURE', 'NODE_TYPE', 'NODE_NAME', 'NODE_ID', 'NODE_PARAMETERS'].includes(i.code)
    )
  )
    return fail();
  const adjacency = new Map(workflow.nodes.map((n) => [n.name, []]));
  const inbound = new Map(workflow.nodes.map((n) => [n.name, new Set()]));
  for (const [source, connectionTypes] of Object.entries(workflow.connections)) {
    if (
      !byName.has(source) ||
      !connectionTypes ||
      typeof connectionTypes !== 'object' ||
      Array.isArray(connectionTypes)
    ) {
      issues.push(issue('GRAPH_SOURCE', 'Connections reference a missing or malformed source'));
      continue;
    }
    for (const [connectionType, groups] of Object.entries(connectionTypes)) {
      if (!Array.isArray(groups) || groups.length > 100) {
        issues.push(issue('GRAPH_CONNECTIONS', 'Connection outputs must be bounded arrays'));
        continue;
      }
      groups.forEach((targets, outputIndex) => {
        if (!Array.isArray(targets) || targets.length > 100) {
          issues.push(issue('GRAPH_CONNECTIONS', 'Connection targets must be bounded arrays'));
          return;
        }
        const outputs = outputPorts.get(source);
        if (
          targets.length &&
          outputs &&
          outputs.filter((p) => p === connectionType).length <= outputIndex
        )
          issues.push(
            issue(
              'GRAPH_OUTPUT_PORT',
              'Connection uses a nonexistent output port',
              byName.get(source).id
            )
          );
        const seen = new Set();
        for (const target of targets) {
          if (
            !target ||
            typeof target !== 'object' ||
            Object.keys(target).some((k) => !['node', 'type', 'index'].includes(k)) ||
            !byName.has(target.node) ||
            target.type !== connectionType ||
            !Number.isInteger(target.index) ||
            target.index < 0 ||
            target.index > 99
          ) {
            issues.push(
              issue(
                'GRAPH_TARGET',
                'Connection references an invalid target/type/index',
                byName.get(source).id
              )
            );
            continue;
          }
          const key = `${target.node}:${target.type}:${target.index}`;
          if (seen.has(key))
            issues.push(
              issue(
                'GRAPH_DUPLICATE_EDGE',
                'Duplicate wires could duplicate execution',
                byName.get(source).id
              )
            );
          seen.add(key);
          const inputs = inputPorts.get(target.node);
          if (inputs && inputs.filter((p) => p === target.type).length <= target.index)
            issues.push(
              issue(
                'GRAPH_INPUT_PORT',
                'Connection uses a nonexistent input port',
                byName.get(target.node).id
              )
            );
          adjacency.get(source).push(target.node);
          inbound.get(target.node).add(target.index);
        }
      });
    }
  }
  for (const { node, expression } of expressions) {
    const inspected = inspectNativeExpression(expression);
    if (!inspected.safe) blocked.push(issue('EXPRESSION_REVIEW', inspected.reason, node.id));
    for (const name of inspected.references)
      if (!byName.has(name))
        issues.push(
          issue('EXPRESSION_REFERENCE', 'Expression references a missing named node', node.id)
        );
  }
  const triggers = workflow.nodes.filter((n) =>
    definitions.get(n.name)?.group?.includes('trigger')
  );
  const reached = new Set();
  const reach = (name) => {
    if (reached.has(name)) return;
    reached.add(name);
    adjacency.get(name)?.forEach(reach);
  };
  triggers.forEach((n) => reach(n.name));
  if (!triggers.length)
    blocked.push(
      issue(
        'TRIGGER_REQUIRED',
        'A supported trigger must be connected before this draft can execute'
      )
    );
  for (const node of workflow.nodes) {
    if (!reached.has(node.name) && suffix(node.type) !== 'stickyNote')
      blocked.push(
        issue('GRAPH_UNREACHABLE', 'Node is not reachable from a known trigger', node.id)
      );
    if (
      suffix(node.type) === 'merge' &&
      inbound.get(node.name).size !== (inputPorts.get(node.name)?.length ?? 0)
    )
      issues.push(
        issue('GRAPH_MERGE_INPUTS', 'Merge must have a wire to each declared input', node.id)
      );
  }
  const visiting = new Set();
  const visited = new Set();
  const cycle = (name) => {
    if (visiting.has(name)) return true;
    if (visited.has(name)) return false;
    visiting.add(name);
    const found = adjacency.get(name).some(cycle);
    visiting.delete(name);
    visited.add(name);
    return found;
  };
  if (workflow.nodes.some((n) => cycle(n.name)))
    blocked.push(
      issue(
        'GRAPH_LOOP_BUDGET',
        'Cyclic graphs require a separately proven bounded-iteration policy'
      )
    );
  const outboundNodes = workflow.nodes.filter((node) => node.type === BOUNDED_HTTP_NODE.type);
  if (outboundNodes.length) {
    if (outboundNodes.length !== 1)
      blocked.push(
        issue('OUTBOUND_CARDINALITY', 'This profile permits one bounded delivery per invocation')
      );
    else {
      const outbound = outboundNodes[0];
      const incoming = new Map(workflow.nodes.map((node) => [node.name, []]));
      for (const [from, targets] of adjacency)
        for (const to of targets) incoming.get(to).push(from);
      const checked = new Set();
      let current = outbound.name;
      while (current && !checked.has(current)) {
        checked.add(current);
        const parents = incoming.get(current) ?? [];
        if (parents.length > 1) {
          blocked.push(
            issue(
              'OUTBOUND_CARDINALITY',
              'Multiple upstream paths could deliver the same effect more than once',
              outbound.id
            )
          );
          break;
        }
        current = parents[0];
      }
      const withoutDelivery = new Set();
      const reachWithoutDelivery = (name) => {
        if (name === outbound.name || withoutDelivery.has(name)) return;
        withoutDelivery.add(name);
        adjacency.get(name)?.forEach(reachWithoutDelivery);
      };
      triggers.forEach((node) => reachWithoutDelivery(node.name));
      if (
        workflow.nodes.some(
          (node) =>
            node.type === 'n8n-nodes-base.respondToWebhook' && withoutDelivery.has(node.name)
        )
      )
        blocked.push(
          issue(
            'OUTBOUND_RECEIPT_PATH',
            'Every response must follow the bounded delivery; a bypass cannot prove it executed',
            outbound.id
          )
        );
      if (
        !spec.connections.some(
          (connection) =>
            connection.nodeIds.length === 1 &&
            connection.nodeIds[0] === outbound.id &&
            connection.credentialType === 'orqalyBoundedHttp'
        )
      )
        blocked.push(
          issue(
            'CONNECTION_REQUIRED',
            'The bounded delivery requires its own frozen owner-scoped connection',
            outbound.id
          )
        );
    }
  }
  for (const connection of spec.connections) {
    for (const id of connection.nodeIds) {
      const node = byId.get(id);
      if (!node)
        issues.push(issue('CONNECTION_NODE', 'Connection requirement references a missing node'));
      else if (
        connection.credentialType &&
        definitions.get(node.name)?.credentials?.length &&
        !definitions.get(node.name).credentials.some((c) => c.name === connection.credentialType)
      )
        issues.push(
          issue(
            'CONNECTION_TYPE',
            'Connection credential type does not match the pinned native node',
            id
          )
        );
    }
    const record = connections.find(
      (entry) =>
        entry.requirement_id === connection.id && ['saved', 'verified'].includes(entry.status)
    );
    const described =
      record &&
      describeNativeConnection({
        requirement: connection,
        workflow,
        connection: record,
        environmentId,
      });
    const connected =
      outboundPolicy &&
      connection.credentialType === 'orqalyBoundedHttp' &&
      described &&
      ['saved', 'verified'].includes(described.status) &&
      connection.nodeIds.every((id) => {
        const node = byId.get(id);
        return (
          node?.type === BOUNDED_HTTP_NODE.type &&
          node.credentials &&
          equal(
            node.credentials,
            trustedBound?.nodes?.find((entry) => entry.id === id)?.credentials
          )
        );
      });
    if (connected) continue;
    dependencies.push({
      id: connection.id,
      kind: 'connection',
      description: `Securely connect and verify ${connection.provider} for ${connection.operation}`,
    });
    blocked.push(
      issue(
        'CONNECTION_REQUIRED',
        'Outgoing connections must be resolved through the owner-scoped connection service'
      )
    );
  }
  if (spec.runtimeProfile !== 'request_automation') {
    dependencies.push({
      id: `runtime:${spec.runtimeProfile}`,
      kind: 'runtime',
      description: `${spec.runtimeProfile} needs its isolated runtime and lifecycle acceptance`,
    });
    blocked.push(
      issue(
        'RUNTIME_PROFILE',
        'This profile is designable but not enabled by the request-automation policy'
      )
    );
  }
  const policyValid =
    runtimePolicy &&
    runtimePolicy.profile === 'request_automation' &&
    runtimePolicy.n8nVersion === '2.37.10' &&
    (runtimePolicy.imageDigest === NATIVE_WORKFLOW_CATALOG_PIN.imageDigest || outboundPolicy) &&
    runtimePolicy.expressionPolicy === 'pure-data-v1' &&
    ((runtimePolicy.egress === 'deny' && runtimePolicy.credentials === 'deny') || outboundPolicy) &&
    runtimePolicy.code === false &&
    runtimePolicy.durableTriggers === false &&
    Number.isInteger(runtimePolicy.maxNodes) &&
    runtimePolicy.maxNodes >= 1 &&
    runtimePolicy.maxNodes <= 100 &&
    Number.isInteger(runtimePolicy.maxExecutionSeconds) &&
    runtimePolicy.maxExecutionSeconds >= 1 &&
    runtimePolicy.maxExecutionSeconds <= 60 &&
    Array.isArray(runtimePolicy.allowedNodes) &&
    runtimePolicy.allowedNodes.every(
      (node) =>
        REQUEST_AUTOMATION_POLICY.allowedNodes.some((allowed) => equal(allowed, node)) ||
        (outboundPolicy && equal(node, BOUNDED_HTTP_NODE))
    );
  if (!policyValid)
    blocked.push(
      issue(
        'RUNTIME_POLICY_REQUIRED',
        'No valid server-owned pinned runtime policy authorizes execution'
      )
    );
  else {
    if (
      workflow.nodes.length > runtimePolicy.maxNodes ||
      (settings.executionTimeout ?? 60) > runtimePolicy.maxExecutionSeconds
    )
      blocked.push(issue('RUNTIME_LIMIT', 'Workflow exceeds the assigned runtime budget'));
    for (const node of workflow.nodes)
      if (
        !(
          ownedHandlerAllowed &&
          errorHandler &&
          node.type === NATIVE_ERROR_HANDLER_TYPE &&
          node.typeVersion === 1
        ) &&
        !runtimePolicy.allowedNodes.some(
          (n) => n.type === node.type && n.typeVersion === node.typeVersion
        )
      )
        blocked.push(
          issue(
            'RUNTIME_NODE_DISABLED',
            'Node/version is not enabled in this execution environment',
            node.id
          )
        );
    const webhook = triggers.filter((n) => n.type === 'n8n-nodes-base.webhook');
    if (
      errorHandler &&
      (!ownedHandlerAllowed ||
        triggers.length !== 1 ||
        triggers[0].type !== NATIVE_ERROR_HANDLER_TYPE ||
        triggers[0].typeVersion !== 1 ||
        workflow.nodes.some((node) =>
          ['n8n-nodes-base.webhook', 'n8n-nodes-base.respondToWebhook'].includes(node.type)
        ))
    )
      blocked.push(
        issue(
          'OWNED_ERROR_TRIGGER_REQUIRED',
          'An owned handler requires exactly one native Error Trigger and no independent webhook'
        )
      );
    if (
      !errorHandler &&
      (triggers.length !== 1 ||
        webhook.length !== 1 ||
        webhook[0].parameters.httpMethod !== 'POST' ||
        webhook[0].parameters.responseMode !== 'responseNode')
    )
      blocked.push(
        issue(
          'RUNTIME_TRIGGER',
          'The request profile requires one POST webhook with explicit response-node handling'
        )
      );
    if (
      !errorHandler &&
      !workflow.nodes.some(
        (n) => n.type === 'n8n-nodes-base.respondToWebhook' && reached.has(n.name)
      )
    )
      blocked.push(
        issue('RUNTIME_RESPONSE', 'The request profile requires a reachable response node')
      );
    if (
      workflow.nodes.some(
        (n) =>
          n.type === 'n8n-nodes-base.respondToWebhook' &&
          (n.parameters.respondWith ?? 'firstIncomingItem') !== 'json'
      )
    )
      blocked.push(
        issue('RUNTIME_RESPONSE_TYPE', 'The first request profile returns explicit business JSON')
      );
  }
  if (baseWorkflow && isBoundedNativeJson(baseWorkflow)) {
    const prior = new Map((baseWorkflow.nodes ?? []).map((n) => [n.id, n]));
    for (const n of workflow.nodes)
      if (!prior.has(n.id)) changes.push({ kind: 'node_added', message: `Added ${n.name}` });
      else if (!equal(prior.get(n.id), n))
        changes.push({ kind: 'node_changed', message: `Changed ${n.name}` });
    for (const n of prior.values())
      if (!byId.has(n.id)) changes.push({ kind: 'node_removed', message: `Removed ${n.name}` });
    if (!equal(baseWorkflow.connections, workflow.connections))
      changes.push({ kind: 'graph_changed', message: 'Workflow connections changed' });
    if (!equal(baseWorkflow.settings ?? {}, settings))
      changes.push({ kind: 'settings_changed', message: 'Runtime settings changed' });
  }
  const valid = issues.length === 0;
  return {
    valid,
    issues,
    workflow: structuredClone(workflow),
    workflowHash: nativeWorkflowHash(workflow),
    bundleHash,
    spec: parsed.data,
    capabilities,
    dependencies,
    execution: { allowed: valid && blocked.length === 0, reasons: [...issues, ...blocked] },
    changes,
    summary: valid
      ? blocked.length
        ? 'Native draft is structurally valid; execution prerequisites remain'
        : 'Native draft passes static request-profile checks; actual test evidence is still required'
      : 'Native workflow needs correction; no execution is authorized',
  };
}
