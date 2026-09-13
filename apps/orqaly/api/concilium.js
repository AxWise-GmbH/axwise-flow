/**
 * Concilium v2 API dispatcher: boards, members, criteria, consensus rules,
 * agents, agent-reports, teams, analytics.
 * Routes via ?path= query param (same pattern as api/agent.js).
 */
import { jsonError } from './_lib/errors.js';
import { applySecurityHeaders } from './_lib/security-headers.js';
import { stripRouteKey } from './_lib/route-key.js';
import { enforceDemoWriteGuard } from './_lib/demo-guard.js';
import { createLogger } from './_lib/logger.js';

const log = createLogger('concilium');
import boards from '../lib/concilium-handlers/boards.js';
import members from '../lib/concilium-handlers/members.js';
import criteria from '../lib/concilium-handlers/criteria.js';
import consensusRules from '../lib/concilium-handlers/consensus-rules.js';
import agents from '../lib/concilium-handlers/agents.js';
import agentReports from '../lib/concilium-handlers/agent-reports.js';
import teams from '../lib/concilium-handlers/teams.js';
import analytics from '../lib/concilium-handlers/analytics.js';
import agentBlueprints from '../lib/concilium-handlers/agent-blueprints.js';
import agentToolWhitelist from '../lib/concilium-handlers/agent-tool-whitelist.js';
import domainTools from '../lib/concilium-handlers/domain-tools.js';
import agentFactory from '../lib/concilium-handlers/agent-factory.js';
import agentToolScout from '../lib/concilium-handlers/agent-tool-scout.js';
import supervisor from '../lib/concilium-handlers/consilium-supervisor.js';
import agentRollback from '../lib/concilium-handlers/agent-rollback.js';
import consiliumTopology from '../lib/concilium-handlers/consilium-topology.js';

const HANDLERS = {
  boards,
  members,
  criteria,
  'consensus-rules': consensusRules,
  agents,
  'agent-reports': agentReports,
  teams,
  analytics,
  'agent-blueprints': agentBlueprints,
  'agent-tool-whitelist': agentToolWhitelist,
  'domain-tools': domainTools,
  'agent-factory': agentFactory,
  'agent-tool-scout': agentToolScout,
  supervisor,
  'agent-rollback': agentRollback,
  'consilium-topology': consiliumTopology,
};

export default async function handler(req, res) {
  applySecurityHeaders(res);
  const path = (req.query?.path || '').trim().toLowerCase();
  stripRouteKey(req);
  const fn = HANDLERS[path];
  if (!fn) {
    log.warn(req, 'route.not_found', { path });
    return jsonError(res, 404, 'Not found');
  }
  if (await enforceDemoWriteGuard(req, res)) return;
  const done = log.startTimer(req, 'request', { method: req.method, path });
  try {
    const result = await fn(req, res);
    done({ status: res.statusCode });
    return result;
  } catch (err) {
    done({ status: 500, error: err?.message });
    return jsonError(res, 500, err?.message || 'Handler error');
  }
}
