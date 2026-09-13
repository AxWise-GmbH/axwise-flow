-- Prevent owner-facing tool deletion from stranding a current `tool:<id>`
-- credential. Legacy orphan rows are intentionally left untouched: their
-- owner must explicitly remove the credential through the key inventory API.

BEGIN;

CREATE OR REPLACE FUNCTION public.tools_guard_current_credential_on_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  request_role text := nullif(auth.role(), '');
  trusted_writer boolean := false;
BEGIN
  trusted_writer := COALESCE(request_role = 'service_role', false)
    OR current_user IN ('postgres', 'supabase_admin');

  IF NOT trusted_writer
    AND OLD.user_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.user_api_keys AS credential
      WHERE credential.user_id = OLD.user_id
        AND credential.provider = 'tool:' || OLD.id
        AND credential.is_current = true
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Delete this tool''s current credential before deleting the tool';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS tools_guard_current_credential_on_delete_trigger ON public.tools;
CREATE TRIGGER tools_guard_current_credential_on_delete_trigger
  BEFORE DELETE ON public.tools
  FOR EACH ROW
  EXECUTE FUNCTION public.tools_guard_current_credential_on_delete();

COMMENT ON FUNCTION public.tools_guard_current_credential_on_delete() IS
  'Blocks authenticated owner deletion while the exact tenant/tool provider still has a current credential.';

COMMIT;
