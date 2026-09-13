/**
 * Email Notification Preferences — persists per-user email notification settings.
 *
 * Storage: Supabase (email_notification_preferences table) when available,
 * otherwise localStorage fallback.
 *
 * Each preference is a boolean toggle keyed by action type.
 */
import { supabase, hasSupabase } from '../lib/supabase';
import {
  EMAIL_ACTION_CATEGORIES,
  CHANNEL_KEY,
  getDefaultEmailPreferences,
  normalizeEmailPreferences,
  getChannelPrefs,
  getDefaultChannels,
  getCategoryPageIds,
  getVisibleCategoryEntries,
} from '../../shared/notificationCatalog';

const LS_KEY = 'orch_email_notification_prefs_v1';

export {
  EMAIL_ACTION_CATEGORIES,
  CHANNEL_KEY,
  getChannelPrefs,
  getDefaultChannels,
  getCategoryPageIds,
  getVisibleCategoryEntries,
};

/** Flat map: actionKey → default boolean */
export function getDefaultPreferences() {
  return getDefaultEmailPreferences();
}

/* ------------------------------------------------------------------ */
/*  localStorage helpers                                               */
/* ------------------------------------------------------------------ */

function readLocalPrefs() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeLocalPrefs(prefs) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(normalizeEmailPreferences(prefs)));
  } catch {
    // quota exceeded — silently ignore
  }
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Load email notification preferences for a user + metadata.
 * @param {string} userId
 * @returns {Promise<{ prefs: Record<string, boolean>, source: 'supabase' | 'localStorage' | 'defaults', warning: string }>}
 */
export async function loadPreferencesWithMeta(userId) {
  const defaults = getDefaultPreferences();

  function buildUnavailableWarning(err) {
    const msg = String(err?.message || '');
    const code = String(err?.code || '');
    const combined = `${code} ${msg}`.toLowerCase();

    // Common Postgres missing-relation signal (migration not applied).
    const missingTable =
      combined.includes('email_notification_preferences') &&
      (combined.includes('does not exist') || combined.includes('relation') || code === '42P01');

    if (missingTable) {
      return 'Email preferences table is not initialized (run migration 009_email_notification_preferences.sql). Using local settings.';
    }

    // Keep the generic wording for transient/network/auth/RLS issues.
    return 'Database sync is currently unavailable. Using local settings.';
  }

  if (hasSupabase() && supabase && userId) {
    try {
      const { data, error } = await supabase
        .from('email_notification_preferences')
        .select('preferences')
        .eq('user_id', userId)
        .maybeSingle();

      if (!error && data?.preferences) {
        return {
          prefs: normalizeEmailPreferences(data.preferences),
          source: 'supabase',
          warning: '',
        };
      }
      if (error) {
        const localOnError = readLocalPrefs();
        return {
          prefs: localOnError ? normalizeEmailPreferences(localOnError) : defaults,
          source: localOnError ? 'localStorage' : 'defaults',
          warning: buildUnavailableWarning(error),
        };
      }
    } catch (err) {
      const localOnCatch = readLocalPrefs();
      return {
        prefs: localOnCatch ? normalizeEmailPreferences(localOnCatch) : defaults,
        source: localOnCatch ? 'localStorage' : 'defaults',
        warning: buildUnavailableWarning(err),
      };
    }
  }

  const local = readLocalPrefs();
  return {
    prefs: local ? normalizeEmailPreferences(local) : defaults,
    source: local ? 'localStorage' : 'defaults',
    warning: '',
  };
}

/**
 * Load email notification preferences for a user.
 * @param {string} userId
 * @returns {Promise<Record<string, boolean>>}
 */
export async function loadPreferences(userId) {
  const result = await loadPreferencesWithMeta(userId);
  return result.prefs;
}

/**
 * Save email notification preferences.
 * @param {string} userId
 * @param {Record<string, boolean>} prefs
 * @param {{ requireRemote?: boolean }} options
 * @returns {Promise<{ savedToSupabase: boolean, savedToLocal: boolean, warning: string }>}
 */
export async function savePreferences(userId, prefs, options = {}) {
  const normalized = normalizeEmailPreferences(prefs);
  writeLocalPrefs(normalized);

  let savedToSupabase = false;
  let warning = '';

  if (hasSupabase() && supabase && userId) {
    const { error } = await supabase
      .from('email_notification_preferences')
      .upsert(
        { user_id: userId, preferences: normalized, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      );

    if (error) {
      warning = 'Saved locally. Could not sync to database.';
      if (options?.requireRemote) {
        throw new Error(error.message || 'Could not sync preferences to database.');
      }
    } else {
      savedToSupabase = true;
    }
  }

  return { savedToSupabase, savedToLocal: true, warning };
}

/**
 * Check if a specific action should trigger an email notification.
 * @param {string} actionKey  e.g. "partner_created"
 * @param {Record<string, boolean>} prefs  the loaded prefs object
 * @returns {boolean}
 */
export function isActionEnabled(actionKey, prefs) {
  if (!prefs || typeof prefs !== 'object') return false;
  return !!prefs[actionKey];
}
