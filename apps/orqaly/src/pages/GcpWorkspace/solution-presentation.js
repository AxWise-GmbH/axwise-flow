// Presentation-only module: don't pull Zod's server-side compiler schemas into
// the Agent directory just to display a status label.
export const SOLUTION_STATUS_LABELS = {
  draft: 'Review before deployment',
  deploying: 'Deploying workflow',
  deployment_unknown: 'Deployment needs verification',
  ready: 'Ready to test',
  active: 'Active',
  paused: 'Paused',
};

export const isNativeWorkflowSpec = (spec) => spec?.kind === 'n8n_workflow_v2';

// Presentation only. Examples do not run a workflow or establish test success.
export function workflowExampleInput(spec) {
  if (isNativeWorkflowSpec(spec)) {
    const example = spec.acceptanceCases?.find((item) => Object.hasOwn(item, 'input'));
    if (example) return structuredClone(example.input);
    return schemaExample(spec.inputSchema);
  }
  return Object.fromEntries(
    (spec?.fields || []).map((field) => [
      field.source,
      field.source === 'email' ? 'ALICE@EXAMPLE.COM' : '  Alice  ',
    ])
  );
}

function schemaExample(schema, depth = 0) {
  if (!schema || typeof schema !== 'object' || depth > 5) return null;
  if (Object.hasOwn(schema, 'const')) return structuredClone(schema.const);
  if (Array.isArray(schema.examples) && schema.examples.length)
    return structuredClone(schema.examples[0]);
  if (Object.hasOwn(schema, 'default')) return structuredClone(schema.default);
  if (Array.isArray(schema.enum) && schema.enum.length) return structuredClone(schema.enum[0]);
  const type = Array.isArray(schema.type)
    ? schema.type.find((value) => value !== 'null')
    : schema.type;
  if (type === 'object' || schema.properties)
    return Object.fromEntries(
      Object.entries(schema.properties || {})
        .slice(0, 24)
        .map(([key, value]) => [key, schemaExample(value, depth + 1)])
    );
  if (type === 'array') return [];
  if (type === 'boolean') return false;
  if (type === 'number' || type === 'integer') return 0;
  if (type === 'string') return '';
  return null;
}

export function workflowInputError(text) {
  if (typeof text !== 'string' || text.length > 128_000)
    return 'Use a sample input smaller than 128 KB.';
  try {
    JSON.parse(text);
    return null;
  } catch {
    return 'Enter valid JSON. Objects and arrays can contain nested values.';
  }
}

export function workflowSchemaFields(schema, prefix = '', depth = 0) {
  if (!schema || typeof schema !== 'object' || depth > 4) return [];
  const rows = [];
  const type = Array.isArray(schema.type) ? schema.type.join(' or ') : schema.type;
  if (schema.properties && typeof schema.properties === 'object') {
    for (const [name, child] of Object.entries(schema.properties).slice(0, 24)) {
      const path = prefix ? `${prefix}.${name}` : name;
      rows.push({
        path,
        type: Array.isArray(child?.type) ? child.type.join(' or ') : child?.type || 'value',
        required: schema.required?.includes(name) === true,
        description: child?.description,
      });
      if (child?.properties) rows.push(...workflowSchemaFields(child, path, depth + 1));
      if (child?.items?.properties)
        rows.push(...workflowSchemaFields(child.items, `${path}[]`, depth + 1));
    }
  } else if (type === 'array' && schema.items?.properties) {
    rows.push(...workflowSchemaFields(schema.items, `${prefix}[]`, depth + 1));
  } else
    rows.push({
      path: prefix || 'Root value',
      type: type || 'JSON value',
      description: schema.description,
    });
  return rows.slice(0, 48);
}

export const workflowRequirementText = (item) =>
  typeof item === 'string'
    ? item
    : item?.description ||
      item?.text ||
      item?.summary ||
      item?.name ||
      item?.id ||
      'Recorded requirement';

export function executionHasUnknownOutcome(value) {
  return (
    ['outcome_unknown', 'unknown', 'execution_unknown'].includes(value?.status) ||
    ['EXECUTION_OUTCOME_UNKNOWN', 'OUTCOME_UNKNOWN'].includes(value?.errorCode)
  );
}

export function hasVerifiedBuildTest(build) {
  if (!isNativeWorkflowSpec(build?.spec)) return true;
  const evidence = build.testEvidence;
  return (
    evidence?.status === 'succeeded' &&
    ['controlled_runtime', 'live_connection'].includes(evidence.kind) &&
    evidence.workflowHash === build.workflowHash &&
    Array.isArray(evidence.caseResults) &&
    evidence.caseResults.length > 0 &&
    evidence.caseResults.every((item) => item.passed === true && !!item.executionId)
  );
}
