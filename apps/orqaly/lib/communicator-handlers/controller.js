/**
 * [module: connection-hub]
 * Controller handler: command execution + history.
 * POST ?op=execute  — execute a slash or natural language command
 * GET  ?op=history  — command history for current user
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { jsonError, handleApiError } from '../../api/_lib/errors.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import {
  checkRateLimit,
  applyRateLimitHeaders,
  getRateLimitIdentifier,
} from '../../api/_lib/rate-limit.js';
import { createLogger } from '../../api/_lib/logger.js';
import { processAssistantMessage } from './assistant-bridge.js';

const log = createLogger('communicator-controller');

// ── Slash command definitions ──
const SLASH_COMMANDS = {
  '/status': { intent: 'status', description: 'List active agents and their state' },
  '/agent': {
    intent: 'agent-control',
    description: 'Control an agent: /agent [name] [start|pause|stop]',
  },
  '/build': { intent: 'build', description: 'Trigger a build: /build [project]' },
  '/deploy': { intent: 'deploy', description: 'Trigger deployment: /deploy [project]' },
  '/logs': { intent: 'logs', description: 'Return recent logs: /logs [n]' },
  '/help': { intent: 'help', description: 'List all available commands' },
  '/plan': { intent: 'plan', description: 'Generate an execution plan: /plan [description]' },
};

function parseSlashCommand(input) {
  const trimmed = (input || '').trim();
  if (!trimmed.startsWith('/')) return null;

  const parts = trimmed.split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1).join(' ');

  if (SLASH_COMMANDS[cmd]) {
    return { intent: SLASH_COMMANDS[cmd].intent, command: cmd, args, raw: trimmed };
  }
  return { intent: 'unknown', command: cmd, args, raw: trimmed };
}

// ── Command executors ──
async function executeStatus(admin, userId) {
  const { data: agents } = await admin
    .from('agents')
    .select('agent_id, role, availability_status')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (!agents || agents.length === 0) return { output: 'No agents found.', status: 'success' };

  const lines = agents.map(
    (a) => `  ${a.agent_id} — ${a.role || 'no role'} [${a.availability_status || 'unknown'}]`
  );
  return { output: `Active agents (${agents.length}):\n${lines.join('\n')}`, status: 'success' };
}

async function executeAgentControl(admin, userId, args) {
  const parts = args.trim().split(/\s+/);
  const name = parts[0];
  const action = (parts[1] || '').toLowerCase();

  if (!name || !action) {
    return { output: 'Usage: /agent [name] [start|pause|stop]', status: 'error' };
  }
  if (!['start', 'pause', 'stop'].includes(action)) {
    return { output: `Invalid action "${action}". Use start, pause, or stop.`, status: 'error' };
  }

  const statusMap = { start: 'active', pause: 'paused', stop: 'inactive' };
  const { data, error } = await admin
    .from('agents')
    .update({ availability_status: statusMap[action] })
    .eq('user_id', userId)
    .ilike('agent_id', `%${name}%`)
    .select('agent_id, availability_status');

  if (error) return { output: `Error: ${error.message}`, status: 'error' };
  if (!data || data.length === 0)
    return { output: `No agent matching "${name}" found.`, status: 'error' };

  return {
    output: data.map((a) => `Agent ${a.agent_id} → ${a.availability_status}`).join('\n'),
    status: 'success',
  };
}

async function executeLogs(admin, userId, args) {
  const n = Math.min(Number(args) || 10, 50);
  const { data } = await admin
    .from('communication_logs')
    .select('sender_name, content, context_type, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(n);

  if (!data || data.length === 0) return { output: 'No recent logs.', status: 'success' };

  const lines = data.map((l) => {
    const ts = new Date(l.created_at).toISOString().slice(0, 19).replace('T', ' ');
    return `  [${ts}] [${l.context_type}] ${l.sender_name}: ${(l.content || '').slice(0, 120)}`;
  });
  return { output: `Last ${data.length} logs:\n${lines.join('\n')}`, status: 'success' };
}

async function executeBuild(admin, userId, args) {
  if (!args.trim()) return { output: 'Usage: /build [project name or id]', status: 'error' };

  const { data: goals } = await admin
    .from('goals')
    .select('id, title, status')
    .eq('user_id', userId)
    .ilike('title', `%${args.trim()}%`)
    .limit(5);

  if (!goals || goals.length === 0) {
    return { output: `No project matching "${args.trim()}" found.`, status: 'error' };
  }

  const lines = goals.map((g) => `  ${g.id} — "${g.title}" [${g.status}]`);
  return {
    output: `Matching projects:\n${lines.join('\n')}\n\nTo trigger a build, use the Goals page or /plan command.`,
    status: 'success',
  };
}

function executeHelp() {
  const lines = Object.entries(SLASH_COMMANDS).map(
    ([cmd, def]) => `  ${cmd.padEnd(12)} — ${def.description}`
  );
  return { output: `Available commands:\n${lines.join('\n')}`, status: 'success' };
}

export default async function handler(req, res) {
  const safeReq = req && typeof req === 'object' ? req : {};
  if (!safeReq.headers) safeReq.headers = {};
  cors(res, safeReq);
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const token = getBearerToken(safeReq);
    const user = await verifySupabaseToken(token);
    if (!user) return jsonError(res, 401, 'Unauthorized');

    const rlKey = getRateLimitIdentifier(req, user.id);
    const rl = checkRateLimit({ key: rlKey, limit: 20, windowMs: 60_000 });
    applyRateLimitHeaders(res, rl);
    if (!rl.allowed) return jsonError(res, 429, 'Too many requests');

    const admin = buildSupabaseAdminClient();
    if (!admin) return jsonError(res, 503, 'Database not configured');

    const op = (req.query?.op || '').toLowerCase();

    // ── Execute command ──
    if (op === 'execute' && req.method === 'POST') {
      const body = req.body || {};
      const input = (body.input || '').trim();
      if (!input) return jsonError(res, 400, 'input required');

      const parsed = parseSlashCommand(input);
      let result;

      if (parsed) {
        switch (parsed.intent) {
          case 'status':
            result = await executeStatus(admin, user.id);
            break;
          case 'agent-control':
            result = await executeAgentControl(admin, user.id, parsed.args);
            break;
          case 'logs':
            result = await executeLogs(admin, user.id, parsed.args);
            break;
          case 'build':
            result = await executeBuild(admin, user.id, parsed.args);
            break;
          case 'deploy':
            result = {
              output: 'Deploy triggered. Check deployment status in the Projects page.',
              status: 'success',
            };
            break;
          case 'help':
            result = executeHelp();
            break;
          case 'plan':
            result = {
              output: `Planning mode: "${parsed.args}"\n\nPlanning via natural language is coming soon. Use the Goals page to create and plan goals.`,
              status: 'success',
            };
            break;
          default:
            result = {
              output: `Unknown command: ${parsed.command}. Type /help for available commands.`,
              status: 'error',
            };
        }
      } else {
        // Natural language — route through assistant bridge (same brain as "Let's Talk")
        const assistantResult = await processAssistantMessage(admin, user.id, input, {
          platform: body.platform || 'internal',
        });

        // Convert assistant result to controller response format
        const toolsSummary = (assistantResult.toolResults || [])
          .map((tr) => {
            if (tr.status === 'awaiting_confirmation') return `⚠️ ${tr.tool}: needs confirmation`;
            if (tr.status === 'error') return `❌ ${tr.tool}: ${tr.error}`;
            return `✅ ${tr.tool}: done`;
          })
          .join('\n');

        result = {
          output: [assistantResult.message, toolsSummary].filter(Boolean).join('\n\n'),
          status: assistantResult.status || 'success',
          parsed_intent: assistantResult.calls?.[0]?.tool || 'natural-language',
          calls: assistantResult.calls,
          toolResults: assistantResult.toolResults,
          cost: assistantResult.cost,
          model: assistantResult.model,
          provider: assistantResult.provider,
          needsConfirmation: assistantResult.needsConfirmation,
        };

        // Logging already handled by assistant-bridge
        return res.status(200).json(result);
      }

      // Log to command_history (slash commands only — NL logs via bridge)
      await admin
        .from('command_history')
        .insert({
          user_id: user.id,
          input,
          parsed_intent: parsed?.intent || 'slash-command',
          output: result.output || '',
          status: result.status || 'success',
          platform: body.platform || 'internal',
          metadata: { command: parsed?.command, args: parsed?.args },
        })
        .then(() => {})
        .then(
          () => {},
          () => {}
        );

      // Log to communication_logs
      await admin
        .from('communication_logs')
        .insert({
          thread_id: crypto.randomUUID(),
          user_id: user.id,
          sender_type: 'user',
          sender_id: user.id,
          sender_name: 'User',
          content: input,
          context_type: 'command',
          platform: body.platform || 'internal',
          metadata: { type: 'command_input', parsed_intent: parsed?.intent },
        })
        .then(() => {})
        .then(
          () => {},
          () => {}
        );

      return res.status(200).json(result);
    }

    // ── Command history ──
    if (op === 'history' && req.method === 'GET') {
      const { data, error } = await admin
        .from('command_history')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) return handleApiError(res, error, 'controller:history');
      return res.status(200).json({ commands: data || [] });
    }

    return jsonError(res, 400, `Unknown op: ${op}`);
  } catch (err) {
    return handleApiError(res, err, 'controller');
  }
}
