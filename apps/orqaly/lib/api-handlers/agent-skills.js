/**
 * Agent Skills handler — list, install, manage, and seed skill packs.
 * Routes: list, get, install, uninstall, update-custom, toggle, installed,
 *         seed, create, active-for-agent
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { handleApiError, jsonError } from '../../api/_lib/errors.js';
import { checkRateLimit, getRateLimitIdentifier, applyRateLimitHeaders } from '../../api/_lib/rate-limit.js';
import { createLogger } from '../../api/_lib/logger.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { validateSkill, validateSkillContent, buildScanReport } from '../agent-handlers/skill-validation.js';

const log = createLogger('agent-skills');

/* ── List all visible skills ─────────────────────────────────────────────── */
// Progressive fallback: try the richest SELECT first, drop columns as we hit
// undefined_column errors (Postgres code 42703). Keeps the page loading
// during the schema-lag window between a code deploy and the matching
// migration being applied.
const LIST_COLUMNS_MINIMAL = 'id, slug, name, description, category, tags, author, version, compatible_roles, icon, is_bundled, is_public, install_count, rating_avg, created_at';
const LIST_COLUMNS_WITH_COUNT = `${LIST_COLUMNS_MINIMAL}, rating_count`;
const LIST_COLUMNS_FULL = `${LIST_COLUMNS_WITH_COUNT}, scan_report`;

function isUndefinedColumn(err) {
  if (!err) return false;
  return err.code === '42703' || /column .* does not exist/i.test(err.message || '');
}

async function handleList(admin, user, query) {
  const applyFilters = (sel) => {
    let q = admin
      .from('agent_skill_packs')
      .select(sel)
      .or(`is_bundled.eq.true,is_public.eq.true,user_id.eq.${user.id}`)
      .order('install_count', { ascending: false })
      .limit(100);
    if (query?.category) q = q.eq('category', query.category);
    if (query?.search) q = q.ilike('name', `%${query.search}%`);
    return q;
  };

  const attempts = [
    { sel: LIST_COLUMNS_FULL,        hasScan: true,  hasCount: true },
    { sel: LIST_COLUMNS_WITH_COUNT,  hasScan: false, hasCount: true },
    { sel: LIST_COLUMNS_MINIMAL,     hasScan: false, hasCount: false },
  ];

  let chosen = null;
  let rows = [];
  for (const attempt of attempts) {
    const res = await applyFilters(attempt.sel);
    if (!res.error) { chosen = attempt; rows = res.data || []; break; }
    if (!isUndefinedColumn(res.error)) throw res.error;
    log.warn('list-column-missing-falling-back', { message: res.error.message });
  }
  if (!chosen) throw new Error('agent_skill_packs list failed across all column fallbacks');

  const trimmed = rows.map((row) => ({
    ...row,
    rating_count: chosen.hasCount ? (row.rating_count ?? 0) : 0,
    scan_report: chosen.hasScan && row.scan_report
      ? { passed: row.scan_report.passed === true }
      : null,
  }));
  return { status: 200, data: trimmed };
}

/* ── Get single skill ────────────────────────────────────────────────────── */
async function handleGet(admin, user, query) {
  const { id } = query;
  if (!id) return { status: 400, error: 'id is required' };

  const { data, error } = await admin
    .from('agent_skill_packs')
    .select('*')
    .eq('id', id)
    .or(`is_bundled.eq.true,is_public.eq.true,user_id.eq.${user.id}`)
    .maybeSingle();

  if (error) throw error;
  if (!data) return { status: 404, error: 'Skill not found' };
  return { status: 200, data };
}

/* ── Install skill for an agent (upsert) ─────────────────────────────────── */
async function handleInstall(admin, user, body) {
  const { agent_id, skill_id } = body;
  if (!agent_id || !skill_id) return { status: 400, error: 'agent_id and skill_id are required' };

  const { data, error } = await admin
    .from('agent_installed_skills')
    .upsert(
      { user_id: user.id, agent_id, skill_id, is_active: true, installed_at: new Date().toISOString() },
      { onConflict: 'user_id,agent_id,skill_id' }
    )
    .select('id')
    .single();

  if (error) throw error;

  // Bump install_count
  await admin.rpc('increment_field', undefined).catch(() => null); // fallback below
  const { data: skill } = await admin.from('agent_skill_packs').select('install_count').eq('id', skill_id).single();
  if (skill) {
    await admin.from('agent_skill_packs').update({
      install_count: (skill.install_count || 0) + 1,
      updated_at: new Date().toISOString(),
    }).eq('id', skill_id);
  }

  return { status: 201, data: { id: data.id, installed: true } };
}

/* ── Uninstall skill ─────────────────────────────────────────────────────── */
async function handleUninstall(admin, user, body) {
  const { agent_id, skill_id } = body;
  if (!agent_id || !skill_id) return { status: 400, error: 'agent_id and skill_id are required' };

  const { error } = await admin
    .from('agent_installed_skills')
    .delete()
    .eq('user_id', user.id)
    .eq('agent_id', agent_id)
    .eq('skill_id', skill_id);

  if (error) throw error;
  return { status: 200, data: { uninstalled: true } };
}

/* ── Update custom content ───────────────────────────────────────────────── */
async function handleUpdateCustom(admin, user, body) {
  const { skill_id, agent_id, custom_content } = body;
  if (!skill_id || !agent_id) return { status: 400, error: 'skill_id and agent_id are required' };

  if (custom_content != null && custom_content !== '') {
    const v = validateSkillContent(custom_content);
    if (!v.ok) return { status: 400, error: `Skill content rejected: ${v.reason}`, rule: v.rule, excerpt: v.excerpt };
  }

  const { error } = await admin
    .from('agent_installed_skills')
    .update({ custom_content })
    .eq('user_id', user.id)
    .eq('agent_id', agent_id)
    .eq('skill_id', skill_id);

  if (error) throw error;
  return { status: 200, data: { updated: true } };
}

/* ── Toggle skill active/inactive ────────────────────────────────────────── */
async function handleToggle(admin, user, body) {
  const { skill_id, agent_id, is_active } = body;
  if (!skill_id || !agent_id) return { status: 400, error: 'skill_id and agent_id are required' };

  const { error } = await admin
    .from('agent_installed_skills')
    .update({ is_active: !!is_active })
    .eq('user_id', user.id)
    .eq('agent_id', agent_id)
    .eq('skill_id', skill_id);

  if (error) throw error;
  return { status: 200, data: { toggled: true } };
}

/* ── List installed skills for an agent (with pack details) ──────────────── */
async function handleInstalled(admin, user, query) {
  const { agent_id } = query;
  if (!agent_id) return { status: 400, error: 'agent_id is required' };

  const { data, error } = await admin
    .from('agent_installed_skills')
    .select('id, skill_id, custom_content, is_active, installed_at, agent_skill_packs(id, slug, name, description, category, tags, icon, content, author, version)')
    .eq('user_id', user.id)
    .eq('agent_id', agent_id);

  if (error) throw error;
  return { status: 200, data: data || [] };
}

/* ── Seed bundled skills (idempotent) ────────────────────────────────────── */
async function handleSeed(admin, _user, body) {
  const { skills } = body;
  if (!Array.isArray(skills) || skills.length === 0) return { status: 400, error: 'skills array is required' };

  let inserted = 0;
  const rejected = [];
  for (const skill of skills) {
    const v = validateSkill({ name: skill.name, description: skill.description, content: skill.content });
    if (!v.ok) {
      rejected.push({ slug: skill.slug, reason: v.reason, rule: v.rule });
      log.warn('seed-reject', { slug: skill.slug, rule: v.rule });
      continue;
    }

    // Check if already exists (bundled = user_id IS NULL)
    const { data: existing } = await admin
      .from('agent_skill_packs')
      .select('id')
      .eq('slug', skill.slug)
      .is('user_id', null)
      .maybeSingle();

    if (existing) continue;

    const { error } = await admin.from('agent_skill_packs').insert({
      slug: skill.slug,
      name: skill.name,
      description: skill.description,
      category: skill.category,
      tags: skill.tags || [],
      author: skill.author || 'Orqaly',
      version: skill.version || '1.0',
      compatible_roles: skill.compatible_roles || ['all'],
      content: skill.content,
      icon: skill.icon || 'extension',
      is_bundled: true,
      is_public: true,
      user_id: null,
      scan_report: buildScanReport(skill.content),
    });
    if (error) { log.warn('seed-skip', { slug: skill.slug, error: error.message }); continue; }
    inserted++;
  }

  return { status: 200, data: { seeded: inserted, total: skills.length, rejected } };
}

/* ── Create user skill ───────────────────────────────────────────────────── */
async function handleCreate(admin, user, body) {
  const { name, description, category, tags, content, icon } = body;
  if (!name || !content) return { status: 400, error: 'name and content are required' };

  const v = validateSkill({ name, description, content });
  if (!v.ok) return { status: 400, error: `Skill rejected: ${v.reason}`, rule: v.rule, excerpt: v.excerpt };

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const scan_report = buildScanReport(content);

  const { data, error } = await admin
    .from('agent_skill_packs')
    .insert({
      user_id: user.id,
      slug,
      name,
      description: description || '',
      category: category || 'ops',
      tags: tags || [],
      author: user.email || 'User',
      content,
      icon: icon || 'extension',
      is_bundled: false,
      is_public: true,
      scan_report,
    })
    .select('id, slug, name')
    .single();

  if (error) throw error;
  return { status: 201, data };
}

/* ── Approve a forge-generated pending_review skill ──────────────────────── */
async function handleApproveForge(admin, user, body) {
  const { skill_id, approve } = body;
  if (!skill_id) return { status: 400, error: 'skill_id is required' };

  const newStatus = approve === false ? 'rejected' : 'active';

  const { data, error } = await admin
    .from('agent_skill_packs')
    .update({ status: newStatus })
    .eq('id', skill_id)
    .eq('user_id', user.id)
    .eq('generation_source', 'forge')
    .eq('status', 'pending_review')
    .select('id, status, name')
    .single();

  if (error) throw error;
  if (!data) return { status: 404, error: 'Pending forge skill not found' };
  return { status: 200, data };
}

/* ── List forge skills pending review ────────────────────────────────────── */
async function handlePendingForge(admin, user) {
  const { data, error } = await admin
    .from('agent_skill_packs')
    .select('id, slug, name, description, category, content, forge_test_report, created_at')
    .eq('user_id', user.id)
    .eq('generation_source', 'forge')
    .eq('status', 'pending_review')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return { status: 200, data: data || [] };
}

/* ── List this user's agents that have a given skill installed ───────────── */
async function handleAgentsUsingSkill(admin, user, query) {
  const { skill_id } = query;
  if (!skill_id) return { status: 400, error: 'skill_id is required' };

  const { data: installs, error } = await admin
    .from('agent_installed_skills')
    .select('agent_id, is_active, installed_at')
    .eq('user_id', user.id)
    .eq('skill_id', skill_id);
  if (error) throw error;

  if (!installs?.length) return { status: 200, data: [] };

  const agentIds = [...new Set(installs.map((r) => r.agent_id))];
  const { data: agents } = await admin
    .from('agents')
    .select('id, name, metadata')
    .in('id', agentIds);

  const nameById = new Map((agents || []).map((a) => [a.id, a.metadata?.friendly_name || a.name]));
  const result = installs.map((r) => ({
    agent_id: r.agent_id,
    display_name: nameById.get(r.agent_id) || 'Unknown agent',
    is_active: r.is_active,
    installed_at: r.installed_at,
  }));

  return { status: 200, data: result };
}

/* ── Active skill contents for runtime injection ─────────────────────────── */
async function handleActiveForAgent(admin, user, query) {
  const { agent_id } = query;
  if (!agent_id) return { status: 400, error: 'agent_id is required' };

  const { data, error } = await admin
    .from('agent_installed_skills')
    .select('skill_id, custom_content, agent_skill_packs(slug, name, content)')
    .eq('user_id', user.id)
    .eq('agent_id', agent_id)
    .eq('is_active', true);

  if (error) throw error;

  const skills = (data || []).map((row) => ({
    skill_id: row.skill_id,
    slug: row.agent_skill_packs?.slug,
    name: row.agent_skill_packs?.name,
    content: row.custom_content || row.agent_skill_packs?.content || '',
  }));

  return { status: 200, data: skills };
}

/* ── Main handler ────────────────────────────────────────────────────────── */
export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const token = getBearerToken(req);
  const user = await verifySupabaseToken(token);
  if (!user) return jsonError(res, 401, 'Unauthorized');

  const rl = checkRateLimit({ key: getRateLimitIdentifier(req, user), limit: 60, windowMs: 60_000 });
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) return jsonError(res, 429, 'Rate limit exceeded');

  const admin = buildSupabaseAdminClient();
  const op = req.query?.op;
  const body = req.body || {};

  try {
    let result;
    switch (op) {
      case 'list':
        result = await handleList(admin, user, req.query);
        break;
      case 'get':
        result = await handleGet(admin, user, req.query);
        break;
      case 'install':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handleInstall(admin, user, body);
        break;
      case 'uninstall':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handleUninstall(admin, user, body);
        break;
      case 'update-custom':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handleUpdateCustom(admin, user, body);
        break;
      case 'toggle':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handleToggle(admin, user, body);
        break;
      case 'installed':
        result = await handleInstalled(admin, user, req.query);
        break;
      case 'seed':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handleSeed(admin, user, body);
        break;
      case 'create':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handleCreate(admin, user, body);
        break;
      case 'active-for-agent':
        result = await handleActiveForAgent(admin, user, req.query);
        break;
      case 'approve-forge':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handleApproveForge(admin, user, body);
        break;
      case 'pending-forge':
        result = await handlePendingForge(admin, user);
        break;
      case 'agents-using-skill':
        result = await handleAgentsUsingSkill(admin, user, req.query);
        break;
      default:
        return jsonError(res, 400, 'Invalid op');
    }
    if (result.error) return jsonError(res, result.status, result.error);
    return res.status(result.status).json(result.data);
  } catch (err) {
    return handleApiError(res, err, 'agent-skills');
  }
}
