/**
 * Backend communication log utility.
 * Fire-and-forget — never throws. Safe to call from any API handler.
 * Uses the Supabase admin client (service role).
 */
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';

/**
 * @param {object} entry
 * @param {string} entry.user_id
 * @param {string} [entry.thread_id]
 * @param {'agent'|'system'|'user'} [entry.sender_type]
 * @param {string} [entry.sender_name]
 * @param {string} entry.content
 * @param {'build'|'deal'|'investment'|'consilium'|'command'|'general'} [entry.context_type]
 * @param {string} [entry.context_id]
 * @param {string} [entry.context_label]
 * @param {'internal'|'telegram'|'discord'|'slack'|'webhook'} [entry.platform]
 * @param {object} [entry.metadata]
 */
export async function commLog(entry) {
  try {
    if (!entry?.user_id) return;
    const admin = buildSupabaseAdminClient();
    if (!admin) return;
    await admin.from('communication_logs').insert({
      user_id: entry.user_id,
      thread_id: entry.thread_id || crypto.randomUUID(),
      sender_type: entry.sender_type || 'system',
      sender_id: entry.sender_id || null,
      sender_name: entry.sender_name || 'System',
      content: entry.content || '',
      context_type: entry.context_type || 'general',
      context_id: entry.context_id || null,
      context_label: entry.context_label || '',
      platform: entry.platform || 'internal',
      metadata: entry.metadata || {},
    });
  } catch {
    // Non-critical — never break the calling flow
  }
}
