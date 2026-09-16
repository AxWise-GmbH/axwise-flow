export function getSupabaseUrl(): string {
  return Deno.env.get('SUPABASE_URL') || '';
}

export function getServiceRoleKey(): string {
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
}

export function supabaseHeaders(serviceRoleKey: string) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };
}
