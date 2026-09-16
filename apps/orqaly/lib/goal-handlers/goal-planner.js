/**
 * Goal Planner — LLM prompt builder for goal decomposition.
 * Breaks a high-level goal into 2-5 phases with 1-3 jobs each.
 * Enhanced: includes effort estimates, confidence score, and agent context.
 */
import { parseLlmJson } from '../agent-handlers/llm-executor.js';
import { executeLlmTracked } from '../usage-handlers/tracked-llm.js';
import { createLogger } from '../../api/_lib/logger.js';
import { goalNeedsBrandResearch } from './team-assigner.js';
import { defaultModel, defaultProvider } from '../_shared/llm-defaults.js';

const log = createLogger('goal-planner');

// Synthetic phase-0 task injected when a goal references an external URL or
// brand. Runs BEFORE Designer/Frontend tasks so they consume real scraped
// data instead of LLM-hallucinated values. Assigned to Browser Automation
// Lead, which team-assigner.js auto-includes for the same condition.
function buildBrandResearchJob(title) {
  return {
    title: `Brand & Site Research — ${title}`.slice(0, 120),
    description:
      'Produce BRAND_INTEL.md for the target domain referenced in the goal. Call tool_brandfetch__lookup_brand for brand identity, mcp_firecrawl__FIRECRAWL_CRAWL_SITE (limit 25) for full-site markdown, and tool_vision_qa for a homepage layout screenshot. Synthesize into the 4-section BRAND_INTEL.md report (Brand Identity / Offer Summary / Value Props & Hero Copy / Visual Layout Notes) with citations, ending in RESEARCH_READY. Downstream Designer and Frontend tasks consume this output as ground truth — never fabricate brand data.',
    category: 'research',
    requirements: 'Web research, brand identity extraction, site scraping',
    required_role: 'Browser Automation Lead',
    deliverable_type: 'research',
    estimate_hours: 0.5,
    status: 'pending',
    acceptance_criteria: [
      'BRAND_INTEL.md produced with the four required sections',
      'At least one successful call each to tool-brandfetch and mcp-firecrawl recorded in execution_meta.tool_calls',
      'No fabricated hex codes, font names, or offer terms — every claim cited',
      'Output ends with the marker RESEARCH_READY on its own line',
    ],
    injected_by: 'goal-planner.brand-research-autoinject',
  };
}

const SYSTEM_PROMPT = `You are a strategic Project Manager for an AI agent platform.
Break down the user's goal into 2-5 sequential phases.
Each phase has 1-3 concrete jobs that AI agents can execute.
Jobs should be specific, actionable tasks — not vague ideas.
Think practically: what steps actually produce the desired outcome?

Available agent capabilities:
- Research & analysis (web search, data gathering, market research)
- Content creation (writing, copywriting, documentation)
- Web browsing & automation (navigate sites, fill forms, create accounts)
- Development (code, scripts, API integration)
- Design (mockups, visuals, branding)
- Outreach & communication (email, social media, messaging)
- Data analysis (spreadsheets, reports, metrics)

Respond ONLY with valid JSON:
{
  "strategy": "Brief 1-sentence approach",
  "confidence_score": 0-100,
  "estimated_total_hours": number,
  "phases": [
    {
      "name": "Phase name",
      "description": "What this phase achieves",
      "jobs": [
        {
          "title": "Specific job title",
          "description": "What the agent should do (2-3 sentences)",
          "category": "research|content|outreach|analysis|development|design|automation",
          "requirements": "Key skills needed",
          "estimate_hours": number
        }
      ]
    }
  ]
}`;

/**
 * Generate a goal plan from a high-level objective.
 * @param {string} title — User's goal (e.g. "Earn $5000")
 * @param {string} description — Optional expanded description
 * @param {number} budgetUsd — Available budget
 * @param {object} req — HTTP request for logging
 * @param {object} [context] — Extra context (category, priority, requirements).
 *   Pass `context.usage` (a recordLlmUsage context incl. `admin`) to record this
 *   plan-generation call into llm_usage. Omit it and recording is skipped.
 * @returns {{ strategy, phases, planCost, confidenceScore, estimatedHours }}
 */
export async function generateGoalPlan(title, description, budgetUsd, req, context = {}) {
  const prompt = [
    `Goal: ${title}`,
    description ? `Details: ${description}` : '',
    context.parsed_requirements ? `Requirements: ${context.parsed_requirements}` : '',
    context.parsed_category ? `Category: ${context.parsed_category}` : '',
    context.parsed_priority ? `Priority: ${context.parsed_priority}` : '',
    `Budget: $${budgetUsd} (this covers AI agent operational costs)`,
    '',
    'Break this into actionable phases and jobs. Be practical — focus on what AI agents can actually do.',
    'Include effort estimates (hours) for each job and a confidence score (0-100) for the overall plan.',
  ]
    .filter(Boolean)
    .join('\n');

  const llmResult = await executeLlmTracked({
    prompt,
    systemPrompt: SYSTEM_PROMPT,
    provider: defaultProvider(),
    model: defaultModel(),
    pinnedProvider: true,
    temperature: 0.4,
    maxTokens: 2000,
    jsonMode: true,
    req,
    usage: context.usage
      ? {
          source: 'goal-planner',
          operation: 'plan',
          description: `Goal plan: ${title}`,
          ...context.usage,
        }
      : undefined,
  });

  // normalizePlanShape coerces Qwen's string-instead-of-array issues
  // before the .map calls below crash on a non-array.
  const { normalizePlanShape } = await import('./_helpers.js');
  const plan = normalizePlanShape(parseLlmJson(llmResult.content));
  if (!plan?.phases?.length) {
    throw new Error('Failed to generate goal plan — invalid LLM response');
  }

  // Validate and normalize
  let totalEstHours = 0;
  for (const phase of plan.phases) {
    phase.status = 'pending';
    // Array.isArray guard: normalizePlanShape handles the common case but
    // races through when plan.phases itself is malformed (e.g. an object
    // keyed by index) — belt-and-suspenders so .map never blows up here.
    phase.jobs = (Array.isArray(phase.jobs) ? phase.jobs : []).map((j) => {
      const estHours = Number(j.estimate_hours) || 1;
      totalEstHours += estHours;
      return {
        title: j.title || 'Untitled job',
        description: j.description || '',
        category: j.category || 'general',
        requirements: j.requirements || '',
        estimate_hours: estHours,
        status: 'pending',
      };
    });
  }

  // Auto-inject a dedicated "Brand & Site Research" phase before any other
  // work when the goal references an external URL or brand name (see goal
  // f505dbeb post-mortem). MUST be its own phase, not a job inside phase 0:
  // execute-phase.js enqueues all jobs in a phase concurrently, so adding
  // a research job alongside the Designer doesn't guarantee Designer reads
  // the research output before starting. Phase boundaries DO guarantee
  // ordering (evaluate-phase gates phase advancement).
  //
  // Idempotent: skip if a research phase already exists at index 0.
  if (goalNeedsBrandResearch({ title, description })) {
    const alreadyHasResearchPhase = plan.phases[0]?.jobs?.some(
      (j) => j?.injected_by === 'goal-planner.brand-research-autoinject'
    );
    if (!alreadyHasResearchPhase) {
      plan.phases.unshift({
        name: 'Brand & Site Research',
        description:
          'Scrape the target domain via Brandfetch + Firecrawl + Vision-QA and produce BRAND_INTEL.md. Downstream design/build phases consume this as ground truth — no fabricated brand data downstream.',
        status: 'pending',
        jobs: [buildBrandResearchJob(title)],
      });
      log.info(req, 'goal-planner.brand-research-phase-injected', {
        goalTitle: title,
        totalPhases: plan.phases.length,
      });
    }
  }

  return {
    strategy: plan.strategy || '',
    phases: plan.phases,
    planCost: llmResult.estimatedCostUsd || 0,
    confidenceScore: Math.min(100, Math.max(0, Number(plan.confidence_score) || 50)),
    estimatedHours: plan.estimated_total_hours || totalEstHours,
  };
}
