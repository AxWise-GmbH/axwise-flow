/**
 * AxWise Conditions layer - contract typedefs (JSDoc only, no runtime).
 *
 * AxWise is an EXTERNAL cognitive "conditions" engine. Orqaly ships local facts
 * to it and consumes ready-to-merge outputs; it never re-derives condition logic
 * locally. See lib/integrations/axwise/README of the plan and CLAUDE.md.
 *
 * Contract version: /v1/ (POST /v1/conditions/evaluate).
 *
 * @typedef {'consilium.create'|'agent.generate'|'copilot.chat'|'copilot.ground'} IntegrationPoint
 *
 * @typedef {Object} TenantContext
 * @property {string} userId  - authenticated Supabase user id
 * @property {string} [orgId] - organization/tenant id (may be null if unresolved)
 *
 * @typedef {Object} EvaluationContext
 * @property {IntegrationPoint} integrationPoint
 * @property {string} requestId - UUID for idempotency + tracing
 * @property {TenantContext} tenant
 * @property {Record<string, any>} payload - point-specific LOCAL facts only
 * @property {Record<string, any>} [hints]
 *
 * @typedef {Object} AuditMarker
 * @property {string} category
 * @property {string} decision
 * @property {string} [reason]
 *
 * @typedef {Object} SecurityOutput
 * @property {'allowed'|'denied'} scopeDecision  - ADVISORY only; Orqaly enforces authz locally
 * @property {boolean} [requiresApproval]
 * @property {string} [blockReason]
 * @property {string[]} [flags]
 *
 * @typedef {Object} GovernanceOutput
 * @property {string} [consensus_type]
 * @property {number} [quorum]
 * @property {number} [approval_threshold]
 * @property {number} [confidence_threshold]
 * @property {string} [split_decision_strategy]
 *
 * @typedef {Object} GroundingClaim
 * @property {string} claim
 * @property {number} offset_start - index inside the draft answer
 * @property {number} offset_end
 * @property {string} source_file
 *
 * @typedef {Object} GroundingOutput
 * @property {boolean} verified
 * @property {string[]} [unsupportedClaims]
 * @property {GroundingClaim[]} [offsets]
 *
 * @typedef {Object} ProcessedOutputs
 * @property {string} [systemPromptFragment] - ready-to-merge system-prompt text
 * @property {Object} [persona]              - { archetype, ocean, tone, temperature }
 * @property {SecurityOutput} [security]
 * @property {GovernanceOutput} [governance]
 * @property {GroundingOutput} [grounding]
 * @property {Object} [classification]       - { intent, mode, sentiment, theme }
 *
 * @typedef {Object} EvaluationMeta
 * @property {number} [cost]
 * @property {number} [latencyMs]
 * @property {string} [model]
 * @property {string} [traceId]
 * @property {boolean} [degraded]
 *
 * @typedef {Object} ConditionsEvaluationResponse
 * @property {AuditMarker[]} applicableConditions
 * @property {ProcessedOutputs} processedOutputs
 * @property {EvaluationMeta} meta
 *
 * A withAxwise() result is a ConditionsEvaluationResponse plus a top-level
 * `degraded` boolean and optional `skipped` boolean.
 */

export {};
