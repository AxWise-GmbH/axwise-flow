/**
 * Goal Orchestrator — thin dispatcher for the pipeline stages.
 *
 * Routes orchestrate-goal jobs to the appropriate stage handler.
 * All business logic lives in lib/goal-handlers/stages/*.js
 *
 * Pipeline flow:
 *   Smart Request: scope-admission → context-approval → pm-planning → …
 *   Legacy/fallback: feasibility-analysis → po-analysis → customer-intelligence →
 *   context-approval → pm-planning → team-formation → tool-provisioning → discovery-estimation →
 *   client-approval → [approved landing enrichment] →
 *   execute-phase → evaluate-phase → iterate/complete
 */
import { createLogger } from '../../api/_lib/logger.js';

const log = createLogger('goal-orchestrator');

// ── Stage handler imports ─────────────────────────────────────
import { handle as handleFeasibilityAnalysis } from './stages/feasibility-analysis.js';
import {
  handle as handlePoAnalysis,
  handleContinue as handlePoAnalysisContinue,
} from './stages/po-analysis.js';
import { handle as handleCustomerIntelligence } from './stages/customer-intelligence.js';
import { handle as handleContextApproval } from './stages/context-approval.js';
import { handle as handlePmPlanning } from './stages/pm-planning.js';
import { handle as handleTeamFormation } from './stages/team-formation.js';
import { handle as handleToolProvisioning } from './stages/tool-provisioning.js';
import { handle as handleDiscoveryEstimation } from './stages/discovery-estimation.js';
import { handle as handleClientApproval } from './stages/client-approval.js';
import { handle as handleExecutePhase } from './stages/execute-phase.js';
import { handle as handleEvaluatePhase } from './stages/evaluate-phase.js';
import { handle as handleIterate } from './stages/iterate.js';
import { handle as handleComplete } from './stages/complete.js';
import { handle as handlePrdQualityRepair } from './stages/prd-quality-repair.js';
import { handle as handleOsjaReview } from './stages/osja-review.js';
import { handle as handleOsjaRegen } from './stages/osja-regen.js';
import { handle as handleBrandSeed } from './stages/brand-seed.js';
import { handle as handleCloneReference } from './stages/clone-reference.js';
import { handle as handleImagePool } from './stages/image-pool.js';
import { handle as handleApplyFeedback } from './stages/apply-feedback.js';

// Legacy plan handler — for backward compatibility with existing queued jobs
import { handleLegacyPlan } from './stages/_legacy-plan.js';

// ── Action → Handler map ─────────────────────────────────────

const ACTION_HANDLERS = {
  // Legacy action (backward compat)
  plan: handleLegacyPlan,

  // New pipeline stages
  'feasibility-analysis': handleFeasibilityAnalysis,
  'po-analysis': handlePoAnalysis,
  'po-analysis-continue': handlePoAnalysisContinue,
  // Domain-neutral Smart Request name. The handler and persisted state retain
  // their historical customer-intelligence names for queue compatibility.
  'scope-admission': handleCustomerIntelligence,
  'customer-intelligence': handleCustomerIntelligence,
  'context-approval': handleContextApproval,
  'pm-planning': handlePmPlanning,
  // Landing-page-only, post-approval stages. Each external action must be in
  // the current gate-2 authorization manifest before it may run.
  'brand-seed': handleBrandSeed,
  'clone-reference': handleCloneReference,
  'image-pool': handleImagePool,
  'team-formation': handleTeamFormation,
  'tool-provisioning': handleToolProvisioning,
  'discovery-estimation': handleDiscoveryEstimation,
  'client-approval': handleClientApproval,

  // Execution stages
  'execute-phase': handleExecutePhase,
  'evaluate-phase': handleEvaluatePhase,
  iterate: handleIterate,
  'apply-feedback': handleApplyFeedback,
  complete: handleComplete,
  'prd-quality-repair': handlePrdQualityRepair,

  // Post-completion review (Library Universe / Osja General Manager)
  'osja-review': handleOsjaReview,
  // Auto-regeneration of a single deliverable using Osja's critique
  'osja-regen': handleOsjaRegen,
};

// ── Main dispatcher ──────────────────────────────────────────

export async function handleGoalOrchestration(admin, payload, req) {
  const action = payload.action;
  const handler = ACTION_HANDLERS[action];

  if (!handler) {
    throw new Error(
      `Unknown goal action: ${action}. Valid: ${Object.keys(ACTION_HANDLERS).join(', ')}`
    );
  }

  log.info(req, `goal.${action}`, { goalId: payload.goalId });
  return handler(admin, payload, req);
}
