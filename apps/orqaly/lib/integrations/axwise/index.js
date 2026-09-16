/**
 * AxWise integration - public barrel.
 *
 * Conditions callers use withAxwiseTracked() (or withAxwise() when they log
 * usage themselves) with a build*Context helper. Goal orchestration callers
 * use orchestrateGoalWithAxwise(), which revalidates every returned assignment
 * before Orqaly can apply it.
 */
export { evaluateConditions, normalizeAxwiseTenant } from './client.js';
export {
  buildConsiliumCreateContext,
  buildAgentGenerateContext,
  buildCopilotContext,
  buildCopilotGroundContext,
} from './context.js';
export { shouldEvaluate } from './pre-classifier.js';
export { withAxwise } from './degrade.js';
export { withAxwiseTracked } from './tracked.js';
export { isAxwiseEnabled, axwiseEnforcement } from './config.js';
export { isAxwiseUserDisabled, clearAxwiseUserFlagCache } from './user-flag.js';
export {
  createOrchestrationDecision,
  getOrchestrationDecision,
  refreshOrchestrationResearch,
  replanOrchestrationDecision,
} from './orchestration-client.js';
export {
  goalPlanSteps,
  buildGoalOrchestrationRequest,
  authorizeGoalDecision,
  orchestrateGoalWithAxwise,
} from './goal-orchestration.js';
