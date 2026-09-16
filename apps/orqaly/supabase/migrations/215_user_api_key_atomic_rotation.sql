-- Rotate BYOK metadata without exposing a transient no-current state.
--
-- The application writes the new encrypted Vault envelope first, inserts an
-- explicitly non-current metadata row, then calls this service-role-only RPC.
-- Both metadata changes commit atomically. Exact row snapshots make a lost RPC
-- response inspectable without blindly repeating or rolling back a rotation.

BEGIN;

CREATE OR REPLACE FUNCTION public.rotate_user_api_key_current(
  p_user_id uuid,
  p_provider text,
  p_slot text,
  p_old_id uuid,
  p_old_updated_at timestamptz,
  p_old_vault_secret_id uuid,
  p_new_id uuid,
  p_new_updated_at timestamptz,
  p_new_vault_secret_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  old_row record;
  new_row record;
  rotated_at timestamptz := pg_catalog.clock_timestamp();
BEGIN
  IF p_user_id IS NULL
     OR p_provider IS NULL
     OR p_provider = ''
     OR p_slot IS NULL
     OR p_slot = ''
     OR p_old_id IS NULL
     OR p_old_updated_at IS NULL
     OR p_old_vault_secret_id IS NULL
     OR p_new_id IS NULL
     OR p_new_updated_at IS NULL
     OR p_new_vault_secret_id IS NULL
     OR p_old_id = p_new_id THEN
    RAISE EXCEPTION 'invalid user api key rotation input' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO old_row
  FROM public.user_api_keys
  WHERE id = p_old_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'current user api key row is unavailable' USING ERRCODE = '40001';
  END IF;

  SELECT *
  INTO new_row
  FROM public.user_api_keys
  WHERE id = p_new_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'new user api key row is unavailable' USING ERRCODE = '40001';
  END IF;

  IF old_row.user_id <> p_user_id
     OR old_row.provider <> p_provider
     OR old_row.slot <> p_slot
     OR old_row.updated_at <> p_old_updated_at
     OR old_row.vault_secret_id <> p_old_vault_secret_id
     OR old_row.is_current IS NOT TRUE
     OR old_row.superseded_at IS NOT NULL
     OR old_row.superseded_by IS NOT NULL THEN
    RAISE EXCEPTION 'current user api key snapshot changed' USING ERRCODE = '40001';
  END IF;

  IF new_row.user_id <> p_user_id
     OR new_row.provider <> p_provider
     OR new_row.slot <> p_slot
     OR new_row.updated_at <> p_new_updated_at
     OR new_row.vault_secret_id <> p_new_vault_secret_id
     OR new_row.is_current IS NOT FALSE
     OR new_row.superseded_at IS NOT NULL
     OR new_row.superseded_by IS NOT NULL THEN
    RAISE EXCEPTION 'new user api key snapshot changed' USING ERRCODE = '40001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.user_api_keys
    WHERE user_id = p_user_id
      AND provider = p_provider
      AND slot = p_slot
      AND is_current = true
      AND id <> p_old_id
  ) THEN
    RAISE EXCEPTION 'current user api key owner changed' USING ERRCODE = '40001';
  END IF;

  UPDATE public.user_api_keys
  SET
    is_current = false,
    superseded_at = rotated_at,
    superseded_by = p_new_id
  WHERE id = p_old_id;

  UPDATE public.user_api_keys
  SET is_current = true
  WHERE id = p_new_id;

  RETURN pg_catalog.jsonb_build_object(
    'old_id', p_old_id,
    'new_id', p_new_id,
    'rotated_at', rotated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rotate_user_api_key_current(
  uuid, text, text, uuid, timestamptz, uuid, uuid, timestamptz, uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rotate_user_api_key_current(
  uuid, text, text, uuid, timestamptz, uuid, uuid, timestamptz, uuid
) FROM anon;
REVOKE ALL ON FUNCTION public.rotate_user_api_key_current(
  uuid, text, text, uuid, timestamptz, uuid, uuid, timestamptz, uuid
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rotate_user_api_key_current(
  uuid, text, text, uuid, timestamptz, uuid, uuid, timestamptz, uuid
) TO service_role;

COMMIT;
