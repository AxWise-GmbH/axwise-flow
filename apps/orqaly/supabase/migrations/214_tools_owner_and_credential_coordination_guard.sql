-- `tools` is both user-owned configuration and the server-side coordination
-- row for encrypted `tool:*` credential writes.  The original migration gave
-- every authenticated user FOR ALL access to every row, so a browser could
-- mutate another tenant's tool or remove a server reservation between its
-- final check and the Vault/database commit.

ALTER TABLE public.tools ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage tools" ON public.tools;
DROP POLICY IF EXISTS "Users manage own tools" ON public.tools;
DROP POLICY IF EXISTS "tools_owner_select" ON public.tools;
DROP POLICY IF EXISTS "tools_owner_insert" ON public.tools;
DROP POLICY IF EXISTS "tools_owner_update" ON public.tools;
DROP POLICY IF EXISTS "tools_owner_delete" ON public.tools;
DROP POLICY IF EXISTS "tools_service" ON public.tools;

CREATE POLICY "tools_owner_select" ON public.tools
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "tools_owner_insert" ON public.tools
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "tools_owner_update" ON public.tools
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "tools_owner_delete" ON public.tools
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "tools_service" ON public.tools
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Keep the intended browser CRUD surface explicit.  RLS scopes it to the
-- owner; service-role workers retain the trusted credential lifecycle.
REVOKE ALL PRIVILEGES ON TABLE public.tools FROM public, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tools TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.tools TO service_role;

CREATE OR REPLACE FUNCTION public.tools_guard_credential_coordination()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  request_role text := nullif(auth.role(), '');
  trusted_writer boolean := false;
  reservation_field constant text := 'credential_write_reservation';
  version_field constant text := 'credential_write_version';
BEGIN
  -- PostgREST service clients carry role=service_role.  Direct database-owner
  -- maintenance has no JWT claim, so allow only the known administrative
  -- roles by current_user.  Never trust caller-controlled HTTP headers.
  trusted_writer := COALESCE(request_role = 'service_role', false)
    OR current_user IN ('postgres', 'supabase_admin');

  IF TG_OP = 'INSERT' THEN
    IF NOT trusted_writer
      AND (
        COALESCE(NEW.data, '{}'::jsonb) ? reservation_field
        OR COALESCE(NEW.data, '{}'::jsonb) ? version_field
      )
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'tool credential coordination fields are server-owned';
    END IF;

    NEW.updated_at := clock_timestamp();
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NOT trusted_writer THEN
      -- While Vault/user_api_keys work is in flight, no browser update may
      -- advance the row version or alter status/configuration.  Preserving the
      -- marker alone is insufficient: it would make finalization ambiguous and
      -- strand the reservation.
      IF COALESCE(OLD.data, '{}'::jsonb) ? reservation_field THEN
        RAISE EXCEPTION USING
          ERRCODE = '42501',
          MESSAGE = 'tool credential write is in progress';
      END IF;

      IF (OLD.data -> reservation_field) IS DISTINCT FROM (NEW.data -> reservation_field)
        OR (OLD.data -> version_field) IS DISTINCT FROM (NEW.data -> version_field)
      THEN
        RAISE EXCEPTION USING
          ERRCODE = '42501',
          MESSAGE = 'tool credential coordination fields are server-owned';
      END IF;
    END IF;

    -- `updated_at` is an application CAS version.  Make it strictly monotonic
    -- even for same-clock-tick writes or clients that omit/forge the column.
    NEW.updated_at := CASE
      WHEN OLD.updated_at IS NULL THEN clock_timestamp()
      ELSE greatest(clock_timestamp(), OLD.updated_at + interval '1 microsecond')
    END;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF NOT trusted_writer
      AND COALESCE(OLD.data, '{}'::jsonb) ? reservation_field
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'tool credential write is in progress';
    END IF;
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tools_guard_credential_coordination_trigger ON public.tools;
CREATE TRIGGER tools_guard_credential_coordination_trigger
  BEFORE INSERT OR UPDATE OR DELETE ON public.tools
  FOR EACH ROW
  EXECUTE FUNCTION public.tools_guard_credential_coordination();

COMMENT ON FUNCTION public.tools_guard_credential_coordination() IS
  'Owner CRUD guard for server-owned credential reservation/version fields and strictly monotonic tools.updated_at.';
