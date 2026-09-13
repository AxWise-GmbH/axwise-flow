/**
 * [module: connection-hub]
 * Communicator v2 API dispatcher.
 * Routes via ?path= query param (same pattern as api/concilium.js).
 */
import { jsonError } from './_lib/errors.js';
import { applySecurityHeaders } from './_lib/security-headers.js';
import { stripRouteKey } from './_lib/route-key.js';
import { enforceDemoWriteGuard } from './_lib/demo-guard.js';
import { createLogger } from './_lib/logger.js';

const log = createLogger('communicator');

import agentRoom         from '../lib/communicator-handlers/agent-room.js';
import controller        from '../lib/communicator-handlers/controller.js';
import consiliumLog      from '../lib/communicator-handlers/consilium-log.js';
import webhookReceiver   from '../lib/communicator-handlers/webhook-receiver.js';
import activityFeed      from '../lib/communicator-handlers/activity-feed.js';
import linkCode          from '../lib/communicator-handlers/link-code.js';
import telegramRegister  from '../lib/communicator-handlers/telegram-register.js';
import orgCommunication  from '../lib/communicator-handlers/org-communication.js';

const HANDLERS = {
  'agent-room':        agentRoom,
  controller,
  'consilium-log':     consiliumLog,
  'webhook-receiver':  webhookReceiver,
  'activity-feed':     activityFeed,
  'org-communication': orgCommunication,
  'link-code':         linkCode,
  'telegram-register': telegramRegister,
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
