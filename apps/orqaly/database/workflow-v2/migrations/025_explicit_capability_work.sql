-- Explicitly authorized by the owner on 2026-09-09: local migration 025 authoring
-- and verification in a NEW disposable PostgreSQL instance only. This file does
-- not authorize applying it to an existing database or enabling any feature.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Refuse an unknown baseline, a privileged runtime owner, or a partial rollout.
-- Historical migrations 001--024 are not edited or reapplied by this migration.
DO $$
DECLARE original record; role_name text;
BEGIN
  SELECT p.*, r.rolname, r.rolsuper, r.rolbypassrls, r.rolcanlogin
    INTO original FROM pg_proc AS p JOIN pg_roles AS r ON r.oid = p.proowner
   WHERE p.oid = 'orqaly.apply_transition(uuid,uuid,jsonb)'::regprocedure;
  IF original.rolname IS DISTINCT FROM current_user OR original.rolsuper OR
     original.rolbypassrls OR NOT original.prosecdef OR
     original.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, orqaly'] OR
     orqaly.sha256_text(original.prosrc) IS DISTINCT FROM
       'd80a1a623e3962a55d1fe4682aceeca2aa1b750b164758965746d83c502d3343' OR
     (SELECT proowner FROM pg_proc WHERE oid = 'orqaly.rpc_owner_name()'::regprocedure)
       IS DISTINCT FROM original.proowner THEN
    RAISE EXCEPTION 'capability migration requires the reviewed unprivileged RPC owner and original transition body'
      USING ERRCODE = '55000';
  END IF;
  IF EXISTS (SELECT 1 FROM aclexplode(COALESCE(original.proacl, acldefault('f', original.proowner)))
      WHERE privilege_type <> 'EXECUTE' OR is_grantable OR
        grantee NOT IN (original.proowner, 'orqaly_api'::regrole, 'orqaly_worker'::regrole)) OR
     NOT has_function_privilege('orqaly_api', original.oid, 'EXECUTE') OR
     NOT has_function_privilege('orqaly_worker', original.oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'original transition privileges differ from the reviewed baseline' USING ERRCODE = '55000';
  END IF;
  FOREACH role_name IN ARRAY ARRAY['orqaly_api','orqaly_worker','orqaly_identity'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name AND
        (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolcanlogin)) OR
       pg_has_role(role_name, original.proowner, 'MEMBER') OR
       has_schema_privilege(role_name, 'orqaly', 'CREATE') OR
       has_table_privilege(role_name, 'orqaly.workflow_runs', 'INSERT,UPDATE,DELETE,TRUNCATE') OR
       has_table_privilege(role_name, 'orqaly.stage_attempts', 'INSERT,UPDATE,DELETE,TRUNCATE') THEN
      RAISE EXCEPTION 'capability runtime role has unexpected authority' USING ERRCODE = '55000';
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_class WHERE oid IN (
      'orqaly.workflow_runs'::regclass, 'orqaly.workflow_stages'::regclass,
      'orqaly.workflow_stage_dependencies'::regclass, 'orqaly.stage_attempts'::regclass,
      'orqaly.approvals'::regclass, 'orqaly.artifacts'::regclass,
      'orqaly.artifact_lineage'::regclass, 'orqaly.workflow_events'::regclass,
      'orqaly.outbox_events'::regclass) AND (NOT relrowsecurity OR NOT relforcerowsecurity)) OR
     NOT EXISTS (SELECT 1 FROM pg_constraint WHERE
       conrelid = 'orqaly.workflow_runs'::regclass AND conname = 'workflow_runs_status_check'
       AND convalidated AND NOT connoinherit AND pg_get_constraintdef(oid) =
       'CHECK ((status = ANY (ARRAY[''requested''::text, ''running''::text, ''awaiting_gate_1''::text, ''awaiting_gate_2''::text, ''completed''::text, ''completed_with_evidence_gaps''::text, ''blocked''::text, ''failed''::text, ''cancelled''::text])))') OR
     to_regprocedure('orqaly.recover_attempt_lease(uuid,uuid,jsonb)') IS NULL OR
     to_regprocedure('orqaly.apply_transition_private_025(uuid,uuid,jsonb)') IS NOT NULL OR
     to_regprocedure('orqaly.apply_capability_transition(uuid,uuid,jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'capability migration baseline or rollout state differs' USING ERRCODE = '55000';
  END IF;
END
$$;

ALTER TABLE orqaly.workflow_runs DROP CONSTRAINT workflow_runs_status_check;
ALTER TABLE orqaly.workflow_runs ADD CONSTRAINT workflow_runs_status_check CHECK (status IN (
  'requested', 'running', 'awaiting_gate_1', 'awaiting_gate_2',
  'completed', 'completed_with_evidence_gaps', 'blocked', 'failed', 'cancelled',
  'awaiting_capability_input'
));
ALTER TABLE orqaly.workflow_runs ADD CONSTRAINT workflow_runs_capability_idle_check CHECK (
  status <> 'awaiting_capability_input' OR
  request_payload #>> '{workProfile,type}' IS NOT DISTINCT FROM 'capability_work_v1'
);

-- This serializer is deliberately used only for bounded, fixed-key identity
-- objects (profiles, references and consent), not arbitrary numeric source data.
CREATE FUNCTION orqaly.capability_identity_json_025(value jsonb)
RETURNS text LANGUAGE plpgsql IMMUTABLE STRICT
SET search_path = pg_catalog, orqaly
AS $$
DECLARE result text; item record;
BEGIN
  CASE jsonb_typeof(value)
    WHEN 'object' THEN
      SELECT '{' || COALESCE(string_agg(to_jsonb(key)::text || ':' ||
        orqaly.capability_identity_json_025(val), ',' ORDER BY key COLLATE "C"), '') || '}'
        INTO result FROM jsonb_each(value) AS fields(key, val);
    WHEN 'array' THEN
      SELECT '[' || COALESCE(string_agg(orqaly.capability_identity_json_025(val), ',' ORDER BY ord), '') || ']'
        INTO result FROM jsonb_array_elements(value) WITH ORDINALITY AS elements(val, ord);
    WHEN 'number' THEN
      IF value::text !~ '^-?[0-9]+$' OR abs(value::text::numeric) > 9007199254740991 THEN
        RAISE EXCEPTION 'identity serialization accepts only safe integers' USING ERRCODE = '22023';
      END IF;
      result := value::text;
    ELSE result := value::text;
  END CASE;
  RETURN result;
END
$$;
REVOKE ALL ON FUNCTION orqaly.capability_identity_json_025(jsonb) FROM PUBLIC;

-- Remove exactly one top-level member while preserving every other input byte.
-- A byte scanner, not a regexp replacement, avoids confusing nested similarly
-- named data or quoted source text with consent. Numeric source spellings remain
-- untouched: PostgreSQL's JSONB printer is not an RFC 8785 number serializer.
CREATE FUNCTION orqaly.capability_unsigned_input_025(canonical text, expected jsonb)
RETURNS text LANGUAGE plpgsql IMMUTABLE STRICT
SET search_path = pg_catalog, orqaly
AS $$
DECLARE
  bytes bytea := convert_to(canonical, 'UTF8'); size integer := octet_length(bytes);
  position integer; code integer; depth integer := 0; quoted boolean := false;
  escaped boolean := false; start_at integer := 1; member text; member_object jsonb;
  member_key text; seen text[] := ARRAY[]::text[]; kept text[] := ARRAY[]::text[];
  consent_count integer := 0;
BEGIN
  IF size NOT BETWEEN 2 AND 1000000 OR get_byte(bytes, 0) <> 123 OR
     get_byte(bytes, size - 1) <> 125 OR canonical::jsonb IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'capability canonical input bytes mismatch' USING ERRCODE = '22023';
  END IF;
  FOR position IN 0..size - 1 LOOP
    code := get_byte(bytes, position);
    IF quoted THEN
      IF escaped THEN escaped := false;
      ELSIF code = 92 THEN escaped := true;
      ELSIF code = 34 THEN quoted := false;
      END IF;
    ELSIF code = 34 THEN quoted := true;
    ELSIF code IN (123, 91) THEN depth := depth + 1;
    ELSIF code IN (125, 93) THEN depth := depth - 1;
    END IF;
    IF NOT quoted AND ((code = 44 AND depth = 1) OR (position = size - 1 AND depth = 0)) THEN
      member := convert_from(substring(bytes FROM start_at + 1 FOR position - start_at), 'UTF8');
      member_object := ('{' || member || '}')::jsonb;
      SELECT key INTO member_key FROM jsonb_object_keys(member_object) AS keys(key);
      IF member_key IS NULL OR member_key = ANY(seen) OR
         left(member, length(to_jsonb(member_key)::text) + 1) <> to_jsonb(member_key)::text || ':' THEN
        RAISE EXCEPTION 'duplicate or noncanonical top-level capability member' USING ERRCODE = '22023';
      END IF;
      seen := array_append(seen, member_key);
      IF member_key = 'processingConsent' THEN
        IF member IS DISTINCT FROM '"processingConsent":' ||
            orqaly.capability_identity_json_025(expected -> 'processingConsent') THEN
          RAISE EXCEPTION 'processing consent canonical bytes mismatch' USING ERRCODE = '22023';
        END IF;
        consent_count := consent_count + 1;
      ELSE kept := array_append(kept, member);
      END IF;
      start_at := position + 1;
    END IF;
  END LOOP;
  IF consent_count <> 1 OR quoted OR depth <> 0 OR seen IS DISTINCT FROM
      (SELECT array_agg(key ORDER BY key COLLATE "C") FROM jsonb_object_keys(expected) AS keys(key)) THEN
    RAISE EXCEPTION 'missing consent or noncanonical capability member ordering' USING ERRCODE = '22023';
  END IF;
  RETURN '{' || array_to_string(kept, ',') || '}';
END
$$;
REVOKE ALL ON FUNCTION orqaly.capability_unsigned_input_025(text,jsonb) FROM PUBLIC;

CREATE FUNCTION orqaly.capability_profile_valid_025(profile jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog, orqaly
AS $$
  SELECT COALESCE(jsonb_typeof(profile) = 'object' AND
    profile - ARRAY['type','capability','purpose','allowSimulationAnalysis','compilerNoticeVersion'] = '{}'::jsonb AND
    profile ?& ARRAY['type','capability','purpose','allowSimulationAnalysis','compilerNoticeVersion'] AND
    profile ->> 'type' = 'capability_work_v1' AND
    profile ->> 'capability' IN ('AnalyzeEvidenceV1','SimulateV1') AND
    jsonb_typeof(profile -> 'purpose') = 'string' AND
    length(profile ->> 'purpose') BETWEEN 1 AND 4000 AND
    length(btrim(profile ->> 'purpose', E' \t\n\r\f' || chr(11) ||
      U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')) > 0 AND
    jsonb_typeof(profile -> 'allowSimulationAnalysis') = 'boolean' AND
    (profile ->> 'capability' = 'SimulateV1' OR profile -> 'allowSimulationAnalysis' = 'false'::jsonb) AND
    profile ->> 'compilerNoticeVersion' = 'google-scope-compiler-v1', false)
$$;
REVOKE ALL ON FUNCTION orqaly.capability_profile_valid_025(jsonb) FROM PUBLIC;

CREATE FUNCTION orqaly.capability_scope_request_025(profile jsonb)
RETURNS text LANGUAGE sql IMMUTABLE STRICT
SET search_path = pg_catalog, orqaly
AS $$
  SELECT 'Explicit capability work. Compile a scope for owner review; do not execute this request.' || E'\n' ||
    CASE WHEN profile ->> 'capability' = 'AnalyzeEvidenceV1' THEN
      'Qualitatively analyze only transcripts explicitly supplied and selected by the owner.' ELSE
      'Generate a bounded synthetic interview simulation, clearly labeled as synthetic.' END || E'\n' ||
    CASE WHEN profile ->> 'capability' = 'SimulateV1' AND profile -> 'allowSimulationAnalysis' = 'true'::jsonb THEN
      'The owner may separately request qualitative analysis of these simulation outputs in this same work item, with new review and processing consent.' ELSE
      'No other capability is included in this scope.' END || E'\n' ||
    'No web research, PRD, implementation plan, or deployment is requested.' || E'\n' ||
    'Transcript bytes are not part of this scope-compilation request. Each paid capability requires a separate, exact-input owner confirmation.' ||
    E'\n\nOwner purpose:\n' || btrim(profile ->> 'purpose',
      E' \t\n\r\f' || chr(11) || U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')
$$;
REVOKE ALL ON FUNCTION orqaly.capability_scope_request_025(jsonb) FROM PUBLIC;

-- End-to-end owner/lifecycle plan validation is installed below before either
-- RPC becomes callable. No custom session setting conveys authorization.
CREATE FUNCTION orqaly.validate_capability_input_025(run orqaly.workflow_runs, event jsonb, canonical text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, orqaly
AS $$
DECLARE
  input jsonb := event -> 'inputPayload'; operation_type text := input ->> 'type';
  profile jsonb := run.request_payload -> 'workProfile'; consent jsonb;
  scope_artifact orqaly.artifacts%ROWTYPE; source_artifact orqaly.artifacts%ROWTYPE;
  source_ref jsonb; selection jsonb; item jsonb; expected_refs jsonb; observed_refs jsonb;
  unsigned_input text; binding text; key text; limit_value numeric;
BEGIN
  IF input IS NULL OR jsonb_typeof(input) <> 'object' OR input ? 'executionAgent' OR
     canonical IS NULL OR octet_length(canonical) > 1000000 OR canonical::jsonb IS DISTINCT FROM input OR
     orqaly.sha256_text(canonical) IS DISTINCT FROM event ->> 'inputHash' OR
     NOT ((profile ->> 'capability' = 'AnalyzeEvidenceV1' AND
           operation_type IN ('AdmitTranscriptCorpusV1','AnalyzeEvidenceV1')) OR
          (profile ->> 'capability' = 'SimulateV1' AND
           (operation_type = 'SimulateV1' OR (operation_type = 'AnalyzeEvidenceV1' AND
             profile -> 'allowSimulationAnalysis' = 'true'::jsonb)))) THEN
    RAISE EXCEPTION 'capability input/profile/identity mismatch' USING ERRCODE = '22023';
  END IF;
  IF operation_type = 'AdmitTranscriptCorpusV1' THEN
    IF input - ARRAY['type','corpus','admissionProfile'] <> '{}'::jsonb OR
       input ->> 'admissionProfile' IS DISTINCT FROM 'supplied_transcript_v1' OR
       jsonb_typeof(input #> '{corpus,documents}') IS DISTINCT FROM 'array' OR
       jsonb_array_length(input #> '{corpus,documents}') NOT BETWEEN 1 AND 16 OR
       event -> 'reviewId' IS DISTINCT FROM 'null'::jsonb THEN
      RAISE EXCEPTION 'invalid owner transcript admission' USING ERRCODE = '22023';
    END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(input #> '{corpus,documents}') LOOP
      IF item ->> 'origin' IS DISTINCT FROM 'supplied_transcript' OR
         item -> 'originArtifactRefs' IS DISTINCT FROM '[]'::jsonb THEN
        RAISE EXCEPTION 'uploads cannot claim synthetic or cross-run provenance' USING ERRCODE = '42501';
      END IF;
    END LOOP;
    RETURN;
  END IF;

  IF input - (CASE operation_type WHEN 'AnalyzeEvidenceV1' THEN
      ARRAY['type','acceptedScope','scope','source','request','limits','processingConsent'] ELSE
      ARRAY['type','acceptedScope','scope','request','selectedGrounding','limits','processingConsent'] END) <> '{}'::jsonb OR
     input -> 'acceptedScope' IS DISTINCT FROM event -> 'acceptedScope' OR
     event ->> 'reviewId' IS NULL OR event ->> 'reviewId' !~ '^[a-f0-9]{64}$' OR
     jsonb_typeof(input -> 'limits') IS DISTINCT FROM 'object' OR
     (input -> 'limits') - ARRAY['deadlineMs','maxModelCalls','maxInputTokens','maxOutputTokens'] <> '{}'::jsonb OR
     NOT (input -> 'limits' ?& ARRAY['deadlineMs','maxModelCalls','maxInputTokens','maxOutputTokens']) THEN
    RAISE EXCEPTION 'paid capability review or bounded limits missing' USING ERRCODE = '22023';
  END IF;
  FOR key, item IN SELECT * FROM jsonb_each(input -> 'limits') LOOP
    IF jsonb_typeof(item) <> 'number' OR item::text !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'capability limits must be whole numbers' USING ERRCODE = '22023';
    END IF;
    limit_value := item::text::numeric;
    IF limit_value < 1 OR limit_value > (CASE key
        WHEN 'deadlineMs' THEN 900000 WHEN 'maxModelCalls' THEN 32 ELSE 2000000 END) THEN
      RAISE EXCEPTION 'capability limit exceeded' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  SELECT artifact.* INTO scope_artifact FROM orqaly.artifacts AS artifact
    JOIN orqaly.workflow_stages AS stage ON stage.tenant_id = artifact.tenant_id AND
      stage.run_id = artifact.run_id AND stage.id = artifact.stage_id AND
      stage.output_artifact_id = artifact.id AND stage.kind = 'compile_scope' AND stage.status = 'completed'
   WHERE artifact.tenant_id = run.tenant_id AND artifact.run_id = run.id AND
     jsonb_build_object('artifactId',artifact.id,'artifactHash',artifact.content_hash,'kind',artifact.kind) = input -> 'acceptedScope';
  IF scope_artifact.id IS NULL OR scope_artifact.kind <> 'scope' OR
     scope_artifact.payload IS DISTINCT FROM input -> 'scope' THEN
    RAISE EXCEPTION 'paid capability scope bytes are not the approved run output' USING ERRCODE = '42501';
  END IF;
  consent := input -> 'processingConsent';
  IF consent IS NULL OR jsonb_typeof(consent) <> 'object' OR
     consent - ARRAY['schemaVersion','granted','provider','purpose','operationId','bindingHash','noticeVersion'] <> '{}'::jsonb OR
     consent ->> 'schemaVersion' IS DISTINCT FROM 'axwise.processing-consent.v1' OR
     consent -> 'granted' IS DISTINCT FROM 'true'::jsonb OR
     consent ->> 'provider' IS DISTINCT FROM 'google' OR
     consent ->> 'purpose' IS DISTINCT FROM operation_type OR
     consent ->> 'operationId' IS DISTINCT FROM event ->> 'operationId' OR
     consent ->> 'noticeVersion' IS DISTINCT FROM 'google-selected-sources-v1' OR
     consent ->> 'bindingHash' IS NULL OR consent ->> 'bindingHash' !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'explicit operation processing consent required' USING ERRCODE = '42501';
  END IF;
  unsigned_input := orqaly.capability_unsigned_input_025(canonical, input);
  binding := '{"contractVersion":"axwise.operation.v2","input":' || unsigned_input ||
    ',"operationId":' || to_jsonb(event ->> 'operationId')::text ||
    ',"owner":' || orqaly.capability_identity_json_025(jsonb_build_object(
      'tenantId',run.tenant_id,'organizationId',NULL,'userId',run.owner_user_id)) ||
    ',"provider":"google","purpose":' || to_jsonb(operation_type)::text ||
    ',"schemaVersion":"axwise.processing-consent-binding.v1","workflow":' ||
    orqaly.capability_identity_json_025(jsonb_build_object('runId',run.id,
      'stageId',event ->> 'stageId','stageAttemptId',event ->> 'attemptId')) || '}';
  IF orqaly.sha256_text(binding) IS DISTINCT FROM consent ->> 'bindingHash' THEN
    RAISE EXCEPTION 'processing consent does not bind the exact owner/run/operation/input bytes' USING ERRCODE = '42501';
  END IF;

  IF operation_type = 'AnalyzeEvidenceV1' THEN
    source_ref := input #> '{source,artifact}';
    SELECT artifact.* INTO source_artifact FROM orqaly.artifacts AS artifact
      JOIN orqaly.workflow_stages AS stage ON stage.tenant_id = artifact.tenant_id AND
        stage.run_id = artifact.run_id AND stage.id = artifact.stage_id AND
        stage.output_artifact_id = artifact.id AND stage.kind = 'execution' AND stage.status = 'completed'
     WHERE artifact.tenant_id = run.tenant_id AND artifact.run_id = run.id AND
       jsonb_build_object('artifactId',artifact.id,'artifactHash',artifact.content_hash,'kind',artifact.kind) = source_ref;
    IF source_artifact.id IS NULL OR source_artifact.kind NOT IN ('transcript_corpus','simulation') OR
       (profile ->> 'capability' = 'SimulateV1' AND source_artifact.kind <> 'simulation') OR
       input -> 'source' IS DISTINCT FROM jsonb_build_object('artifact',source_ref,
         'contentType',source_artifact.content_type,'payload',source_artifact.payload,'markdown',source_artifact.markdown) THEN
      RAISE EXCEPTION 'analysis source bytes are not an eligible completed output of this run' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF jsonb_typeof(input -> 'selectedGrounding') IS DISTINCT FROM 'array' OR
       jsonb_array_length(input -> 'selectedGrounding') > 16 OR
       jsonb_typeof(input #> '{request,grounding,sourceArtifacts}') IS DISTINCT FROM 'array' OR
       jsonb_array_length(input #> '{request,grounding,sourceArtifacts}') > 4 OR
       input #>> '{request,grounding,mode}' NOT IN ('scenario_only','source_grounded') OR
       (input #>> '{request,grounding,mode}' = 'scenario_only') IS DISTINCT FROM
         (input -> 'selectedGrounding' = '[]'::jsonb) THEN
      RAISE EXCEPTION 'invalid bounded simulation grounding selection' USING ERRCODE = '22023';
    END IF;
    FOR selection IN SELECT value FROM jsonb_array_elements(input -> 'selectedGrounding') LOOP
      source_ref := selection -> 'artifact';
      SELECT artifact.* INTO source_artifact FROM orqaly.artifacts AS artifact
        JOIN orqaly.workflow_stages AS stage ON stage.tenant_id = artifact.tenant_id AND
          stage.run_id = artifact.run_id AND stage.id = artifact.stage_id AND
          stage.output_artifact_id = artifact.id AND stage.kind = 'execution' AND stage.status = 'completed'
       WHERE artifact.tenant_id = run.tenant_id AND artifact.run_id = run.id AND
         jsonb_build_object('artifactId',artifact.id,'artifactHash',artifact.content_hash,'kind',artifact.kind) = source_ref;
      IF source_artifact.id IS NULL OR source_artifact.kind <> 'qualitative_analysis' OR
         selection ->> 'entryKind' IS DISTINCT FROM 'quote' OR
         NOT EXISTS (SELECT 1 FROM jsonb_array_elements(source_artifact.payload -> 'quotes') AS quote
           WHERE quote ->> 'quoteId' = selection ->> 'entryId') THEN
        RAISE EXCEPTION 'simulation grounding is not an exact selected quote of this run' USING ERRCODE = '42501';
      END IF;
    END LOOP;
    SELECT COALESCE(jsonb_agg(ref ORDER BY ref::text), '[]') INTO expected_refs
      FROM (SELECT value AS ref FROM jsonb_array_elements(input #> '{request,grounding,sourceArtifacts}')) AS refs;
    SELECT COALESCE(jsonb_agg(ref ORDER BY ref::text), '[]') INTO observed_refs
      FROM (SELECT DISTINCT value -> 'artifact' AS ref FROM jsonb_array_elements(input -> 'selectedGrounding')) AS refs;
    IF expected_refs IS DISTINCT FROM observed_refs OR
       (SELECT count(*) FROM jsonb_array_elements(input -> 'selectedGrounding')) <>
       (SELECT count(DISTINCT value) FROM jsonb_array_elements(input -> 'selectedGrounding')) THEN
      RAISE EXCEPTION 'simulation grounding set differs or contains duplicate selections' USING ERRCODE = '22023';
    END IF;
  END IF;
END
$$;
REVOKE ALL ON FUNCTION orqaly.validate_capability_input_025(orqaly.workflow_runs,jsonb,text) FROM PUBLIC;

CREATE FUNCTION orqaly.guard_capability_transition_025(p_tenant_id uuid, p_run_id uuid, p_plan jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, orqaly
AS $$
DECLARE
  event jsonb := p_plan -> 'event'; event_type text := event ->> 'type';
  owner_event boolean := COALESCE(event_type IN (
    'CapabilityRunRequested','CapabilityScopeApproved','CapabilityActivityRequested'), false);
  run orqaly.workflow_runs%ROWTYPE; stage orqaly.workflow_stages%ROWTYPE;
  scope_stage orqaly.workflow_stages%ROWTYPE; gate orqaly.workflow_stages%ROWTYPE;
  attempt orqaly.stage_attempts%ROWTYPE; approval orqaly.approvals%ROWTYPE;
  existing orqaly.workflow_events%ROWTYPE; profile jsonb; expected jsonb;
  expected_stage jsonb; expected_attempt jsonb; expected_outbox jsonb;
  input jsonb := event -> 'inputPayload'; canonical text;
  scope_ref jsonb; request text; item jsonb; previous record;
  api_member boolean := pg_has_role(session_user, 'orqaly_api', 'MEMBER');
  worker_member boolean := pg_has_role(session_user, 'orqaly_worker', 'MEMBER');
  identity_member boolean := pg_has_role(session_user, 'orqaly_identity', 'MEMBER');
  keys text[]; mutation jsonb; retry boolean := false; operation_type text;
BEGIN
  -- These cannot enter a legacy Goal under a forged legacy event name either.
  IF NOT owner_event AND (event ? 'workProfile' OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(COALESCE(p_plan -> 'createAttempts','[]')) AS created
       WHERE created #>> '{inputPayload,type}' IN ('AdmitTranscriptCorpusV1','AnalyzeEvidenceV1','SimulateV1'))) THEN
    RAISE EXCEPTION 'capability owner command required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO run FROM orqaly.workflow_runs WHERE tenant_id = p_tenant_id AND id = p_run_id;
  IF NOT owner_event AND run.request_payload #>> '{workProfile,type}' IS DISTINCT FROM 'capability_work_v1' THEN
    RETURN; -- Preserve the historical ledger contract for ordinary Goal plans.
  END IF;
  IF orqaly.current_tenant_id() IS DISTINCT FROM p_tenant_id OR
     identity_member OR api_member = worker_member OR
     pg_has_role(session_user, orqaly.rpc_owner_name(), 'MEMBER') OR
     (owner_event AND NOT api_member) OR (NOT owner_event AND NOT worker_member) THEN
    RAISE EXCEPTION 'exclusive capability API or worker tenant role required' USING ERRCODE = '42501';
  END IF;
  IF p_plan ->> 'contractVersion' IS DISTINCT FROM 'orqaly.workflow.v2' OR
     jsonb_typeof(event) IS DISTINCT FROM 'object' OR
     p_plan ->> 'eventCanonical' IS NULL OR octet_length(p_plan ->> 'eventCanonical') > 1100000 OR
     (p_plan ->> 'eventCanonical')::jsonb IS DISTINCT FROM event OR
     orqaly.sha256_text(p_plan ->> 'eventCanonical') IS DISTINCT FROM p_plan ->> 'eventHash' OR
     event ->> 'tenantId' IS DISTINCT FROM p_tenant_id::text OR
     event ->> 'runId' IS DISTINCT FROM p_run_id::text OR
     event ->> 'eventId' IS NULL OR event ->> 'occurredAt' IS NULL OR
     p_plan - ARRAY['contractVersion','event','eventCanonical','eventHash','runMutation',
       'stageMutations','attemptMutations','createStages','createDependencies','createAttempts',
       'createArtifacts','createApproval','outbox','audit'] <> '{}'::jsonb THEN
    RAISE EXCEPTION 'invalid capability event or transition envelope' USING ERRCODE = '22023';
  END IF;
  FOREACH keys SLICE 1 IN ARRAY ARRAY[
      ARRAY['createStages'], ARRAY['createDependencies'], ARRAY['createAttempts'],
      ARRAY['createArtifacts'], ARRAY['stageMutations'], ARRAY['attemptMutations'], ARRAY['outbox']
    ] LOOP
    IF jsonb_typeof(p_plan -> keys[1]) IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'capability transition arrays required' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  -- Same event-before-run lock order as the historical RPC. The run advisory
  -- lock additionally serializes fresh-run initialization before a row exists.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':' || (event ->> 'eventId')::uuid::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('capability-run:' || p_tenant_id::text || ':' || p_run_id::text, 0));
  SELECT * INTO run FROM orqaly.workflow_runs WHERE tenant_id = p_tenant_id AND id = p_run_id FOR UPDATE;
  profile := run.request_payload -> 'workProfile';
  IF run.id IS NULL OR NOT orqaly.capability_profile_valid_025(profile) OR run.owner_organization_id IS NOT NULL OR
     run.mode <> 'simple' OR NOT EXISTS (
       SELECT 1 FROM orqaly.tenant_identity_bindings AS binding JOIN orqaly.tenants AS tenant
         ON tenant.id = binding.tenant_id AND tenant.status = 'active'
        WHERE binding.tenant_id = p_tenant_id AND binding.provider = 'clerk' AND
          binding.subject_type = 'user' AND binding.subject_id = run.owner_user_id) THEN
    RAISE EXCEPTION 'capability requires an existing personal owner-bound run' USING ERRCODE = '42501';
  END IF;
  IF owner_event AND (COALESCE(event ->> 'ownerUserId', event ->> 'decidedBy') IS DISTINCT FROM run.owner_user_id OR
      event ->> 'ownerCommandHash' IS NULL OR event ->> 'ownerCommandHash' !~ '^[a-f0-9]{64}$') THEN
    RAISE EXCEPTION 'capability command owner mismatch' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO existing FROM orqaly.workflow_events WHERE tenant_id = p_tenant_id AND id = (event ->> 'eventId')::uuid;
  IF FOUND THEN
    IF existing.run_id IS DISTINCT FROM p_run_id OR existing.event_hash IS DISTINCT FROM p_plan ->> 'eventHash' OR
       existing.transition_receipt ->> 'planHash' IS DISTINCT FROM orqaly.sha256_text(p_plan::text) THEN
      RAISE EXCEPTION 'capability replay input or plan changed' USING ERRCODE = '23505';
    END IF;
    RETURN; -- An exact recorded receipt remains replayable after later progress.
  END IF;
  expected := jsonb_build_object('contractVersion','orqaly.workflow.v2','event',event,
    'eventCanonical',p_plan -> 'eventCanonical','eventHash',p_plan -> 'eventHash',
    'runMutation',NULL,'stageMutations','[]'::jsonb,'attemptMutations','[]'::jsonb,
    'createStages','[]'::jsonb,'createDependencies','[]'::jsonb,'createAttempts','[]'::jsonb,
    'createArtifacts','[]'::jsonb,'createApproval',NULL,'outbox','[]'::jsonb,
    'audit',jsonb_build_object('eventType',event_type,'payload',jsonb_build_object('eventId',event -> 'eventId')));

  IF owner_event THEN
    IF event_type IN ('CapabilityRunRequested','CapabilityActivityRequested') THEN
      IF jsonb_array_length(p_plan -> 'createAttempts') <> 1 THEN
        RAISE EXCEPTION 'owner command creates exactly one attempt' USING ERRCODE = '22023';
      END IF;
      canonical := p_plan #>> '{createAttempts,0,inputCanonical}';
      IF canonical IS NULL OR octet_length(canonical) > 1000000 OR canonical::jsonb IS DISTINCT FROM input OR
         orqaly.sha256_text(canonical) IS DISTINCT FROM event ->> 'inputHash' THEN
        RAISE EXCEPTION 'owner command input bytes differ from its attempt' USING ERRCODE = '22023';
      END IF;
      expected_attempt := jsonb_build_object('id',event -> 'attemptId','stageId',
        CASE WHEN event_type = 'CapabilityRunRequested' THEN event #> '{stageIds,compileScope}' ELSE event -> 'stageId' END,
        'attemptNumber',1,'operationId',event -> 'operationId','inputHash',event -> 'inputHash',
        'inputPayload',input,'inputCanonical',canonical,'activityType','axwise_operation');
      expected_outbox := jsonb_build_object('idempotencyKey','dispatch:' || (event ->> 'operationId'),
        'commandType','dispatch_activity','stageId',expected_attempt -> 'stageId','attemptId',event -> 'attemptId',
        'operationId',event -> 'operationId','inputHash',event -> 'inputHash','artifact',NULL,'availableAt',event -> 'occurredAt');
      expected := expected || jsonb_build_object('createAttempts',jsonb_build_array(expected_attempt),
        'outbox',jsonb_build_array(expected_outbox),'runMutation',jsonb_build_object('id',run.id,
          'expectedVersion',run.row_version,'patch',jsonb_build_object('status','running')));
    END IF;
    IF event_type = 'CapabilityRunRequested' THEN
      keys := ARRAY['type','eventId','tenantId','runId','occurredAt','ownerCommandHash','ownerUserId',
        'ownerOrganizationId','mode','workProfile','request','requestHash','stageIds','attemptId','operationId','inputHash','inputPayload'];
      request := orqaly.capability_scope_request_025(profile);
      IF run.status <> 'requested' OR run.row_version <> 0 OR
         event -> 'workProfile' IS DISTINCT FROM profile OR event -> 'ownerOrganizationId' IS DISTINCT FROM 'null'::jsonb OR
         event ->> 'mode' IS DISTINCT FROM 'simple' OR event ->> 'request' IS DISTINCT FROM request OR
         event ->> 'requestHash' IS DISTINCT FROM orqaly.sha256_text(request) OR
         run.request_payload IS DISTINCT FROM jsonb_build_object('request',request,'workProfile',profile) OR
         run.request_hash IS DISTINCT FROM event ->> 'requestHash' OR
         event #>> '{stageIds,compileScope}' IS NOT DISTINCT FROM event #>> '{stageIds,gate1}' OR
         (event -> 'stageIds') - ARRAY['compileScope','gate1'] <> '{}'::jsonb OR
         input IS DISTINCT FROM jsonb_build_object('type','CompileScopeV2','request',request,
           'objectiveOnlyContext','[]'::jsonb,'safeDefaults',jsonb_build_object('geography','[]'::jsonb,
             'acceptedSourceTypes','[]'::jsonb,'assumptions','[]'::jsonb,'limits','[]'::jsonb,'policies','[]'::jsonb)) OR
         EXISTS (SELECT 1 FROM orqaly.workflow_stages WHERE tenant_id = p_tenant_id AND run_id = p_run_id) OR
         EXISTS (SELECT 1 FROM orqaly.stage_attempts WHERE tenant_id = p_tenant_id AND run_id = p_run_id) OR
         EXISTS (SELECT 1 FROM orqaly.approvals WHERE tenant_id = p_tenant_id AND run_id = p_run_id) THEN
        RAISE EXCEPTION 'capability initialization must be a fresh exact disclosed scope' USING ERRCODE = '22023';
      END IF;
      expected := expected || jsonb_build_object('createStages',jsonb_build_array(
        jsonb_build_object('id',event #> '{stageIds,compileScope}','stageKey','capability-compile-scope',
          'kind','compile_scope','status','queued','ordinal',10,'inputHash',event -> 'inputHash'),
        jsonb_build_object('id',event #> '{stageIds,gate1}','stageKey','capability-scope-approval',
          'kind','gate_1','status','pending','ordinal',20,'inputHash',NULL)),
        'createDependencies',jsonb_build_array(jsonb_build_object('stageId',event #> '{stageIds,gate1}',
          'dependsOnStageId',event #> '{stageIds,compileScope}')),
        'audit',jsonb_build_object('eventType',event_type,'payload',jsonb_build_object('eventId',event -> 'eventId',
          'profile',profile -> 'type','capability',profile -> 'capability','initializedStageCount',2)));
    ELSE
      SELECT * INTO scope_stage FROM orqaly.workflow_stages WHERE tenant_id = p_tenant_id AND run_id = p_run_id AND kind = 'compile_scope';
      SELECT * INTO gate FROM orqaly.workflow_stages WHERE tenant_id = p_tenant_id AND run_id = p_run_id AND kind = 'gate_1';
      SELECT jsonb_build_object('artifactId',id,'artifactHash',content_hash,'kind',kind) INTO scope_ref
        FROM orqaly.artifacts WHERE tenant_id = p_tenant_id AND run_id = p_run_id AND id = scope_stage.output_artifact_id;
      IF scope_stage.id IS NULL OR scope_stage.status <> 'completed' OR gate.id IS NULL OR scope_ref IS NULL OR
         event -> 'scopeCompatible' IS DISTINCT FROM 'true'::jsonb THEN
        RAISE EXCEPTION 'completed compatible scope required' USING ERRCODE = '42501';
      END IF;
      IF event_type = 'CapabilityScopeApproved' THEN
        keys := ARRAY['type','eventId','tenantId','runId','occurredAt','ownerCommandHash','approvalId',
          'stageId','artifact','inputHash','idempotencyKey','decisionHash','decidedBy','scopeCompatible'];
        IF run.status <> 'awaiting_gate_1' OR gate.status <> 'awaiting_approval' OR
           event ->> 'stageId' IS DISTINCT FROM gate.id::text OR event -> 'artifact' IS DISTINCT FROM scope_ref OR
           event ->> 'inputHash' IS DISTINCT FROM scope_stage.input_hash OR
           event ->> 'decisionHash' IS DISTINCT FROM orqaly.sha256_text(orqaly.capability_identity_json_025(
             jsonb_build_object('artifact',scope_ref,'workProfile',profile,'scopeCompatible',true))) OR
           EXISTS (SELECT 1 FROM orqaly.approvals WHERE tenant_id = p_tenant_id AND run_id = p_run_id) THEN
          RAISE EXCEPTION 'owner must approve the exact current capability scope' USING ERRCODE = '42501';
        END IF;
        expected := expected || jsonb_build_object('createApproval',jsonb_build_object('id',event -> 'approvalId',
          'kind','scope','stageId',gate.id,'artifact',scope_ref,'inputHash',event -> 'inputHash',
          'idempotencyKey',event -> 'idempotencyKey','decisionHash',event -> 'decisionHash','decidedBy',event -> 'decidedBy'),
          'stageMutations',jsonb_build_array(jsonb_build_object('id',gate.id,'expectedVersion',gate.row_version,
            'patch',jsonb_build_object('status','completed','input_hash',event -> 'inputHash'))),
          'runMutation',jsonb_build_object('id',run.id,'expectedVersion',run.row_version,
            'patch',jsonb_build_object('status','awaiting_capability_input')),
          'audit',jsonb_build_object('eventType',event_type,'payload',jsonb_build_object('eventId',event -> 'eventId',
            'approvalId',event -> 'approvalId','artifactId',scope_ref -> 'artifactId','artifactHash',scope_ref -> 'artifactHash')));
      ELSE
        keys := ARRAY['type','eventId','tenantId','runId','occurredAt','ownerCommandHash','decidedBy',
          'expectedRowVersion','stageId','stageKey','ordinal','attemptId','operationId','inputHash','inputPayload',
          'acceptedScope','scopeApprovalId','scopeCompatible','reviewId'];
        SELECT * INTO approval FROM orqaly.approvals WHERE tenant_id = p_tenant_id AND run_id = p_run_id AND
          stage_id = gate.id AND kind = 'scope' AND decision = 'approved' AND decided_by = run.owner_user_id AND
          jsonb_build_object('artifactId',artifact_id,'artifactHash',artifact_hash,'kind','scope') = scope_ref;
        IF gate.status <> 'completed' OR approval.id IS NULL OR event ->> 'scopeApprovalId' IS DISTINCT FROM approval.id::text OR
           event -> 'acceptedScope' IS DISTINCT FROM scope_ref OR
           event -> 'expectedRowVersion' IS DISTINCT FROM to_jsonb(run.row_version) OR
           run.status NOT IN ('awaiting_capability_input','completed','failed') OR
           event ->> 'stageKey' IS NULL OR event ->> 'stageKey' !~ '^capability-[a-z0-9-]{1,90}$' OR
           (event ->> 'ordinal')::integer NOT BETWEEN 30 AND 1000 OR
           (event ->> 'ordinal')::integer IS DISTINCT FROM
             (SELECT max(ordinal) + 10 FROM orqaly.workflow_stages WHERE tenant_id = p_tenant_id AND run_id = p_run_id) OR
           (SELECT count(*) FROM orqaly.workflow_stages WHERE tenant_id = p_tenant_id AND run_id = p_run_id) >= 60 OR
           (SELECT count(*) FROM orqaly.stage_attempts WHERE tenant_id = p_tenant_id AND run_id = p_run_id) >= 100 OR
           EXISTS (SELECT 1 FROM orqaly.workflow_stages WHERE tenant_id = p_tenant_id AND run_id = p_run_id AND
             status IN ('pending','queued','running','polling','awaiting_approval')) THEN
          RAISE EXCEPTION 'capability activity requires exact owner-approved idle state' USING ERRCODE = '42501';
        END IF;
        PERFORM orqaly.validate_capability_input_025(run, event, canonical);
        expected := expected || jsonb_build_object('createStages',jsonb_build_array(jsonb_build_object(
          'id',event -> 'stageId','stageKey',event -> 'stageKey','kind','execution','status','queued',
          'ordinal',event -> 'ordinal','inputHash',event -> 'inputHash')),
          'createDependencies',jsonb_build_array(jsonb_build_object('stageId',event -> 'stageId','dependsOnStageId',gate.id)),
          'audit',jsonb_build_object('eventType',event_type,'payload',jsonb_build_object('eventId',event -> 'eventId',
            'stageId',event -> 'stageId','operationId',event -> 'operationId','inputHash',event -> 'inputHash',
            'scopeApprovalId',event -> 'scopeApprovalId','reviewId',event -> 'reviewId','operationType',input -> 'type')));
      END IF;
    END IF;
    IF event - keys <> '{}'::jsonb OR NOT event ?& keys OR p_plan IS DISTINCT FROM expected THEN
      RAISE EXCEPTION 'capability owner transition differs from the exact permitted plan' USING ERRCODE = '22023';
    END IF;
    RETURN;
  END IF;

  -- Worker-only lifecycle validation follows. Owner consent is immutable and
  -- permits no new paid operation, successor stage, approval or final export.
  PERFORM orqaly.guard_capability_worker_plan_025(run, p_plan);
END
$$;
REVOKE ALL ON FUNCTION orqaly.guard_capability_transition_025(uuid,uuid,jsonb) FROM PUBLIC;

CREATE FUNCTION orqaly.guard_capability_worker_plan_025(run orqaly.workflow_runs, p_plan jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, orqaly
AS $$
DECLARE
  event jsonb := p_plan -> 'event'; event_type text := event ->> 'type';
  stage orqaly.workflow_stages%ROWTYPE; gate orqaly.workflow_stages%ROWTYPE;
  attempt orqaly.stage_attempts%ROWTYPE; expected jsonb; stage_patch jsonb; attempt_patch jsonb;
  run_patch jsonb := NULL; next_attempt jsonb; created jsonb; artifact jsonb; expected_artifact jsonb;
  outbox jsonb := NULL; status text; operation_type text; result_type text; kind text;
  canonical text; source_ids jsonb; scope jsonb; keys text[]; expected_keys text[];
BEGIN
  IF event_type NOT IN ('ActivityStarted','ActivityDeferred','ActivityDispatchAmbiguous',
      'ActivityRedispatchRequested','ActivityCompleted','ActivityFailed','LeaseExpired') OR
     run.status <> 'running' OR jsonb_typeof(p_plan -> 'audit') IS DISTINCT FROM 'object' OR
     p_plan #>> '{audit,eventType}' IS DISTINCT FROM event_type OR
     jsonb_typeof(p_plan #> '{audit,payload}') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'capability worker lifecycle event required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO stage FROM orqaly.workflow_stages WHERE tenant_id = run.tenant_id AND run_id = run.id AND id = (event ->> 'stageId')::uuid;
  SELECT * INTO attempt FROM orqaly.stage_attempts WHERE tenant_id = run.tenant_id AND run_id = run.id AND id = (event ->> 'attemptId')::uuid;
  operation_type := attempt.input_payload ->> 'type';
  IF stage.id IS NULL OR attempt.id IS NULL OR attempt.stage_id <> stage.id OR
     attempt.status <> stage.status OR attempt.input_hash IS DISTINCT FROM stage.input_hash OR
     attempt.activity_type <> 'axwise_operation' OR
     ((stage.kind = 'compile_scope' AND operation_type = 'CompileScopeV2') OR
      (stage.kind = 'execution' AND operation_type IN ('AdmitTranscriptCorpusV1','AnalyzeEvidenceV1','SimulateV1'))) IS DISTINCT FROM true OR
     EXISTS (SELECT 1 FROM orqaly.stage_attempts AS later WHERE later.tenant_id = run.tenant_id AND
       later.run_id = run.id AND later.stage_id = stage.id AND later.attempt_number > attempt.attempt_number) OR
     attempt.lease_token IS NULL OR attempt.lease_token IS DISTINCT FROM (event ->> 'leaseToken')::uuid OR
     attempt.lease_expires_at IS NULL OR
     (event_type = 'ActivityStarted' AND attempt.status <> 'queued') OR
     (event_type <> 'ActivityStarted' AND attempt.status NOT IN ('running','polling')) OR
     (event_type = 'LeaseExpired' AND attempt.lease_expires_at > clock_timestamp()) OR
     (event_type <> 'LeaseExpired' AND attempt.lease_expires_at <= clock_timestamp()) THEN
    RAISE EXCEPTION 'capability worker attempt, lease or immutable input mismatch' USING ERRCODE = '42501';
  END IF;
  keys := ARRAY['type','eventId','tenantId','runId','occurredAt','stageId','attemptId','leaseToken'];
  expected := jsonb_build_object('contractVersion','orqaly.workflow.v2','event',event,
    'eventCanonical',p_plan -> 'eventCanonical','eventHash',p_plan -> 'eventHash',
    'runMutation',NULL,'stageMutations','[]'::jsonb,'attemptMutations','[]'::jsonb,
    'createStages','[]'::jsonb,'createDependencies','[]'::jsonb,'createAttempts','[]'::jsonb,
    'createArtifacts','[]'::jsonb,'createApproval',NULL,'outbox','[]'::jsonb,'audit',p_plan -> 'audit');

  CASE event_type
    WHEN 'ActivityStarted' THEN
      keys := keys || ARRAY['deploymentId'];
      IF length(event ->> 'deploymentId') NOT BETWEEN 1 AND 300 THEN
        RAISE EXCEPTION 'deployment identity required' USING ERRCODE = '22023';
      END IF;
      stage_patch := jsonb_build_object('status','running');
      attempt_patch := jsonb_build_object('status','running','deployment_id',event -> 'deploymentId');
    WHEN 'ActivityDeferred', 'ActivityDispatchAmbiguous' THEN
      keys := keys || ARRAY['statusUrl','nextPollAt'];
      stage_patch := jsonb_build_object('status','polling');
      attempt_patch := jsonb_build_object('status','polling','operation_status_url',event -> 'statusUrl','clear_lease',true);
      outbox := jsonb_build_object('idempotencyKey','poll:' || attempt.operation_id,
        'commandType','poll_activity','availableAt',event -> 'nextPollAt');
    WHEN 'ActivityRedispatchRequested' THEN
      keys := keys || ARRAY['redispatchAt'];
      stage_patch := jsonb_build_object('status','queued');
      attempt_patch := jsonb_build_object('status','queued','clear_lease',true);
      outbox := jsonb_build_object('idempotencyKey','dispatch:' || attempt.operation_id,
        'commandType','dispatch_activity','availableAt',event -> 'redispatchAt');
    WHEN 'LeaseExpired' THEN
      keys := keys || ARRAY['requeueAt'];
      status := CASE WHEN attempt.status = 'polling' THEN 'polling' ELSE 'queued' END;
      stage_patch := jsonb_build_object('status',status);
      attempt_patch := jsonb_build_object('status',status,'clear_lease',true);
      outbox := jsonb_build_object('idempotencyKey',CASE WHEN status = 'polling' THEN 'poll:' ELSE 'dispatch:' END || attempt.operation_id,
        'commandType',CASE WHEN status = 'polling' THEN 'poll_activity' ELSE 'dispatch_activity' END,
        'availableAt',event -> 'requeueAt');
    WHEN 'ActivityFailed' THEN
      keys := keys || ARRAY['retryable','errorClass'];
      expected_keys := keys;
      keys := keys || ARRAY['nextAttempt'];
      IF jsonb_typeof(event -> 'retryable') IS DISTINCT FROM 'boolean' OR
         length(event ->> 'errorClass') NOT BETWEEN 1 AND 200 OR
         (stage.kind <> 'compile_scope' AND (event -> 'retryable' <> 'false'::jsonb OR event ? 'nextAttempt')) THEN
        RAISE EXCEPTION 'capability failure requires fresh owner consent, not a new paid retry' USING ERRCODE = '42501';
      END IF;
      attempt_patch := jsonb_build_object('status','failed','error_class',event -> 'errorClass','clear_lease',true);
      IF stage.kind = 'compile_scope' AND event -> 'retryable' = 'true'::jsonb AND attempt.attempt_number < 3 THEN
        next_attempt := event -> 'nextAttempt';
        IF next_attempt IS NULL OR next_attempt - ARRAY['attemptId','operationId','inputHash','inputPayload'] <> '{}'::jsonb OR
           next_attempt -> 'inputPayload' IS DISTINCT FROM attempt.input_payload OR
           next_attempt ->> 'inputHash' IS DISTINCT FROM attempt.input_hash OR
           next_attempt ->> 'attemptId' IS NULL OR next_attempt ->> 'operationId' IS NULL THEN
          RAISE EXCEPTION 'scope retry must preserve exact compiler input bytes' USING ERRCODE = '42501';
        END IF;
        created := jsonb_build_object('id',next_attempt -> 'attemptId','stageId',stage.id,
          'attemptNumber',attempt.attempt_number + 1,'operationId',next_attempt -> 'operationId',
          'inputHash',attempt.input_hash,'inputPayload',attempt.input_payload,
          'inputCanonical',attempt.input_canonical,'activityType','axwise_operation');
        expected := expected || jsonb_build_object('createAttempts',jsonb_build_array(created));
        stage_patch := jsonb_build_object('status','queued');
        outbox := jsonb_build_object('idempotencyKey','dispatch:' || (next_attempt ->> 'operationId'),
          'commandType','dispatch_activity','stageId',stage.id,'attemptId',next_attempt -> 'attemptId',
          'operationId',next_attempt -> 'operationId','inputHash',attempt.input_hash,
          'artifact',NULL,'availableAt',event -> 'occurredAt');
      ELSE
        stage_patch := jsonb_build_object('status','failed');
        run_patch := jsonb_build_object('status','failed');
      END IF;
    WHEN 'ActivityCompleted' THEN
      keys := keys || ARRAY['result','nextAttempts'];
      IF event -> 'nextAttempts' IS DISTINCT FROM '[]'::jsonb OR jsonb_array_length(p_plan -> 'createArtifacts') <> 1 THEN
        RAISE EXCEPTION 'capability completion cannot create successors' USING ERRCODE = '42501';
      END IF;
      result_type := CASE operation_type WHEN 'CompileScopeV2' THEN 'scope_compiled'
        WHEN 'AdmitTranscriptCorpusV1' THEN 'transcript_corpus_admitted'
        WHEN 'AnalyzeEvidenceV1' THEN 'evidence_analyzed' ELSE 'simulation_completed' END;
      kind := CASE operation_type WHEN 'CompileScopeV2' THEN 'scope'
        WHEN 'AdmitTranscriptCorpusV1' THEN 'transcript_corpus'
        WHEN 'AnalyzeEvidenceV1' THEN 'qualitative_analysis' ELSE 'simulation' END;
      artifact := event #> '{result,artifact}';
      canonical := p_plan #>> '{createArtifacts,0,canonicalContent}';
      IF event #>> '{result,resultType}' IS DISTINCT FROM result_type OR artifact IS NULL OR
         artifact ->> 'kind' IS DISTINCT FROM kind OR artifact ->> 'contentType' IS DISTINCT FROM 'application/json' OR
         artifact -> 'markdown' IS DISTINCT FROM 'null'::jsonb OR
         artifact - ARRAY['artifactId','artifactHash','kind','contentType','payload','markdown','sourceArtifactIds'] <> '{}'::jsonb OR
         canonical IS NULL OR canonical::jsonb IS DISTINCT FROM jsonb_build_object(
           'contentType','application/json','payload',artifact -> 'payload','markdown',NULL) OR
         orqaly.sha256_text(canonical) IS DISTINCT FROM artifact ->> 'artifactHash' THEN
        RAISE EXCEPTION 'capability result is not the exact typed immutable artifact' USING ERRCODE = '22023';
      END IF;
      IF operation_type = 'CompileScopeV2' THEN
        IF artifact #>> '{payload,authority,canonicalInputHash}' IS DISTINCT FROM attempt.input_hash OR
           artifact -> 'sourceArtifactIds' IS DISTINCT FROM '[]'::jsonb THEN
          RAISE EXCEPTION 'scope artifact does not bind the compiler input' USING ERRCODE = '42501';
        END IF;
        SELECT stored.* INTO gate FROM orqaly.workflow_stages AS stored
          WHERE stored.tenant_id = run.tenant_id AND stored.run_id = run.id AND stored.kind = 'gate_1';
        IF gate.id IS NULL OR gate.status <> 'pending' THEN
          RAISE EXCEPTION 'scope approval gate is not pending' USING ERRCODE = '42501';
        END IF;
        run_patch := jsonb_build_object('status','awaiting_gate_1');
      ELSIF operation_type = 'AdmitTranscriptCorpusV1' THEN
        IF artifact -> 'payload' IS DISTINCT FROM attempt.input_payload -> 'corpus' OR
           artifact -> 'sourceArtifactIds' IS DISTINCT FROM '[]'::jsonb THEN
          RAISE EXCEPTION 'admitted corpus bytes or provenance changed' USING ERRCODE = '42501';
        END IF;
        run_patch := jsonb_build_object('status','awaiting_capability_input');
      ELSE
        IF artifact #> '{payload,acceptedScope}' IS DISTINCT FROM attempt.input_payload -> 'acceptedScope' OR
           artifact #> '{payload,request}' IS DISTINCT FROM attempt.input_payload -> 'request' OR
           (operation_type = 'SimulateV1' AND artifact #>> '{payload,operationId}' IS DISTINCT FROM attempt.operation_id::text) OR
           artifact #> '{payload,sourceArtifacts}' IS DISTINCT FROM (CASE operation_type WHEN 'AnalyzeEvidenceV1' THEN
             jsonb_build_array(attempt.input_payload #> '{source,artifact}') ELSE
             attempt.input_payload #> '{request,grounding,sourceArtifacts}' END) THEN
          RAISE EXCEPTION 'paid result does not bind its approved request and source references' USING ERRCODE = '42501';
        END IF;
        SELECT jsonb_agg(id ORDER BY id) INTO source_ids FROM (
          SELECT DISTINCT value ->> 'artifactId' AS id FROM jsonb_array_elements(
            jsonb_build_array(attempt.input_payload -> 'acceptedScope') || (artifact #> '{payload,sourceArtifacts}'))
        ) AS sources;
        IF artifact -> 'sourceArtifactIds' IS DISTINCT FROM source_ids THEN
          RAISE EXCEPTION 'paid result lineage differs from the exact approved source set' USING ERRCODE = '42501';
        END IF;
        run_patch := jsonb_build_object('status','completed','final_artifact_id',artifact -> 'artifactId');
      END IF;
      expected_artifact := artifact || jsonb_build_object('stageId',stage.id,'attemptId',attempt.id,
        'operationId',attempt.operation_id,'inputHash',attempt.input_hash,'canonicalContent',canonical);
      expected := expected || jsonb_build_object('createArtifacts',jsonb_build_array(expected_artifact));
      stage_patch := jsonb_build_object('status','completed','output_artifact_id',artifact -> 'artifactId');
      attempt_patch := jsonb_build_object('status','succeeded','clear_lease',true);
  END CASE;
  expected := expected || jsonb_build_object('stageMutations',jsonb_build_array(
    jsonb_build_object('id',stage.id,'expectedVersion',stage.row_version,'patch',stage_patch)),
    'attemptMutations',jsonb_build_array(jsonb_build_object('id',attempt.id,'expectedVersion',attempt.row_version,'patch',attempt_patch)));
  IF gate.id IS NOT NULL THEN
    expected := jsonb_set(expected, '{stageMutations}', expected -> 'stageMutations' || jsonb_build_array(
      jsonb_build_object('id',gate.id,'expectedVersion',gate.row_version,'patch',jsonb_build_object('status','awaiting_approval'))));
  END IF;
  IF run_patch IS NOT NULL THEN
    expected := expected || jsonb_build_object('runMutation',jsonb_build_object('id',run.id,'expectedVersion',run.row_version,'patch',run_patch));
  END IF;
  IF outbox IS NOT NULL THEN
    IF NOT outbox ? 'attemptId' THEN
      outbox := outbox || jsonb_build_object('stageId',stage.id,'attemptId',attempt.id,
        'operationId',attempt.operation_id,'inputHash',attempt.input_hash,'artifact',NULL);
    END IF;
    expected := expected || jsonb_build_object('outbox',jsonb_build_array(outbox));
  END IF;
  IF event - keys <> '{}'::jsonb OR NOT event ?& COALESCE(expected_keys,keys) OR p_plan IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'capability worker plan differs from its permitted leased lifecycle' USING ERRCODE = '22023';
  END IF;
END
$$;
REVOKE ALL ON FUNCTION orqaly.guard_capability_worker_plan_025(orqaly.workflow_runs,jsonb) FROM PUBLIC;

CREATE FUNCTION orqaly.capability_run_invariant_025()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, orqaly
AS $$
BEGIN
  IF NEW.request_payload ? 'workProfile' AND
      NOT orqaly.capability_profile_valid_025(NEW.request_payload -> 'workProfile') THEN
    RAISE EXCEPTION 'invalid explicit capability work profile' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND (OLD.request_payload ? 'workProfile' OR NEW.request_payload ? 'workProfile') AND
      (ROW(OLD.tenant_id,OLD.id,OLD.owner_user_id,OLD.owner_organization_id,OLD.mode,
           OLD.contract_version,OLD.request_hash,OLD.request_payload) IS DISTINCT FROM
       ROW(NEW.tenant_id,NEW.id,NEW.owner_user_id,NEW.owner_organization_id,NEW.mode,
           NEW.contract_version,NEW.request_hash,NEW.request_payload)) THEN
    RAISE EXCEPTION 'capability owner, profile and disclosed request are immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION orqaly.capability_run_invariant_025() FROM PUBLIC;
CREATE TRIGGER capability_run_invariant_025 BEFORE INSERT OR UPDATE ON orqaly.workflow_runs
  FOR EACH ROW EXECUTE FUNCTION orqaly.capability_run_invariant_025();

CREATE FUNCTION orqaly.capability_attempt_invariant_025()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, orqaly
AS $$
DECLARE profile jsonb; prior_profile jsonb; capability_input boolean;
BEGIN
  SELECT request_payload -> 'workProfile' INTO profile FROM orqaly.workflow_runs
    WHERE tenant_id = NEW.tenant_id AND id = NEW.run_id;
  capability_input := COALESCE(NEW.input_payload ->> 'type' IN ('AdmitTranscriptCorpusV1','AnalyzeEvidenceV1','SimulateV1'), false);
  IF TG_OP = 'UPDATE' THEN
    SELECT request_payload -> 'workProfile' INTO prior_profile FROM orqaly.workflow_runs
      WHERE tenant_id = OLD.tenant_id AND id = OLD.run_id;
    IF (profile IS NOT NULL OR prior_profile IS NOT NULL OR capability_input OR
        OLD.input_payload ->> 'type' IN ('AdmitTranscriptCorpusV1','AnalyzeEvidenceV1','SimulateV1')) AND
       ROW(OLD.tenant_id,OLD.run_id,OLD.stage_id,OLD.id,OLD.attempt_number,OLD.activity_type,
           OLD.operation_id,OLD.input_hash,OLD.input_payload,OLD.input_canonical) IS DISTINCT FROM
       ROW(NEW.tenant_id,NEW.run_id,NEW.stage_id,NEW.id,NEW.attempt_number,NEW.activity_type,
           NEW.operation_id,NEW.input_hash,NEW.input_payload,NEW.input_canonical) THEN
      RAISE EXCEPTION 'capability attempt identity, input and consent are immutable' USING ERRCODE = '55000';
    END IF;
  END IF;
  IF capability_input AND (NOT orqaly.capability_profile_valid_025(profile) OR
      (TG_OP = 'INSERT' AND (NOT pg_has_role(session_user,'orqaly_api','MEMBER') OR
        pg_has_role(session_user,'orqaly_worker','MEMBER') OR pg_has_role(session_user,'orqaly_identity','MEMBER')))) THEN
    RAISE EXCEPTION 'new capability attempts require the exclusive owner API profile' USING ERRCODE = '42501';
  END IF;
  IF profile IS NOT NULL AND (NEW.activity_type <> 'axwise_operation' OR NEW.input_payload ? 'executionAgent' OR
      NEW.input_payload ->> 'type' NOT IN ('CompileScopeV2','AdmitTranscriptCorpusV1','AnalyzeEvidenceV1','SimulateV1')) THEN
    RAISE EXCEPTION 'capability attempts cannot change activity families' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION orqaly.capability_attempt_invariant_025() FROM PUBLIC;
CREATE TRIGGER capability_attempt_invariant_025 BEFORE INSERT OR UPDATE ON orqaly.stage_attempts
  FOR EACH ROW EXECUTE FUNCTION orqaly.capability_attempt_invariant_025();

-- Keep the original OID, ledger body and all lease/CAS/receipt checks. A guard
-- in that same body makes cached original-OID calls safe independently of ACL
-- invalidation. The only body change is this single leading validation call.
ALTER FUNCTION orqaly.apply_transition(uuid,uuid,jsonb) RENAME TO apply_transition_private_025;
REVOKE ALL ON FUNCTION orqaly.apply_transition_private_025(uuid,uuid,jsonb)
  FROM PUBLIC, orqaly_api, orqaly_worker, orqaly_identity, orqaly_bootstrap;
DO $$
DECLARE definition text; original_body text; guarded_body text;
BEGIN
  SELECT prosrc, pg_get_functiondef(oid) INTO original_body, definition
    FROM pg_proc WHERE oid = 'orqaly.apply_transition_private_025(uuid,uuid,jsonb)'::regprocedure;
  IF orqaly.sha256_text(original_body) <> 'd80a1a623e3962a55d1fe4682aceeca2aa1b750b164758965746d83c502d3343' THEN
    RAISE EXCEPTION 'original transition body changed before guard installation' USING ERRCODE = '55000';
  END IF;
  guarded_body := replace(original_body, E'BEGIN\n  IF p_plan',
    E'BEGIN\n  PERFORM orqaly.guard_capability_transition_025(p_tenant_id, p_run_id, p_plan);\n  IF p_plan');
  IF guarded_body = original_body OR replace(guarded_body,
      E'  PERFORM orqaly.guard_capability_transition_025(p_tenant_id, p_run_id, p_plan);\n','') <> original_body THEN
    RAISE EXCEPTION 'transition guard did not preserve the complete historical ledger body' USING ERRCODE = '55000';
  END IF;
  EXECUTE replace(definition, original_body, guarded_body);
END
$$;

CREATE FUNCTION orqaly.apply_transition(p_tenant_id uuid, p_run_id uuid, p_plan jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, orqaly
AS $$
BEGIN
  IF p_plan #>> '{event,type}' IN ('CapabilityRunRequested','CapabilityScopeApproved','CapabilityActivityRequested') THEN
    RAISE EXCEPTION 'capability owner commands require their API-only endpoint' USING ERRCODE = '42501';
  END IF;
  RETURN orqaly.apply_transition_private_025(p_tenant_id, p_run_id, p_plan);
END
$$;
REVOKE ALL ON FUNCTION orqaly.apply_transition(uuid,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION orqaly.apply_transition(uuid,uuid,jsonb) TO orqaly_api, orqaly_worker;

CREATE FUNCTION orqaly.apply_capability_transition(p_tenant_id uuid, p_run_id uuid, p_plan jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, orqaly
AS $$
DECLARE event jsonb := p_plan -> 'event'; profile jsonb := event -> 'workProfile';
BEGIN
  IF NOT pg_has_role(session_user,'orqaly_api','MEMBER') OR
     pg_has_role(session_user,'orqaly_worker','MEMBER') OR pg_has_role(session_user,'orqaly_identity','MEMBER') OR
     pg_has_role(session_user,orqaly.rpc_owner_name(),'MEMBER') OR
     orqaly.current_tenant_id() IS DISTINCT FROM p_tenant_id THEN
    RAISE EXCEPTION 'exclusive owner API tenant role required' USING ERRCODE = '42501';
  END IF;
  IF event ->> 'type' IS NULL OR event ->> 'type' NOT IN
      ('CapabilityRunRequested','CapabilityScopeApproved','CapabilityActivityRequested') OR
     event ->> 'tenantId' IS DISTINCT FROM p_tenant_id::text OR
     event ->> 'runId' IS DISTINCT FROM p_run_id::text OR
     event ->> 'eventId' IS NULL THEN
    RAISE EXCEPTION 'explicit capability owner event required' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':' || (event ->> 'eventId')::uuid::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('capability-run:' || p_tenant_id::text || ':' || p_run_id::text, 0));
  IF event ->> 'type' = 'CapabilityRunRequested' THEN
    IF NOT orqaly.capability_profile_valid_025(profile) OR
       event ->> 'ownerUserId' IS NULL OR event ->> 'ownerUserId' !~ '^user_[A-Za-z0-9]+$' OR
       event -> 'ownerOrganizationId' IS DISTINCT FROM 'null'::jsonb OR event ->> 'mode' IS DISTINCT FROM 'simple' OR
       NOT EXISTS (SELECT 1 FROM orqaly.tenant_identity_bindings AS binding JOIN orqaly.tenants AS tenant
         ON tenant.id = binding.tenant_id AND tenant.status = 'active'
         WHERE binding.tenant_id = p_tenant_id AND binding.provider = 'clerk' AND
           binding.subject_type = 'user' AND binding.subject_id = event ->> 'ownerUserId') THEN
      RAISE EXCEPTION 'capability initialization requires its personal bound owner' USING ERRCODE = '42501';
    END IF;
    INSERT INTO orqaly.workflow_runs (tenant_id,id,owner_user_id,owner_organization_id,mode,status,
      contract_version,request_hash,request_payload,row_version)
    VALUES (p_tenant_id,p_run_id,event ->> 'ownerUserId',NULL,'simple','requested','orqaly.workflow.v2',
      event ->> 'requestHash',jsonb_build_object('request',event ->> 'request','workProfile',profile),0)
    ON CONFLICT (tenant_id,id) DO NOTHING;
  END IF;
  RETURN orqaly.apply_transition_private_025(p_tenant_id, p_run_id, p_plan);
END
$$;
REVOKE ALL ON FUNCTION orqaly.apply_capability_transition(uuid,uuid,jsonb)
  FROM PUBLIC, orqaly_worker, orqaly_identity, orqaly_bootstrap;
GRANT EXECUTE ON FUNCTION orqaly.apply_capability_transition(uuid,uuid,jsonb) TO orqaly_api;

-- Readiness attestation is completed below before this transaction commits.
CREATE FUNCTION orqaly.capability_work_schema_ready_025()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, orqaly
AS $$
DECLARE owner_id oid; owner_name name; valid boolean; function_row record;
  api_member boolean := pg_has_role(session_user,'orqaly_api','MEMBER');
  worker_member boolean := pg_has_role(session_user,'orqaly_worker','MEMBER');
BEGIN
  SELECT p.proowner, r.rolname INTO owner_id, owner_name FROM pg_proc AS p
    JOIN pg_roles AS r ON r.oid = p.proowner WHERE p.oid = 'orqaly.rpc_owner_name()'::regprocedure
      AND NOT r.rolsuper AND NOT r.rolbypassrls;
  IF owner_id IS NULL OR owner_name IS DISTINCT FROM current_user OR api_member = worker_member OR
     pg_has_role(session_user,'orqaly_identity','MEMBER') OR pg_has_role(session_user,owner_id,'MEMBER') OR
     has_function_privilege(session_user,'orqaly.apply_transition_private_025(uuid,uuid,jsonb)','EXECUTE') OR
     has_function_privilege(session_user,'orqaly.apply_capability_transition(uuid,uuid,jsonb)','EXECUTE') IS DISTINCT FROM api_member OR
     has_table_privilege(session_user,'orqaly.workflow_runs','INSERT,UPDATE,DELETE,TRUNCATE') OR
     has_table_privilege(session_user,'orqaly.stage_attempts','INSERT,UPDATE,DELETE,TRUNCATE') THEN
    RETURN false;
  END IF;
  -- Every boundary helper is pinned, including the guard inside the preserved
  -- original OID. These hashes are generated from this reviewed migration file.
  FOR function_row IN SELECT * FROM (VALUES
    ('orqaly.capability_identity_json_025(jsonb)', 'b11fe3ee6ac5e41904f9a3d485b8ac8253fe83f08b649f3744fc5fbd5ea3dc48', false),
    ('orqaly.capability_unsigned_input_025(text,jsonb)', 'df7a229c48c6e9d6b42172ab7f8f3e90c03fe21a92cc8088dc34ba5f56926061', false),
    ('orqaly.capability_profile_valid_025(jsonb)', '7550569312b108cb5caa1eca82dedaf9ab577410ab7e62b5623d4d7165256535', false),
    ('orqaly.capability_scope_request_025(jsonb)', 'eae54f6aa9169738fb62e468d516b28d3878f331611495aacacf27653c260b16', false),
    ('orqaly.validate_capability_input_025(orqaly.workflow_runs,jsonb,text)', 'd20b515968e574cfdbc5003067f0bd0aded5380a854bbbf70d9ad7a636a7dbd5', true),
    ('orqaly.guard_capability_transition_025(uuid,uuid,jsonb)', '81f6052df7cc04087518f7132d3bc0faa5a65859f38ab410006d3cc065bbcf51', true),
    ('orqaly.guard_capability_worker_plan_025(orqaly.workflow_runs,jsonb)', '3117d3645c16d89ab88b997ea15db80c0a1a78efaa442cd1bf7147cf2da332b1', true),
    ('orqaly.capability_run_invariant_025()', 'd40b291e7b35411b22601131bfee013137827b85f051cd868810a345b4622987', false),
    ('orqaly.capability_attempt_invariant_025()', '0aa5e2c5082600b6b8dc008bab58c2e3b1a51e5ace33ded76ccff20deb683a15', false),
    ('orqaly.apply_transition(uuid,uuid,jsonb)', '9853bf604c4769467827e49fadcb4ca387ad4ed512f47b852384d0adb6e1b8e0', true),
    ('orqaly.apply_capability_transition(uuid,uuid,jsonb)', 'af66c13de54acb7905fc2a20184d120115e9596a7886f0161dba2a9c9785696e', true),
    ('orqaly.apply_transition_private_025(uuid,uuid,jsonb)', '837c9d398883096738731b8c5cf4911611e7f0dd1665882eb0d3d3b747b538a4', true)
  ) AS expected(signature,source_hash,security_definer) LOOP
    SELECT p.proowner = owner_id AND p.prosecdef = function_row.security_definer AND
        p.proconfig = ARRAY['search_path=pg_catalog, orqaly'] AND
        orqaly.sha256_text(p.prosrc) = function_row.source_hash
      INTO valid FROM pg_proc AS p WHERE p.oid = to_regprocedure(function_row.signature);
    IF valid IS DISTINCT FROM true THEN RETURN false; END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_class WHERE oid IN (
      'orqaly.workflow_runs'::regclass,'orqaly.workflow_stages'::regclass,
      'orqaly.workflow_stage_dependencies'::regclass,'orqaly.stage_attempts'::regclass,
      'orqaly.approvals'::regclass,'orqaly.artifacts'::regclass,'orqaly.artifact_lineage'::regclass,
      'orqaly.workflow_events'::regclass,'orqaly.outbox_events'::regclass)
        AND (NOT relrowsecurity OR NOT relforcerowsecurity)) OR
     NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'orqaly.workflow_runs'::regclass
       AND conname = 'workflow_runs_status_check' AND convalidated AND NOT connoinherit AND
       pg_get_constraintdef(oid) = 'CHECK ((status = ANY (ARRAY[''requested''::text, ''running''::text, ''awaiting_gate_1''::text, ''awaiting_gate_2''::text, ''completed''::text, ''completed_with_evidence_gaps''::text, ''blocked''::text, ''failed''::text, ''cancelled''::text, ''awaiting_capability_input''::text])))') OR
     NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'orqaly.workflow_runs'::regclass
       AND conname = 'workflow_runs_capability_idle_check' AND convalidated AND NOT connoinherit) OR
     (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgenabled = 'O' AND
       tgtype = 23 AND tgnargs = 0 AND tgqual IS NULL AND tgattr = ''::int2vector AND
       ((tgrelid = 'orqaly.workflow_runs'::regclass AND tgname = 'capability_run_invariant_025' AND
         tgfoid = 'orqaly.capability_run_invariant_025()'::regprocedure) OR
        (tgrelid = 'orqaly.stage_attempts'::regclass AND tgname = 'capability_attempt_invariant_025' AND
         tgfoid = 'orqaly.capability_attempt_invariant_025()'::regprocedure))) <> 2 THEN
    RETURN false;
  END IF;
  FOR function_row IN SELECT p.oid,p.proname,p.proowner,p.proacl FROM pg_proc AS p
      JOIN pg_namespace AS n ON n.oid = p.pronamespace WHERE n.nspname = 'orqaly' AND
        (p.proname LIKE '%\_025' ESCAPE '\' OR p.proname IN ('apply_transition','apply_capability_transition')) LOOP
    IF EXISTS (SELECT 1 FROM aclexplode(COALESCE(function_row.proacl,acldefault('f',function_row.proowner)))
      WHERE privilege_type <> 'EXECUTE' OR is_grantable OR
        NOT (grantee = owner_id OR
          (function_row.proname IN ('apply_transition','apply_capability_transition','capability_work_schema_ready_025') AND grantee = 'orqaly_api'::regrole) OR
          (function_row.proname IN ('apply_transition','capability_work_schema_ready_025') AND grantee = 'orqaly_worker'::regrole))) THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
END
$$;
REVOKE ALL ON FUNCTION orqaly.capability_work_schema_ready_025() FROM PUBLIC, orqaly_identity, orqaly_bootstrap;
GRANT EXECUTE ON FUNCTION orqaly.capability_work_schema_ready_025() TO orqaly_api, orqaly_worker;

COMMIT;
