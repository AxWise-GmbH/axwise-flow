BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Add one design-only operation. Preserve leases, ownership/RLS and stage-attempt
-- uniqueness; no release, credential or runtime authority is granted here.
ALTER TABLE axwise.cognitive_operations
  DROP CONSTRAINT cognitive_operations_operation_type_check;

ALTER TABLE axwise.cognitive_operations
  ADD CONSTRAINT cognitive_operations_operation_type_check CHECK (operation_type IN (
    'AssistantTurnV1', 'CompileScopeV2', 'CompileScopeV3', 'ReviseScopeV2',
    'ExecuteResearchV2', 'SynthesizeArtifactV1', 'PrepareSolutionV1'
  ));

COMMIT;
