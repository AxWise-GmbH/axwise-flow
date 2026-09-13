# Orqaly Tool Gateway

This private service is the narrow effect boundary behind self-hosted n8n. The
first allowlisted operation is `operational_record_create_v1`: it commits one
tenant-scoped operational record after atomically redeeming a five-minute
Gateway grant, then returns an Ed25519-signed effect receipt.

It is deliberately not an Agent runtime. It receives no conversation,
principal token, persona, memory or provider credential. The accepted request
is the strict n8n connector projection and is bound to organization, workspace,
run, step, effect, descriptor, executor binding, input hash, approval hash,
connection and idempotency key.

## Runtime contract

`POST /v1/effects/execute` requires:

- a workload `Authorization` bearer token;
- `x-orqaly-request-id` equal to the exact attempt ID;
- `idempotency-key` equal to `logical_effect:<approved key>`; and
- the strict `orqaly_n8n_connector_request_v1` JSON body.

In GCP, Cloud Run IAM verifies the Google-signed token before the container is
invoked. The service then checks issuer, custom audience and the exact n8n
service-account claims. `roles/run.invoker` must contain only
`orqaly-n8n-preview@axwise-v2-preview-001.iam.gserviceaccount.com`. Local token
mode exists only for isolated tests and is rejected when Cloud Run IAM mode is
selected.

The success receipt includes a signed attestation with:

- `operational_record_id`;
- `idempotency_key`;
- `idempotency_state` (`created` or `replayed`);
- the canonical input and output hashes;
- observation time and zero observed external cost; and
- receipt hash, signing key ID and Ed25519 signature.

The control plane independently verifies the signature and all tenant/run/step/
attempt/effect/descriptor identities before showing success.

## Required database boundary

The Gateway connects as a dedicated LOGIN role that is a member of the
NOLOGIN capability role `orqaly_gateway`. That capability role may execute only
`orqaly.redeem_agentic_gateway_grant(...)` and select/insert
`orqaly.agentic_operational_records` and `orqaly.agentic_gateway_effects`.
Grant redemption, the operational record and the immutable effect row occur in
one PostgreSQL transaction. A replay returns the original record/output and a
new signed replay observation; a conflicting idempotency identity fails closed.

Schema is owned by
`database/workflow-v2/migrations/008_agentic_execution_preview.sql`.

## Environment

Required variables:

- `DATABASE_URL`: dedicated Gateway LOGIN connection from
  `orqaly-v2-preview-001-db-gateway-url`;
- `TOOL_GATEWAY_AUTH_MODE`: `cloud_run_iam` in Preview;
- `TOOL_GATEWAY_AUDIENCE`: `https://tool-gateway.agentic.internal`;
- `EXPECTED_N8N_SERVICE_ACCOUNT`:
  `orqaly-n8n-preview@axwise-v2-preview-001.iam.gserviceaccount.com`;
- `TOOL_GATEWAY_ATTESTATION_PRIVATE_KEY`: PKCS#8 Ed25519 PEM from
  `orqaly-v2-preview-001-gateway-attestation-private-key`;
- `TOOL_GATEWAY_ATTESTATION_KEY_ID`: `preview_gateway_v1`;
- `OPERATIONAL_RECORD_DESCRIPTOR_HASH`:
  `8979da2128c0c4305d0756118d8761eaa83a65bfdc19a219b1abc2cd33e5e2dd`;
- `N8N_EXECUTOR_BINDING_HASH`:
  `2f2c52f8940de8eb8daa680d5663b9073af0c7768108ea144ac9fe2d2e3bdcea`;
  and
- `TOOL_GATEWAY_CONNECTION_REFERENCE`:
  `orqaly-internal-operational-record-v1`.

The public key is supplied separately to the control plane. The n8n identity
must never receive the Gateway database URL or signing private key.

Run tests with `npm test`.
