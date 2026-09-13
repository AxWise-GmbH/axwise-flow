BEGIN;

-- Refresh the clock AFTER the grant lock is acquired. A request that waited
-- behind a reconciliation transaction must not redeem an expired grant.
CREATE OR REPLACE FUNCTION orqaly.redeem_agentic_gateway_grant(
  p_reference_hash text, p_scope_hash text, p_organization_id text,
  p_workspace_id text, p_run_id uuid, p_step_id uuid, p_effect_id uuid,
  p_redeemed_at timestamptz
)
RETURNS TABLE(state text, grant_id uuid, tenant_id uuid, owner_user_id text, action_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, orqaly
AS $$
DECLARE
  v_grant orqaly.agentic_gateway_grants%ROWTYPE;
  v_now timestamptz;
BEGIN
  IF p_reference_hash IS NULL OR p_scope_hash IS NULL
     OR p_organization_id IS NULL OR p_workspace_id IS NULL
     OR p_run_id IS NULL OR p_step_id IS NULL OR p_effect_id IS NULL
     OR p_redeemed_at IS NULL
     OR p_reference_hash !~ '^[a-f0-9]{64}$'
     OR p_scope_hash !~ '^[a-f0-9]{64}$' THEN RETURN; END IF;

  SELECT * INTO v_grant FROM orqaly.agentic_gateway_grants AS stored_grant
  WHERE stored_grant.reference_hash = p_reference_hash FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  v_now := clock_timestamp();
  IF abs(extract(epoch FROM (p_redeemed_at - v_now))) > 30
     OR v_grant.scope_hash <> p_scope_hash
     OR v_grant.organization_id <> p_organization_id
     OR v_grant.workspace_id <> p_workspace_id
     OR v_grant.run_id <> p_run_id OR v_grant.step_id <> p_step_id
     OR v_grant.effect_id <> p_effect_id
     OR v_grant.issued_at > v_now OR v_grant.expires_at <= v_now THEN RETURN; END IF;

  IF v_grant.state = 'redeemed' THEN
    RETURN QUERY SELECT 'replayed'::text, v_grant.id, v_grant.tenant_id,
      v_grant.owner_user_id, v_grant.action_id;
    RETURN;
  END IF;
  UPDATE orqaly.agentic_gateway_grants AS stored_grant
  SET state = 'redeemed', redeemed_at = v_now
  WHERE stored_grant.tenant_id = v_grant.tenant_id AND stored_grant.id = v_grant.id;
  RETURN QUERY SELECT 'redeemed'::text, v_grant.id, v_grant.tenant_id,
    v_grant.owner_user_id, v_grant.action_id;
END
$$;
REVOKE ALL ON FUNCTION orqaly.redeem_agentic_gateway_grant(
  text,text,text,text,uuid,uuid,uuid,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION orqaly.redeem_agentic_gateway_grant(
  text,text,text,text,uuid,uuid,uuid,timestamptz) TO orqaly_gateway;

-- Narrow recovery proof; never grants the API access to Gateway rows or keys.
-- It does not rewrite the failed attempt or silently replay its approval.
CREATE OR REPLACE FUNCTION orqaly.executable_action_not_applied(
  p_tenant_id uuid, p_action_id uuid, p_owner_user_id text
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, orqaly
AS $$
DECLARE
  v_action orqaly.executable_actions%ROWTYPE;
  v_grant orqaly.agentic_gateway_grants%ROWTYPE;
BEGIN
  IF p_tenant_id IS DISTINCT FROM orqaly.current_tenant_id()
     OR p_owner_user_id IS NULL THEN RETURN false; END IF;
  SELECT * INTO v_action FROM orqaly.executable_actions AS action
  WHERE action.tenant_id = p_tenant_id AND action.id = p_action_id
    AND action.owner_user_id = p_owner_user_id
    AND action.operation_key = 'operational_record_create_v1'
    AND action.status = 'outcome_unknown';
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO v_grant FROM orqaly.agentic_gateway_grants AS grant_row
  WHERE grant_row.tenant_id = p_tenant_id AND grant_row.action_id = p_action_id
    AND grant_row.owner_user_id = p_owner_user_id FOR UPDATE;
  IF NOT FOUND OR v_grant.state <> 'issued'
     OR v_grant.expires_at > clock_timestamp() THEN RETURN false; END IF;
  -- The lock waits for any in-flight atomic effect transaction to settle.
  -- Future redemption is denied by the fresh expiry check above.
  RETURN NOT EXISTS (
    SELECT 1 FROM orqaly.agentic_gateway_effects AS effect
    WHERE effect.tenant_id = p_tenant_id AND effect.effect_id = v_action.effect_id
  ) AND NOT EXISTS (
    SELECT 1 FROM orqaly.agentic_operational_records AS record
    WHERE record.tenant_id = p_tenant_id AND record.effect_id = v_action.effect_id
  );
END
$$;
REVOKE ALL ON FUNCTION orqaly.executable_action_not_applied(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION orqaly.executable_action_not_applied(uuid,uuid,text) TO orqaly_api;

COMMIT;
