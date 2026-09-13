BEGIN;
-- Original request/envelope remains immutable. One optional, durable routing
-- phase may dispatch exactly one separately addressed native draft operation.
ALTER TABLE orqaly.solution_conversation_turns DROP CONSTRAINT solution_conversation_turns_mode_check;
ALTER TABLE orqaly.solution_conversation_turns DROP CONSTRAINT solution_conversation_turns_check;
ALTER TABLE orqaly.solution_conversation_turns ADD CONSTRAINT solution_conversation_turns_mode_check CHECK(mode IN ('auto','ask','change'));
ALTER TABLE orqaly.solution_conversation_turns ADD CONSTRAINT solution_conversation_turns_check CHECK((mode='ask' AND target_revision_id IS NULL) OR (mode IN ('auto','change') AND target_revision_id IS NOT NULL));
ALTER TABLE orqaly.solution_conversation_turns ADD COLUMN lifecycle jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(lifecycle)='object' AND octet_length(lifecycle::text)<=512000);

-- A no-traffic Cloud Run worker still runs its background loop. The legacy
-- claim entry point must never lease new requests before that worker retires.
-- All new API requests carry changeRequestId, including explicit ask/change
-- and proposal/continuation commands whose lifecycle starts empty.
CREATE OR REPLACE FUNCTION orqaly.claim_solution_conversation_turn(token uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,orqaly AS $$
DECLARE t orqaly.solution_conversation_turns%ROWTYPE;
BEGIN
  IF NOT pg_has_role(session_user,'orqaly_worker','member') OR token IS NULL THEN RAISE EXCEPTION 'worker lease required' USING ERRCODE='42501'; END IF;
  WITH candidate AS (
    SELECT tenant_id,id FROM orqaly.solution_conversation_turns WHERE status IN ('queued','running') AND next_at<=clock_timestamp()
      AND mode IN ('ask','change') AND lifecycle='{}'::jsonb AND NOT(context_snapshot ? 'changeRequestId')
      AND (lease_expires_at IS NULL OR lease_expires_at<=clock_timestamp())
    ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1
  ) UPDATE orqaly.solution_conversation_turns v SET status='running',lease_token=token,lease_expires_at=clock_timestamp()+interval '90 seconds',dispatch_count=LEAST(v.dispatch_count+1,100)
    FROM candidate c WHERE v.tenant_id=c.tenant_id AND v.id=c.id RETURNING v.* INTO t;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('tenantId',t.tenant_id,'userId',t.owner_user_id,'turnId',t.id,'leaseToken',token);
END $$;
REVOKE ALL ON FUNCTION orqaly.claim_solution_conversation_turn(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION orqaly.claim_solution_conversation_turn(uuid) TO orqaly_worker;

-- New workers understand both legacy messages and durable intent/design phases.
-- Selection, lease expiry and persisted owner scope are otherwise unchanged.
CREATE FUNCTION orqaly.claim_solution_conversation_turn_v2(token uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,orqaly AS $$
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
REVOKE ALL ON FUNCTION orqaly.claim_solution_conversation_turn_v2(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION orqaly.claim_solution_conversation_turn_v2(uuid) TO orqaly_worker;

CREATE FUNCTION orqaly.advance_solution_conversation_turn(turn_id uuid,token uuid,payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,orqaly AS $$
DECLARE t orqaly.solution_conversation_turns%ROWTYPE; DECLARE s orqaly.customer_solutions%ROWTYPE;
BEGIN
  IF NOT pg_has_role(session_user,'orqaly_worker','member') OR orqaly.current_tenant_id() IS NULL OR jsonb_typeof(payload) IS DISTINCT FROM 'object' OR octet_length(payload::text)>512000 THEN RAISE EXCEPTION 'worker scope required' USING ERRCODE='42501'; END IF;
  SELECT * INTO t FROM orqaly.solution_conversation_turns WHERE tenant_id=orqaly.current_tenant_id() AND id=turn_id;
  IF NOT FOUND OR t.owner_user_id IS DISTINCT FROM current_setting('orqaly.build_owner_user_id',true) THEN RAISE EXCEPTION 'conversation scope denied' USING ERRCODE='42501'; END IF;
  SELECT * INTO s FROM orqaly.customer_solutions WHERE tenant_id=t.tenant_id AND owner_user_id=t.owner_user_id AND id=t.solution_id FOR UPDATE;
  SELECT * INTO t FROM orqaly.solution_conversation_turns WHERE tenant_id=t.tenant_id AND id=turn_id FOR UPDATE;
  IF token IS NULL OR t.lease_token IS NULL OR t.lease_expires_at IS NULL OR t.status<>'running' OR t.lease_token IS DISTINCT FROM token OR t.lease_expires_at<=clock_timestamp() THEN RETURN jsonb_build_object('stale',true); END IF;
  IF t.mode<>'auto' OR t.lifecycle<>'{}'::jsonb OR payload->>'resolvedMode' IS DISTINCT FROM 'change' OR payload->>'phase' IS DISTINCT FROM 'designing' OR
    jsonb_typeof(payload->'request') IS DISTINCT FROM 'string' OR length(payload->>'request') NOT BETWEEN 1 AND 8000 OR
    payload->'envelope'->>'operationType' IS DISTINCT FROM 'PrepareSolutionV2' OR
    payload->'envelope'->'owner'->>'tenantId' IS DISTINCT FROM t.tenant_id::text OR
    payload->'envelope'->'owner'->>'userId' IS DISTINCT FROM t.owner_user_id OR
    payload->'envelope'->'workflow'->>'runId' IS DISTINCT FROM t.context_snapshot->'source'->>'runId' OR
    payload->'envelope'->'input'->>'buildRequestId' IS DISTINCT FROM t.id::text OR
    payload->'envelope'->'input'->'draft'->'workflow' IS DISTINCT FROM t.context_snapshot->'workflow' OR
    payload->'envelope'->'input'->'draft'->'spec' IS DISTINCT FROM t.context_snapshot->'spec' OR
    COALESCE(payload->'envelope'->>'canonicalInputHash','') !~ '^[a-f0-9]{64}$' OR
    COALESCE(payload->'envelope'->>'operationId','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' OR
    payload->'envelope'->>'operationId'=t.operation_id::text THEN RAISE EXCEPTION 'invalid conversation design transition' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS(SELECT 1 FROM orqaly.tenants WHERE id=t.tenant_id AND status='active') THEN
    UPDATE orqaly.solution_conversation_turns SET status='blocked',error_code='TENANT_SUSPENDED',completed_at=clock_timestamp(),lease_token=NULL,lease_expires_at=NULL WHERE tenant_id=t.tenant_id AND id=t.id;
    RETURN jsonb_build_object('status','blocked');
  END IF;
  UPDATE orqaly.solution_conversation_turns SET lifecycle=payload,status_url=NULL,next_at=clock_timestamp(),lease_token=NULL,lease_expires_at=NULL WHERE tenant_id=t.tenant_id AND id=t.id;
  RETURN jsonb_build_object('status','running','phase','designing');
END $$;
REVOKE ALL ON FUNCTION orqaly.advance_solution_conversation_turn(uuid,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION orqaly.advance_solution_conversation_turn(uuid,uuid,jsonb) TO orqaly_worker;

CREATE OR REPLACE FUNCTION orqaly.complete_solution_conversation_turn(turn_id uuid,token uuid,payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,orqaly AS $$
DECLARE t orqaly.solution_conversation_turns%ROWTYPE;
DECLARE s orqaly.customer_solutions%ROWTYPE;
DECLARE r orqaly.solution_revisions%ROWTYPE;
DECLARE active_hash text; DECLARE final_status text; DECLARE failure text; DECLARE draft_id uuid; DECLARE candidate jsonb; DECLARE version_no integer; DECLARE authoritative_workflow jsonb; DECLARE authoritative_spec jsonb; DECLARE dependency jsonb; DECLARE previous_dependency jsonb;
BEGIN
  IF NOT pg_has_role(session_user,'orqaly_worker','member') OR orqaly.current_tenant_id() IS NULL OR jsonb_typeof(payload) IS DISTINCT FROM 'object' OR octet_length(payload::text)>512000 THEN RAISE EXCEPTION 'worker scope required' USING ERRCODE='42501'; END IF;
  SELECT * INTO t FROM orqaly.solution_conversation_turns WHERE tenant_id=orqaly.current_tenant_id() AND id=turn_id;
  IF NOT FOUND OR t.owner_user_id IS DISTINCT FROM current_setting('orqaly.build_owner_user_id',true) THEN RAISE EXCEPTION 'conversation scope denied' USING ERRCODE='42501'; END IF;
  -- Parent -> turn -> revision ordering matches request admission and editor.
  SELECT * INTO s FROM orqaly.customer_solutions WHERE tenant_id=t.tenant_id AND owner_user_id=t.owner_user_id AND id=t.solution_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'conversation solution unavailable' USING ERRCODE='42501'; END IF;
  SELECT * INTO t FROM orqaly.solution_conversation_turns WHERE tenant_id=t.tenant_id AND id=turn_id FOR UPDATE;
  IF token IS NULL OR t.lease_token IS NULL OR t.lease_expires_at IS NULL OR t.status<>'running' OR t.lease_token IS DISTINCT FROM token OR t.lease_expires_at<=clock_timestamp() THEN RETURN jsonb_build_object('stale',true); END IF;
  IF payload ? 'lifecycle' THEN
    IF t.mode<>'auto' OR t.lifecycle<>'{}'::jsonb OR jsonb_typeof(payload->'lifecycle') IS DISTINCT FROM 'object' OR octet_length((payload->'lifecycle')::text)>512000 OR (payload->'lifecycle' ? 'envelope') OR
      NOT (payload->'lifecycle' ? 'resolvedMode') OR (payload->'lifecycle'->>'resolvedMode' IS NOT NULL AND payload->'lifecycle'->>'resolvedMode' NOT IN ('ask','change')) OR
      jsonb_typeof(payload->'lifecycle'->'request') IS DISTINCT FROM 'string' OR length(payload->'lifecycle'->>'request') NOT BETWEEN 1 AND 8000 THEN RAISE EXCEPTION 'invalid conversation routing result' USING ERRCODE='42501'; END IF;
    UPDATE orqaly.solution_conversation_turns SET lifecycle=payload->'lifecycle' WHERE tenant_id=t.tenant_id AND id=t.id;
    t.lifecycle:=payload->'lifecycle';
  END IF;
  IF payload->>'status'='running' THEN
    UPDATE orqaly.solution_conversation_turns SET status_url=payload->>'statusUrl',next_at=clock_timestamp()+interval '2 seconds',lease_token=NULL,lease_expires_at=NULL WHERE tenant_id=t.tenant_id AND id=t.id;
    RETURN jsonb_build_object('status','running');
  END IF;
  final_status:=payload->>'status'; failure:=payload->>'errorCode';
  IF final_status IS NULL OR final_status NOT IN ('completed','blocked','failed') OR octet_length((payload->'result')::text)>256000 OR octet_length((payload->'reply')::text)>80000 OR octet_length((payload->'model')::text)>4000 THEN RAISE EXCEPTION 'invalid conversation result' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS(SELECT 1 FROM orqaly.tenants WHERE id=t.tenant_id AND status='active') THEN final_status:='blocked'; failure:='TENANT_SUSPENDED'; END IF;
  active_hash:=s.workflow_hash;
  authoritative_workflow:=s.workflow;
  authoritative_spec:=s.spec;
  IF s.active_revision_id IS NOT NULL THEN SELECT workflow_hash,workflow,spec INTO active_hash,authoritative_workflow,authoritative_spec FROM orqaly.solution_revisions WHERE tenant_id=t.tenant_id AND solution_id=s.id AND id=s.active_revision_id AND owner_user_id=t.owner_user_id AND status='active'; END IF;
  IF final_status='completed' AND (t.mode='change' OR (t.mode='auto' AND (t.lifecycle->>'resolvedMode'='change' OR t.envelope->>'operationType'='PrepareSolutionV2'))) THEN
    IF s.row_version<>(t.command->>'expectedSolutionVersion')::integer OR active_hash IS DISTINCT FROM t.command->>'workflowHash' OR s.active_revision_id IS DISTINCT FROM (t.context_snapshot->>'activeRevisionId')::uuid THEN
      final_status:='blocked'; failure:='SOLUTION_CONVERSATION_CONFLICT';
    ELSE
      SELECT * INTO r FROM orqaly.solution_revisions WHERE tenant_id=t.tenant_id AND owner_user_id=t.owner_user_id AND solution_id=s.id AND status IN ('draft','reviewed') FOR UPDATE;
      IF (t.command ? 'draft') AND (NOT FOUND OR r.id IS DISTINCT FROM t.target_revision_id OR r.id IS DISTINCT FROM (t.command->'draft'->>'id')::uuid OR r.row_version IS DISTINCT FROM (t.command->'draft'->>'rowVersion')::integer OR r.workflow_hash IS DISTINCT FROM t.command->'draft'->>'workflowHash') THEN
        final_status:='blocked'; failure:='SOLUTION_CONVERSATION_CONFLICT';
      ELSIF NOT(t.command ? 'draft') AND FOUND THEN final_status:='blocked'; failure:='DRAFT_SELECTION_REQUIRED'; END IF;
      IF final_status='completed' AND t.command ? 'draft' THEN authoritative_workflow:=r.workflow; authoritative_spec:=r.spec; END IF;
    END IF;
    IF final_status='completed' THEN
      candidate:=payload->'candidate';
      IF jsonb_typeof(candidate->'workflow') IS DISTINCT FROM 'object' OR jsonb_typeof(candidate->'workflow'->'nodes') IS DISTINCT FROM 'array' OR jsonb_typeof(candidate->'spec'->'connections') IS DISTINCT FROM 'array' OR candidate->'spec'->>'kind' IS DISTINCT FROM 'n8n_workflow_v2' OR COALESCE(candidate->>'workflowHash','') !~ '^[a-f0-9]{64}$' OR candidate->>'validated' IS DISTINCT FROM 'true' OR
        (candidate->'spec'->'connections' IS DISTINCT FROM t.context_snapshot->'spec'->'connections' AND candidate->>'connectionSetupRequired' IS DISTINCT FROM 'true') OR
        (candidate->>'connectionSetupRequired'='true' AND EXISTS(SELECT 1 FROM jsonb_array_elements(candidate->'workflow'->'nodes') n WHERE n ? 'credentials')) OR
        EXISTS(SELECT 1 FROM jsonb_array_elements(candidate->'workflow'->'nodes') proposed WHERE proposed ? 'credentials' AND NOT EXISTS(
          SELECT 1 FROM jsonb_array_elements(authoritative_workflow->'nodes') previous,
            jsonb_array_elements(candidate->'spec'->'connections') requirement,
            jsonb_array_elements_text(requirement->'nodeIds') connected_id
          WHERE proposed->>'id'=connected_id AND previous->>'id'=connected_id AND proposed->'credentials'=previous->'credentials'
        )) THEN
        RAISE EXCEPTION 'invalid non-executing native proposal' USING ERRCODE='42501';
      END IF;
      -- Linked workflow credentials have the same authority boundary as the
      -- primary graph. A private child selector must come from the exact current
      -- owned child, never from model output or another workflow's metadata.
      FOR dependency IN SELECT * FROM jsonb_array_elements(COALESCE(candidate->'spec'->'ownedDependencies','[]'::jsonb)) LOOP
        SELECT item INTO previous_dependency FROM jsonb_array_elements(COALESCE(authoritative_spec->'ownedDependencies','[]'::jsonb)) item
          WHERE item->>'id'=dependency->>'id' AND item->>'kind'=dependency->>'kind';
        IF jsonb_typeof(dependency->'workflow'->'nodes') IS DISTINCT FROM 'array' OR jsonb_typeof(dependency->'spec'->'connections') IS DISTINCT FROM 'array' OR
          (dependency->'spec'->'connections' IS DISTINCT FROM previous_dependency->'spec'->'connections' AND candidate->>'connectionSetupRequired' IS DISTINCT FROM 'true') OR
          EXISTS(SELECT 1 FROM jsonb_array_elements(dependency->'workflow'->'nodes') proposed WHERE proposed ? 'credentials' AND
            (candidate->>'connectionSetupRequired'='true' OR NOT EXISTS(
              SELECT 1 FROM jsonb_array_elements(COALESCE(previous_dependency->'workflow'->'nodes','[]'::jsonb)) previous,
                jsonb_array_elements(dependency->'spec'->'connections') requirement,
                jsonb_array_elements_text(requirement->'nodeIds') connected_id
              WHERE proposed->>'id'=connected_id AND previous->>'id'=connected_id AND proposed->'credentials'=previous->'credentials' AND
                jsonb_build_object('type',proposed->'type','typeVersion',proposed->'typeVersion','parameters',proposed->'parameters')=
                jsonb_build_object('type',previous->'type','typeVersion',previous->'typeVersion','parameters',previous->'parameters')
            ))) THEN RAISE EXCEPTION 'invalid owned child credential proposal' USING ERRCODE='42501'; END IF;
      END LOOP;
      -- Every connected node keeps exact declared settings. Existing release
      -- review/test binds current owned credentials separately, never from this
      -- candidate. Pure mapping edits around an unchanged connector are valid.
      IF candidate->>'connectionSetupRequired' IS DISTINCT FROM 'true' AND EXISTS(
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
          VALUES(t.tenant_id,s.id,t.target_revision_id,t.owner_user_id,version_no,s.active_revision_id,(t.context_snapshot->>'activeVersion')::integer,COALESCE(t.context_snapshot->'authoritativeWorkflow',t.context_snapshot->'workflow'),COALESCE(t.context_snapshot->'authoritativeSpec',t.context_snapshot->'spec'),candidate->'workflow',candidate->>'workflowHash',candidate->'spec');
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

COMMIT;
