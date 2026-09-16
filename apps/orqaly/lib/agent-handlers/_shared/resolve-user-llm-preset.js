/**
 * Resolves a user's /setup default-LLM preset to a concrete provider+model
 * pair, with a short-TTL in-process cache so the LLM hot path doesn't pay a
 * DB round trip per call.
 *
 * The release-level default is authoritative for background execution so a
 * workflow cannot silently fan out across providers. PRESET_MAP retains the
 * semantic catalogue for deployments that deliberately choose another model
 * policy in the future.
 */
import { buildSupabaseAdminClient } from '../../../api/_lib/supabase-server.js';
import { applyDefaultProvider } from '../../_shared/llm-defaults.js';

const PRESET_MAP = {
  cheapest: { provider: 'groq', model: 'llama-3.3-70b-versatile' },
  smartest: { provider: 'anthropic', model: 'claude-opus-5' },
  fastest: { provider: 'groq', model: 'llama-3.3-70b-versatile' },
};

const CACHE_TTL_MS = 60_000;
const cache = new Map(); // userId -> { value, expiry }

export function presetToProvider(preset) {
  // Keep background workflows on the release-level provider/model. Explicit
  // per-request model selections are resolved earlier and do not use this map.
  return applyDefaultProvider(PRESET_MAP[preset], { force: true }) || null;
}

export async function resolveUserLlmPreset(userId) {
  if (!userId) return null;
  const cached = cache.get(userId);
  if (cached && cached.expiry > Date.now()) return cached.value;

  let value = null;
  try {
    const admin = buildSupabaseAdminClient();
    const { data } = await admin
      .from('users')
      .select('default_llm_preset')
      .eq('id', userId)
      .maybeSingle();
    value = presetToProvider(data?.default_llm_preset);
  } catch {
    value = null;
  }
  cache.set(userId, { value, expiry: Date.now() + CACHE_TTL_MS });
  return value;
}

export function _clearLlmPresetCache() {
  cache.clear();
}
