BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Add native-JSON cognition only. This does not grant execution, credential,
-- publishing, tenant-selection or runtime-provisioning authority.
-- Preserve all earlier operation types, leases, RLS and stage-attempt identity.
ALTER TABLE axwise.cognitive_operations
  DROP CONSTRAINT cognitive_operations_operation_type_check;

ALTER TABLE axwise.cognitive_operations
  ADD CONSTRAINT cognitive_operations_operation_type_check CHECK (operation_type IN (
    'AssistantTurnV1', 'CompileScopeV2', 'CompileScopeV3', 'ReviseScopeV2',
    'ExecuteResearchV2', 'SynthesizeArtifactV1', 'PrepareSolutionV1', 'PrepareSolutionV2'
  ));

COMMIT;
