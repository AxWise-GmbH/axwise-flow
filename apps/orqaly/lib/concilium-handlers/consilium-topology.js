/**
 * Consilium topology handler: the persisted, versioned, activity-logged diagram
 * behind the "Graph" view on the Consilium Boards tab.
 *
 * NOT a workflow: this lives in its own tables (consilium_topology*) and never
 * appears in the /workflow library.
 *
 * Ops (via ?path=consilium-topology&op=<op>):
 *   get             GET   load the user's diagram; seed it from the org hierarchy on first open
 *   save            POST  { nodes, edges, expectedVersion?, activities? } -> new version + activity
 *   reseed          POST  rebuild nodes/edges from the DB as a new version
 *   list-versions   GET   version metadata (newest first)
 *   get-version     GET   &version=<n> full snapshot
 *   restore-version POST  &version=<n> apply a snapshot as a new version
 *   list-activity   GET   per-action feed (newest first, capped)
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
import { buildSeededTopology } from './topology-seed.js';

const SCOPE = 'consilium';
const MAX_PAYLOAD_BYTES = 2 * 1024 * 1024; // ~2MB guard on nodes+edges
const ACTIVITY_LIMIT = 200;

// ── Fire-and-forget activity writers (never break the request) ──────────────
async function logActivity(admin, { diagramId, userId, action, payload }) {
  try {
    await admin.from('consilium_topology_activity').insert({
      diagram_id: diagramId,
      user_id: userId,
      action,
      payload: payload || {},
    });
  } catch {
    /* activity logging is best-effort */
  }
}

async function logActivities(admin, diagramId, userId, activities) {
  if (!Array.isArray(activities) || activities.length === 0) return;
  const rows = activities.slice(0, ACTIVITY_LIMIT).map((a) => ({
    diagram_id: diagramId,
    user_id: userId,
    action: typeof a?.action === 'string' ? a.action : 'edit',
    payload: a?.payload && typeof a.payload === 'object' ? a.payload : {},
  }));
  try {
    await admin.from('consilium_topology_activity').insert(rows);
  } catch {
    /* best-effort */
  }
}

// ── Assemble the seed graph from the user's existing rows ───────────────────
async function assembleSeed(admin, userId) {
  const [orgsR, boardsR, orgTeamsR, teamsR, teamMembersR, membersR] = await Promise.all([
    admin
      .from('organizations')
      .select('id, name, org_type, consilium_id, is_active')
      .eq('user_id', userId),
    admin.from('concilium').select('id, name, status, llms').eq('user_id', userId),
    admin.from('org_teams').select('org_id, team_id').eq('user_id', userId),
    admin.from('concilium_teams').select('id, name, is_active').eq('user_id', userId),
    admin.from('concilium_team_members').select('team_id, member_id').eq('user_id', userId),
    admin
      .from('concilium_members')
      .select('id, name, role, active, quarantined, concilium_id')
      .eq('user_id', userId),
  ]);

  const orgTeamMap = {};
  for (const r of orgTeamsR.data || []) {
    if (!orgTeamMap[r.org_id]) orgTeamMap[r.org_id] = [];
    orgTeamMap[r.org_id].push(r.team_id);
  }
  const teamMembersMap = {};
  for (const r of teamMembersR.data || []) {
    if (!teamMembersMap[r.team_id]) teamMembersMap[r.team_id] = [];
    teamMembersMap[r.team_id].push(r.member_id);
  }

  return buildSeededTopology({
    orgs: orgsR.data || [],
    boards: boardsR.data || [],
    orgTeamMap,
    teams: teamsR.data || [],
    teamMembersMap,
    members: membersR.data || [],
  });
}

async function loadUserDiagram(admin, userId, id) {
  let q = admin.from('consilium_topology').select('*').eq('user_id', userId);
  q = id ? q.eq('id', id) : q.eq('scope', SCOPE);
  const { data } = await q.maybeSingle();
  return data || null;
}

// ── Version bump + snapshot + compare-and-swap + activity ────────────────────
async function persistDiagram(
  admin,
  { diagram, userId, nodes, edges, action, payload, activities }
) {
  const prevVersion = diagram.current_version || 0;
  const newVersion = prevVersion + 1;

  const { error: snapErr } = await admin.from('consilium_topology_versions').insert({
    diagram_id: diagram.id,
    user_id: userId,
    version: newVersion,
    nodes,
    edges,
    label: payload?.label || action,
  });
  if (snapErr) return { conflict: true }; // UNIQUE(diagram_id, version) => concurrent save

  const { data: updated, error: updErr } = await admin
    .from('consilium_topology')
    .update({
      nodes,
      edges,
      current_version: newVersion,
      updated_at: new Date().toISOString(),
    })
    .eq('id', diagram.id)
    .eq('user_id', userId)
    .eq('current_version', prevVersion) // compare-and-swap
    .select('*')
    .maybeSingle();
  if (updErr) return { error: updErr };
  if (!updated) {
    // Lost the CAS race; drop the orphaned snapshot best-effort.
    try {
      await admin
        .from('consilium_topology_versions')
        .delete()
        .eq('diagram_id', diagram.id)
        .eq('version', newVersion);
    } catch {
      /* ignore */
    }
    return { conflict: true };
  }

  await logActivity(admin, {
    diagramId: diagram.id,
    userId,
    action,
    payload: { ...(payload || {}), version: newVersion },
  });
  await logActivities(admin, diagram.id, userId, activities);

  return { diagram: updated, version: newVersion };
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
    const rl = checkRateLimit({ key: rlKey, limit: 60, windowMs: 60_000 });
    applyRateLimitHeaders(res, rl);
    if (!rl.allowed) return jsonError(res, 429, 'Too many requests');

    const admin = buildSupabaseAdminClient();
    if (!admin) return jsonError(res, 503, 'Database not configured');

    const op = String(req.query?.op || '').toLowerCase();
    const method = req.method;

    // ── get (load-or-seed) ──────────────────────────────────────────────
    if (op === 'get' || (!op && method === 'GET')) {
      let diagram = await loadUserDiagram(admin, user.id, null);
      if (!diagram) {
        const { nodes, edges } = await assembleSeed(admin, user.id);
        const { data: created, error: insErr } = await admin
          .from('consilium_topology')
          .insert({
            user_id: user.id,
            scope: SCOPE,
            name: 'Consilium topology',
            nodes,
            edges,
            current_version: 0,
          })
          .select('*')
          .maybeSingle();
        if (insErr || !created) {
          // UNIQUE(user_id, scope) race: another tab seeded first -> re-select.
          diagram = await loadUserDiagram(admin, user.id, null);
          if (!diagram) return handleApiError(res, insErr, 'consilium-topology:seed');
        } else {
          diagram = created;
          await logActivity(admin, {
            diagramId: diagram.id,
            userId: user.id,
            action: 'seed',
            payload: { nodeCount: nodes.length },
          });
        }
      }
      return res.status(200).json({ diagram });
    }

    // ── save ────────────────────────────────────────────────────────────
    if (op === 'save' && method === 'POST') {
      const body = typeof req.body === 'object' && req.body ? req.body : {};
      const { nodes, edges, expectedVersion, activities } = body;
      if (!Array.isArray(nodes) || !Array.isArray(edges)) {
        return jsonError(res, 400, 'nodes and edges arrays are required');
      }
      if (Buffer.byteLength(JSON.stringify({ nodes, edges })) > MAX_PAYLOAD_BYTES) {
        return jsonError(res, 413, 'Diagram too large');
      }
      const diagram = await loadUserDiagram(admin, user.id, req.query?.id);
      if (!diagram) return jsonError(res, 404, 'Diagram not found');
      if (expectedVersion != null && Number(expectedVersion) !== diagram.current_version) {
        return jsonError(res, 409, 'Version conflict');
      }
      const result = await persistDiagram(admin, {
        diagram,
        userId: user.id,
        nodes,
        edges,
        action: 'save',
        payload: {},
        activities,
      });
      if (result.conflict) return jsonError(res, 409, 'Version conflict');
      if (result.error) return handleApiError(res, result.error, 'consilium-topology:save');
      return res.status(200).json({ diagram: result.diagram, version: result.version });
    }

    // ── reseed (rebuild from DB) ─────────────────────────────────────────
    if (op === 'reseed' && method === 'POST') {
      const diagram = await loadUserDiagram(admin, user.id, req.query?.id);
      if (!diagram) return jsonError(res, 404, 'Diagram not found');
      const { nodes, edges } = await assembleSeed(admin, user.id);
      const result = await persistDiagram(admin, {
        diagram,
        userId: user.id,
        nodes,
        edges,
        action: 'reseed',
        payload: { nodeCount: nodes.length },
      });
      if (result.conflict) return jsonError(res, 409, 'Version conflict');
      if (result.error) return handleApiError(res, result.error, 'consilium-topology:reseed');
      return res.status(200).json({ diagram: result.diagram, version: result.version });
    }

    // ── list-versions ────────────────────────────────────────────────────
    if (op === 'list-versions' && method === 'GET') {
      const diagram = await loadUserDiagram(admin, user.id, req.query?.id);
      if (!diagram) return jsonError(res, 404, 'Diagram not found');
      const { data, error } = await admin
        .from('consilium_topology_versions')
        .select('id, version, label, created_at')
        .eq('diagram_id', diagram.id)
        .eq('user_id', user.id)
        .order('version', { ascending: false });
      if (error) return handleApiError(res, error, 'consilium-topology:list-versions');
      return res.status(200).json({ versions: data || [] });
    }

    // ── get-version ──────────────────────────────────────────────────────
    if (op === 'get-version' && method === 'GET') {
      const version = Number(req.query?.version);
      const diagram = await loadUserDiagram(admin, user.id, req.query?.id);
      if (!diagram) return jsonError(res, 404, 'Diagram not found');
      const { data, error } = await admin
        .from('consilium_topology_versions')
        .select('*')
        .eq('diagram_id', diagram.id)
        .eq('user_id', user.id)
        .eq('version', version)
        .maybeSingle();
      if (error) return handleApiError(res, error, 'consilium-topology:get-version');
      if (!data) return jsonError(res, 404, 'Version not found');
      return res.status(200).json({ version: data });
    }

    // ── restore-version ──────────────────────────────────────────────────
    if (op === 'restore-version' && method === 'POST') {
      const version = Number(req.query?.version ?? req.body?.version);
      const diagram = await loadUserDiagram(admin, user.id, req.query?.id);
      if (!diagram) return jsonError(res, 404, 'Diagram not found');
      const { data: snap, error } = await admin
        .from('consilium_topology_versions')
        .select('nodes, edges')
        .eq('diagram_id', diagram.id)
        .eq('user_id', user.id)
        .eq('version', version)
        .maybeSingle();
      if (error) return handleApiError(res, error, 'consilium-topology:restore');
      if (!snap) return jsonError(res, 404, 'Version not found');
      const result = await persistDiagram(admin, {
        diagram,
        userId: user.id,
        nodes: snap.nodes,
        edges: snap.edges,
        action: 'restore',
        payload: { restoredFrom: version },
      });
      if (result.conflict) return jsonError(res, 409, 'Version conflict');
      if (result.error) return handleApiError(res, result.error, 'consilium-topology:restore');
      return res.status(200).json({ diagram: result.diagram, version: result.version });
    }

    // ── list-activity ────────────────────────────────────────────────────
    if (op === 'list-activity' && method === 'GET') {
      const diagram = await loadUserDiagram(admin, user.id, req.query?.id);
      if (!diagram) return jsonError(res, 404, 'Diagram not found');
      const limit = Math.min(Number(req.query?.limit) || 100, ACTIVITY_LIMIT);
      const { data, error } = await admin
        .from('consilium_topology_activity')
        .select('*')
        .eq('diagram_id', diagram.id)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) return handleApiError(res, error, 'consilium-topology:list-activity');
      return res.status(200).json({ activity: data || [] });
    }

    return jsonError(res, 400, 'Unknown op');
  } catch (err) {
    return handleApiError(res, err, 'consilium-topology');
  }
}
