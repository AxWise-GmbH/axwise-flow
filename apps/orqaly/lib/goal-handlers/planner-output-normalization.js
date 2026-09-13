import {
  CREDENTIAL_FREE_DOCUMENT_TOOL_ID,
  isKnownToolId,
  normalizeToolId,
} from '../_shared/tool-ids.js';

export const PLANNER_DELIVERABLE_TYPES = Object.freeze([
  'markdown',
  'code',
  'deployment',
  'presentation',
  'asset',
  'data',
]);

const PLANNER_DELIVERABLE_TYPE_SET = new Set(PLANNER_DELIVERABLE_TYPES);
const DELIVERABLE_ALIASES = new Map([
  ['md', 'markdown'],
  ['document', 'markdown'],
  ['markdown document', 'markdown'],
  ['documentation', 'markdown'],
  ['documentation document', 'markdown'],
  ['specification', 'markdown'],
  ['specification document', 'markdown'],
  ['technical specification', 'markdown'],
  ['report', 'markdown'],
  ['analysis', 'markdown'],
  ['research', 'markdown'],
  ['strategy', 'markdown'],
  ['plan', 'markdown'],
  ['checklist', 'markdown'],
  ['validation checklist', 'markdown'],
  ['diagram', 'markdown'],
  ['mermaid diagram', 'markdown'],
  ['source code', 'code'],
  ['github repository', 'code'],
  ['code repository', 'code'],
  ['repository', 'code'],
  ['script', 'code'],
  ['website', 'deployment'],
  ['web app', 'deployment'],
  ['landing page', 'deployment'],
  ['live site', 'deployment'],
  ['deployed site', 'deployment'],
  ['slide deck', 'presentation'],
  ['pitch deck', 'presentation'],
  ['slides', 'presentation'],
  ['deck', 'presentation'],
  ['image', 'asset'],
  ['graphic', 'asset'],
  ['banner', 'asset'],
  ['visual asset', 'asset'],
  ['dataset', 'data'],
  ['spreadsheet', 'data'],
  ['table', 'data'],
  ['csv', 'data'],
  ['structured data', 'data'],
]);

function normalizedLabel(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[._/]+/g, ' ')
    .replace(/[-:]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function plannerList(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') return value.split(/[;,]\s*/).filter(Boolean);
  return [];
}

const AXWISE_RESEARCH_MODE = 'research_assisted';
const WEB_RESEARCH_TOOL_ID = 'tool-web-search';
const RESEARCH_ONLY_TITLE_RE =
  /\b(?:research\s*&\s*data gathering|market research|benchmark research|competitive research|industry research|web research|data gathering)\b/i;
const CITATION_DEMAND_RE =
  /\b(?:cite|cites|cited|citation|citations|source urls?|every (?:numeric|factual) claim)\b/i;
const SUPPLIED_EVIDENCE_REFERENCE_RE =
  /\b(?:attached|supplied|provided|internal|declared|goal evidence|axwise|source ids?|character offsets?|quote offsets?)\b/i;
const EXTERNAL_RESEARCH_DEMAND_RES = [
  /\btool[_-]?web[_-]?search\b/i,
  /\b(?:web|internet|online|external|public)\s+(?:search|research|sources?|data)\b/i,
  /\b(?:search|browse|research)\s+(?:the\s+)?(?:web|internet|online|external sources?|public sources?)\b/i,
  /\b(?:conduct|perform|run|do|complete|gather|collect|find)\b.{0,80}\b(?:market|competitor|industry|benchmark|trend)\s+(?:research|data|sources?|benchmarks?)\b/i,
  /\b(?:minimum|at least)\s+\d+\s+(?:distinct\s+)?search queries\b/i,
];

// These capabilities can only inspect or transform records that actually
// exist behind an attachment or an explicitly authorised connector. Planner
// models frequently invent them from a metric-shaped goal ("reduce churn" ->
// "query SQL cohorts") even when Orqaly has received no rows to inspect.
const RECORD_ACCESS_TOOL_RE =
  /(?:^|[-_])(?:airtable|analytics|bigquery|csv|database|dashboard|excel|google-sheets|looker|pandas|power-bi|python|sheet|snowflake|sql|tableau|warehouse)(?:$|[-_])/i;
const GENERIC_AUTHORING_TOOL_RE =
  /(?:^|[-_])(?:confluence|doc-generator|document-generator|markdown-generator|notion|pdf-generator)(?:$|[-_])/i;
const RECORD_NOUN_RE =
  /\b(?:analytics|cohorts?|csv|customer records?|data(?:base|set)?s?|events?|files?|inventory|logs?|metrics?|orders?|records?|rows?|spreadsheets?|sql|tables?|transactions?)\b/i;
const OPERATIONAL_RECORD_NOUN_RE =
  /\b(?:cohorts?|customer records?|databases?|delivery (?:delay )?logs?|event logs?|inventory|orders?|records?|rows?|spreadsheets?|sql|support tickets?|tables?|transactions?)\b/i;
const RECORD_ACTION_RE =
  /\b(?:aggregate|analy[sz](?:e|ed|es|ing)?|calculate|categori[sz]e|compute|correlate|diagnose|extract|inspect|join|map|measure|model|parse|profile|query|read|segment|synthesi[sz]e|validate|visuali[sz]e)\b/i;
const RECORD_RESULT_RE =
  /\b(?:cohort analysis|data pack|dataset|metric report|retention analysis|retention report|sql report|statistical analysis)\b/i;
const BOUNDED_METHOD_TITLE_RE =
  /\b(?:architecture|blueprint|design|framework|methodology|playbook|requirements?|specification|template)\b/i;
const DECLARED_CONTEXT_AUTHORING_TITLE_RE =
  /\b(?:assemble|author|compil(?:e|ation)|consolidat(?:e|ed|ion)|create|draft|produce|synthesi[sz]e|write)\b.{0,100}\b(?:prd|product requirements document)\b/i;
const DECLARED_EVIDENCE_SOURCE_RE =
  /(?:declared|goal[-_: ]?owner|po[-_: ]?answer|clarification|customer[-_: ]?quote|interview|persona|synthetic|hypothesis)/i;
const OPERATIONAL_RECORD_SOURCE_RE =
  /(?:attachment|connector|database|dataset|event[-_: ]?log|operational[-_: ]?record|prior[-_: ]?goal|source[-_: ]?record|transaction|user[-_: ]?upload)/i;

function axwiseIntelligence(goal) {
  const intelligence = goal?.data?.axwise_customer_intelligence;
  return intelligence && typeof intelligence === 'object' ? intelligence : null;
}

function contentBearingEvidence(goal) {
  const intelligence = axwiseIntelligence(goal);
  const resolution = intelligence?.persona_resolution || {};
  const customer = resolution.customer_persona || {};

  const attachmentHasContent = (goal?.data?.attachments || []).some((item) =>
    [item?.content_excerpt, item?.content, item?.text].some(
      (value) => typeof value === 'string' && value.trim().length > 0
    )
  );
  if (attachmentHasContent) return true;

  return (customer.evidence || []).some((item) => {
    const hasContent = [item?.quote, item?.content, item?.excerpt, item?.text].some(
      (value) => typeof value === 'string' && value.trim().length > 0
    );
    if (!hasContent) return false;
    const source = [
      item?.provenance,
      item?.source_type,
      item?.verification_source,
      item?.document_id,
      item?.reference_id,
    ]
      .filter(Boolean)
      .join(' ');
    return OPERATIONAL_RECORD_SOURCE_RE.test(source) && !DECLARED_EVIDENCE_SOURCE_RE.test(source);
  });
}

function goalAuthorizedConnectorIds(goal) {
  const data = goal?.data || {};
  const manifest =
    data.execution_authorization?.manifest ||
    data.execution_authorization_manifest ||
    data.goal_approvals?.execution?.snapshot?.authorization_manifest ||
    {};
  const ids = [
    ...(Array.isArray(data.authorized_connector_ids) ? data.authorized_connector_ids : []),
    ...(Array.isArray(data.authorized_tool_ids) ? data.authorized_tool_ids : []),
    ...(Array.isArray(data.approved_tool_ids) ? data.approved_tool_ids : []),
    ...(manifest.tasks || []).flatMap((task) => task?.granted_tool_ids || []),
    ...(manifest.agent_grants || []).flatMap((grant) => grant?.tool_ids || []),
  ];
  return new Set(ids.map(normalizeToolId).filter((toolId) => isRecordAccessTool(toolId)));
}

function claimsRecordInspection(job) {
  const text = [
    job?.title,
    job?.description,
    job?.requirements,
    ...(Array.isArray(job?.acceptance_criteria) ? job.acceptance_criteria : []),
  ]
    .filter(Boolean)
    .join(' ');
  const title = String(job?.title || '');
  if (BOUNDED_METHOD_TITLE_RE.test(title) || DECLARED_CONTEXT_AUTHORING_TITLE_RE.test(title)) {
    return false;
  }
  return (RECORD_ACTION_RE.test(text) && RECORD_NOUN_RE.test(text)) || RECORD_RESULT_RE.test(text);
}

function isRecordAccessTool(toolId) {
  return RECORD_ACCESS_TOOL_RE.test(String(toolId || ''));
}

function isGenericAuthoringTool(toolId) {
  return GENERIC_AUTHORING_TOOL_RE.test(String(toolId || ''));
}

function boundUnavailableTools(value, diagnostics, location) {
  const retained = [];
  const seen = new Set();
  for (const rawTool of plannerList(value)) {
    const toolId = normalizeToolId(rawTool);
    if (!toolId) continue;
    const boundedTool =
      isRecordAccessTool(toolId) || isGenericAuthoringTool(toolId)
        ? CREDENTIAL_FREE_DOCUMENT_TOOL_ID
        : toolId;
    if (boundedTool !== toolId) {
      diagnostics.replacedTools.push({ ...location, from: toolId, to: boundedTool });
    }
    if (seen.has(boundedTool)) continue;
    seen.add(boundedTool);
    retained.push(boundedTool);
  }
  return retained;
}

function methodologyTitle(title) {
  const subject = String(title || 'the requested analysis')
    .trim()
    .replace(
      /^(?:aggregate|analy[sz]e|build|calculate|compute|create|diagnose|develop|generate|inspect|model|produce|query|review|visuali[sz]e)\s+/i,
      ''
    );
  return `Specify methodology and required inputs for ${subject || 'the requested analysis'}`;
}

function convertToBoundedMethodology(job, removedToolIds) {
  const originalTitle = String(job.title || 'the requested analysis').trim();
  job.title = methodologyTitle(originalTitle);
  job.description = [
    `Create a reviewable methodology and input specification for the future objective: ${originalTitle}.`,
    'Use only declared goal context; do not claim that source records were inspected, queried, calculated, or validated.',
    'Label assumptions and unresolved questions, then define the records, fields, provenance, access permissions, calculation steps, and validation checks required before real analysis can run.',
  ].join(' ');
  job.requirements =
    'Produce a framework/specification, not computed findings. Separate declared context, assumptions, and required future inputs.';
  job.acceptance_criteria = [
    'Every statement is labelled as declared context, assumption, or unresolved input',
    'Required future records, fields, provenance, and access permissions are explicit',
    'Calculation or inspection steps and validation checks are specified without claiming results',
    'No finding implies that unavailable source records were accessed',
  ];
  job.deliverable_type = 'markdown';
  job.category = 'methodology';
  job.tool_requirements = [CREDENTIAL_FREE_DOCUMENT_TOOL_ID];
  return { originalTitle, removedToolIds };
}

function axwiseRoutingMode(goal) {
  const selectedMode = goal?.data?.axwise_customer_intelligence?.routing_assessment?.selected_mode;
  if (typeof selectedMode !== 'string' || !selectedMode.trim()) return null;
  return selectedMode.trim().toLowerCase();
}

function demandsExternalResearch(value) {
  const text = String(value || '').trim();
  if (!text) return false;
  if (EXTERNAL_RESEARCH_DEMAND_RES.some((pattern) => pattern.test(text))) return true;
  return CITATION_DEMAND_RE.test(text) && !SUPPLIED_EVIDENCE_REFERENCE_RE.test(text);
}

function scrubResearchDemands(value) {
  if (typeof value !== 'string') return value;
  const retained = value
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !demandsExternalResearch(part));
  return retained.join(' ').trim();
}

function scrubResearchList(value) {
  if (!Array.isArray(value)) return value;
  return value
    .map((item) => (typeof item === 'string' ? scrubResearchDemands(item) : item))
    .filter((item) => typeof item !== 'string' || item.trim());
}

function stripWebResearchTools(value, diagnostics, location) {
  const retained = [];
  for (const rawTool of plannerList(value)) {
    if (normalizeToolId(rawTool) === WEB_RESEARCH_TOOL_ID) {
      diagnostics.removedTools.push({ ...location, tool: WEB_RESEARCH_TOOL_ID });
      continue;
    }
    retained.push(rawTool);
  }
  return retained;
}

function boundedEvidenceSynthesisJob(removedJob) {
  return {
    title: 'Synthesize supplied evidence and uncertainties',
    description:
      'Use only evidence already attached to the goal and AxWise customer intelligence. Summarize known facts, declared assumptions, unresolved uncertainties, and their implications for the requested outcome. Mark each statement as supplied evidence, declared context, or working hypothesis.',
    category: 'content',
    required_role: removedJob?.required_role || 'Analyst',
    deliverable_type: 'markdown',
    tool_requirements: [],
    acceptance_criteria: [
      'Separates supplied facts from declared assumptions and working hypotheses',
      'Lists unresolved uncertainties and explains their effect on the decision',
      'Uses only evidence already attached to the goal or AxWise context',
    ],
    requirements:
      'Produce a bounded evidence synthesis from supplied material and explicitly preserve uncertainty.',
    estimate_hours: Number(removedJob?.estimate_hours) || 0.5,
  };
}

/**
 * AxWise owns the value-of-information decision for integrated goals. Once it
 * has selected a non-research route, a downstream PM model must not silently
 * re-authorise web research by inventing search tasks, citation requirements,
 * or the web-search tool. This mutating guard is intentionally goal-aware and
 * activates only when AxWise persisted an explicit routing decision; legacy
 * goals retain their historical planner behaviour.
 *
 * If filtering would leave a phase empty, keep the plan executable by replacing
 * the removed work with a bounded synthesis of evidence already supplied to the
 * goal. The replacement records uncertainty instead of fabricating external
 * facts or silently deleting the phase.
 */
export function enforceAxwiseResearchBoundary(plan, goal) {
  const routingMode = axwiseRoutingMode(goal);
  const diagnostics = {
    enforced: Boolean(routingMode && routingMode !== AXWISE_RESEARCH_MODE),
    routingMode,
    removedJobs: [],
    replacedPhases: [],
    removedTools: [],
    scrubbedFields: [],
  };

  if (!diagnostics.enforced || !plan || typeof plan !== 'object') {
    return { plan, diagnostics };
  }

  const scrubField = (owner, field, location) => {
    const original = owner?.[field];
    const scrubbed = Array.isArray(original)
      ? scrubResearchList(original)
      : scrubResearchDemands(original);
    if (JSON.stringify(scrubbed) !== JSON.stringify(original)) {
      owner[field] = scrubbed;
      diagnostics.scrubbedFields.push({ ...location, field });
    }
  };

  scrubField(plan, 'strategy', { scope: 'plan' });
  if (!String(plan.strategy || '').trim()) {
    plan.strategy =
      'Use supplied evidence to pursue the requested outcome while preserving uncertainty.';
  }

  for (const [phaseIndex, phase] of (Array.isArray(plan.phases) ? plan.phases : []).entries()) {
    if (!phase || typeof phase !== 'object') continue;

    phase.tool_requirements = stripWebResearchTools(phase.tool_requirements, diagnostics, {
      phaseIndex,
      scope: 'phase',
    });
    scrubField(phase, 'description', { phaseIndex, scope: 'phase' });
    scrubField(phase, 'acceptance_criteria', { phaseIndex, scope: 'phase' });

    const jobs = Array.isArray(phase.jobs) ? phase.jobs : [];
    const retainedJobs = [];
    const removedInPhase = [];

    for (const [jobIndex, job] of jobs.entries()) {
      if (!job || typeof job !== 'object') continue;
      const rawTools = plannerList(job.tool_requirements);
      const hasWebResearchTool = rawTools.some(
        (tool) => normalizeToolId(tool) === WEB_RESEARCH_TOOL_ID
      );
      const title = String(job.title || '');
      const category = normalizedLabel(job.category);
      const jobResearchDemand = [
        job.title,
        job.description,
        job.requirements,
        ...(Array.isArray(job.acceptance_criteria) ? job.acceptance_criteria : []),
      ].some(demandsExternalResearch);
      const researchOnly =
        (hasWebResearchTool || jobResearchDemand) &&
        (RESEARCH_ONLY_TITLE_RE.test(title) || category === 'research');

      if (researchOnly) {
        const removed = {
          phaseIndex,
          jobIndex,
          title: title || null,
          requiredRole: job.required_role || null,
        };
        diagnostics.removedJobs.push(removed);
        removedInPhase.push(job);
        continue;
      }

      job.tool_requirements = stripWebResearchTools(job.tool_requirements, diagnostics, {
        phaseIndex,
        jobIndex,
        scope: 'job',
      });
      scrubField(job, 'title', { phaseIndex, jobIndex, scope: 'job' });
      scrubField(job, 'description', { phaseIndex, jobIndex, scope: 'job' });
      scrubField(job, 'requirements', { phaseIndex, jobIndex, scope: 'job' });
      scrubField(job, 'acceptance_criteria', { phaseIndex, jobIndex, scope: 'job' });

      if (!String(job.title || '').trim())
        job.title = 'Use supplied evidence for the requested outcome';
      if (!String(job.description || '').trim()) {
        job.description =
          'Complete this task using only evidence already attached to the goal and AxWise customer intelligence. Preserve unresolved uncertainty explicitly.';
      }
      retainedJobs.push(job);
    }

    if (jobs.length > 0 && retainedJobs.length === 0 && removedInPhase.length > 0) {
      retainedJobs.push(boundedEvidenceSynthesisJob(removedInPhase[0]));
      phase.name = 'Evidence Synthesis & Decision Framing';
      phase.description =
        'Synthesize supplied evidence, declared context, and unresolved uncertainty without collecting new external data.';
      phase.acceptance_criteria = [
        'Known facts, declared assumptions, and working hypotheses are clearly separated',
        'Material uncertainties and their decision impact are explicit',
      ];
      diagnostics.replacedPhases.push({ phaseIndex });
    } else if (removedInPhase.length > 0 && RESEARCH_ONLY_TITLE_RE.test(String(phase.name || ''))) {
      phase.name = 'Evidence Synthesis & Decision Framing';
    }

    phase.jobs = retainedJobs;
  }

  return { plan, diagnostics };
}

export function formatAxwiseResearchPolicyForPlanning(goal) {
  const routingMode = axwiseRoutingMode(goal);
  if (!routingMode) return '';
  if (routingMode === AXWISE_RESEARCH_MODE) {
    return 'AXWISE RESEARCH AUTHORIZATION: research_assisted. Bounded external research is authorised only within the evidence and budget limits returned by AxWise.';
  }
  return [
    `AXWISE RESEARCH AUTHORIZATION (binding): ${routingMode}.`,
    'AxWise determined that additional external research does not have sufficient value for this goal. Do not create web/internet research jobs, citation or source-URL requirements, or tool-web-search dependencies.',
    'Use only attached goal evidence, declared context, and AxWise customer intelligence. Preserve unresolved facts as explicit uncertainties or working hypotheses.',
    'This boundary overrides generic research guidance and any domain-specific template below.',
  ].join(' ');
}

export function isAxwiseResearchRestricted(goal) {
  const routingMode = axwiseRoutingMode(goal);
  return Boolean(routingMode && routingMode !== AXWISE_RESEARCH_MODE);
}

/**
 * Prevent a planner from turning a metric-shaped goal into fictional data
 * analysis. AxWise-integrated goals with only declared context have no records
 * to query and no goal-scoped connector grant. In that narrow state, tasks
 * that claim record inspection become reviewable methodology specifications.
 *
 * Bounded research remains independent: a research_assisted route can retain
 * web-search work. This guard only converts tasks that claim to compute over
 * unavailable records. Content-bearing attachments, AxWise evidence, or an
 * existing goal-scoped connector grant leave the plan unchanged.
 */
export function enforceAxwiseEvidenceExecutionBoundary(plan, goal) {
  const intelligence = axwiseIntelligence(goal);
  const hasEvidence = contentBearingEvidence(goal);
  const authorizedConnectorIds = goalAuthorizedConnectorIds(goal);
  const diagnostics = {
    enforced: Boolean(intelligence && !hasEvidence && authorizedConnectorIds.size === 0),
    evidenceAvailable: hasEvidence,
    authorizedConnectorIds: [...authorizedConnectorIds].sort(),
    convertedJobs: [],
    replacedTools: [],
  };

  if (!diagnostics.enforced || !plan || typeof plan !== 'object') {
    return { plan, diagnostics };
  }

  for (const [phaseIndex, phase] of (Array.isArray(plan.phases) ? plan.phases : []).entries()) {
    const jobs = Array.isArray(phase?.jobs) ? phase.jobs : [];
    phase.tool_requirements = boundUnavailableTools(phase?.tool_requirements, diagnostics, {
      phaseIndex,
      scope: 'phase',
    });
    let phaseConverted = false;
    for (const [jobIndex, job] of jobs.entries()) {
      if (!job || typeof job !== 'object') continue;
      const tools = plannerList(job.tool_requirements).map(normalizeToolId).filter(Boolean);
      const recordTools = tools.filter(isRecordAccessTool);
      const hasWebResearchTool = tools.includes(WEB_RESEARCH_TOOL_ID);
      const jobText = [job.title, job.description, job.requirements].filter(Boolean).join(' ');
      const recordClaim = claimsRecordInspection(job);
      const boundedExternalResearch =
        axwiseRoutingMode(goal) === AXWISE_RESEARCH_MODE &&
        hasWebResearchTool &&
        recordTools.length === 0 &&
        !OPERATIONAL_RECORD_NOUN_RE.test(jobText);

      if (!recordClaim || boundedExternalResearch) {
        job.tool_requirements = boundUnavailableTools(job.tool_requirements, diagnostics, {
          phaseIndex,
          jobIndex,
          scope: 'job',
        });
        continue;
      }

      const converted = convertToBoundedMethodology(job, recordTools);
      phaseConverted = true;
      diagnostics.convertedJobs.push({
        phaseIndex,
        jobIndex,
        ...converted,
      });
    }
    if (phaseConverted) {
      phase.description = `Define an evidence-bounded methodology and required future inputs for ${phase?.name || 'this phase'}, while completing non-record-dependent framework work from declared context.`;
      phase.acceptance_criteria = [
        'No result claims that unavailable operational records were inspected or computed',
        'Declared context, assumptions, unresolved inputs, and future validation steps are separated',
      ];
    }
  }

  if (diagnostics.convertedJobs.length) {
    plan.strategy =
      'Use declared context to produce a reviewable operating framework. Treat record-dependent objectives as future analysis: specify required inputs, methods, permissions, and validation checks without claiming computed findings.';
  }

  return { plan, diagnostics };
}

export function formatAxwiseEvidenceExecutionPolicyForPlanning(goal) {
  if (
    !axwiseIntelligence(goal) ||
    contentBearingEvidence(goal) ||
    goalAuthorizedConnectorIds(goal).size > 0
  ) {
    return '';
  }
  return [
    'AXWISE EVIDENCE EXECUTION BOUNDARY (binding): only declared context is available; no content-bearing evidence or goal-authorised record connector is attached.',
    'Do not claim to inspect, query, calculate, segment, or validate cohorts, databases, spreadsheets, records, transactions, logs, or metrics.',
    'If the outcome needs such analysis, create a methodology/framework/specification task that labels assumptions and lists the future records, fields, provenance, permissions, calculation steps, and validation checks required.',
    'Do not require Python, SQL, Sheets, Notion, dashboard, warehouse, or similar data/document software for that specification. The credential-free tool-doc-generator is allowed.',
    'If AxWise separately selected research_assisted, bounded web research remains allowed; it does not create access to unavailable internal records.',
  ].join(' ');
}

/**
 * Constrain planner output to the six task formats understood by execution.
 * Unknown labels fall back to markdown, the least-privileged format: they can
 * still produce a reviewable artifact but cannot accidentally trigger code or
 * deployment semantics.
 */
export function normalizePlannerDeliverableType(value) {
  const key = normalizedLabel(value);
  if (PLANNER_DELIVERABLE_TYPE_SET.has(key)) return key;
  return DELIVERABLE_ALIASES.get(key) || 'markdown';
}

/**
 * Normalize the untrusted plan returned by the PM LLM immediately before it is
 * persisted. Generic authoring labels resolve through the exact alias table in
 * tool-ids.js. Known external connectors stay known requirements. Everything
 * else receives an explicit but unknown canonical id, which makes downstream
 * provisioning fail closed instead of silently discarding the requirement.
 *
 * The plan is mutated in place to match normalizePlanShape's existing contract.
 */
export function normalizePlannerOutput(plan) {
  const toolMappings = [];
  const deliverableMappings = [];
  const unknownTools = new Set();

  for (const [phaseIndex, phase] of (Array.isArray(plan?.phases) ? plan.phases : []).entries()) {
    const jobs = Array.isArray(phase?.jobs) ? phase.jobs : [];
    for (const [jobIndex, job] of jobs.entries()) {
      if (!job || typeof job !== 'object') continue;

      const normalizedTools = [];
      const seenTools = new Set();
      for (const rawTool of plannerList(job.tool_requirements)) {
        const normalizedTool = normalizeToolId(rawTool);
        if (!normalizedTool) continue;
        if (String(rawTool).trim() !== normalizedTool) {
          toolMappings.push({
            phaseIndex,
            jobIndex,
            from: String(rawTool).trim(),
            to: normalizedTool,
          });
        }
        if (!isKnownToolId(normalizedTool)) unknownTools.add(normalizedTool);
        if (seenTools.has(normalizedTool)) continue;
        seenTools.add(normalizedTool);
        normalizedTools.push(normalizedTool);
      }
      job.tool_requirements = normalizedTools;

      const originalDeliverable = String(job.deliverable_type || '').trim();
      const normalizedDeliverable = normalizePlannerDeliverableType(originalDeliverable);
      if (originalDeliverable !== normalizedDeliverable) {
        deliverableMappings.push({
          phaseIndex,
          jobIndex,
          from: originalDeliverable || null,
          to: normalizedDeliverable,
        });
      }
      job.deliverable_type = normalizedDeliverable;
    }
  }

  return {
    plan,
    diagnostics: {
      toolMappings,
      deliverableMappings,
      unknownTools: [...unknownTools],
    },
  };
}
