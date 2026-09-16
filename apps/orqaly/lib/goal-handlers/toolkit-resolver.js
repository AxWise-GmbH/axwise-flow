/**
 * Toolkit Resolver — decides which tools an agent gets for a specific job.
 *
 * Runtime access is a least-privilege intersection:
 *   1. The task explicitly requires the tool.
 *   2. The agent is explicitly granted the tool through Agent Hub, an installed
 *      skill, or a connected MCP library.
 *   3. The tool is currently available for the user.
 *
 * A configured user tool is availability, not authorization. It must never be
 * injected into unrelated tasks or agents merely because the user configured it.
 */
import { normalizeToolIds } from '../_shared/tool-ids.js';

/**
 * @param {object}   args
 * @param {object}   args.agent             — { id, metadata?: { tools? } }
 * @param {object}   args.job               — { tool_requirements? }
 * @param {string[]} [args.skillTools]      — installed-skill grants
 * @param {string[]} [args.connectedTools]  — active per-agent MCP bindings
 * @param {string[]} [args.userTools]       — currently available tool ids
 * @returns {string[]} canonical task-scoped grants in requirement order
 */
export function resolveToolkit({
  agent,
  job,
  skillTools = [],
  connectedTools = [],
  userTools = [],
}) {
  const requirements = normalizeToolIds(job?.tool_requirements || []);
  if (!requirements.length) return [];

  const agentGrants = new Set(
    normalizeToolIds([
      ...(Array.isArray(agent?.metadata?.tools) ? agent.metadata.tools : []),
      ...skillTools,
      ...connectedTools,
    ])
  );
  const available = new Set(normalizeToolIds(userTools));
  return requirements.filter((toolId) => agentGrants.has(toolId) && available.has(toolId));
}
