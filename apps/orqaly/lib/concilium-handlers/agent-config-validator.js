/**
 * Agent config validator: pre-instantiation security checks + runtime scope enforcement.
 *
 * validateAgentConfig() — called by Agent Factory before spawning an agent.
 * enforceAgentToolScope() — called at runtime on every domain tool call.
 */
import { createLogger } from '../../api/_lib/logger.js';
import { defaultProvider } from '../_shared/llm-defaults.js';

const log = createLogger('agent-config-validator');

// Patterns that should never appear in agent system prompts
const DANGEROUS_PROMPT_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|prompts|rules)/i,
  /you\s+are\s+now\s+(DAN|evil|unrestricted|jailbroken)/i,
  /bypass\s+(your\s+)?(safety|content|moderation)\s+(filters?|rules?|guidelines?)/i,
  /disregard\s+(your\s+)?(system|safety|content)\s+(prompt|instructions|rules)/i,
  /\bDAN\s+mode\b/i,
  /override\s+system\s+prompt/i,
  /\b(BEGIN|START)\s+INJECTION\b/i,
  /delete\s+(all|every|the\s+entire)\s+(database|table|user|record)/i,
  /drop\s+table/i,
  /rm\s+-rf/i,
  /sudo\s+/i,
  /eval\s*\(/i,
  /exec\s*\(/i,
];

// Escalation patterns — agent should not try to promote its own privileges
const ESCALATION_PATTERNS = [
  /grant\s+(me|yourself)\s+(admin|superuser|root|elevated)/i,
  /change\s+(my|your)\s+(role|permissions|access)\s+to\s+(admin|superuser)/i,
  /escalat(e|ion)\s+(privileg|permission|access)/i,
  /modify\s+(your\s+own|my)\s+constraints/i,
];

// Valid providers and their models
const VALID_PROVIDERS = {
  groq: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'gemma2-9b-it'],
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
  anthropic: ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5'],
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
  glm: ['glm-4.6', 'glm-5.1', 'glm-4-plus', 'glm-4', 'glm-4-flash'],
  gemini: [
    'gemini-3.8-flash',
    'gemini-3.7-flash',
    'gemini-3.6-flash',
    'gemini-3.5-flash',
    'gemini-3.1-pro-preview',
    'gemini-3.1-flash-lite',
    'gemini-3.1-flash-lite-preview',
    'gemini-3-pro-preview',
    'gemini-3-flash-preview',
    'gemini-pro-latest',
    'gemini-flash-latest',
    'gemini-flash-lite-latest',
    'gemini-2.5-pro',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
  ],
};

const MAX_COST_CEILING_USD = 50; // No single agent can have > $50/day budget

/**
 * Pure security screen of a system prompt (no DB, no async). Runs the same
 * dangerous + escalation pattern sets validateAgentConfig uses, returning a
 * scopeDecision-shaped verdict ('allowed' | 'denied'). Exported so callers that
 * need a cheap local security verdict for comparison (e.g. the agent factory
 * capturing local-vs-AxWise divergence) can get it without the full DB-backed
 * validateAgentConfig. Does not alter validateAgentConfig's own behavior.
 *
 * @param {string} systemPrompt
 * @returns {{ decision: 'allowed' | 'denied', reason: string | null }}
 */
export function screenSystemPrompt(systemPrompt) {
  const text = typeof systemPrompt === 'string' ? systemPrompt : '';
  for (const pattern of DANGEROUS_PROMPT_PATTERNS) {
    if (pattern.test(text))
      return { decision: 'denied', reason: `dangerous:${pattern.source.slice(0, 40)}` };
  }
  for (const pattern of ESCALATION_PATTERNS) {
    if (pattern.test(text)) return { decision: 'denied', reason: 'escalation' };
  }
  return { decision: 'allowed', reason: null };
}

/**
 * Validate an agent configuration before it gets instantiated.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {object} config - Blueprint or inline config
 * @param {string} config.system_prompt
 * @param {string} config.provider
 * @param {string} config.model
 * @param {string[]} config.tools - Array of tool IDs
 * @param {object} config.constraints
 * @param {string} userId - Owner user ID
 * @returns {Promise<{ valid: boolean, errors: string[], warnings: string[] }>}
 */
export async function validateAgentConfig(admin, config, userId) {
  const errors = [];
  const warnings = [];

  // 1. System prompt validation
  if (!config.system_prompt || config.system_prompt.trim().length < 10) {
    errors.push('System prompt is required (minimum 10 characters)');
  } else {
    for (const pattern of DANGEROUS_PROMPT_PATTERNS) {
      if (pattern.test(config.system_prompt)) {
        errors.push(`System prompt contains dangerous pattern: ${pattern.source.slice(0, 40)}`);
        break;
      }
    }
    for (const pattern of ESCALATION_PATTERNS) {
      if (pattern.test(config.system_prompt)) {
        errors.push(`System prompt contains privilege escalation pattern`);
        break;
      }
    }
    if (config.system_prompt.length > 10000) {
      warnings.push('System prompt is very long (>10K chars) — may increase costs');
    }
  }

  // 2. Provider + model validation
  const provider = config.provider || defaultProvider();
  const validModels = VALID_PROVIDERS[provider];
  if (!validModels) {
    errors.push(`Invalid provider: ${provider}. Valid: ${Object.keys(VALID_PROVIDERS).join(', ')}`);
  } else if (config.model && !validModels.includes(config.model)) {
    warnings.push(`Model "${config.model}" not in known list for ${provider}. It may still work.`);
  }

  // 3. Tools against whitelist
  if (config.tools && Array.isArray(config.tools) && config.tools.length > 0) {
    const { data: whitelist } = await admin
      .from('agent_tool_whitelist')
      .select('tool_id, risk_level, requires_approval')
      .eq('user_id', userId)
      .eq('is_active', true);

    const whitelistedIds = new Set((whitelist || []).map((t) => t.tool_id));
    const highRiskTools = [];
    const needsApproval = [];

    for (const toolId of config.tools) {
      if (!whitelistedIds.has(toolId)) {
        errors.push(`Tool "${toolId}" is not in your whitelist`);
      } else {
        const entry = (whitelist || []).find((t) => t.tool_id === toolId);
        if (entry?.risk_level === 'high') highRiskTools.push(toolId);
        if (entry?.requires_approval) needsApproval.push(toolId);
      }
    }

    if (highRiskTools.length > 0) {
      warnings.push(`High-risk tools: ${highRiskTools.join(', ')} — requires manual approval`);
    }
    if (needsApproval.length > 0) {
      warnings.push(`Tools requiring approval: ${needsApproval.join(', ')}`);
    }
  }

  // 4. Cost constraints
  const maxCost = Number(config.constraints?.max_cost_per_day_usd || 5);
  if (maxCost > MAX_COST_CEILING_USD) {
    errors.push(`Daily cost limit $${maxCost} exceeds ceiling of $${MAX_COST_CEILING_USD}`);
  }
  if (maxCost <= 0) {
    errors.push('Daily cost limit must be positive');
  }

  // 5. Temperature bounds
  const temp = Number(config.temperature ?? 0.3);
  if (temp < 0 || temp > 2) {
    errors.push('Temperature must be between 0 and 2');
  }

  // 6. Max tokens bounds
  const maxTokens = Number(config.max_tokens ?? 3000);
  if (maxTokens < 100 || maxTokens > 128000) {
    errors.push('Max tokens must be between 100 and 128000');
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Check whether an agent is allowed to call a specific tool at runtime.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {string} agentId - The agent's ID
 * @param {string} toolId - The tool being called
 * @returns {Promise<{ allowed: boolean, reason?: string }>}
 */
export async function enforceAgentToolScope(admin, agentId, toolId) {
  // Load agent's blueprint
  const { data: agent, error: agentErr } = await admin
    .from('concilium_agents')
    .select('id, name, status, user_id')
    .eq('id', agentId)
    .maybeSingle();

  if (agentErr || !agent) {
    return { allowed: false, reason: 'Agent not found' };
  }

  // Agent must be active
  if (agent.status !== 'active' && agent.status !== 'accepted') {
    return { allowed: false, reason: `Agent status is "${agent.status}" — must be active` };
  }

  // Find the agent's blueprint
  const { data: blueprint } = await admin
    .from('agent_blueprints')
    .select('tools')
    .eq('user_id', agent.user_id)
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // If no blueprint exists, check tool whitelist directly
  if (!blueprint) {
    const { data: whitelistEntry } = await admin
      .from('agent_tool_whitelist')
      .select('tool_id')
      .eq('user_id', agent.user_id)
      .eq('tool_id', toolId)
      .eq('is_active', true)
      .maybeSingle();

    if (!whitelistEntry) {
      return { allowed: false, reason: `Tool "${toolId}" not in whitelist` };
    }
    return { allowed: true };
  }

  // Check if tool is in blueprint's tools array
  const allowedTools = Array.isArray(blueprint.tools) ? blueprint.tools : [];
  if (allowedTools.length === 0) {
    // No tools defined = allow all whitelisted tools
    return { allowed: true };
  }

  if (!allowedTools.includes(toolId)) {
    return {
      allowed: false,
      reason: `Tool "${toolId}" not in agent's blueprint (allowed: ${allowedTools.join(', ')})`,
    };
  }

  return { allowed: true };
}

/**
 * Resolve agent identity from a tracking token.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {string} trackingToken - The cagt_ prefixed token
 * @returns {Promise<{ agent: object|null }>}
 */
export async function resolveAgentFromToken(admin, trackingToken) {
  if (!trackingToken || !trackingToken.startsWith('cagt_')) {
    return { agent: null };
  }

  const { data: agent } = await admin
    .from('concilium_agents')
    .select('*')
    .eq('tracking_token', trackingToken)
    .maybeSingle();

  return { agent: agent || null };
}
