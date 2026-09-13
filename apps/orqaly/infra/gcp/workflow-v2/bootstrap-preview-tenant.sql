BEGIN;

SET LOCAL ROLE orqaly_bootstrap;
SELECT set_config('orqaly.tenant_id', :'tenant_id', true);

INSERT INTO orqaly.tenants (id, display_name)
VALUES (:'tenant_id'::uuid, :'tenant_display_name')
ON CONFLICT (id) DO NOTHING;

INSERT INTO orqaly.tenant_identity_bindings (
  tenant_id,
  provider,
  environment,
  subject_type,
  subject_id
)
VALUES (:'tenant_id'::uuid, 'clerk', 'preview', 'user', :'clerk_user_id')
ON CONFLICT (provider, environment, subject_type, subject_id) DO NOTHING;

SET LOCAL ROLE orqaly_identity;
SELECT 1 / (
  (
    SELECT provisioned.tenant_id = :'tenant_id'::uuid AND NOT provisioned.created
    FROM orqaly.ensure_personal_tenant('preview', :'clerk_user_id') AS provisioned
  )
)::integer AS binding_verified;
SET LOCAL ROLE orqaly_bootstrap;

INSERT INTO orqaly.tenant_agents (
  tenant_id,
  id,
  name,
  capabilities,
  tool_ids,
  quality_score,
  cost_per_run_cents
)
VALUES (
  :'tenant_id'::uuid,
  :'agent_id'::uuid,
  'Preview Research and Product Agent',
  ARRAY['research', 'evidence_synthesis', 'prd', 'product_strategy']::text[],
  '{}'::uuid[],
  0.95000,
  25
)
ON CONFLICT (tenant_id, id) DO NOTHING;

-- Idempotency adopts only the exact seed. Conflicting tenant or catalogue
-- state fails closed instead of silently changing an existing Preview owner.
SELECT 1 / (EXISTS (
  SELECT 1 FROM orqaly.tenants
  WHERE id = :'tenant_id'::uuid
    AND display_name = :'tenant_display_name'
    AND status = 'active'
))::integer AS tenant_verified;

SELECT 1 / (EXISTS (
  SELECT 1 FROM orqaly.tenant_identity_bindings
  WHERE tenant_id = :'tenant_id'::uuid
    AND provider = 'clerk'
    AND environment = 'preview'
    AND subject_type = 'user'
    AND subject_id = :'clerk_user_id'
))::integer AS identity_verified;

SELECT 1 / (EXISTS (
  SELECT 1 FROM orqaly.tenant_agents
  WHERE tenant_id = :'tenant_id'::uuid
    AND id = :'agent_id'::uuid
    AND name = 'Preview Research and Product Agent'
    AND status = 'active'
    AND capabilities = ARRAY['research', 'evidence_synthesis', 'prd', 'product_strategy']::text[]
    AND tool_ids = '{}'::uuid[]
    AND quality_score = 0.95000
    AND cost_per_run_cents = 25
))::integer AS agent_verified;

COMMIT;
