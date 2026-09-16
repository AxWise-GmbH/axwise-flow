/**
 * Domain-neutral work-shape routing.
 *
 * AxWise may supply signed admission hints, but this module never treats them
 * as execution authority. It selects a bounded Orqaly playbook and carries the
 * action risk into planning; the existing Orqaly tool and client-approval gates
 * remain the only path to an external side effect.
 */

export const WORK_SHAPE_ROUTE_VERSION = 'orqaly_work_shape_route_v1';

export const WORK_SHAPE_PLAYBOOK_IDS = Object.freeze({
  SIMPLE_CONTENT: 'simple_content',
  RESEARCH_STRATEGY: 'research_strategy',
  SOFTWARE_PRD: 'software_prd',
  CAMPAIGN: 'campaign',
  EXTERNAL_ACTION: 'external_action',
  LOGISTICS_DISTRIBUTION: 'logistics_distribution',
  MIXED_CUSTOM: 'mixed_custom',
});

export const WORK_SHAPE_PLAYBOOK_REGISTRY = Object.freeze([
  Object.freeze({
    id: WORK_SHAPE_PLAYBOOK_IDS.EXTERNAL_ACTION,
    label: 'External action',
    deterministic: true,
  }),
  Object.freeze({
    id: WORK_SHAPE_PLAYBOOK_IDS.LOGISTICS_DISTRIBUTION,
    label: 'Logistics and distribution',
    deterministic: true,
  }),
  Object.freeze({
    id: WORK_SHAPE_PLAYBOOK_IDS.CAMPAIGN,
    label: 'Campaign',
    deterministic: true,
  }),
  Object.freeze({
    id: WORK_SHAPE_PLAYBOOK_IDS.SOFTWARE_PRD,
    label: 'Software or product requirements',
    deterministic: true,
  }),
  Object.freeze({
    id: WORK_SHAPE_PLAYBOOK_IDS.RESEARCH_STRATEGY,
    label: 'Research and strategy',
    deterministic: true,
  }),
  Object.freeze({
    id: WORK_SHAPE_PLAYBOOK_IDS.SIMPLE_CONTENT,
    label: 'Simple content',
    deterministic: true,
  }),
  Object.freeze({
    id: WORK_SHAPE_PLAYBOOK_IDS.MIXED_CUSTOM,
    label: 'Mixed or custom work',
    deterministic: false,
  }),
]);

const PLAYBOOK_BY_ID = new Map(WORK_SHAPE_PLAYBOOK_REGISTRY.map((item) => [item.id, item]));
const SIDE_EFFECT_RANK = Object.freeze({ none: 0, reversible: 1, irreversible: 2 });
const PRIMARY_SHAPES = new Set([
  WORK_SHAPE_PLAYBOOK_IDS.SOFTWARE_PRD,
  WORK_SHAPE_PLAYBOOK_IDS.CAMPAIGN,
  WORK_SHAPE_PLAYBOOK_IDS.LOGISTICS_DISTRIBUTION,
]);
const EXACT_AXWISE_WORK_TYPE_SHAPES = new Map([
  ['software development', WORK_SHAPE_PLAYBOOK_IDS.SOFTWARE_PRD],
  ['outreach campaign', WORK_SHAPE_PLAYBOOK_IDS.CAMPAIGN],
  ['procurement logistics', WORK_SHAPE_PLAYBOOK_IDS.LOGISTICS_DISTRIBUTION],
  ['content asset creation', WORK_SHAPE_PLAYBOOK_IDS.SIMPLE_CONTENT],
  ['research analysis', WORK_SHAPE_PLAYBOOK_IDS.RESEARCH_STRATEGY],
  ['strategy planning', WORK_SHAPE_PLAYBOOK_IDS.RESEARCH_STRATEGY],
  ['physical operations', WORK_SHAPE_PLAYBOOK_IDS.LOGISTICS_DISTRIBUTION],
  ['mixed custom', WORK_SHAPE_PLAYBOOK_IDS.MIXED_CUSTOM],
]);

function strings(values, maximum = 50) {
  return (Array.isArray(values) ? values : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .slice(0, maximum);
}

function normalized(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_/.-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function admissionFrom(goal, scopePacket) {
  return (
    scopePacket?.admission ||
    goal?.data?.axwise_customer_intelligence?.scope_packet?.admission ||
    goal?.data?.scope_packet?.admission ||
    null
  );
}

function normalizeRequestedActions(values) {
  return (Array.isArray(values) ? values : [])
    .filter((value) => value && typeof value === 'object')
    .slice(0, 100)
    .map((value) => ({
      action: String(value.action || '')
        .trim()
        .slice(0, 500),
      mode: ['advise', 'prepare', 'execute'].includes(value.mode) ? value.mode : 'advise',
      side_effect: ['none', 'reversible', 'irreversible'].includes(value.side_effect)
        ? value.side_effect
        : 'none',
      requires_authorization: value.requires_authorization === true,
    }))
    .filter((value) => value.action);
}

function workTypeShape(value, { signedAdmission = false, executesExternalAction = false } = {}) {
  const token = normalized(value);
  if (!token) return null;
  if (signedAdmission && token === 'external service operation') {
    // A service operation can describe advice/configuration or a real side
    // effect. The work type alone is never execution authority and, while
    // advisory, must not overpower another signed primary shape (for example
    // an outreach campaign that happens to discuss an external service).
    return executesExternalAction ? WORK_SHAPE_PLAYBOOK_IDS.EXTERNAL_ACTION : null;
  }
  const exactAxwiseShape = signedAdmission ? EXACT_AXWISE_WORK_TYPE_SHAPES.get(token) : null;
  if (exactAxwiseShape) return exactAxwiseShape;
  if (/\b(mixed|custom|multi domain|cross domain)\b/.test(token)) {
    return WORK_SHAPE_PLAYBOOK_IDS.MIXED_CUSTOM;
  }
  if (/\b(external action|execution|send|messaging|message|sms|publish|purchase)\b/.test(token)) {
    return WORK_SHAPE_PLAYBOOK_IDS.EXTERNAL_ACTION;
  }
  if (
    /\b(logistics|distribution|supply chain|procurement|fulfilment|fulfillment|delivery operations)\b/.test(
      token
    )
  ) {
    return WORK_SHAPE_PLAYBOOK_IDS.LOGISTICS_DISTRIBUTION;
  }
  if (/\b(campaign|marketing|advertising|media plan|growth|outreach)\b/.test(token)) {
    return WORK_SHAPE_PLAYBOOK_IDS.CAMPAIGN;
  }
  if (
    /\b(software|engineering|product requirements|prd|application|api|code|implementation)\b/.test(
      token
    )
  ) {
    return WORK_SHAPE_PLAYBOOK_IDS.SOFTWARE_PRD;
  }
  if (/\b(research|analysis|strategy|planning|recommendation|evaluation)\b/.test(token)) {
    return WORK_SHAPE_PLAYBOOK_IDS.RESEARCH_STRATEGY;
  }
  if (/\b(content|writing|copy|document|brief|article|script|creative asset)\b/.test(token)) {
    return WORK_SHAPE_PLAYBOOK_IDS.SIMPLE_CONTENT;
  }
  return null;
}

function reduceShapes(values, preferredOutputShape = null) {
  const shapes = new Set(values.filter(Boolean));
  if (shapes.has(WORK_SHAPE_PLAYBOOK_IDS.EXTERNAL_ACTION)) {
    return WORK_SHAPE_PLAYBOOK_IDS.EXTERNAL_ACTION;
  }
  if (shapes.has(WORK_SHAPE_PLAYBOOK_IDS.MIXED_CUSTOM)) {
    return WORK_SHAPE_PLAYBOOK_IDS.MIXED_CUSTOM;
  }
  const primary = [...shapes].filter((shape) => PRIMARY_SHAPES.has(shape));
  if (primary.length > 1) return WORK_SHAPE_PLAYBOOK_IDS.MIXED_CUSTOM;
  if (primary.length === 1) return primary[0];
  if (
    shapes.has(WORK_SHAPE_PLAYBOOK_IDS.RESEARCH_STRATEGY) &&
    shapes.has(WORK_SHAPE_PLAYBOOK_IDS.SIMPLE_CONTENT)
  ) {
    // Research is often a supporting phase for a requested article, brief, or
    // other content asset. Let the canonical deliverable choose the final
    // shape; if it is ambiguous, use the dynamic planner instead of silently
    // replacing the requested content with a strategy document.
    return [
      WORK_SHAPE_PLAYBOOK_IDS.RESEARCH_STRATEGY,
      WORK_SHAPE_PLAYBOOK_IDS.SIMPLE_CONTENT,
    ].includes(preferredOutputShape)
      ? preferredOutputShape
      : WORK_SHAPE_PLAYBOOK_IDS.MIXED_CUSTOM;
  }
  if (shapes.has(WORK_SHAPE_PLAYBOOK_IDS.RESEARCH_STRATEGY)) {
    return WORK_SHAPE_PLAYBOOK_IDS.RESEARCH_STRATEGY;
  }
  if (shapes.has(WORK_SHAPE_PLAYBOOK_IDS.SIMPLE_CONTENT)) {
    return WORK_SHAPE_PLAYBOOK_IDS.SIMPLE_CONTENT;
  }
  return null;
}

function explicitExecutionShape(actions) {
  return actions.some((item) => item.mode === 'execute' || item.side_effect !== 'none')
    ? WORK_SHAPE_PLAYBOOK_IDS.EXTERNAL_ACTION
    : null;
}

function fallbackShape(text) {
  const value = normalized(text);
  if (!value) return WORK_SHAPE_PLAYBOOK_IDS.MIXED_CUSTOM;
  if (
    /\b(send|dispatch|publish|deploy|purchase|place an? order|contact|reach out|message|make a call|launch live|activate)\b/.test(
      value
    )
  ) {
    return WORK_SHAPE_PLAYBOOK_IDS.EXTERNAL_ACTION;
  }
  if (
    /\b(logistics|distribution|distributor|supply chain|procurement|fulfilment|fulfillment|warehouse|last mile)\b/.test(
      value
    )
  ) {
    return WORK_SHAPE_PLAYBOOK_IDS.LOGISTICS_DISTRIBUTION;
  }
  if (
    /\b(campaign|media plan|content calendar|advertising|marketing strategy|channel strategy)\b/.test(
      value
    )
  ) {
    return WORK_SHAPE_PLAYBOOK_IDS.CAMPAIGN;
  }
  if (
    /\b(product requirements document|\bprd\b|software specification|software architecture|build (?:an? )?(?:app|api|service|cli)|implement (?:an? )?(?:app|api|service|feature))\b/.test(
      value
    )
  ) {
    return WORK_SHAPE_PLAYBOOK_IDS.SOFTWARE_PRD;
  }
  if (
    /\b(research|analy[sz]e|analysis|strategy|recommend|evaluate|market study|feasibility)\b/.test(
      value
    )
  ) {
    return WORK_SHAPE_PLAYBOOK_IDS.RESEARCH_STRATEGY;
  }
  if (
    /\b(write|draft|create|prepare|edit|rewrite|summari[sz]e)\b.*\b(content|copy|document|brief|article|post|email|script|markdown)\b/.test(
      value
    )
  ) {
    return WORK_SHAPE_PLAYBOOK_IDS.SIMPLE_CONTENT;
  }
  return WORK_SHAPE_PLAYBOOK_IDS.MIXED_CUSTOM;
}

function maxSideEffect(actions) {
  return actions.reduce(
    (maximum, item) =>
      SIDE_EFFECT_RANK[item.side_effect] > SIDE_EFFECT_RANK[maximum] ? item.side_effect : maximum,
    'none'
  );
}

function isAuthoritativeNativeScope(goal, scopePacket) {
  return Boolean(
    scopePacket?.source === 'axwise_scope_packet_v1' ||
    scopePacket?.version === 'axwise_scope_packet_v1' ||
    goal?.data?.axwise_customer_intelligence?.scope_packet?.version === 'axwise_scope_packet_v1'
  );
}

function deterministicTopologySupported(playbookId, scopePacket) {
  if (playbookId === WORK_SHAPE_PLAYBOOK_IDS.EXTERNAL_ACTION) return true;
  if (playbookId === WORK_SHAPE_PLAYBOOK_IDS.SOFTWARE_PRD) {
    return isSoftwareSpecification(scopePacket);
  }
  if (
    [
      WORK_SHAPE_PLAYBOOK_IDS.SIMPLE_CONTENT,
      WORK_SHAPE_PLAYBOOK_IDS.RESEARCH_STRATEGY,
      WORK_SHAPE_PLAYBOOK_IDS.CAMPAIGN,
      WORK_SHAPE_PLAYBOOK_IDS.LOGISTICS_DISTRIBUTION,
    ].includes(playbookId)
  ) {
    return supportsDocumentPlaybook(scopePacket);
  }
  return false;
}

/**
 * Select a playbook from signed AxWise admission hints first, then from the
 * accepted scope text. The returned route is descriptive and grants nothing.
 */
export function selectWorkShapePlaybook({ goal = {}, scopePacket = null } = {}) {
  const admission = admissionFrom(goal, scopePacket);
  const nativePacket = goal?.data?.axwise_customer_intelligence?.scope_packet || null;
  const actions = normalizeRequestedActions(admission?.requested_actions);
  const workTypes = strings(admission?.work_types, 9);
  const executionShape = explicitExecutionShape(actions);
  const actionShapes = actions.map((item) => {
    const shape = workTypeShape(item.action);
    // An advisory or preparation request may discuss SMS, publishing, or a
    // connector without asking Orqaly to cause the side effect. Only the
    // signed work type or execute/risk tuple may select external execution.
    return shape === WORK_SHAPE_PLAYBOOK_IDS.EXTERNAL_ACTION && item.mode !== 'execute'
      ? null
      : shape;
  });
  const canonicalOutputShape = workTypeShape(scopePacket?.deliverable?.type);
  const admissionShape = reduceShapes(
    [
      executionShape,
      ...workTypes.map((value) =>
        workTypeShape(value, {
          signedAdmission: true,
          executesExternalAction: Boolean(executionShape),
        })
      ),
      ...actionShapes,
    ],
    canonicalOutputShape
  );
  const scopeText = [
    scopePacket?.deliverable?.type,
    scopePacket?.deliverable?.title_prefix,
    scopePacket?.intent?.objective,
    scopePacket?.intent?.problem,
    scopePacket?.intent?.desired_outcome,
    ...(scopePacket?.deliverable?.required_sections || []).map(
      (section) => section?.topic || section
    ),
    ...(scopePacket?.ledger?.requirements || []).map((item) => item?.text || item),
  ]
    .filter(Boolean)
    .join(' ');
  const goalText = [goal?.title, goal?.description, goal?.parsed_requirements]
    .filter(Boolean)
    .join(' ');
  const source = admissionShape
    ? 'axwise_admission'
    : scopeText
      ? 'scope_contract'
      : 'goal_fallback';
  const playbookId = admissionShape || fallbackShape(scopeText || goalText);
  const descriptor = PLAYBOOK_BY_ID.get(playbookId) || PLAYBOOK_BY_ID.get('mixed_custom');
  const sideEffect = maxSideEffect(actions);
  const requiresAuthorization = actions.some(
    (item) => item.requires_authorization || item.mode === 'execute' || item.side_effect !== 'none'
  );
  const authoritative = isAuthoritativeNativeScope(goal, scopePacket);
  const deterministicPlanEligible =
    authoritative &&
    descriptor.deterministic &&
    deterministicTopologySupported(descriptor.id, scopePacket);

  return {
    version: WORK_SHAPE_ROUTE_VERSION,
    playbook_id: descriptor.id,
    playbook_label: descriptor.label,
    source,
    confidence:
      source === 'axwise_admission'
        ? descriptor.id === WORK_SHAPE_PLAYBOOK_IDS.MIXED_CUSTOM
          ? 0.8
          : 0.99
        : source === 'scope_contract'
          ? descriptor.id === WORK_SHAPE_PLAYBOOK_IDS.MIXED_CUSTOM
            ? 0.4
            : 0.85
          : descriptor.id === WORK_SHAPE_PLAYBOOK_IDS.MIXED_CUSTOM
            ? 0.25
            : 0.65,
    deterministic_plan_eligible: deterministicPlanEligible,
    authoritative_scope: authoritative,
    scope_hash: scopePacket?.scope_hash || nativePacket?.scope_hash || null,
    work_types: workTypes,
    geographies: strings(admission?.geographies, 100),
    channels: strings(admission?.channels, 100),
    success_criteria: strings(admission?.success_criteria, 200),
    required_capabilities: strings(admission?.required_capabilities, 100),
    requested_actions: actions,
    requires_authorization: requiresAuthorization,
    maximum_side_effect: sideEffect,
    grants_authorization: false,
  };
}

function preferredRole(requiredRoles, patterns, fallback, excluded = new Set()) {
  const values = unique(strings(requiredRoles).map((value) => String(value).trim()));
  for (const pattern of patterns) {
    const match = values.find((value) => !excluded.has(value) && pattern.test(value));
    if (match) return match;
  }
  return values.find((value) => !excluded.has(value)) || fallback;
}

function safeDeliverableType(scopePacket, fallback = 'markdown') {
  const value = normalized(scopePacket?.deliverable?.type);
  if (/\b(code|software|repository)\b/.test(value)) return 'code';
  if (/\b(presentation|slides|deck)\b/.test(value)) return 'presentation';
  if (/\b(asset|image|creative)\b/.test(value)) return 'asset';
  if (/\b(data|json|csv|structured)\b/.test(value)) return 'data';
  return fallback;
}

function supportsDocumentPlaybook(scopePacket) {
  const presentation = normalized(scopePacket?.deliverable?.presentation);
  const type = normalized(scopePacket?.deliverable?.type);
  if (['mixed', 'presentation', 'asset', 'structured data'].includes(presentation)) return false;
  return !/\b(code|repository|deployment|website|application|image|video|audio|banner|slides|deck|data|json|csv)\b/.test(
    type
  );
}

function isSoftwareSpecification(scopePacket) {
  if (!supportsDocumentPlaybook(scopePacket)) return false;
  const text = normalized(
    [
      scopePacket?.deliverable?.type,
      scopePacket?.deliverable?.title_prefix,
      scopePacket?.intent?.objective,
      ...(scopePacket?.deliverable?.required_sections || []).map(
        (section) => section?.topic || section
      ),
    ].join(' ')
  );
  return /\b(prd|product requirements|requirements document|specification|technical design|architecture plan|implementation plan)\b/.test(
    text
  );
}

function job({
  title,
  description,
  category,
  role,
  deliverableType = 'markdown',
  tools = [],
  criteria = [],
  requirements = '',
  hours = 0.5,
}) {
  return {
    title,
    description,
    category,
    required_role: role,
    deliverable_type: deliverableType,
    tool_requirements: unique(tools),
    acceptance_criteria: criteria,
    requirements,
    estimate_hours: hours,
  };
}

function phase(name, description, jobs, criteria = []) {
  return {
    name,
    description,
    tool_requirements: unique(jobs.flatMap((item) => item.tool_requirements || [])),
    acceptance_criteria: criteria,
    jobs,
  };
}

function simpleContentPlan(route, scopePacket, requiredRoles) {
  const contentRole = preferredRole(
    requiredRoles,
    [/content|copy|writer|editor|creative/i],
    'Content Specialist'
  );
  const requiresResearch = route.work_types.some((value) =>
    ['research_analysis', 'research analysis'].includes(normalized(value))
  );
  const researchRole = preferredRole(
    requiredRoles,
    [/research|analyst|evidence|insight/i],
    'Researcher',
    new Set([contentRole])
  );
  const researchPhase = requiresResearch
    ? [
        phase(
          'Evidence Preparation',
          'Prepare the bounded evidence and uncertainty ledger needed by the requested content.',
          [
            job({
              title: 'Analyze Approved Evidence for the Content',
              description:
                'Analyze the approved scope and any approved AxWise research for the requested content. Separate verified evidence, declared inputs, assumptions, contradictions, and gaps. Do not perform unapproved external research or actions.',
              category: 'content_research',
              role: researchRole,
              criteria: [
                'Every consequential claim has approved evidence or an explicit uncertainty label',
                'The evidence analysis is organized around the requested audience, format, and success criteria',
              ],
            }),
          ]
        ),
      ]
    : [];
  return {
    strategy: requiresResearch
      ? 'Ground the requested content in approved evidence, then create and validate the exact final asset.'
      : 'Create and validate the requested content directly from the approved scope.',
    phases: [
      ...researchPhase,
      phase(
        'Content Production',
        'Produce the requested bounded content and verify it against the approved scope.',
        [
          job({
            title: 'Create and Validate Requested Content',
            description:
              'Produce the requested content as the final deliverable. Preserve the approved audience, constraints, factual authority, tone, format, and success criteria; do not invent external actions.',
            category: 'content',
            role: contentRole,
            deliverableType: safeDeliverableType(scopePacket),
            criteria: [
              'The deliverable covers the approved objective and audience',
              'Every explicit constraint and success criterion is satisfied',
              'Facts, assumptions, and proposals remain distinguishable',
            ],
          }),
        ]
      ),
    ],
    confidence_score: Math.round(route.confidence * 100),
    estimated_total_hours: requiresResearch ? 1.25 : 0.5,
    estimated_total_tokens: requiresResearch ? 15000 : 7000,
  };
}

function researchStrategyPlan(route, requiredRoles) {
  const researchRole = preferredRole(
    requiredRoles,
    [/research|analyst|evidence|insight/i],
    'Researcher'
  );
  const strategyRole = preferredRole(
    requiredRoles,
    [/strateg|operation|consult|planner/i],
    'Operations Strategist',
    new Set([researchRole])
  );
  return {
    strategy:
      'Analyze the approved evidence and assumptions, then synthesize a decision-ready recommendation.',
    phases: [
      phase(
        'Evidence and Analysis',
        'Build the bounded evidence and uncertainty ledger required by the approved scope.',
        [
          job({
            title: 'Analyze Evidence, Assumptions, and Options',
            description:
              'Analyze the approved scope and any approved AxWise research. Separate verified evidence, declared inputs, assumptions, gaps, options, trade-offs, and confidence. Do not perform unapproved external research or actions.',
            category: 'research',
            role: researchRole,
            criteria: [
              'Every consequential claim has approved evidence or an explicit uncertainty label',
              'Options and trade-offs are comparable against the approved success criteria',
            ],
          }),
        ]
      ),
      phase('Recommendation Synthesis', 'Turn the analysis into an actionable, bounded strategy.', [
        job({
          title: 'Produce Decision-Ready Strategy',
          description:
            'Synthesize the analysis into the requested strategy or recommendation, including priorities, dependencies, risks, measures, decision points, and next actions. Keep execution outside the approved scope.',
          category: 'strategy',
          role: strategyRole,
          criteria: [
            'Recommendations are traceable to evidence or labelled assumptions',
            'Priorities, owners, measures, risks, and next decisions are explicit',
          ],
        }),
      ]),
    ],
    confidence_score: Math.round(route.confidence * 100),
    estimated_total_hours: 1.25,
    estimated_total_tokens: 18000,
  };
}

function genericSoftwarePrdPlan(route, requiredRoles) {
  const productRole = preferredRole(
    requiredRoles,
    [/product|ux|design|customer/i],
    'Product Manager'
  );
  const architectureRole = preferredRole(
    requiredRoles,
    [/architect|engineer|security|technical|platform|reliability/i],
    'Software Architect',
    new Set([productRole])
  );
  return {
    strategy:
      'Run product and technical specification in parallel, then synthesize one traceable implementation-ready document.',
    phases: [
      phase(
        'Product and Technical Analysis',
        'Produce complementary product and technical specifications from the same approved scope.',
        [
          job({
            title: 'Define Product Requirements and User Experience',
            description:
              'Define scope, non-goals, users, journeys, requirements, states, success measures, rollout, and requirement-linked acceptance tests.',
            category: 'product_ux',
            role: productRole,
            criteria: ['Every approved requirement and user journey is traceable to a test'],
          }),
          job({
            title: 'Define Architecture and Technical Assurance',
            description:
              'Define boundaries, interfaces, data, security, privacy, reliability, failure handling, observability, and requirement-linked verification without presenting unsettled choices as facts.',
            category: 'architecture_assurance',
            role: architectureRole,
            criteria: ['Technical boundaries and verification are implementation-ready'],
          }),
        ]
      ),
      phase(
        'Specification Synthesis',
        'Reconcile the two specifications into one coherent artifact.',
        [
          job({
            title: 'Synthesize Final Product Specification',
            description:
              'Produce one self-contained, implementation-ready Markdown specification from the approved scope and both specialist outputs. Preserve traceability and explicitly surface unresolved material decisions.',
            category: 'prd_synthesis',
            role: productRole,
            criteria: [
              'The output is one coherent specification',
              'Requirements, implementation detail, and tests are traceable',
            ],
            hours: 0.75,
          }),
        ]
      ),
    ],
    confidence_score: Math.round(route.confidence * 100),
    estimated_total_hours: 1.75,
    estimated_total_tokens: 30000,
  };
}

function campaignPlan(route, requiredRoles) {
  const strategyRole = preferredRole(
    requiredRoles,
    [/marketing|campaign|growth|research/i],
    'Marketing Strategist'
  );
  const creativeRole = preferredRole(
    requiredRoles,
    [/content|copy|creative|design|channel|social/i],
    'Content Specialist',
    new Set([strategyRole])
  );
  return {
    strategy:
      'Define the audience and channel strategy, develop the campaign package, then produce a measurable launch plan without executing unapproved actions.',
    phases: [
      phase(
        'Campaign Strategy and Creative',
        'Develop complementary strategy and channel-ready creative guidance.',
        [
          job({
            title: 'Define Campaign Strategy and Measurement',
            description:
              'Define objective, segments, positioning, channel roles, funnel, budget assumptions, schedule, KPIs, measurement, risks, and stop conditions from the approved scope.',
            category: 'campaign_strategy',
            role: strategyRole,
            criteria: [
              'Audience, channels, measures, assumptions, and stop conditions are explicit',
            ],
          }),
          job({
            title: 'Prepare Campaign Messages and Asset Briefs',
            description:
              'Create channel-specific message architecture, offers, calls to action, creative briefs, variants, accessibility requirements, and claim substantiation. Do not publish or spend.',
            category: 'campaign_content',
            role: creativeRole,
            criteria: [
              'Every message and asset maps to an audience, channel, and measurable objective',
            ],
          }),
        ]
      ),
      phase(
        'Campaign Plan Synthesis',
        'Produce one execution-ready but non-authorizing campaign package.',
        [
          job({
            title: 'Synthesize Campaign Launch Plan',
            description:
              'Reconcile strategy and creative outputs into the requested campaign plan, including timeline, ownership, dependencies, approval checkpoints, measurement, experimentation, and optimization rules. External launch remains separately authorized.',
            category: 'campaign_synthesis',
            role: strategyRole,
            criteria: [
              'The plan is internally consistent and contains explicit external-action gates',
            ],
            hours: 0.75,
          }),
        ]
      ),
    ],
    confidence_score: Math.round(route.confidence * 100),
    estimated_total_hours: 1.75,
    estimated_total_tokens: 26000,
  };
}

function logisticsPlan(route, requiredRoles) {
  const marketRole = preferredRole(
    requiredRoles,
    [/market|research|commercial|regulat|analyst/i],
    'Market Researcher'
  );
  const operationsRole = preferredRole(
    requiredRoles,
    [/logistics|supply|distribution|operation|procurement|finance/i],
    'Operations Strategist',
    new Set([marketRole])
  );
  return {
    strategy:
      'Assess market and regulatory conditions alongside the physical operating model, then synthesize a staged distribution plan.',
    phases: [
      phase(
        'Distribution Analysis',
        'Produce complementary commercial and operating analyses from approved evidence.',
        [
          job({
            title: 'Analyze Market, Buyers, and Regulatory Assumptions',
            description:
              'Analyze geography, buyer segments, routes to market, competition, regulatory constraints, evidence gaps, and commercial assumptions. Label all unverified market claims.',
            category: 'market_regulatory',
            role: marketRole,
            criteria: ['Market and regulatory claims have evidence or explicit assumption status'],
          }),
          job({
            title: 'Design Supply, Logistics, and Unit Economics',
            description:
              'Design sourcing, inventory, warehousing, transport, distributor selection, service levels, capacity, unit economics, risks, controls, and contingency paths without purchasing or contacting parties.',
            category: 'logistics_operations',
            role: operationsRole,
            criteria: [
              'The operating model, economics, dependencies, and failure paths are testable',
            ],
          }),
        ]
      ),
      phase(
        'Distribution Plan Synthesis',
        'Turn both analyses into a staged decision-ready distribution plan.',
        [
          job({
            title: 'Synthesize Staged Distribution Plan',
            description:
              'Produce the requested distribution plan with phases, partner criteria, economics, regulatory dependencies, risks, KPIs, validation experiments, decision gates, and a bounded launch roadmap. Outreach, orders, and shipments remain separately authorized.',
            category: 'distribution_synthesis',
            role: operationsRole,
            criteria: [
              'The plan connects market evidence to an executable operating model and explicit approval gates',
            ],
            hours: 0.75,
          }),
        ]
      ),
    ],
    confidence_score: Math.round(route.confidence * 100),
    estimated_total_hours: 2,
    estimated_total_tokens: 30000,
  };
}

function externalActionPlan(route, requiredRoles) {
  const operationsRole = preferredRole(
    requiredRoles,
    [/operation|campaign|communication|delivery|project/i],
    'Operations Strategist'
  );
  const assuranceRole = preferredRole(
    requiredRoles,
    [/compliance|risk|qa|security|privacy|legal/i],
    'QA Tester',
    new Set([operationsRole])
  );
  const orderedActionSummary = [
    ...route.requested_actions.filter(
      (item) => item.mode === 'execute' || item.side_effect !== 'none'
    ),
    ...route.requested_actions.filter(
      (item) => item.mode !== 'execute' && item.side_effect === 'none'
    ),
  ];
  const actionSummary =
    orderedActionSummary
      .slice(0, 20)
      .map((item) => item.action)
      .join('; ')
      .slice(0, 4000) || 'the requested external action';
  return {
    strategy:
      'Prepare and validate a payload-bound action package, then produce a non-executing authorization handoff for a future payload-bound approval mechanism.',
    phases: [
      phase(
        'Action Preparation and Readiness',
        'Prepare the exact action package and prove it is safe to present for authorization.',
        [
          job({
            title: 'Prepare External Action Package',
            description: `Prepare ${actionSummary}: recipients or targets, content or payload, schedule, cost, consent/compliance basis, exclusions, idempotency key, dry-run preview, rollback or stop conditions, and measurable success criteria. This task MUST NOT send, publish, purchase, contact, deploy, or otherwise create an external side effect.`,
            category: 'external_action_preparation',
            role: operationsRole,
            criteria: [
              'The exact payload, target set, cost boundary, and success criteria are reviewable',
              'Consent, compliance, idempotency, rollback, and stop conditions are explicit',
              'No external action occurs during preparation',
            ],
          }),
          job({
            title: 'Validate Authorization Readiness',
            description:
              'Validate the prepared package against the approved scope, tenant boundary, connector requirements, risk, consent, cost, payload binding, stale-version rejection, and rollback policy. Produce pass/fail findings only; do not execute.',
            category: 'external_action_assurance',
            role: assuranceRole,
            criteria: [
              'Any missing authority, connector, consent, or payload binding blocks execution',
            ],
          }),
        ]
      ),
      phase(
        'Authorization Handoff',
        'Produce the exact immutable manifest required for a later payload-bound approval and execution workflow.',
        [
          job({
            title: 'Produce Authorization Handoff Manifest',
            description: `Produce a receipt-ready, non-executing handoff manifest for ${actionSummary}. Bind the exact canonical payload, target set, tenant, scope hash/version, payload hash, idempotency key, required connector capabilities, cost boundary, expiry, rollback or stop conditions, and expected receipt schema. Record that ACTION_BLOCKED_NO_AUTHORIZATION is the only permitted runtime result until Orqaly has a mid-workflow approval that binds this exact prepared payload. This task MUST NOT call a connector or create any external side effect; the playbook route never grants authorization.`,
            category: 'external_action_authorization_handoff',
            role: operationsRole,
            criteria: [
              'The manifest binds the exact canonical payload, targets, scope, tenant, budget, and idempotency identity',
              'Connector capabilities and the expected per-target receipt schema are explicit',
              'No connector or external action is invoked by this playbook',
            ],
            requirements: `Execution remains blocked pending a future payload-bound mid-workflow approval. Route risk=${route.maximum_side_effect}; requires_authorization=${route.requires_authorization}; grants_authorization=false.`,
            hours: 0.5,
          }),
        ]
      ),
    ],
    confidence_score: Math.round(route.confidence * 100),
    estimated_total_hours: 1.5,
    estimated_total_tokens: 20000,
  };
}

/** Build a known deterministic plan. Strict PRD callers may supply its existing plan. */
export function buildDeterministicPlaybookPlan({
  route,
  scopePacket = null,
  requiredRoles = [],
  strictPrdPlan = null,
} = {}) {
  if (!route?.deterministic_plan_eligible) return null;
  switch (route.playbook_id) {
    case WORK_SHAPE_PLAYBOOK_IDS.SIMPLE_CONTENT:
      if (!supportsDocumentPlaybook(scopePacket)) return null;
      return simpleContentPlan(route, scopePacket, requiredRoles);
    case WORK_SHAPE_PLAYBOOK_IDS.RESEARCH_STRATEGY:
      if (!supportsDocumentPlaybook(scopePacket)) return null;
      return researchStrategyPlan(route, requiredRoles);
    case WORK_SHAPE_PLAYBOOK_IDS.SOFTWARE_PRD:
      if (strictPrdPlan) return strictPrdPlan;
      return isSoftwareSpecification(scopePacket)
        ? genericSoftwarePrdPlan(route, requiredRoles)
        : null;
    case WORK_SHAPE_PLAYBOOK_IDS.CAMPAIGN:
      if (!supportsDocumentPlaybook(scopePacket)) return null;
      return campaignPlan(route, requiredRoles);
    case WORK_SHAPE_PLAYBOOK_IDS.EXTERNAL_ACTION:
      return externalActionPlan(route, requiredRoles);
    case WORK_SHAPE_PLAYBOOK_IDS.LOGISTICS_DISTRIBUTION:
      if (!supportsDocumentPlaybook(scopePacket)) return null;
      return logisticsPlan(route, requiredRoles);
    default:
      return null;
  }
}
