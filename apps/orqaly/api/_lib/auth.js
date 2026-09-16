/** Prefer server-side SUPABASE_URL, fallback to VITE_SUPABASE_URL for compatibility. */
export function getSupabaseUrl() {
  return process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
}

/** Prefer server-side SUPABASE_ANON_KEY, fallback to VITE_SUPABASE_ANON_KEY for compatibility. */
export function getSupabaseAnonKey() {
  return process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
}

/** Verify Supabase JWT; returns user or null */
export async function verifySupabaseToken(token) {
  const url = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();
  if (!url || !token || !anonKey) return null;
  const res = await fetch(`${url.replace(/\/$/, '')}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anonKey,
    },
  });
  if (!res.ok) return null;
  const user = await res.json().catch(() => null);
  return user?.id ? user : null;
}

export function getBearerToken(req) {
  const authHeader = req.headers.authorization;
  return authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
}
