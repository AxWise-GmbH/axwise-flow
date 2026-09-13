BEGIN;

-- One immutable user message + exact model envelope/context per turn. Replies
-- and model accounting are durable. Nothing here grants execution authority.
CREATE TABLE orqaly.solution_conversation_turns (
  tenant_id uuid NOT NULL,
  solution_id uuid NOT NULL,
  id uuid NOT NULL,
  owner_user_id text NOT NULL CHECK (owner_user_id ~ '^user_[A-Za-z0-9]+$'),
  mode text NOT NULL CHECK (mode IN ('ask','change')),
  message text NOT NULL CHECK (length(message) BETWEEN 1 AND 8000),
  request_key text NOT NULL CHECK (length(request_key) BETWEEN 8 AND 160),
  request_hash char(64) NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  command jsonb NOT NULL CHECK (octet_length(command::text)<=16000),
  context_snapshot jsonb NOT NULL CHECK (octet_length(context_snapshot::text)<=768000),
  context_hash char(64) NOT NULL CHECK (context_hash ~ '^[a-f0-9]{64}$'),
  operation_id uuid NOT NULL,
  envelope jsonb NOT NULL CHECK (octet_length(envelope::text)<=256000),
  target_revision_id uuid,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','blocked','failed')),
  status_url text,
  reply jsonb,
  model jsonb,
  result jsonb CHECK (octet_length(result::text)<=256000),
  draft_revision_id uuid,
  error_code text,
  dispatch_count integer NOT NULL DEFAULT 0 CHECK (dispatch_count BETWEEN 0 AND 100),
  next_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  lease_token uuid,
  lease_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  PRIMARY KEY(tenant_id,id),
  UNIQUE(tenant_id,solution_id,request_key),
  UNIQUE(operation_id),
  FOREIGN KEY(tenant_id,solution_id) REFERENCES orqaly.customer_solutions(tenant_id,id),
  FOREIGN KEY(tenant_id,solution_id,draft_revision_id) REFERENCES orqaly.solution_revisions(tenant_id,solution_id,id),
  CHECK ((mode='ask' AND target_revision_id IS NULL) OR (mode='change' AND target_revision_id IS NOT NULL))
);
CREATE UNIQUE INDEX solution_conversation_one_pending ON orqaly.solution_conversation_turns(tenant_id,solution_id)
  WHERE status IN ('queued','running');
CREATE INDEX solution_conversation_owner_history ON orqaly.solution_conversation_turns(tenant_id,owner_user_id,solution_id,created_at DESC,id);
CREATE INDEX solution_conversation_claim ON orqaly.solution_conversation_turns(next_at,created_at,id) WHERE status IN ('queued','running');
ALTER TABLE orqaly.solution_conversation_turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE orqaly.solution_conversation_turns FORCE ROW LEVEL SECURITY;
CREATE POLICY solution_conversation_scope ON orqaly.solution_conversation_turns TO orqaly_api,orqaly_worker
  USING(tenant_id=orqaly.current_tenant_id() AND owner_user_id=current_setting('orqaly.build_owner_user_id',true))
  WITH CHECK(tenant_id=orqaly.current_tenant_id() AND owner_user_id=current_setting('orqaly.build_owner_user_id',true));
CREATE POLICY solution_conversation_rpc ON orqaly.solution_conversation_turns
  USING(current_user=orqaly.rpc_owner_name()) WITH CHECK(current_user=orqaly.rpc_owner_name());
GRANT SELECT ON orqaly.solution_conversation_turns TO orqaly_api;
GRANT INSERT(tenant_id,solution_id,id,owner_user_id,mode,message,request_key,request_hash,command,context_snapshot,context_hash,operation_id,envelope,target_revision_id) ON orqaly.solution_conversation_turns TO orqaly_api;
GRANT SELECT ON orqaly.solution_conversation_turns TO orqaly_worker;
REVOKE UPDATE,DELETE,TRUNCATE ON orqaly.solution_conversation_turns FROM orqaly_api,orqaly_worker;

CREATE FUNCTION orqaly.guard_solution_conversation_turn() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF (NEW.tenant_id,NEW.solution_id,NEW.id,NEW.owner_user_id,NEW.mode,NEW.message,NEW.request_key,NEW.request_hash,NEW.command,NEW.context_snapshot,NEW.context_hash,NEW.operation_id,NEW.envelope,NEW.target_revision_id,NEW.created_at)
    IS DISTINCT FROM
    (OLD.tenant_id,OLD.solution_id,OLD.id,OLD.owner_user_id,OLD.mode,OLD.message,OLD.request_key,OLD.request_hash,OLD.command,OLD.context_snapshot,OLD.context_hash,OLD.operation_id,OLD.envelope,OLD.target_revision_id,OLD.created_at) THEN
    RAISE EXCEPTION 'conversation_request_immutable' USING ERRCODE='42501';
  END IF;
  IF OLD.status IN ('completed','blocked','failed') THEN RAISE EXCEPTION 'conversation_result_immutable' USING ERRCODE='42501'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER solution_conversation_guard BEFORE UPDATE ON orqaly.solution_conversation_turns FOR EACH ROW EXECUTE FUNCTION orqaly.guard_solution_conversation_turn();

-- Cross-owner selection happens only here. Callers cannot nominate another
-- tenant's turn; returned scopes originate in the persisted API-owned request.
CREATE FUNCTION orqaly.claim_solution_conversation_turn(token uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,orqaly AS $$
DECLARE t orqaly.solution_conversation_turns%ROWTYPE;
BEGIN
  IF NOT pg_has_role(session_user,'orqaly_worker','member') OR token IS NULL THEN RAISE EXCEPTION 'worker lease required' USING ERRCODE='42501'; END IF;
  WITH candidate AS (
    SELECT tenant_id,id FROM orqaly.solution_conversation_turns WHERE status IN ('queued','running') AND next_at<=clock_timestamp()
      AND (lease_expires_at IS NULL OR lease_expires_at<=clock_timestamp())
    ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1
  ) UPDATE orqaly.solution_conversation_turns v SET status='running',lease_token=token,lease_expires_at=clock_timestamp()+interval '90 seconds',dispatch_count=LEAST(v.dispatch_count+1,100)
    FROM candidate c WHERE v.tenant_id=c.tenant_id AND v.id=c.id RETURNING v.* INTO t;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('tenantId',t.tenant_id,'userId',t.owner_user_id,'turnId',t.id,'leaseToken',token);
END $$;
REVOKE ALL ON FUNCTION orqaly.claim_solution_conversation_turn(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION orqaly.claim_solution_conversation_turn(uuid) TO orqaly_worker;

-- The worker receives no general revision write grant. This function can save
-- only a draft nominated by an immutable, user-authorized change turn, after a
-- fresh parent/base/draft CAS. It cannot approve, deploy, test or activate.
CREATE POLICY customer_solutions_conversation_rpc ON orqaly.customer_solutions
  USING(current_user=orqaly.rpc_owner_name() AND tenant_id=orqaly.current_tenant_id() AND owner_user_id=current_setting('orqaly.build_owner_user_id',true));
CREATE POLICY solution_revisions_conversation_rpc ON orqaly.solution_revisions
  USING(current_user=orqaly.rpc_owner_name() AND tenant_id=orqaly.current_tenant_id() AND owner_user_id=current_setting('orqaly.build_owner_user_id',true))
  WITH CHECK(current_user=orqaly.rpc_owner_name() AND tenant_id=orqaly.current_tenant_id() AND owner_user_id=current_setting('orqaly.build_owner_user_id',true));
CREATE POLICY solution_revision_events_conversation_rpc ON orqaly.solution_revision_events
  USING(current_user=orqaly.rpc_owner_name() AND tenant_id=orqaly.current_tenant_id() AND owner_user_id=current_setting('orqaly.build_owner_user_id',true))
  WITH CHECK(current_user=orqaly.rpc_owner_name() AND tenant_id=orqaly.current_tenant_id() AND owner_user_id=current_setting('orqaly.build_owner_user_id',true));

CREATE FUNCTION orqaly.complete_solution_conversation_turn(turn_id uuid,token uuid,payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,orqaly AS $$
DECLARE t orqaly.solution_conversation_turns%ROWTYPE;
DECLARE s orqaly.customer_solutions%ROWTYPE;
DECLARE r orqaly.solution_revisions%ROWTYPE;
DECLARE active_hash text; DECLARE final_status text; DECLARE failure text; DECLARE draft_id uuid; DECLARE candidate jsonb; DECLARE version_no integer; DECLARE authoritative_workflow jsonb;
BEGIN
  IF NOT pg_has_role(session_user,'orqaly_worker','member') OR orqaly.current_tenant_id() IS NULL OR jsonb_typeof(payload) IS DISTINCT FROM 'object' OR octet_length(payload::text)>512000 THEN RAISE EXCEPTION 'worker scope required' USING ERRCODE='42501'; END IF;
  SELECT * INTO t FROM orqaly.solution_conversation_turns WHERE tenant_id=orqaly.current_tenant_id() AND id=turn_id;
  IF NOT FOUND OR t.owner_user_id IS DISTINCT FROM current_setting('orqaly.build_owner_user_id',true) THEN RAISE EXCEPTION 'conversation scope denied' USING ERRCODE='42501'; END IF;
  -- Parent -> turn -> revision ordering matches request admission and editor.
  SELECT * INTO s FROM orqaly.customer_solutions WHERE tenant_id=t.tenant_id AND owner_user_id=t.owner_user_id AND id=t.solution_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'conversation solution unavailable' USING ERRCODE='42501'; END IF;
  SELECT * INTO t FROM orqaly.solution_conversation_turns WHERE tenant_id=t.tenant_id AND id=turn_id FOR UPDATE;
  IF token IS NULL OR t.lease_token IS NULL OR t.lease_expires_at IS NULL OR t.status<>'running' OR t.lease_token IS DISTINCT FROM token OR t.lease_expires_at<=clock_timestamp() THEN RETURN jsonb_build_object('stale',true); END IF;
  IF payload->>'status'='running' THEN
    UPDATE orqaly.solution_conversation_turns SET status_url=payload->>'statusUrl',next_at=clock_timestamp()+interval '2 seconds',lease_token=NULL,lease_expires_at=NULL WHERE tenant_id=t.tenant_id AND id=t.id;
    RETURN jsonb_build_object('status','running');
  END IF;
  final_status:=payload->>'status'; failure:=payload->>'errorCode';
  IF final_status IS NULL OR final_status NOT IN ('completed','blocked','failed') OR octet_length((payload->'result')::text)>256000 OR octet_length((payload->'reply')::text)>80000 OR octet_length((payload->'model')::text)>4000 THEN RAISE EXCEPTION 'invalid conversation result' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS(SELECT 1 FROM orqaly.tenants WHERE id=t.tenant_id AND status='active') THEN final_status:='blocked'; failure:='TENANT_SUSPENDED'; END IF;
  active_hash:=s.workflow_hash;
  authoritative_workflow:=s.workflow;
  IF s.active_revision_id IS NOT NULL THEN SELECT workflow_hash,workflow INTO active_hash,authoritative_workflow FROM orqaly.solution_revisions WHERE tenant_id=t.tenant_id AND solution_id=s.id AND id=s.active_revision_id AND owner_user_id=t.owner_user_id AND status='active'; END IF;
  IF final_status='completed' AND t.mode='change' THEN
    IF s.row_version<>(t.command->>'expectedSolutionVersion')::integer OR active_hash IS DISTINCT FROM t.command->>'workflowHash' OR s.active_revision_id IS DISTINCT FROM (t.context_snapshot->>'activeRevisionId')::uuid THEN
      final_status:='blocked'; failure:='SOLUTION_CONVERSATION_CONFLICT';
    ELSE
      SELECT * INTO r FROM orqaly.solution_revisions WHERE tenant_id=t.tenant_id AND owner_user_id=t.owner_user_id AND solution_id=s.id AND status IN ('draft','reviewed') FOR UPDATE;
      IF (t.command ? 'draft') AND (NOT FOUND OR r.id IS DISTINCT FROM t.target_revision_id OR r.id IS DISTINCT FROM (t.command->'draft'->>'id')::uuid OR r.row_version IS DISTINCT FROM (t.command->'draft'->>'rowVersion')::integer OR r.workflow_hash IS DISTINCT FROM t.command->'draft'->>'workflowHash') THEN
        final_status:='blocked'; failure:='SOLUTION_CONVERSATION_CONFLICT';
      ELSIF NOT(t.command ? 'draft') AND FOUND THEN final_status:='blocked'; failure:='DRAFT_SELECTION_REQUIRED'; END IF;
      IF final_status='completed' AND t.command ? 'draft' THEN authoritative_workflow:=r.workflow; END IF;
    END IF;
    IF final_status='completed' THEN
      candidate:=payload->'candidate';
      IF jsonb_typeof(candidate->'workflow') IS DISTINCT FROM 'object' OR jsonb_typeof(candidate->'workflow'->'nodes') IS DISTINCT FROM 'array' OR jsonb_typeof(candidate->'spec'->'connections') IS DISTINCT FROM 'array' OR candidate->'spec'->>'kind' IS DISTINCT FROM 'n8n_workflow_v2' OR COALESCE(candidate->>'workflowHash','') !~ '^[a-f0-9]{64}$' OR candidate->>'validated' IS DISTINCT FROM 'true' OR
        candidate->'spec'->'connections' IS DISTINCT FROM t.context_snapshot->'spec'->'connections' OR
        EXISTS(SELECT 1 FROM jsonb_array_elements(candidate->'workflow'->'nodes') proposed WHERE proposed ? 'credentials' AND NOT EXISTS(
          SELECT 1 FROM jsonb_array_elements(authoritative_workflow->'nodes') previous,
            jsonb_array_elements(candidate->'spec'->'connections') requirement,
            jsonb_array_elements_text(requirement->'nodeIds') connected_id
          WHERE proposed->>'id'=connected_id AND previous->>'id'=connected_id AND proposed->'credentials'=previous->'credentials'
        )) THEN
        RAISE EXCEPTION 'invalid non-executing native proposal' USING ERRCODE='42501';
      END IF;
      -- Every connected node keeps exact declared settings. Existing release
      -- review/test binds current owned credentials separately, never from this
      -- candidate. Pure mapping edits around an unchanged connector are valid.
      IF EXISTS(
        SELECT 1 FROM jsonb_array_elements(candidate->'spec'->'connections') connection_requirement,
          jsonb_array_elements_text(connection_requirement->'nodeIds') connected_id
        WHERE NOT EXISTS(
          SELECT 1 FROM jsonb_array_elements(candidate->'workflow'->'nodes') proposed,
            jsonb_array_elements(authoritative_workflow->'nodes') previous
          WHERE proposed->>'id'=connected_id AND previous->>'id'=connected_id AND
            proposed->'credentials' IS NOT DISTINCT FROM previous->'credentials' AND
            jsonb_build_object('type',proposed->'type','typeVersion',proposed->'typeVersion','parameters',proposed->'parameters')=
            jsonb_build_object('type',previous->'type','typeVersion',previous->'typeVersion','parameters',previous->'parameters')
        )
      ) THEN final_status:='blocked'; failure:='CONVERSATION_CONNECTION_SETUP_REQUIRED';
      ELSIF t.command ? 'draft' THEN
        UPDATE orqaly.solution_revisions SET workflow=candidate->'workflow',workflow_hash=candidate->>'workflowHash',spec=candidate->'spec',status='draft',review=NULL,tested_at=NULL,row_version=row_version+1,updated_at=clock_timestamp()
          WHERE tenant_id=t.tenant_id AND id=t.target_revision_id AND solution_id=s.id AND owner_user_id=t.owner_user_id;
        draft_id:=t.target_revision_id;
      ELSE
        SELECT COALESCE(MAX(version),1)+1 INTO version_no FROM orqaly.solution_revisions WHERE tenant_id=t.tenant_id AND solution_id=s.id;
        INSERT INTO orqaly.solution_revisions(tenant_id,solution_id,id,owner_user_id,version,base_revision_id,base_version,base_workflow,base_spec,workflow,workflow_hash,spec)
          VALUES(t.tenant_id,s.id,t.target_revision_id,t.owner_user_id,version_no,s.active_revision_id,(t.context_snapshot->>'activeVersion')::integer,COALESCE(t.context_snapshot->'authoritativeWorkflow',t.context_snapshot->'workflow'),t.context_snapshot->'spec',candidate->'workflow',candidate->>'workflowHash',candidate->'spec');
        draft_id:=t.target_revision_id;
      END IF;
      IF draft_id IS NOT NULL THEN
        INSERT INTO orqaly.solution_revision_events(tenant_id,solution_id,revision_id,id,owner_user_id,kind,workflow_hash,details)
          VALUES(t.tenant_id,s.id,draft_id,t.id,t.owner_user_id,'saved',candidate->>'workflowHash',jsonb_build_object('conversationTurnId',t.id,'operationId',t.operation_id,'baseWorkflowHash',active_hash));
      END IF;
    END IF;
  END IF;
  UPDATE orqaly.solution_conversation_turns SET status=final_status,reply=payload->'reply',model=payload->'model',result=payload->'result',error_code=failure,draft_revision_id=draft_id,completed_at=clock_timestamp(),lease_token=NULL,lease_expires_at=NULL
    WHERE tenant_id=t.tenant_id AND id=t.id;
  RETURN jsonb_build_object('status',final_status,'draftRevisionId',draft_id,'errorCode',failure);
END $$;
REVOKE ALL ON FUNCTION orqaly.complete_solution_conversation_turn(uuid,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION orqaly.complete_solution_conversation_turn(uuid,uuid,jsonb) TO orqaly_worker;
COMMIT;
