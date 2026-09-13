BEGIN;

CREATE TABLE orqaly.executable_action_reconciliations (
  tenant_id uuid NOT NULL, action_id uuid NOT NULL, owner_user_id text NOT NULL,
  prior_status text NOT NULL CHECK (prior_status = 'outcome_unknown'),
  prior_error_code text, receipt_hash char(64) NOT NULL CHECK (receipt_hash ~ '^[a-f0-9]{64}$'),
  recovered_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, action_id),
  FOREIGN KEY (tenant_id, action_id) REFERENCES orqaly.executable_actions(tenant_id,id)
);
ALTER TABLE orqaly.executable_action_reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE orqaly.executable_action_reconciliations FORCE ROW LEVEL SECURITY;
CREATE POLICY reconciliation_owner ON orqaly.executable_action_reconciliations
  USING (current_user = orqaly.rpc_owner_name()) WITH CHECK (current_user = orqaly.rpc_owner_name());
CREATE POLICY reconciliation_tenant ON orqaly.executable_action_reconciliations TO orqaly_api
  USING (tenant_id = orqaly.current_tenant_id());
GRANT SELECT ON orqaly.executable_action_reconciliations TO orqaly_api;

CREATE FUNCTION orqaly.load_committed_action_receipt(p_tenant uuid,p_action uuid,p_owner text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog,orqaly AS $$
  SELECT effect.dispatch_receipt
  FROM orqaly.executable_actions AS action
  JOIN orqaly.agentic_gateway_effects AS effect ON effect.tenant_id=action.tenant_id
    AND effect.action_id=action.id AND effect.effect_id=action.effect_id
    AND effect.run_id=action.workflow_run_id AND effect.step_id=action.step_id
    AND effect.canonical_input_hash=action.canonical_input_hash
  JOIN orqaly.agentic_operational_records AS record ON record.tenant_id=effect.tenant_id
    AND record.record_id=effect.operational_record_id AND record.action_id=action.id
    AND record.effect_id=action.effect_id AND record.owner_user_id=action.owner_user_id
    AND record.canonical_input_hash=action.canonical_input_hash
  WHERE p_tenant=orqaly.current_tenant_id() AND action.tenant_id=p_tenant
    AND action.id=p_action AND action.owner_user_id=p_owner
    AND action.operation_key='operational_record_create_v1'
    AND effect.dispatch_receipt->>'status'='succeeded'
    AND effect.dispatch_receipt->'gatewayEffectAttestation'->>'receiptHash'=effect.receipt_hash
$$;
REVOKE ALL ON FUNCTION orqaly.load_committed_action_receipt(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION orqaly.load_committed_action_receipt(uuid,uuid,text) TO orqaly_api;

-- Preserve the original guard verbatim, adding only the audited definer-owned
-- unknown -> succeeded transition. All authority and original error/time fields
-- must remain byte-for-byte identical; API callers cannot take this branch.
DO $$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef('orqaly.guard_executable_action_update()'::regprocedure) INTO definition;
  IF position('invalid executable action state transition' IN definition)=0 THEN
    RAISE EXCEPTION 'unknown action guard version';
  END IF;
  definition := regexp_replace(definition, E'BEGIN\n', $repair$BEGIN
  -- receipt_reconciliation_v1
  IF OLD.status='outcome_unknown' AND NEW.status='succeeded'
     AND current_user=orqaly.rpc_owner_name() AND NEW.row_version=OLD.row_version+1
     AND (to_jsonb(NEW)-ARRAY['status','dispatch_receipt','receipt_hash','n8n_execution_reference','row_version','updated_at'])
       = (to_jsonb(OLD)-ARRAY['status','dispatch_receipt','receipt_hash','n8n_execution_reference','row_version','updated_at'])
     AND EXISTS (SELECT 1 FROM orqaly.executable_action_reconciliations AS audit
       WHERE audit.tenant_id=OLD.tenant_id AND audit.action_id=OLD.id
         AND audit.owner_user_id=OLD.owner_user_id AND audit.receipt_hash=NEW.receipt_hash)
     AND NEW.dispatch_receipt=orqaly.load_committed_action_receipt(OLD.tenant_id,OLD.id,OLD.owner_user_id)
  THEN RETURN NEW; END IF;
$repair$);
  EXECUTE definition;
END
$$;

CREATE FUNCTION orqaly.reconcile_committed_action_receipt(p_tenant uuid,p_action uuid,p_owner text,p_hash text)
RETURNS SETOF orqaly.executable_actions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog,orqaly AS $$
DECLARE prior orqaly.executable_actions%ROWTYPE; receipt jsonb;
BEGIN
  IF p_tenant IS DISTINCT FROM orqaly.current_tenant_id() THEN RETURN; END IF;
  SELECT * INTO prior FROM orqaly.executable_actions AS action
  WHERE action.tenant_id=p_tenant AND action.id=p_action AND action.owner_user_id=p_owner FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  receipt := orqaly.load_committed_action_receipt(p_tenant,p_action,p_owner);
  IF receipt IS NULL OR receipt->'gatewayEffectAttestation'->>'receiptHash' IS DISTINCT FROM p_hash THEN RETURN; END IF;
  IF prior.status='succeeded' AND prior.receipt_hash=p_hash THEN RETURN NEXT prior; RETURN; END IF;
  IF prior.status<>'outcome_unknown' THEN RETURN; END IF;
  INSERT INTO orqaly.executable_action_reconciliations(tenant_id,action_id,owner_user_id,prior_status,prior_error_code,receipt_hash)
  VALUES(p_tenant,p_action,p_owner,prior.status,prior.error_code,p_hash);
  RETURN QUERY UPDATE orqaly.executable_actions AS action
  SET status='succeeded',dispatch_receipt=receipt,receipt_hash=p_hash,
      n8n_execution_reference=receipt->>'executorReference',row_version=action.row_version+1
  WHERE action.tenant_id=p_tenant AND action.id=p_action RETURNING action.*;
END
$$;
REVOKE ALL ON FUNCTION orqaly.reconcile_committed_action_receipt(uuid,uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION orqaly.reconcile_committed_action_receipt(uuid,uuid,text,text) TO orqaly_api;

COMMIT;
