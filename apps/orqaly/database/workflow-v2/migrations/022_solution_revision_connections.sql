BEGIN;

-- Revision credentials are distinct from original Build credentials. The member
-- registry gives child-graph metadata a real owner/revision/member foreign key.
CREATE TABLE orqaly.solution_revision_connection_members (
  tenant_id uuid NOT NULL, solution_id uuid NOT NULL, revision_id uuid NOT NULL,
  owner_user_id text NOT NULL, member_id text NOT NULL CHECK (length(member_id)<=120),
  PRIMARY KEY (tenant_id,solution_id,revision_id,owner_user_id,member_id),
  FOREIGN KEY (tenant_id,solution_id,revision_id,owner_user_id)
    REFERENCES orqaly.solution_revisions(tenant_id,solution_id,id,owner_user_id)
);
CREATE TABLE orqaly.solution_revision_connections (
  tenant_id uuid NOT NULL, solution_id uuid NOT NULL, revision_id uuid NOT NULL,
  owner_user_id text NOT NULL, id uuid NOT NULL, member_id text NOT NULL,
  requirement_id text NOT NULL CHECK (length(requirement_id) BETWEEN 1 AND 320),
  member_requirement_id text NOT NULL CHECK (length(member_requirement_id) BETWEEN 1 AND 120),
  environment_id text NOT NULL CHECK (length(environment_id) BETWEEN 1 AND 200),
  credential_type text NOT NULL CHECK (credential_type='orqalyBoundedHttp'),
  scope jsonb NOT NULL CHECK (jsonb_typeof(scope)='object' AND octet_length(scope::text)<=32000),
  scope_hash char(64) NOT NULL CHECK (scope_hash ~ '^[a-f0-9]{64}$'),
  provider_credential_id text CHECK (provider_credential_id ~ '^[A-Za-z0-9_-]{1,200}$'),
  request_key text NOT NULL CHECK (request_key ~ '^[A-Za-z0-9_-]{8,160}$'),
  request_hash char(64) NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  status text NOT NULL CHECK (status IN ('creating','saved','create_unknown','revoking','revoke_unknown','revoked')),
  row_version integer NOT NULL DEFAULT 0 CHECK (row_version>=0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(), revoked_at timestamptz,
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,solution_id,revision_id,owner_user_id,id),
  UNIQUE (tenant_id,solution_id,revision_id,request_key),
  FOREIGN KEY (tenant_id,solution_id,revision_id,owner_user_id,member_id)
    REFERENCES orqaly.solution_revision_connection_members(tenant_id,solution_id,revision_id,owner_user_id,member_id),
  CHECK (requirement_id=CASE WHEN member_id='' THEN member_requirement_id ELSE 'owned:'||member_id||':'||member_requirement_id END),
  CHECK (status<>'saved' OR provider_credential_id IS NOT NULL),
  CHECK ((status='revoked')=(revoked_at IS NOT NULL))
);
CREATE INDEX solution_revision_connections_owner_idx ON orqaly.solution_revision_connections
  (tenant_id,owner_user_id,solution_id,revision_id,created_at DESC);
CREATE INDEX solution_revision_connections_member_idx ON orqaly.solution_revision_connections
  (tenant_id,solution_id,revision_id,owner_user_id,member_id);
CREATE UNIQUE INDEX solution_revision_connections_requirement_idx ON orqaly.solution_revision_connections
  (tenant_id,solution_id,revision_id,requirement_id) WHERE status<>'revoked';
CREATE TABLE orqaly.solution_revision_connection_operations (
  tenant_id uuid NOT NULL, solution_id uuid NOT NULL, revision_id uuid NOT NULL,
  owner_user_id text NOT NULL, connection_id uuid NOT NULL,
  request_key text NOT NULL CHECK (request_key ~ '^[A-Za-z0-9_-]{8,160}$'),
  request_hash char(64) NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  status text NOT NULL CHECK (status IN ('pending','unknown','done')),
  attempts integer NOT NULL DEFAULT 1 CHECK (attempts BETWEEN 1 AND 5),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id,solution_id,revision_id,request_key),
  FOREIGN KEY (tenant_id,solution_id,revision_id,owner_user_id,connection_id)
    REFERENCES orqaly.solution_revision_connections(tenant_id,solution_id,revision_id,owner_user_id,id)
);
CREATE INDEX solution_revision_connection_operations_connection_idx ON orqaly.solution_revision_connection_operations
  (tenant_id,solution_id,revision_id,owner_user_id,connection_id);

CREATE FUNCTION orqaly.guard_revision_connection_binding() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE r orqaly.solution_revisions%ROWTYPE; selected_workflow jsonb; selected_spec jsonb;
  requirement jsonb; target jsonb; node jsonb;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF (to_jsonb(NEW)-ARRAY['status','provider_credential_id','row_version','updated_at','revoked_at'])
      IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','provider_credential_id','row_version','updated_at','revoked_at'])
      OR NEW.row_version<>OLD.row_version+1 OR OLD.status='revoked'
      OR (OLD.provider_credential_id IS NOT NULL AND NEW.provider_credential_id IS DISTINCT FROM OLD.provider_credential_id)
      OR (NEW.status<>OLD.status AND NOT (
        (OLD.status='creating' AND NEW.status IN ('saved','create_unknown','revoking')) OR
        (OLD.status IN ('saved','create_unknown','revoke_unknown') AND NEW.status='revoking') OR
        (OLD.status='revoking' AND NEW.status IN ('revoked','revoke_unknown')))) THEN
      RAISE EXCEPTION 'revision_connection_immutable' USING ERRCODE='42501';
    END IF;
    RETURN NEW;
  END IF;
  SELECT * INTO r FROM orqaly.solution_revisions WHERE tenant_id=NEW.tenant_id
    AND solution_id=NEW.solution_id AND id=NEW.revision_id AND owner_user_id=NEW.owner_user_id;
  IF r.id IS NULL OR r.status NOT IN ('draft','reviewed') OR NEW.status<>'creating'
    OR NEW.provider_credential_id IS NOT NULL OR NEW.row_version<>0 OR NEW.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'revision_connection_draft_required' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM orqaly.customer_solutions s JOIN orqaly.tenants t ON t.id=s.tenant_id
    WHERE s.tenant_id=NEW.tenant_id AND s.owner_user_id=NEW.owner_user_id AND s.id=NEW.solution_id
      AND s.environment_id=NEW.environment_id AND t.status='active') THEN
    RAISE EXCEPTION 'revision_connection_environment_denied' USING ERRCODE='42501';
  END IF;
  selected_workflow:=r.workflow; selected_spec:=COALESCE(r.spec,r.base_spec);
  IF NEW.member_id<>'' THEN
    SELECT d->'workflow',d->'spec' INTO selected_workflow,selected_spec
      FROM jsonb_array_elements(COALESCE(selected_spec->'ownedDependencies','[]'::jsonb)) d
      WHERE d->>'id'=NEW.member_id;
  END IF;
  SELECT q INTO requirement FROM jsonb_array_elements(COALESCE(selected_spec->'connections','[]'::jsonb)) q
    WHERE q->>'id'=NEW.member_requirement_id AND q->>'credentialType'=NEW.credential_type;
  IF requirement IS NULL OR jsonb_array_length(requirement->'nodeIds')<>1
    OR jsonb_array_length(NEW.scope->'targets')<>1 OR NEW.scope->>'credentialType'<>NEW.credential_type THEN
    RAISE EXCEPTION 'revision_connection_member_denied' USING ERRCODE='42501';
  END IF;
  target:=NEW.scope->'targets'->0;
  SELECT n INTO node FROM jsonb_array_elements(selected_workflow->'nodes') n
    WHERE n->>'id'=requirement->'nodeIds'->>0;
  IF node IS NULL OR node->>'type'<>'CUSTOM.boundedHttp' OR node->>'typeVersion'<>'1'
    OR node->'parameters'->>'method'<>'POST' OR target->>'nodeId' IS DISTINCT FROM node->>'id'
    OR target->>'destination' IS DISTINCT FROM node->'parameters'->>'url'
    OR target->>'method'<>'POST' OR target->>'typeVersion'<>'1' OR target->>'transportVersion'<>'1' THEN
    RAISE EXCEPTION 'revision_connection_scope_denied' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER revision_connection_binding_guard BEFORE INSERT OR UPDATE ON orqaly.solution_revision_connections
  FOR EACH ROW EXECUTE FUNCTION orqaly.guard_revision_connection_binding();

CREATE FUNCTION orqaly.guard_revision_connection_operation() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.status<>'pending' OR NEW.attempts<>1 THEN
      RAISE EXCEPTION 'revision_connection_operation_initial_state' USING ERRCODE='42501';
    END IF;
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW)-ARRAY['status','attempts','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','attempts','updated_at'])
    OR OLD.status='done' OR NEW.attempts<OLD.attempts OR NEW.attempts>OLD.attempts+1 THEN
    RAISE EXCEPTION 'revision_connection_operation_immutable' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER revision_connection_operation_guard BEFORE INSERT OR UPDATE ON orqaly.solution_revision_connection_operations
  FOR EACH ROW EXECUTE FUNCTION orqaly.guard_revision_connection_operation();
CREATE FUNCTION orqaly.guard_revision_connection_pending() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
  IF EXISTS (SELECT 1 FROM orqaly.solution_revision_connections c WHERE c.tenant_id=OLD.tenant_id
    AND c.solution_id=OLD.solution_id AND c.revision_id=OLD.id AND c.status IN ('creating','revoking')) THEN
    RAISE EXCEPTION 'revision_connection_pending' USING ERRCODE='40001';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER revision_connection_pending_guard BEFORE UPDATE ON orqaly.solution_revisions
  FOR EACH ROW EXECUTE FUNCTION orqaly.guard_revision_connection_pending();
REVOKE ALL ON FUNCTION orqaly.guard_revision_connection_binding() FROM PUBLIC;
REVOKE ALL ON FUNCTION orqaly.guard_revision_connection_operation() FROM PUBLIC;
REVOKE ALL ON FUNCTION orqaly.guard_revision_connection_pending() FROM PUBLIC;

DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['solution_revision_connection_members','solution_revision_connections','solution_revision_connection_operations'] LOOP
    EXECUTE format('ALTER TABLE orqaly.%I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE orqaly.%I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('CREATE POLICY %I ON orqaly.%I TO orqaly_api,orqaly_worker USING (tenant_id=(SELECT orqaly.current_tenant_id()) AND owner_user_id=current_setting(''orqaly.build_owner_user_id'',true)) WITH CHECK (tenant_id=(SELECT orqaly.current_tenant_id()) AND owner_user_id=current_setting(''orqaly.build_owner_user_id'',true))',table_name||'_owner',table_name);
    EXECUTE format('GRANT SELECT ON orqaly.%I TO orqaly_api,orqaly_worker',table_name);
    EXECUTE format('GRANT INSERT ON orqaly.%I TO orqaly_api',table_name);
  END LOOP;
END $$;
GRANT UPDATE(status,provider_credential_id,row_version,updated_at,revoked_at)
  ON orqaly.solution_revision_connections TO orqaly_api;
GRANT UPDATE(status,attempts,updated_at) ON orqaly.solution_revision_connection_operations TO orqaly_api;

COMMIT;
