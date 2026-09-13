-- User key metadata is readable by its owner, but every mutation must cross
-- the authenticated server API so Vault writes, rotation, deletion, and tool
-- credential reservations remain one coordinated protocol.

ALTER TABLE public.user_api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users insert own api keys" ON public.user_api_keys;
DROP POLICY IF EXISTS "Users update own api keys" ON public.user_api_keys;
DROP POLICY IF EXISTS "Users delete own api keys" ON public.user_api_keys;

REVOKE ALL PRIVILEGES ON TABLE public.user_api_keys FROM PUBLIC, anon, authenticated;

-- Keep metadata-only owner reads used by Tool Setup and the key inventory UI.
-- The existing "Users read own api keys" policy remains authoritative.
GRANT SELECT ON TABLE public.user_api_keys TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.user_api_keys TO service_role;
