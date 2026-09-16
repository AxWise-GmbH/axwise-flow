export const BUILD_STATES = {
  designing: {
    label: 'Designing workflow',
    color: 'info',
    next: 'Orqanix is preparing the next native draft for this task.',
  },
  validating: {
    label: 'Validating saved workflow',
    color: 'info',
    next: 'Checking the saved graph and its requested capabilities. Validation is not execution.',
  },
  testing: {
    label: 'Testing workflow',
    color: 'info',
    next: 'An authorized test is in progress. Results will appear when recorded.',
  },
  repairing: {
    label: 'Repairing draft',
    color: 'info',
    next: 'Preparing a revision from the recorded diagnostics. The active workflow stays unchanged.',
  },
  dependencies: {
    label: 'Setup required',
    color: 'warning',
    next: 'The saved draft needs the listed capability or connection before it can continue.',
  },
  ready_for_review: {
    label: 'Ready for review',
    color: 'success',
    next: 'Inspect the saved workflow, evidence and requested effects before approval.',
  },
  preparing: {
    label: 'Preparing workflow',
    color: 'info',
    next: 'Your build request is saved. Waiting for the next design result.',
  },
  needs_input: {
    label: 'Needs you',
    color: 'warning',
    next: 'Answer the question to resume this same build.',
  },
  draft: {
    label: 'Draft · not runnable',
    color: 'default',
    next: 'Inspect the draft, then review its saved behavior.',
  },
  reviewed: {
    label: 'Ready for handoff',
    color: 'success',
    next: 'Check the exact behavior below, then create the Solution.',
  },
  completed: {
    label: 'Solution created',
    color: 'success',
    next: 'Open the Solution to review deployment, test it and control activation.',
  },
  cancelled: {
    label: 'Build stopped',
    color: 'default',
    next: 'No further work will be started. The draft and recorded results remain available; an already dispatched action may still finish.',
  },
  unsupported: {
    label: 'Not supported yet',
    color: 'warning',
    next: 'This request was not converted into a different automation.',
  },
  failed: {
    label: 'Preparation failed',
    color: 'error',
    next: 'Check the saved failure, then retry preparation if appropriate. Nothing has been deployed.',
  },
};

export const BUILD_WORKING_STATES = new Set([
  'preparing',
  'designing',
  'validating',
  'testing',
  'repairing',
]);

export const isWorkingBuild = (build) =>
  !['completed', 'cancelled', 'failed', 'unsupported'].includes(build.status) &&
  (BUILD_WORKING_STATES.has(build.status) ||
    ['designing', 'repairing', 'testing'].includes(build.progress?.stage) ||
    ['queued', 'running'].includes(build.testEvidence?.status));

export const buildState = (status) =>
  BUILD_STATES[status] || {
    label: 'Status unavailable',
    color: 'warning',
    next: 'Refresh before taking another action.',
  };

export function buildFailureMessage(error) {
  const code = typeof error === 'string' ? error : error?.code;
  if (code === 'AXWISE_NATIVE_SOLUTION_BUDGET_EXHAUSTED')
    return 'Design stopped at its usage limit. Your task and saved draft are safe. Narrow the requested change or explicitly start another attempt; no automatic retry is running.';
  if (code === 'AXWISE_SOLUTION_DESIGN_DEADLINE')
    return 'Design reached its time limit. Your task and saved draft are safe. You can request a smaller change or explicitly try again; no automatic retry is running.';
  return (
    (typeof error === 'string' ? error : error?.message) ||
    'Workflow preparation failed. The saved request and any draft remain available.'
  );
}
// The server projects only current open questions. Historical answers must not
// suppress a new input-version question with a reused semantic ID.
export const openBuildQuestions = (build) =>
  (build.questions || []).filter((question) => question.status !== 'answered');
export const buildHref = (id) => `/workspace/builds/${encodeURIComponent(id)}`;

// A local, explicitly non-executing illustration of the reviewed scalar mapping.
// This is not an n8n execution result or authorization to run a workflow.
export function illustrateMapping(spec, text) {
  if (spec?.kind !== 'webhook_transform_v1' || !Array.isArray(spec.fields))
    throw new Error('A complete supported mapping is needed for an input/output preview.');
  const input = JSON.parse(text);
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('Enter a JSON object with the input fields shown above.');
  const output = {};
  for (const field of spec.fields) {
    if (!Object.hasOwn(input, field.source))
      throw new Error(`Input field “${field.source}” is missing.`);
    const value = input[field.source];
    if (value !== null && !['string', 'number', 'boolean'].includes(typeof value))
      throw new Error(`“${field.source}” must contain a scalar value, not an object or array.`);
    if (field.transform !== 'copy' && typeof value !== 'string')
      throw new Error(`“${field.source}” must be text for ${field.transform}.`);
    const transform = {
      copy: (v) => v,
      trim: (v) => v.trim(),
      lowercase: (v) => v.toLowerCase(),
      uppercase: (v) => v.toUpperCase(),
    }[field.transform];
    if (!transform) throw new Error('This transformation is not supported by the preview.');
    Object.defineProperty(output, field.target, { value: transform(value), enumerable: true });
  }
  return output;
}
