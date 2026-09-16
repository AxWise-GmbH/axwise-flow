/**
 * Unified auth: Supabase Auth when configured, else localAuth (localStorage).
 */
import { supabase, hasSupabase } from './supabase';
import { localAuth } from '../config/firebase';
import { clearReportClientData } from '../services/reportService';

const STRONG_PASSWORD_RULE =
  'Password must be at least 10 characters and include uppercase, lowercase, number, and symbol.';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(email) {
  return typeof email === 'string' && EMAIL_REGEX.test(email.trim());
}

function isStrongPassword(password) {
  return (
    typeof password === 'string' &&
    password.length >= 10 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

function mapSupabaseUser(supabaseUser) {
  if (!supabaseUser) return null;
  return {
    uid: supabaseUser.id,
    email: supabaseUser.email,
    displayName:
      supabaseUser.user_metadata?.display_name || supabaseUser.email?.split('@')[0] || 'User',
    photoURL: supabaseUser.user_metadata?.avatar_url || null,
  };
}

export async function login(email, password) {
  if (hasSupabase()) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) {
      const err = new Error(error.message);
      err.code = error.message?.toLowerCase().includes('invalid')
        ? 'auth/invalid-credential'
        : error.code;
      throw err;
    }
    return mapSupabaseUser(data.user);
  }
  return localAuth.login(email, password);
}

export async function register(email, password, displayName, inviteCode = '') {
  if (!isValidEmail(email)) {
    const err = new Error('Please enter a valid email address.');
    err.code = 'auth/invalid-email';
    throw err;
  }
  if (!isStrongPassword(password)) {
    const err = new Error(STRONG_PASSWORD_RULE);
    err.code = 'auth/weak-password';
    throw err;
  }
  if (hasSupabase()) {
    // Beta invite gate (migration 124_beta_invites.sql) reads invite_code
    // from raw_user_meta_data and throws BETA_INVITE_* if missing/invalid.
    // Pass an empty string when gating is disabled (the trigger no-ops then).
    const trimmedInvite = (inviteCode || '').trim();
    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        data: {
          display_name: displayName || email.split('@')[0],
          ...(trimmedInvite ? { invite_code: trimmedInvite } : {}),
        },
      },
    });
    if (error) {
      const msg = error.message || 'Sign-up failed.';
      const friendly = msg.includes('BETA_INVITE_REQUIRED')
        ? 'Sign-up is invite-only. Enter a valid invite code.'
        : msg.includes('BETA_INVITE_INVALID')
          ? 'Invite code not recognized. Double-check it and try again.'
          : msg.includes('BETA_INVITE_USED')
            ? 'This invite code has already been used. Request a new one.'
            : msg.includes('BETA_INVITE_EXPIRED')
              ? 'This invite code has expired. Request a new one.'
              : msg;
      const err = new Error(friendly);
      err.code = msg.includes('BETA_INVITE')
        ? 'auth/invalid-invite'
        : msg.toLowerCase().includes('already')
          ? 'auth/email-already-in-use'
          : error.code;
      throw err;
    }
    return mapSupabaseUser(data.user);
  }
  return localAuth.register(email, password, displayName);
}

export async function loginWithGoogle() {
  if (hasSupabase()) {
    const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'google' });
    if (error) {
      const message = String(error?.message || '');
      if (message.toLowerCase().includes('unsupported provider')) {
        throw new Error(
          'Google sign-in is not enabled in Supabase Auth. Enable Google provider in Supabase first.'
        );
      }
      throw error;
    }
    if (data?.url) window.location.href = data.url;
    return null; // redirect flow
  }
  return localAuth.loginWithGoogle();
}

export async function logout() {
  try {
    if (hasSupabase()) {
      await supabase.auth.signOut();
    } else {
      await localAuth.logout();
    }
  } finally {
    // Always clear client-held report data so a shared browser cannot surface
    // the previous user's cached/aggregated reports after sign-out.
    clearReportClientData();
  }
}

/**
 * Update password for the current user.
 * - Supabase: updates password in Supabase Auth (database). Optionally pass currentPassword to re-authenticate first.
 * - Local auth: updates password in stored users (localStorage). currentPassword is required to verify.
 */
export async function updatePassword(newPassword, currentPassword = '') {
  if (!isStrongPassword(newPassword)) {
    const err = new Error(STRONG_PASSWORD_RULE);
    err.code = 'auth/weak-password';
    throw err;
  }
  if (hasSupabase()) {
    if (currentPassword) {
      const session = await supabase.auth.getSession();
      const email = session?.data?.session?.user?.email;
      if (email) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password: currentPassword,
        });
        if (signInError) {
          const err = new Error(signInError.message || 'Current password is incorrect.');
          err.code = 'auth/invalid-credential';
          throw err;
        }
      }
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
  } else {
    if (!currentPassword) {
      const err = new Error('Current password is required.');
      err.code = 'auth/missing-current-password';
      throw err;
    }
    await localAuth.updatePassword(currentPassword, newPassword);
  }
}

/** Link Google account for the current user (Supabase OAuth link). */
export async function linkGoogle() {
  if (hasSupabase()) {
    const { data, error } = await supabase.auth.linkIdentity({ provider: 'google' });
    if (error) {
      const message = String(error?.message || '');
      if (message.toLowerCase().includes('unsupported provider')) {
        throw new Error(
          'Google provider is disabled in Supabase Auth. Enable Google first, then retry linking.'
        );
      }
      throw error;
    }
    if (data?.url) window.location.href = data.url;
    return null;
  }
  throw new Error('Link Google is only available with Supabase.');
}

function extractFactorsByType(listData, type) {
  if (!listData) return [];
  if (Array.isArray(listData[type])) return listData[type];
  if (Array.isArray(listData.all)) {
    return listData.all.filter(
      (f) => String(f?.factor_type || f?.factorType).toLowerCase() === type
    );
  }
  return [];
}

export async function getSecurityStatus() {
  if (!hasSupabase()) {
    return {
      googleLinked: false,
      totpEnabled: false,
      totpFactors: [],
      webauthnEnabled: false,
      webauthnFactors: [],
    };
  }
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const user = userData?.user || null;
  const identities = Array.isArray(user?.identities) ? user.identities : [];
  const googleLinked = identities.some((identity) => identity?.provider === 'google');

  let totpFactors = [];
  let webauthnFactors = [];
  if (supabase.auth.mfa?.listFactors) {
    const { data: factorData, error: factorError } = await supabase.auth.mfa.listFactors();
    if (factorError) throw factorError;
    totpFactors = extractFactorsByType(factorData, 'totp');
    webauthnFactors = extractFactorsByType(factorData, 'webauthn');
  }
  return {
    googleLinked,
    totpEnabled: totpFactors.length > 0,
    totpFactors,
    webauthnEnabled: webauthnFactors.length > 0,
    webauthnFactors,
  };
}

export async function createTotpEnrollment(friendlyName = 'Google Authenticator') {
  if (!hasSupabase()) {
    throw new Error(
      'TOTP requires Supabase. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment.'
    );
  }
  if (!supabase.auth.mfa?.enroll) {
    throw new Error(
      'Your Supabase client does not support MFA. Upgrade @supabase/supabase-js to the latest version.'
    );
  }
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: friendlyName || 'Google Authenticator',
  });
  if (error) {
    const msg = error.message || 'Enrollment failed';
    if (msg.toLowerCase().includes('mfa') && msg.toLowerCase().includes('enabled')) {
      throw new Error(
        'MFA must be enabled in your Supabase project: Dashboard → Authentication → Providers → enable MFA.'
      );
    }
    throw error;
  }
  const factorId = data?.id ?? data?.factor_id ?? null;
  const totp = data?.totp || data;
  const qrCodeSvg = totp?.qr_code ?? totp?.qrCodeSvg ?? '';
  const uri = totp?.uri ?? '';
  const secret = totp?.secret ?? '';
  return {
    factorId,
    qrCodeSvg,
    uri,
    secret,
  };
}

export async function createTotpChallenge(factorId) {
  if (!hasSupabase() || !supabase.auth.mfa?.challenge) {
    throw new Error('TOTP challenge requires Supabase Auth MFA support.');
  }
  const { data, error } = await supabase.auth.mfa.challenge({ factorId });
  if (error) throw error;
  return data?.id ?? data?.challenge_id ?? null;
}

export async function verifyTotpCode({ factorId, challengeId, code }) {
  if (!hasSupabase() || !supabase.auth.mfa?.verify) {
    throw new Error('TOTP verification requires Supabase Auth MFA support.');
  }
  const codeStr = String(code || '')
    .trim()
    .replace(/\s/g, '');
  if (!codeStr || codeStr.length !== 6) {
    throw new Error('Enter the 6-digit code from your authenticator app.');
  }
  const { data, error } = await supabase.auth.mfa.verify({
    factorId,
    challengeId,
    code: codeStr,
  });
  if (error) throw error;
  return data;
}

export async function disableTotpFactor(factorId) {
  if (!hasSupabase() || !supabase.auth.mfa?.unenroll) {
    throw new Error('TOTP disable requires Supabase Auth MFA support.');
  }
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) throw error;
}

export async function checkMfaRequired() {
  if (!hasSupabase() || !supabase.auth.mfa?.getAuthenticatorAssuranceLevel) return false;
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) return false;
  return data.nextLevel === 'aal2' && data.currentLevel !== 'aal2';
}

export async function getMfaTotpFactors() {
  if (!hasSupabase() || !supabase.auth.mfa?.listFactors) return [];
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error || !data) return [];
  return extractFactorsByType(data, 'totp');
}

/** Delete all TOTP factors for the current user via the server-side admin endpoint.
 *  This works regardless of the session AAL level. */
export async function deleteMfaFactorViaAdmin() {
  if (!hasSupabase()) throw new Error('Supabase is required for MFA management.');
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error('Sign in required.');
  const resp = await fetch('/api/delete-mfa-factor', {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || data.message || 'Failed to remove MFA factor.');
  return data;
}

export async function completeMfaLogin({ factorId, code }) {
  const challengeId = await createTotpChallenge(factorId);
  return verifyTotpCode({ factorId, challengeId, code });
}

export async function createWebAuthnEnrollment(friendlyName = 'YubiKey') {
  if (!hasSupabase() || !supabase.auth.mfa?.enroll) {
    throw new Error('YubiKey enrollment requires Supabase Auth MFA support.');
  }
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'webauthn',
    friendlyName,
  });
  if (error) throw error;
  return {
    factorId: data?.id || '',
  };
}

export async function verifyWebAuthnFactor(factorId) {
  if (!hasSupabase() || !supabase.auth.mfa?.challengeAndVerify) {
    throw new Error('YubiKey verification requires Supabase Auth WebAuthn support.');
  }
  const { data, error } = await supabase.auth.mfa.challengeAndVerify({ factorId });
  if (error) throw error;
  return data;
}

export async function disableWebAuthnFactor(factorId) {
  if (!hasSupabase() || !supabase.auth.mfa?.unenroll) {
    throw new Error('YubiKey disable requires Supabase Auth MFA support.');
  }
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) throw error;
}

export async function updateProfile({ displayName, telegram } = {}) {
  if (hasSupabase()) {
    const updates = {};
    if (displayName !== undefined) updates.display_name = displayName;
    if (telegram !== undefined) updates.telegram = telegram;
    const { error } = await supabase.auth.updateUser({ data: updates });
    if (error) throw error;
    return;
  }
  localAuth.updateProfile({ displayName, telegram });
}

const SIMPLE_MODE_KEY = 'orchestratori_simple_mode';
const SIMPLE_ROUTE = '/home';
const ADVANCED_ROUTE = '/home';

/**
 * Decide where to send the user after a successful login.
 *   simple   -> /home (Cockpit shell with the Home org overview)
 *   advanced -> /home (plain org overview)
 * Both modes land on Home; the page renders per-mode internally.
 *
 * When `fetchServerMode` is provided (login flow), server uiMode wins over
 * stale device cache. Without fetchServerMode, falls back to localStorage then
 * simple default.
 */
function cacheSimpleMode(isSimple) {
  try {
    localStorage.setItem(SIMPLE_MODE_KEY, isSimple ? 'true' : 'false');
  } catch {
    // ignore
  }
}

function routeForMode(mode) {
  if (mode === 'advanced') {
    cacheSimpleMode(false);
    return ADVANCED_ROUTE;
  }
  cacheSimpleMode(true);
  return SIMPLE_ROUTE;
}

export async function resolvePostLoginRoute({ fetchServerMode } = {}) {
  if (typeof fetchServerMode === 'function') {
    try {
      const mode = await fetchServerMode();
      return routeForMode(mode === 'advanced' ? 'advanced' : 'simple');
    } catch {
      // Network failure - fall through to cache / default.
    }
  }

  let cached = null;
  try {
    cached = localStorage.getItem(SIMPLE_MODE_KEY);
  } catch {
    // localStorage unavailable - fall through to default.
  }
  if (cached === 'true') return SIMPLE_ROUTE;
  if (cached === 'false') return ADVANCED_ROUTE;

  cacheSimpleMode(true);
  return SIMPLE_ROUTE;
}

export function onAuthStateChanged(callback) {
  if (hasSupabase()) {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      callback(session ? mapSupabaseUser(session.user) : null);
    });
    return () => subscription.unsubscribe();
  }
  return localAuth.onAuthStateChanged(callback);
}
