/**
 * Contacts handler — CRUD + bulk import for CRM contacts.
 *
 * Routes (via query param `op`):
 *   POST ?op=add       — Add a contact
 *   POST ?op=update    — Update a contact by ID
 *   GET  ?op=list      — List contacts (filters: search_text)
 *   POST ?op=delete    — Delete a contact by ID
 *   POST ?op=import    — Bulk import contacts
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { handleApiError, jsonError } from '../../api/_lib/errors.js';
import { checkRateLimit, getRateLimitIdentifier, applyRateLimitHeaders } from '../../api/_lib/rate-limit.js';
import { createLogger } from '../../api/_lib/logger.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';

const log = createLogger('contacts');

const ALLOWED_ATTITUDES = new Set(['vip', 'friendly', 'neutral', 'cold_lead', 'hostile']);

async function handleAdd(admin, userId, body, req) {
  const { name, phone, email, attitude, comment, goal_id, organization_id, metadata, contact_type } = body;

  if (!name || !name.trim()) {
    return { status: 400, error: 'Name is required' };
  }

  const cleanAttitude = ALLOWED_ATTITUDES.has(attitude) ? attitude : 'neutral';

  const row = {
    user_id: userId,
    name: name.trim(),
    phone: (phone || '').trim(),
    email: (email || '').trim(),
    attitude: cleanAttitude,
    comment: comment || '',
    goal_id: goal_id || null,
    organization_id: organization_id || null,
    metadata: metadata || {},
    contact_type: contact_type === 'mail' ? 'mail' : 'phone',
  };

  const { data, error } = await admin
    .from('contacts')
    .insert(row)
    .select()
    .single();

  if (error) throw error;
  log.info(req, 'contact.added', { id: data.id });
  return { status: 200, data };
}

async function handleUpdate(admin, userId, body, req) {
  const { id, ...patch } = body;
  if (!id) return { status: 400, error: 'ID is required' };

  const allowed = ['name', 'phone', 'email', 'attitude', 'comment', 'goal_id', 'organization_id', 'metadata', 'contact_type'];
  const row = { updated_at: new Date().toISOString() };
  
  for (const key of allowed) {
    if (patch[key] !== undefined) {
      if (key === 'name') row[key] = String(patch[key] || '').trim();
      else if (key === 'attitude') row[key] = ALLOWED_ATTITUDES.has(patch[key]) ? patch[key] : 'neutral';
      else if (key === 'contact_type') row[key] = patch[key] === 'mail' ? 'mail' : 'phone';
      else row[key] = patch[key];
    }
  }

  if (row.name === '') {
    return { status: 400, error: 'Name cannot be empty' };
  }

  const { data, error } = await admin
    .from('contacts')
    .update(row)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) throw error;
  log.info(req, 'contact.updated', { id });
  return { status: 200, data };
}

async function handleList(admin, userId, query) {
  const searchText = query?.search_text || null;
  const contactType = query?.contact_type || null;
  const limit = Math.min(parseInt(query?.limit, 10) || 100, 500);

  let q = admin
    .from('contacts')
    .select('*')
    .eq('user_id', userId)
    .order('name', { ascending: true })
    .limit(limit);

  if (contactType) {
    q = q.eq('contact_type', contactType);
  }

  if (searchText) {
    // Simple text search logic
    q = q.or(`name.ilike.%${searchText}%,email.ilike.%${searchText}%,phone.ilike.%${searchText}%,comment.ilike.%${searchText}%`);
  }

  const { data, error } = await q;
  if (error) throw error;
  return { status: 200, data: data || [] };
}

async function handleDelete(admin, userId, body, req) {
  const { id } = body;
  if (!id) return { status: 400, error: 'ID is required' };

  const { error } = await admin
    .from('contacts')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) throw error;
  log.info(req, 'contact.deleted', { id });
  return { status: 200, data: { deleted: id } };
}

async function handleImport(admin, userId, body, req) {
  const { contacts } = body;
  if (!Array.isArray(contacts) || contacts.length === 0) {
    return { status: 400, error: 'Contacts list must be a non-empty array' };
  }

  const rows = [];
  for (const c of contacts) {
    if (!c.name || !c.name.trim()) continue;
    rows.push({
      user_id: userId,
      name: c.name.trim(),
      phone: String(c.phone || '').trim(),
      email: String(c.email || '').trim(),
      attitude: ALLOWED_ATTITUDES.has(c.attitude) ? c.attitude : 'neutral',
      comment: c.comment || '',
      goal_id: c.goal_id || null,
      organization_id: c.organization_id || null,
      metadata: c.metadata || {},
      contact_type: c.contact_type === 'mail' ? 'mail' : 'phone',
    });
  }

  if (rows.length === 0) {
    return { status: 400, error: 'No valid contacts to import (name is required)' };
  }

  const { data, error } = await admin
    .from('contacts')
    .insert(rows)
    .select();

  if (error) throw error;
  log.info(req, 'contacts.imported', { count: data.length });
  return { status: 200, data };
}

async function handleFindMatches(admin, userId, body, req) {
  const { data: contacts, error } = await admin
    .from('contacts')
    .select('*')
    .eq('user_id', userId);

  if (error) throw error;

  const phoneContacts = contacts.filter(c => c.contact_type === 'phone');
  const mailContacts = contacts.filter(c => c.contact_type === 'mail');

  const normalizePhone = (phone) => (phone || '').replace(/[^\d+]/g, '');
  const normalizeName = (name) => (name || '').trim().toLowerCase().replace(/\s+/g, ' ');

  const updates = [];

  const addMatch = (c1, c2, matchBy) => {
    if (!c1.metadata) c1.metadata = {};
    if (!c1.metadata.matches) c1.metadata.matches = [];
    if (!c1.metadata.matches.some(m => m.id === c2.id)) {
      c1.metadata.matches.push({
        id: c2.id,
        name: c2.name,
        contact_type: c2.contact_type,
        match_by: matchBy
      });
    }
  };

  // Clear existing matches in metadata for all contacts
  for (const c of contacts) {
    if (c.metadata && c.metadata.matches) {
      const { matches, ...rest } = c.metadata;
      c.metadata = rest;
      updates.push({ id: c.id, metadata: rest });
    }
  }

  // Cross-match Phone and Mail contacts
  for (const p of phoneContacts) {
    for (const m of mailContacts) {
      const matchBy = [];
      
      const pEmail = (p.email || '').trim().toLowerCase();
      const mEmail = (m.email || '').trim().toLowerCase();
      if (pEmail && mEmail && pEmail === mEmail) {
        matchBy.push('email');
      }

      const pPhone = normalizePhone(p.phone);
      const mPhone = normalizePhone(m.phone);
      if (pPhone && mPhone && pPhone === mPhone) {
        matchBy.push('phone');
      }

      const pName = normalizeName(p.name);
      const mName = normalizeName(m.name);
      if (pName && mName && pName === mName) {
        matchBy.push('name');
      }

      if (matchBy.length > 0) {
        addMatch(p, m, matchBy);
        addMatch(m, p, matchBy);
      }
    }
  }

  const finalUpdates = [];
  for (const c of contacts) {
    if (c.metadata && c.metadata.matches) {
      finalUpdates.push({ id: c.id, metadata: c.metadata });
    } else if (updates.some(u => u.id === c.id)) {
      finalUpdates.push({ id: c.id, metadata: c.metadata || {} });
    }
  }

  for (const item of finalUpdates) {
    await admin
      .from('contacts')
      .update({ metadata: item.metadata, updated_at: new Date().toISOString() })
      .eq('id', item.id)
      .eq('user_id', userId);
  }

  log.info(req, 'contacts.find_matches', { matchesFound: finalUpdates.length });
  return { status: 200, data: { success: true, updatedCount: finalUpdates.length } };
}

// ── Main handler ──────────────────────────────────────────────────

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const token = getBearerToken(req);
  const user = await verifySupabaseToken(token);
  if (!user) return jsonError(res, 401, 'Unauthorized. Sign in and retry.');

  const rlKey = `contacts:${getRateLimitIdentifier(req, user.id)}`;
  const rl = checkRateLimit({ key: rlKey, limit: 60, windowMs: 60_000 });
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) return jsonError(res, 429, 'Too many requests');

  const admin = buildSupabaseAdminClient();
  if (!admin) return jsonError(res, 503, 'Database not configured');

  const op = (req.query?.op || '').trim();

  const GET_OPS = { list: handleList };
  const POST_OPS = { add: handleAdd, update: handleUpdate, delete: handleDelete, import: handleImport, 'find-matches': handleFindMatches };

  try {
    let result;

    if (req.method === 'GET' && GET_OPS[op]) {
      result = await GET_OPS[op](admin, user.id, req.query, req);
    } else if (req.method === 'POST' && POST_OPS[op]) {
      const body = typeof req.body === 'object' && req.body ? req.body : {};
      result = await POST_OPS[op](admin, user.id, body, req);
    }

    if (!result) return jsonError(res, 400, 'Invalid op. Use: add, update, list, delete, import, find-matches');
    if (result.error) return jsonError(res, result.status, result.error);
    return res.status(result.status).json(result.data);
  } catch (err) {
    return handleApiError(res, err, 'contacts');
  }
}
