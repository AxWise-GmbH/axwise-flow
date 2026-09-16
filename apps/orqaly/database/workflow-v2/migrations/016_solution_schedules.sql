BEGIN;
ALTER TABLE orqaly.solution_invocations ADD CONSTRAINT solution_invocation_schedule_identity UNIQUE(tenant_id,solution_id,id);
CREATE TABLE orqaly.solution_schedules (
  tenant_id uuid NOT NULL, id uuid NOT NULL, solution_id uuid NOT NULL,
  owner_user_id text NOT NULL, label text NOT NULL CHECK(length(label) BETWEEN 1 AND 80),
  workflow_hash char(64) NOT NULL CHECK(workflow_hash ~ '^[a-f0-9]{64}$'),
  revision_id uuid, timing jsonb NOT NULL CHECK(jsonb_typeof(timing)='object' AND octet_length(timing::text)<=1024),
  input jsonb NOT NULL CHECK(jsonb_typeof(input)='object' AND octet_length(input::text)<=64000),
  create_key text NOT NULL CHECK(length(create_key) BETWEEN 8 AND 160), request_hash char(64) NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','needs_attention')),
  next_run_at timestamptz NOT NULL, last_tick_at timestamptz, last_error text,
  lease_token uuid, lease_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), row_version integer NOT NULL DEFAULT 1,
  PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,solution_id,create_key),
  FOREIGN KEY(tenant_id,solution_id,owner_user_id) REFERENCES orqaly.customer_solutions(tenant_id,id,owner_user_id)
);
CREATE INDEX solution_schedules_owner_idx ON orqaly.solution_schedules(tenant_id,solution_id,owner_user_id,created_at DESC);
CREATE INDEX solution_schedules_due_idx ON orqaly.solution_schedules(next_run_at) WHERE status='active';
CREATE TABLE orqaly.solution_schedule_ticks (
  tenant_id uuid NOT NULL, schedule_id uuid NOT NULL, id uuid NOT NULL, owner_user_id text NOT NULL,
  scheduled_at timestamptz NOT NULL, invocation_id uuid NOT NULL, solution_id uuid NOT NULL,
  status text NOT NULL CHECK(status IN ('running','succeeded','failed','outcome_unknown')),
  error_code text, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), completed_at timestamptz,
  PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,schedule_id,scheduled_at),
  FOREIGN KEY(tenant_id,schedule_id) REFERENCES orqaly.solution_schedules(tenant_id,id),
  FOREIGN KEY(tenant_id,solution_id,invocation_id) REFERENCES orqaly.solution_invocations(tenant_id,solution_id,id)
);
CREATE INDEX solution_schedule_ticks_recent_idx ON orqaly.solution_schedule_ticks(tenant_id,schedule_id,created_at DESC);
CREATE FUNCTION orqaly.guard_solution_schedule_update() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,orqaly AS $$
BEGIN
 IF (to_jsonb(NEW)-ARRAY['status','next_run_at','last_tick_at','last_error','lease_token','lease_expires_at','row_version']) IS DISTINCT FROM
    (to_jsonb(OLD)-ARRAY['status','next_run_at','last_tick_at','last_error','lease_token','lease_expires_at','row_version']) OR
    NEW.row_version<>OLD.row_version+1 OR (OLD.status<>'active' AND NEW.status='active')
 THEN RAISE EXCEPTION 'schedule approval immutable; create a new schedule to resume' USING ERRCODE='55000'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER solution_schedule_guard BEFORE UPDATE ON orqaly.solution_schedules FOR EACH ROW EXECUTE FUNCTION orqaly.guard_solution_schedule_update();
CREATE FUNCTION orqaly.guard_solution_schedule_tick_update() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,orqaly AS $$
BEGIN
 IF (to_jsonb(NEW)-ARRAY['status','error_code','completed_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','error_code','completed_at']) OR OLD.status<>'running' OR NEW.status='running'
 THEN RAISE EXCEPTION 'schedule receipt immutable' USING ERRCODE='55000'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER solution_schedule_tick_guard BEFORE UPDATE ON orqaly.solution_schedule_ticks FOR EACH ROW EXECUTE FUNCTION orqaly.guard_solution_schedule_tick_update();
-- Pausing/replacing a release atomically revokes recurring authority, even if
-- the workflow is reactivated before the next due time.
CREATE FUNCTION orqaly.stop_schedules_on_release_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,orqaly AS $$
BEGIN
 IF (OLD.status='active' AND NEW.status<>'active') OR NEW.active_revision_id IS DISTINCT FROM OLD.active_revision_id THEN
  UPDATE orqaly.solution_schedules SET status='paused',last_error='SCHEDULE_RELEASE_CHANGED',lease_token=NULL,lease_expires_at=NULL,row_version=row_version+1 WHERE tenant_id=NEW.tenant_id AND solution_id=NEW.id AND status='active';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER solution_schedules_release_guard AFTER UPDATE ON orqaly.customer_solutions FOR EACH ROW EXECUTE FUNCTION orqaly.stop_schedules_on_release_change();
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['solution_schedules','solution_schedule_ticks'] LOOP
  EXECUTE format('ALTER TABLE orqaly.%I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('ALTER TABLE orqaly.%I FORCE ROW LEVEL SECURITY',tab);
  EXECUTE format('CREATE POLICY %I ON orqaly.%I TO orqaly_api,orqaly_worker USING (tenant_id=(SELECT orqaly.current_tenant_id()) AND owner_user_id=current_setting(''orqaly.build_owner_user_id'',true)) WITH CHECK (tenant_id=(SELECT orqaly.current_tenant_id()) AND owner_user_id=current_setting(''orqaly.build_owner_user_id'',true))',tab||'_scope',tab);
  EXECUTE format('CREATE POLICY %I ON orqaly.%I USING (current_user=orqaly.rpc_owner_name()) WITH CHECK (current_user=orqaly.rpc_owner_name())',tab||'_rpc',tab);
 END LOOP;
END $$;
GRANT SELECT,INSERT ON orqaly.solution_schedules TO orqaly_api;
GRANT UPDATE(status,last_error,lease_token,lease_expires_at,row_version) ON orqaly.solution_schedules TO orqaly_api;
GRANT SELECT ON orqaly.solution_schedule_ticks TO orqaly_api;
GRANT SELECT,UPDATE ON orqaly.solution_schedules TO orqaly_worker;
GRANT SELECT,INSERT,UPDATE ON orqaly.solution_schedule_ticks TO orqaly_worker;
CREATE POLICY customer_solutions_schedule_worker ON orqaly.customer_solutions TO orqaly_worker
 USING(tenant_id=(SELECT orqaly.current_tenant_id()) AND owner_user_id=current_setting('orqaly.build_owner_user_id',true));
CREATE POLICY solution_revisions_schedule_worker ON orqaly.solution_revisions TO orqaly_worker
 USING(tenant_id=(SELECT orqaly.current_tenant_id()) AND owner_user_id=current_setting('orqaly.build_owner_user_id',true));
CREATE POLICY solution_invocations_schedule_worker ON orqaly.solution_invocations TO orqaly_worker
 USING(tenant_id=(SELECT orqaly.current_tenant_id()) AND owner_user_id=current_setting('orqaly.build_owner_user_id',true))
 WITH CHECK(tenant_id=(SELECT orqaly.current_tenant_id()) AND owner_user_id=current_setting('orqaly.build_owner_user_id',true));
GRANT SELECT ON orqaly.customer_solutions,orqaly.solution_revisions TO orqaly_worker;
GRANT SELECT(id,status) ON orqaly.tenants TO orqaly_worker;
GRANT UPDATE(status) ON orqaly.customer_solutions TO orqaly_worker;
GRANT SELECT,INSERT ON orqaly.solution_invocations TO orqaly_worker;
GRANT UPDATE(status,output,execution_id,error_code,completed_at,evidence) ON orqaly.solution_invocations TO orqaly_worker;
-- Cross-tenant discovery is only this bounded claim. All subsequent operations
-- use the returned tenant/owner through forced RLS. No effects inside the RPC.
CREATE FUNCTION orqaly.claim_solution_schedule(token uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,orqaly AS $$
DECLARE candidate orqaly.solution_schedules;
BEGIN
 IF token IS NULL THEN RAISE EXCEPTION 'claim token required'; END IF;
 SELECT * INTO candidate FROM orqaly.solution_schedules WHERE status='active' AND next_run_at<=clock_timestamp()
  AND (lease_expires_at IS NULL OR lease_expires_at<clock_timestamp()) ORDER BY next_run_at,id LIMIT 1 FOR UPDATE SKIP LOCKED;
 IF NOT FOUND THEN RETURN NULL; END IF;
 UPDATE orqaly.solution_schedules SET lease_token=token,lease_expires_at=clock_timestamp()+interval '3 minutes',row_version=row_version+1 WHERE tenant_id=candidate.tenant_id AND id=candidate.id;
 RETURN jsonb_build_object('tenantId',candidate.tenant_id,'userId',candidate.owner_user_id,'solutionId',candidate.solution_id,'scheduleId',candidate.id,'leaseToken',token);
END; $$;
REVOKE ALL ON FUNCTION orqaly.claim_solution_schedule(uuid),orqaly.guard_solution_schedule_update(),orqaly.guard_solution_schedule_tick_update() FROM PUBLIC;
REVOKE ALL ON FUNCTION orqaly.stop_schedules_on_release_change() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION orqaly.claim_solution_schedule(uuid) TO orqaly_worker;
COMMIT;
