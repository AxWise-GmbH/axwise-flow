BEGIN;

DO $$
DECLARE
  constraint_name name;
BEGIN
  SELECT candidate.conname
    INTO constraint_name
    FROM pg_constraint AS candidate
   WHERE candidate.conrelid = 'axwise.cognitive_operations'::regclass
     AND candidate.contype = 'c'
     AND pg_get_constraintdef(candidate.oid) LIKE '%operation_type%';
  IF constraint_name IS NULL THEN
    RAISE EXCEPTION 'cognitive operation type constraint not found';
  END IF;
  EXECUTE format(
    'ALTER TABLE axwise.cognitive_operations DROP CONSTRAINT %I',
    constraint_name
  );
END
$$;

ALTER TABLE axwise.cognitive_operations
  ADD CONSTRAINT cognitive_operations_operation_type_check CHECK (operation_type IN (
    'AssistantTurnV1', 'CompileScopeV2', 'ReviseScopeV2',
    'ExecuteResearchV2', 'SynthesizeArtifactV1'
  ));

COMMIT;
