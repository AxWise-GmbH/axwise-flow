BEGIN;

DO $$
DECLARE
  operation_type_constraint name;
  stage_attempt_constraint name;
BEGIN
  SELECT candidate.conname
    INTO operation_type_constraint
    FROM pg_constraint AS candidate
   WHERE candidate.conrelid = 'axwise.cognitive_operations'::regclass
     AND candidate.contype = 'c'
     AND pg_get_constraintdef(candidate.oid) LIKE '%operation_type%';

  SELECT candidate.conname
    INTO stage_attempt_constraint
    FROM pg_constraint AS candidate
   WHERE candidate.conrelid = 'axwise.cognitive_operations'::regclass
     AND candidate.contype = 'u'
     AND (
       SELECT array_agg(attribute.attname::text ORDER BY member.ordinality)
       FROM unnest(candidate.conkey) WITH ORDINALITY AS member(attnum, ordinality)
       JOIN pg_attribute AS attribute
         ON attribute.attrelid = candidate.conrelid
        AND attribute.attnum = member.attnum
     ) = ARRAY['tenant_id', 'stage_attempt_id', 'operation_type'];

  IF operation_type_constraint IS NULL OR stage_attempt_constraint IS NULL THEN
    RAISE EXCEPTION 'cognitive operation V2 constraints not found';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM axwise.cognitive_operations
    GROUP BY tenant_id, stage_attempt_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'stage attempt has more than one cognitive operation';
  END IF;

  EXECUTE format(
    'ALTER TABLE axwise.cognitive_operations DROP CONSTRAINT %I',
    operation_type_constraint
  );
  EXECUTE format(
    'ALTER TABLE axwise.cognitive_operations DROP CONSTRAINT %I',
    stage_attempt_constraint
  );
END
$$;

ALTER TABLE axwise.cognitive_operations
  ADD CONSTRAINT cognitive_operations_operation_type_check CHECK (operation_type IN (
    'AssistantTurnV1', 'CompileScopeV2', 'CompileScopeV3', 'ReviseScopeV2',
    'ExecuteResearchV2', 'SynthesizeArtifactV1'
  )),
  ADD CONSTRAINT cognitive_operations_tenant_stage_attempt_key
    UNIQUE (tenant_id, stage_attempt_id);

COMMIT;
