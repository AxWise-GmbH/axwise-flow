// Small, shared read-only DTO boundary. Keep the server's command/authority
// schemas out of the browser bundle; this view grants no execution authority.
export const GOAL_WORKFLOW_VIEW_LIMITS = Object.freeze({ stages: 64, outputs: 65, lineage: 128 });

/** @typedef {{family: 'canonical_artifact', runId: string, artifactId: string, artifactHash: string, kind: string}} GoalOutputReference */
/** @typedef {{domain: string, raw: string|null, label: string, basis: 'ledger'}} GoalLedgerStatus */
/** @typedef {{reference: GoalOutputReference, artifactType: null, contentType: string|null, sourceArtifactIds: string[]|null, inputHash: string|null}} GoalOutputMetadata */
/** @typedef {{id: string, kind: string|null, stageKey: string|null, ordinal: number|null, rowVersion: number|null, status: GoalLedgerStatus, inputHash: string|null, output: GoalOutputReference|null}} GoalStepMetadata */
/**
 * @typedef {object} GoalWorkflowView
 * @property {'orqaly.workflow-view.v1'} schemaVersion
 * @property {string} id
 * @property {{kind: 'goal_run', id: string}} source
 * @property {{tenantId: string, ownerUserId: string}} scope
 * @property {string|null} title
 * @property {string|null} objective
 * @property {GoalLedgerStatus} status
 * @property {string|null} evidenceReadiness
 * @property {number} rowVersion
 * @property {string} requestHash
 * @property {string|null} createdAt
 * @property {string|null} updatedAt
 * @property {GoalOutputMetadata[]} outputs
 * @property {GoalStepMetadata[]} steps
 * @property {null} inputs
 * @property {never[]} attempts
 * @property {never[]} dependencies
 * @property {never[]} approvals
 * @property {never[]} children
 * @property {never[]} issues
 * @property {{goalRunId: null, buildRequestId: null, solutionId: null}} links
 */
/**
 * @typedef {object} GoalWorkflowViewResponse
 * @property {GoalWorkflowView} workflow
 * @property {{stages: {loaded: number, limit: number, complete: boolean}, outputs: {loaded: number, limit: number, complete: boolean}, lineage: {limitPerOutput: number, incompleteArtifactIds: string[]}, attempts: 'not_loaded', dependencies: 'not_loaded', approvals: 'not_loaded', history: 'not_loaded', content: 'not_loaded'}} coverage
 */

const uuid = (v) =>
  typeof v === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const hash = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const string = (max) => (v) => typeof v === 'string' && v.length > 0 && v.length <= max;
const integer = (v) => Number.isSafeInteger(v) && v >= 0;
const literal = (expected) => (v) => v === expected;
const nullable = (check) => (v) => v === null || check(v);
const array = (check, max) => (v) => Array.isArray(v) && v.length <= max && v.every(check);
const empty = (v) => Array.isArray(v) && v.length === 0;
const unique = (v) => new Set(v).size === v.length;
const object = (fields) => (v) =>
  v !== null &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  Object.keys(v).length === Object.keys(fields).length &&
  Object.entries(fields).every(([name, check]) => Object.hasOwn(v, name) && check(v[name]));
const date = (v) =>
  typeof v === 'string' && v.length <= 64 && /T.*Z$/.test(v) && Number.isFinite(Date.parse(v));
const limits = GOAL_WORKFLOW_VIEW_LIMITS;
const reference = object({
  family: literal('canonical_artifact'),
  runId: uuid,
  artifactId: uuid,
  artifactHash: hash,
  kind: string(120),
});
const status = (domain) =>
  object({
    domain: literal(domain),
    raw: nullable(string(120)),
    label: string(200),
    basis: literal('ledger'),
  });
const output = object({
  reference,
  artifactType: literal(null),
  contentType: nullable(string(200)),
  sourceArtifactIds: nullable(array(uuid, limits.lineage)),
  inputHash: nullable(hash),
});
const step = object({
  id: uuid,
  kind: nullable(string(120)),
  stageKey: nullable(string(120)),
  ordinal: nullable(integer),
  rowVersion: nullable(integer),
  status: status('goal_stage'),
  inputHash: nullable(hash),
  output: nullable(reference),
});
const view = object({
  schemaVersion: literal('orqaly.workflow-view.v1'),
  id: string(100),
  source: object({ kind: literal('goal_run'), id: uuid }),
  scope: object({
    tenantId: uuid,
    ownerUserId: (v) => typeof v === 'string' && /^user_[A-Za-z0-9]+$/.test(v) && v.length <= 200,
  }),
  title: nullable(string(24_000)),
  objective: nullable(string(24_000)),
  status: status('goal_run'),
  evidenceReadiness: nullable(string(120)),
  rowVersion: integer,
  requestHash: hash,
  createdAt: nullable(date),
  updatedAt: nullable(date),
  inputs: literal(null),
  outputs: array(output, limits.outputs),
  steps: array(step, limits.stages),
  attempts: empty,
  dependencies: empty,
  approvals: empty,
  children: empty,
  issues: empty,
  links: object({
    goalRunId: literal(null),
    buildRequestId: literal(null),
    solutionId: literal(null),
  }),
});
const coverageCount = (limit) =>
  object({
    loaded: (v) => integer(v) && v <= limit,
    limit: literal(limit),
    complete: (v) => typeof v === 'boolean',
  });
const response = object({
  workflow: view,
  coverage: object({
    stages: coverageCount(limits.stages),
    outputs: coverageCount(limits.outputs),
    lineage: object({
      limitPerOutput: literal(limits.lineage),
      incompleteArtifactIds: array(uuid, limits.outputs),
    }),
    attempts: literal('not_loaded'),
    dependencies: literal('not_loaded'),
    approvals: literal('not_loaded'),
    history: literal('not_loaded'),
    content: literal('not_loaded'),
  }),
});

export const GoalWorkflowViewResponseSchema = Object.freeze({
  /** @returns {GoalWorkflowViewResponse} */
  parse(value) {
    if (!response(value)) throw new TypeError('Invalid Goal workflow view');
    const { workflow, coverage } = value;
    const outputById = new Map(workflow.outputs.map((item) => [item.reference.artifactId, item]));
    const sameReference = (a, b) =>
      a &&
      b &&
      ['family', 'runId', 'artifactId', 'artifactHash', 'kind'].every(
        (field) => a[field] === b[field]
      );
    if (
      workflow.id !== `goal_run:${workflow.source.id}` ||
      workflow.title !== workflow.objective ||
      !unique(workflow.steps.map((item) => item.id)) ||
      outputById.size !== workflow.outputs.length ||
      workflow.outputs.some(
        (item) =>
          item.reference.runId !== workflow.source.id ||
          (item.sourceArtifactIds && !unique(item.sourceArtifactIds))
      ) ||
      workflow.steps.some(
        (item) =>
          item.output &&
          !sameReference(item.output, outputById.get(item.output.artifactId)?.reference)
      ) ||
      coverage.stages.loaded !== workflow.steps.length ||
      coverage.outputs.loaded !== workflow.outputs.length ||
      (!coverage.stages.complete && coverage.outputs.complete) ||
      !unique(coverage.lineage.incompleteArtifactIds) ||
      coverage.lineage.incompleteArtifactIds.some((id) => !outputById.has(id))
    ) {
      throw new TypeError('Inconsistent Goal workflow view identity or coverage');
    }
    return value;
  },
});
