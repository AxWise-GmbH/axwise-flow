import { describe, expect, it } from 'vitest';
import {
  enforceAxwiseEvidenceExecutionBoundary,
  enforceAxwiseResearchBoundary,
  formatAxwiseEvidenceExecutionPolicyForPlanning,
  formatAxwiseResearchPolicyForPlanning,
  isAxwiseResearchRestricted,
  normalizePlannerDeliverableType,
  normalizePlannerOutput,
  PLANNER_DELIVERABLE_TYPES,
} from './planner-output-normalization.js';

describe('planner output normalization', () => {
  it('maps observed generic authoring requirements to one credential-free tool', () => {
    const plan = {
      phases: [
        {
          jobs: [
            {
              deliverable_type: 'Specification Document',
              tool_requirements: [
                'Mermaid.js',
                'Data Analysis Tools',
                'Documentation Platform',
                'Spreadsheet Tool',
                'Validation Checklist',
              ],
            },
          ],
        },
      ],
    };

    const result = normalizePlannerOutput(plan);

    expect(result.plan.phases[0].jobs[0]).toMatchObject({
      deliverable_type: 'markdown',
      tool_requirements: ['tool-doc-generator'],
    });
    expect(result.diagnostics.unknownTools).toEqual([]);
    expect(result.diagnostics.toolMappings).toHaveLength(5);
  });

  it('keeps real connectors and unknown privileged runtimes explicit so they fail closed', () => {
    const plan = {
      phases: [
        {
          jobs: [
            {
              deliverable_type: 'Slide Deck',
              tool_requirements: 'Google Sheets; Notion; Python; SQL; Snowflake Warehouse',
            },
          ],
        },
      ],
    };

    const result = normalizePlannerOutput(plan);
    const job = result.plan.phases[0].jobs[0];

    expect(job.deliverable_type).toBe('presentation');
    expect(job.tool_requirements).toEqual([
      'mcp-google-sheets',
      'tool-notion',
      'tool-python',
      'tool-sql',
      'tool-snowflake-warehouse',
    ]);
    expect(result.diagnostics.unknownTools).toEqual([
      'tool-python',
      'tool-sql',
      'tool-snowflake-warehouse',
    ]);
  });

  it.each([
    ['markdown', 'markdown'],
    ['code', 'code'],
    ['deployment', 'deployment'],
    ['presentation', 'presentation'],
    ['asset', 'asset'],
    ['data', 'data'],
    ['Validation Checklist', 'markdown'],
    ['Mermaid Diagram', 'markdown'],
    ['GitHub Repository', 'code'],
    ['Landing Page', 'deployment'],
    ['Pitch Deck', 'presentation'],
    ['Spreadsheet', 'data'],
    ['something the runtime does not understand', 'markdown'],
    [null, 'markdown'],
  ])('normalizes deliverable type %j to %s', (input, expected) => {
    expect(normalizePlannerDeliverableType(input)).toBe(expected);
    expect(PLANNER_DELIVERABLE_TYPES).toContain(expected);
  });

  it('deduplicates canonical tools and safely handles malformed plan fields', () => {
    const plan = {
      phases: [
        {
          jobs: [
            {
              deliverable_type: null,
              tool_requirements: ['Document editor', 'tool-doc-generator', '', null],
            },
          ],
        },
        { jobs: 'not-an-array' },
      ],
    };

    expect(normalizePlannerOutput(plan).plan.phases[0].jobs[0]).toMatchObject({
      deliverable_type: 'markdown',
      tool_requirements: ['tool-doc-generator'],
    });
  });

  it('enforces a non-research AxWise route while preserving supplied-evidence work', () => {
    const plan = {
      strategy: 'Use attached cohort records and browse the web for DACH market benchmarks.',
      phases: [
        {
          name: 'Market Research & Retention Diagnosis',
          description: 'Research the internet for category trends. Diagnose the supplied cohorts.',
          tool_requirements: ['web-search', 'doc-generator'],
          acceptance_criteria: [
            'Cite at least five external URLs',
            'Quote supplied AxWise evidence with source IDs and character offsets',
            'Identify the highest-churn cohort from attached records',
          ],
          jobs: [
            {
              title: 'DACH Pet Food Subscription Market Research',
              description: 'Conduct deep web research with five search queries and cited sources.',
              category: 'research',
              required_role: 'Marketing Strategist',
              deliverable_type: 'markdown',
              tool_requirements: ['tool-web-search'],
              acceptance_criteria: ['Every numeric claim has a citation URL'],
            },
            {
              title: 'Retention Cohort Diagnosis',
              description:
                'Analyze the supplied subscription cohort records. Search online for industry benchmarks.',
              category: 'analysis',
              required_role: 'Ecommerce Operations Manager',
              deliverable_type: 'markdown',
              tool_requirements: ['tool-web-search', 'tool-doc-generator'],
              requirements:
                'Separate observed cohort facts from hypotheses. Quote attached evidence using its source IDs and offsets.',
              acceptance_criteria: [
                'Retention risks are tied to supplied cohort data',
                'Cite external market reports with source URLs',
                'Quote AxWise evidence with source IDs and offsets',
              ],
            },
          ],
        },
      ],
    };
    const goal = {
      data: {
        axwise_customer_intelligence: {
          routing_assessment: { selected_mode: 'human_controlled' },
        },
      },
    };

    normalizePlannerOutput(plan);
    const result = enforceAxwiseResearchBoundary(plan, goal);
    const phase = result.plan.phases[0];

    expect(result.diagnostics).toMatchObject({
      enforced: true,
      routingMode: 'human_controlled',
    });
    expect(result.diagnostics.removedJobs).toHaveLength(1);
    expect(phase.jobs).toHaveLength(1);
    expect(phase.jobs[0]).toMatchObject({
      title: 'Retention Cohort Diagnosis',
      tool_requirements: ['tool-doc-generator'],
    });
    expect(phase.jobs[0].description).toBe('Analyze the supplied subscription cohort records.');
    expect(phase.jobs[0].requirements).toContain('source IDs and offsets');
    expect(phase.jobs[0].acceptance_criteria).toContain(
      'Quote AxWise evidence with source IDs and offsets'
    );
    expect(phase.acceptance_criteria).toContain(
      'Quote supplied AxWise evidence with source IDs and character offsets'
    );
    expect(JSON.stringify(result.plan)).not.toMatch(
      /tool-web-search|search online|research the internet|external URLs|source URLs/i
    );
  });

  it('replaces an emptied research phase with bounded supplied-evidence synthesis', () => {
    const plan = {
      phases: [
        {
          name: 'Benchmark Research',
          description: 'Browse external sources for current benchmarks.',
          acceptance_criteria: ['At least 5 citations'],
          jobs: [
            {
              title: 'Competitive Research',
              description: 'Collect competitor data from the web.',
              category: 'research',
              required_role: 'Market Analyst',
              deliverable_type: 'data',
              tool_requirements: ['doc-generator'],
              estimate_hours: 2,
            },
          ],
        },
      ],
    };
    const goal = {
      data: {
        axwise_customer_intelligence: {
          routing_assessment: { selected_mode: 'direct' },
        },
      },
    };

    normalizePlannerOutput(plan);
    const result = enforceAxwiseResearchBoundary(plan, goal);
    const phase = result.plan.phases[0];

    expect(result.diagnostics.replacedPhases).toEqual([{ phaseIndex: 0 }]);
    expect(phase.name).toBe('Evidence Synthesis & Decision Framing');
    expect(phase.jobs).toHaveLength(1);
    expect(phase.jobs[0]).toMatchObject({
      title: 'Synthesize supplied evidence and uncertainties',
      required_role: 'Market Analyst',
      deliverable_type: 'markdown',
      tool_requirements: [],
      estimate_hours: 2,
    });
    expect(JSON.stringify(phase)).not.toMatch(/tool-web-search|citation|source URL/i);
  });

  it('keeps mixed design/specification work and removes only its external-research demand', () => {
    const plan = {
      phases: [
        {
          name: 'Design Research & Specification',
          jobs: [
            {
              title: 'Design Research & Specification',
              description:
                'Use supplied brand context to define the visual direction. Research the web for customer personas. Produce the CSS palette, typography, wireframes, and QA checklist.',
              category: 'design',
              required_role: 'Designer',
              deliverable_type: 'markdown',
              tool_requirements: ['web-search', 'doc-generator'],
              acceptance_criteria: [
                'CSS-ready palette and typography are complete',
                'Cite attached AxWise evidence with its source URL, source ID, and character offsets',
                'Quote internal records and label declared evidence',
              ],
            },
          ],
        },
      ],
    };
    const goal = {
      data: {
        axwise_customer_intelligence: {
          routing_assessment: { selected_mode: 'evidence_assisted' },
        },
      },
    };

    normalizePlannerOutput(plan);
    const result = enforceAxwiseResearchBoundary(plan, goal);
    const job = result.plan.phases[0].jobs[0];

    expect(result.diagnostics.removedJobs).toEqual([]);
    expect(job.title).toBe('Design Research & Specification');
    expect(job.tool_requirements).toEqual(['tool-doc-generator']);
    expect(job.description).toContain('supplied brand context');
    expect(job.description).toContain('CSS palette, typography, wireframes, and QA checklist');
    expect(job.description).not.toContain('Research the web');
    expect(job.acceptance_criteria).toContain(
      'Cite attached AxWise evidence with its source URL, source ID, and character offsets'
    );
    expect(job.acceptance_criteria).toContain('Quote internal records and label declared evidence');
  });

  it.each([
    ['research-assisted', { routing_assessment: { selected_mode: 'research_assisted' } }],
    ['legacy', null],
  ])('preserves planner behavior for %s goals', (_label, intelligence) => {
    const plan = {
      phases: [
        {
          jobs: [
            {
              title: 'Market Research',
              description: 'Search the web and cite external URLs.',
              category: 'research',
              tool_requirements: ['web-search'],
            },
          ],
        },
      ],
    };
    const goal = intelligence
      ? { data: { axwise_customer_intelligence: intelligence } }
      : { data: {} };

    normalizePlannerOutput(plan);
    const before = structuredClone(plan);
    const result = enforceAxwiseResearchBoundary(plan, goal);

    expect(result.diagnostics.enforced).toBe(false);
    expect(result.plan).toEqual(before);
    expect(result.plan.phases[0].jobs[0].tool_requirements).toEqual(['tool-web-search']);
  });

  it('formats an explicit binding planning policy only for AxWise-routed goals', () => {
    const restrictedGoal = {
      data: {
        axwise_customer_intelligence: {
          routing_assessment: { selected_mode: 'evidence_assisted' },
        },
      },
    };
    const researchGoal = {
      data: {
        axwise_customer_intelligence: {
          routing_assessment: { selected_mode: 'research_assisted' },
        },
      },
    };

    expect(isAxwiseResearchRestricted(restrictedGoal)).toBe(true);
    expect(formatAxwiseResearchPolicyForPlanning(restrictedGoal)).toContain(
      'additional external research does not have sufficient value'
    );
    expect(isAxwiseResearchRestricted(researchGoal)).toBe(false);
    expect(formatAxwiseResearchPolicyForPlanning(researchGoal)).toContain(
      'Bounded external research is authorised'
    );
    expect(formatAxwiseResearchPolicyForPlanning({ data: {} })).toBe('');
  });

  it('turns the exact absent-record Advanced plan into bounded methodology without losing strategy work', () => {
    const plan = {
      strategy: 'Analyze cohorts, calculate retention, and produce a 90-day operating plan.',
      phases: [
        {
          name: 'Retention Diagnosis',
          description:
            'Analyze historical cohort retention, cancellation records, support tickets, and delivery logs.',
          acceptance_criteria: ['All data sources are verified and cohort findings are calculated'],
          jobs: [
            {
              title: 'Cohort Churn & Logistics Diagnostic Matrix',
              description:
                'Query SQL cohort data, calculate churn in Python/Pandas, and map support tickets to delivery delay logs.',
              category: 'analysis',
              required_role: 'Ecommerce Operations Manager',
              deliverable_type: 'Data Analysis',
              tool_requirements: [
                'Python/Pandas',
                'SQL',
                'Google Sheets',
                'Notion',
                'Dashboard',
                'PDF Generator',
              ],
              acceptance_criteria: ['Calculates churn by cohort from source records'],
            },
          ],
        },
        {
          name: 'Strategy',
          jobs: [
            {
              title: 'Flexible Subscription & Dietary Guidance Framework',
              description:
                'Draft pause, skip, and dietary-transition operating specifications from declared context.',
              category: 'strategy',
              deliverable_type: 'markdown',
              tool_requirements: ['Notion', 'PDF Generator'],
            },
          ],
        },
        {
          name: 'Operating Plan',
          jobs: [
            {
              title: '90-Day Retention Operating Plan',
              description:
                'Prioritize hypotheses, owners, safeguards, and future validation steps.',
              category: 'operations',
              deliverable_type: 'markdown',
              tool_requirements: ['Notion', 'PDF Generator'],
            },
            {
              title: 'Weekly Leading Indicators Dashboard Specification',
              description:
                'Specify future metrics, source requirements, thresholds, and reporting cadence; no live dashboard.',
              category: 'analytics',
              deliverable_type: 'markdown',
              tool_requirements: ['Notion'],
            },
          ],
        },
      ],
    };
    const goal = {
      data: {
        attachments: [],
        axwise_customer_intelligence: {
          routing_assessment: { selected_mode: 'human_controlled' },
          persona_resolution: {
            customer_persona: {
              trust: { status: 'declared_unverified', evidence_count: 3 },
              evidence: [
                {
                  quote: 'We have cohort retention and cancellation themes.',
                  provenance: 'operational',
                  document_id: 'orqaly:goal:g1:po-answer:1',
                },
              ],
            },
          },
        },
      },
    };

    normalizePlannerOutput(plan);
    const result = enforceAxwiseEvidenceExecutionBoundary(plan, goal);
    const [diagnostic, framework, finalPlan, dashboardSpec] = [
      result.plan.phases[0].jobs[0],
      result.plan.phases[1].jobs[0],
      result.plan.phases[2].jobs[0],
      result.plan.phases[2].jobs[1],
    ];

    expect(result.diagnostics.enforced).toBe(true);
    expect(result.diagnostics.convertedJobs).toHaveLength(1);
    expect(diagnostic).toMatchObject({
      title:
        'Specify methodology and required inputs for Cohort Churn & Logistics Diagnostic Matrix',
      category: 'methodology',
      deliverable_type: 'markdown',
      tool_requirements: ['tool-doc-generator'],
    });
    expect(diagnostic.description).toContain('do not claim that source records were inspected');
    expect(framework.title).toBe('Flexible Subscription & Dietary Guidance Framework');
    expect(finalPlan.title).toBe('90-Day Retention Operating Plan');
    expect(dashboardSpec.title).toBe('Weekly Leading Indicators Dashboard Specification');
    expect(framework.tool_requirements).toEqual(['tool-doc-generator']);
    expect(finalPlan.tool_requirements).toEqual(['tool-doc-generator']);
    expect(dashboardSpec.tool_requirements).toEqual(['tool-doc-generator']);
    expect(JSON.stringify(result.plan)).not.toMatch(
      /tool-(?:python|python-pandas|sql|notion|dashboard|pdf-generator)|mcp-google-sheets/
    );
  });

  it('preserves a forward-looking Bremen funnel architecture as a complete design deliverable', () => {
    const plan = {
      strategy: 'Design the commercial operating system from declared context.',
      phases: [
        {
          name: 'Funnel, Metrics & Risk',
          jobs: [
            {
              title: 'Conversion Funnel Architecture, Metrics & Risk Matrix',
              description:
                'Design funnel stages, measure the defined KPIs, specify the measurement cadence, and produce a commercial risk matrix with mitigations.',
              required_role: 'Commercial Risk Analyst',
              deliverable_type: 'markdown',
              tool_requirements: [],
              acceptance_criteria: [
                'The full funnel, KPI definitions, measurement method, and risk matrix are reviewable',
              ],
            },
          ],
        },
      ],
    };
    const goal = {
      data: {
        axwise_customer_intelligence: {
          routing_assessment: { selected_mode: 'evidence_assisted' },
        },
      },
    };

    normalizePlannerOutput(plan);
    const result = enforceAxwiseEvidenceExecutionBoundary(plan, goal);
    const [job] = result.plan.phases[0].jobs;

    expect(result.diagnostics.convertedJobs).toEqual([]);
    expect(job.title).toBe('Conversion Funnel Architecture, Metrics & Risk Matrix');
    expect(job.description).toContain('produce a commercial risk matrix');
  });

  it('preserves PRD synthesis when metrics and observability are specification topics', () => {
    const plan = {
      phases: [
        {
          jobs: [
            {
              title: 'Compile Unified Production PRD, Observability Specs & Acceptance Test Matrix',
              description:
                'Assemble the product requirements document from declared context and define metrics, logs, security controls, and acceptance tests.',
              deliverable_type: 'markdown',
              tool_requirements: ['tool-doc-generator'],
            },
          ],
        },
      ],
    };
    const goal = {
      data: {
        axwise_customer_intelligence: {
          routing_assessment: { selected_mode: 'human_controlled' },
        },
      },
    };

    const result = enforceAxwiseEvidenceExecutionBoundary(plan, goal);

    expect(result.diagnostics.enforced).toBe(true);
    expect(result.diagnostics.convertedJobs).toEqual([]);
    expect(result.plan.phases[0].jobs[0].title).toMatch(/^Compile Unified/);
  });

  it('preserves an observed consolidated PRD compilation title', () => {
    const plan = {
      phases: [
        {
          jobs: [
            {
              title: 'Consolidated PRD Compilation, Validation & Final Assembly',
              description:
                'Compile the complete product requirements document from declared context and specialist inputs.',
              deliverable_type: 'markdown',
              tool_requirements: ['tool-doc-generator'],
            },
          ],
        },
      ],
    };
    const goal = {
      data: {
        axwise_customer_intelligence: {
          routing_assessment: { selected_mode: 'human_controlled' },
        },
      },
    };

    const result = enforceAxwiseEvidenceExecutionBoundary(plan, goal);

    expect(result.diagnostics.enforced).toBe(true);
    expect(result.diagnostics.convertedJobs).toEqual([]);
    expect(result.plan.phases[0].jobs[0].title).toMatch(/^Consolidated PRD Compilation/);
  });

  it('does not let declared customer quotes or unrelated old grants authorize record analysis', () => {
    const plan = {
      phases: [
        {
          jobs: [
            {
              title: 'Analyze subscription records',
              description: 'Calculate churn by cohort from customer records.',
              deliverable_type: 'data',
              tool_requirements: ['SQL'],
            },
          ],
        },
      ],
    };
    const goal = {
      data: {
        axwise_customer_intelligence: {
          persona_resolution: {
            customer_persona: {
              trust: { status: 'declared_unverified', evidence_count: 2 },
              evidence: [
                {
                  quote: 'I believe cancellation is caused by delivery delays.',
                  provenance: 'operational',
                  document_id: 'orqaly:goal:g2:po-answer:1',
                },
              ],
            },
          },
        },
        execution_authorization: {
          manifest: {
            tasks: [{ granted_tool_ids: ['tool-doc-generator', 'tool-email'] }],
          },
        },
      },
    };

    normalizePlannerOutput(plan);
    const result = enforceAxwiseEvidenceExecutionBoundary(plan, goal);

    expect(result.diagnostics.enforced).toBe(true);
    expect(result.diagnostics.authorizedConnectorIds).toEqual([]);
    expect(result.diagnostics.convertedJobs).toHaveLength(1);
  });

  it.each([
    [
      'content-bearing attachment',
      {
        attachments: [{ content_excerpt: 'week, active_subscribers, cancellations\n1, 100, 4' }],
      },
    ],
    [
      'goal-scoped record connector',
      {
        attachments: [],
        execution_authorization: {
          manifest: { tasks: [{ granted_tool_ids: ['mcp-google-sheets'] }] },
        },
      },
    ],
  ])('preserves legitimate analysis with a %s', (_label, goalData) => {
    const plan = {
      phases: [
        {
          jobs: [
            {
              title: 'Analyze subscription records',
              description: 'Calculate churn by cohort from attached records.',
              deliverable_type: 'data',
              tool_requirements: ['Google Sheets'],
            },
          ],
        },
      ],
    };
    const goal = {
      data: {
        ...goalData,
        axwise_customer_intelligence: {
          persona_resolution: {
            customer_persona: {
              trust: { status: 'declared_unverified', evidence_count: 0 },
              evidence: [],
            },
          },
        },
      },
    };

    normalizePlannerOutput(plan);
    const before = structuredClone(plan);
    const result = enforceAxwiseEvidenceExecutionBoundary(plan, goal);

    expect(result.diagnostics.enforced).toBe(false);
    expect(result.plan).toEqual(before);
    expect(result.plan.phases[0].jobs[0].tool_requirements).toEqual(['mcp-google-sheets']);
  });

  it('keeps bounded web research on research_assisted while converting absent internal-record analysis', () => {
    const plan = {
      phases: [
        {
          jobs: [
            {
              title: 'DACH market research',
              description: 'Search public sources and analyze market data with citations.',
              category: 'research',
              deliverable_type: 'markdown',
              tool_requirements: ['web-search'],
            },
            {
              title: 'Analyze customer cohorts',
              description: 'Calculate churn from internal cohort records.',
              category: 'analysis',
              deliverable_type: 'data',
              tool_requirements: ['SQL'],
            },
          ],
        },
      ],
    };
    const goal = {
      data: {
        attachments: [],
        axwise_customer_intelligence: {
          routing_assessment: { selected_mode: 'research_assisted' },
          persona_resolution: {
            customer_persona: {
              trust: { status: 'declared_unverified', evidence_count: 0 },
              evidence: [],
            },
          },
        },
      },
    };

    normalizePlannerOutput(plan);
    const result = enforceAxwiseEvidenceExecutionBoundary(plan, goal);

    expect(result.plan.phases[0].jobs[0]).toMatchObject({
      title: 'DACH market research',
      tool_requirements: ['tool-web-search'],
    });
    expect(result.plan.phases[0].jobs[1]).toMatchObject({
      category: 'methodology',
      tool_requirements: ['tool-doc-generator'],
    });
    expect(formatAxwiseEvidenceExecutionPolicyForPlanning(goal)).toContain(
      'bounded web research remains allowed'
    );
  });
});
