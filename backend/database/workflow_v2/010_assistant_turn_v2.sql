BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- AssistantTurnV2 adds typed presentation capabilities while retaining the
-- existing cognitive-operation ledger, RLS policies, leases and terminal
-- facts. Refuse to modify an unexpected constraint definition so a drifted
-- database cannot be silently widened.
DO $assistant_turn_v2_migration$
DECLARE
  current_definition text;
  previous_definition constant text := $previous$CHECK((operation_type=ANY(ARRAY['AssistantTurnV1'::text,'CompileScopeV2'::text,'CompileScopeV3'::text,'ReviseScopeV2'::text,'ExecuteResearchV2'::text,'SynthesizeArtifactV1'::text,'PrepareSolutionV1'::text,'PrepareSolutionV2'::text,'AdmitTranscriptCorpusV1'::text,'AnalyzeEvidenceV1'::text,'SimulateV1'::text])))$previous$;
  expected_definition constant text := $expected$CHECK((operation_type=ANY(ARRAY['AssistantTurnV1'::text,'AssistantTurnV2'::text,'CompileScopeV2'::text,'CompileScopeV3'::text,'ReviseScopeV2'::text,'ExecuteResearchV2'::text,'SynthesizeArtifactV1'::text,'PrepareSolutionV1'::text,'PrepareSolutionV2'::text,'AdmitTranscriptCorpusV1'::text,'AnalyzeEvidenceV1'::text,'SimulateV1'::text])))$expected$;
BEGIN
  IF NOT COALESCE((
    SELECT relrowsecurity AND relforcerowsecurity
    FROM pg_class WHERE oid = to_regclass('axwise.cognitive_operations')
  ), false) THEN
    RAISE EXCEPTION 'Expected existing FORCE-RLS cognitive operation ledger';
  END IF;

  SELECT regexp_replace(pg_get_constraintdef(candidate.oid), '\s+', '', 'g')
    INTO current_definition
    FROM pg_constraint AS candidate
   WHERE candidate.conrelid = 'axwise.cognitive_operations'::regclass
     AND candidate.conname = 'cognitive_operations_operation_type_check'
     AND candidate.contype = 'c'
     AND candidate.convalidated
     AND NOT candidate.connoinherit
     AND candidate.conkey = ARRAY[(
       SELECT attnum FROM pg_attribute
       WHERE attrelid = candidate.conrelid AND attname = 'operation_type'
         AND NOT attisdropped
     )]::smallint[];

  IF current_definition = expected_definition THEN
    RETURN;
  END IF;
  IF current_definition IS DISTINCT FROM previous_definition THEN
    RAISE EXCEPTION 'Unexpected cognitive operation type constraint; expected exact migration 009';
  END IF;

  ALTER TABLE axwise.cognitive_operations
    DROP CONSTRAINT cognitive_operations_operation_type_check;
  ALTER TABLE axwise.cognitive_operations
    ADD CONSTRAINT cognitive_operations_operation_type_check CHECK (operation_type IN (
      'AssistantTurnV1', 'AssistantTurnV2', 'CompileScopeV2', 'CompileScopeV3', 'ReviseScopeV2',
      'ExecuteResearchV2', 'SynthesizeArtifactV1', 'PrepareSolutionV1', 'PrepareSolutionV2',
      'AdmitTranscriptCorpusV1', 'AnalyzeEvidenceV1', 'SimulateV1'
    ));
END
$assistant_turn_v2_migration$;

COMMIT;
