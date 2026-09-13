# Private self-hosted n8n executor

This deployment is an internal connector runner, not the Orqaly product UI and not an authority service. Customers review, approve or reject the exact action and inspect its result in Orqaly. Goal-level pause/cancel controls do not interrupt an already-dispatched connector write. n8n receives only the strict `orqaly_n8n_connector_request_v1` projection, calls one fixed internal Tool Gateway URL, and returns the Gateway receipt unchanged. The full execution envelope never enters n8n.

It intentionally has:

- a Community image pinned to the immutable OCI index digest recorded in
  `executor-bindings.json`;
- one execution at a time for Preview;
- no automatic workflow retries;
- a five-second metadata identity timeout and 20-second Gateway timeout inside
  the 30-second Orqaly action deadline;
- no saved success, failure, progress or manual execution payloads;
- no customer/provider credentials;
- only one opaque provider-account connection reference and one scoped Gateway
  grant reference per connector call;
- no Code, shell, SSH or filesystem nodes; and
- an internal-only Docker network. The checked-in workflow is inactive as a
  source artifact; the reviewed bootstrap job publishes those exact bytes only
  after the Tool Gateway, private ingress and conformance checks are ready.

The connector projection contains only tenant, run, step, attempt, immutable
action-intent and effect identity; pinned descriptor and executor-binding
identity; the exact canonical connector input and its hash; effect/egress
policy; deadline, policy, approval and idempotency bindings; targets and
preconditions; and opaque connection/grant references. It deliberately omits
the principal, Agent identity, persona, sealed context, artifact references,
reasoning limits and callback reference. Those reserved concepts are also
rejected recursively inside canonical connector input, while similarly named
provider parameters are not rejected by substring. The workflow reconstructs
this exact top-level field set instead of forwarding the webhook body.

Two different proofs are required:

1. `gatewayGrant` is customer authority. It is opaque, bound to the complete
   external-action scope by an RFC 8785 hash, names the exact Gateway audience,
   and may live for at most five minutes. Every connector read, external
   notification and write requires it and exactly one opaque provider-account
   connection reference. Public-source evidence lookup stays a `retrieve`
   step and does not use n8n or a provider-account grant.
2. `Authorization` is platform workload identity. The workflow obtains a
   short-lived Google-signed ID token directly from the Cloud Run metadata
   server, with the manifest-pinned `toolGatewayAudience`, then uses it only for
   the fixed Tool Gateway call. The incoming control-plane request cannot
   project or override this header. Cloud Run IAM must verify the token and the
   Gateway additionally requires the exact issuer, expiry, audience and
   manifest-pinned n8n service-account subject before resolving any customer
   grant. Workload identity is not customer action authority; both proofs are
   required.

Local infrastructure inspection:

1. Copy `.env.example` to `.env` and replace both secrets.
2. Attach an internal Tool Gateway service as `tool-gateway` on the `n8n-private` network.
3. Start with `docker compose up -d`.
4. Inspect the runtime and database without publishing the GCP-bound workflow.

The checked-in production workflow intentionally acquires identity from the
GCP metadata server and calls the exact Preview Gateway URL. A local container
without that workload identity must fail closed; do not add a fake metadata
token or relax the Gateway to make it run. Use the Gateway's explicit local
authentication mode only in automated tests.

`executor-bindings.json` is the authoritative, RFC 8785 content-addressed
deployment manifest. Its binding hash covers the immutable n8n image digest,
workflow byte hash, fixed webhook and Tool Gateway address, metadata identity
endpoint and audience, expected service-account subject, step kinds and
security posture. The manifest-level hash additionally covers the exact
descriptor/binding allowlist. Preview currently permits only the reviewed
`operational_record_create_v1` descriptor as a `connector_write`; everything
else remains denied. Orqaly rejects mutable image tags, changed workflow bytes,
arbitrary webhook paths, provider credentials and n8n-owned retries.

Regenerate the descriptor/binding pack only after reviewed source changes:

```sh
node infra/n8n/scripts/generate-execution-pack.mjs
node infra/n8n/scripts/verify-execution-pack.mjs
```

The current workflow SHA-256 is
`bb70d048e588eb2be1ae706668e3c2016a4fc2b876c2830ba2f65838c1ca823b`;
the binding hash is
`90da06a5e27263e11891eff9cc0982546b93d4b7425b7b6f5ca550131b9147ee`;
the descriptor hash is
`c02032d38de3f05d6bd4c9d72e54e6b92e2c1c30d470edc62913e76c417add57`;
and the full manifest hash is
`ee3c76ac1c0a2cb20928e437c082712177276b6587efadbe481e9bfd5d2cc6d2`.

After a write request is sent, an HTTP error, timeout, oversized or malformed
response, identity mismatch, unknown signing key or invalid Gateway signature
cannot prove that the provider effect was absent. The adapter reports those
cases as ambiguous and the control plane must reconcile them; only a verified
Gateway `not_applied` attestation establishes a known non-effect.

For this internal PostgreSQL record only, migration 009 adds a narrower recovery
proof: lock the original grant, verify it expired unused, and verify neither an
effect nor a record exists. The original attempt remains unchanged in audit
history. The customer may then prepare and approve a new exact action. Active
grants, committed effects, missing grants and cross-owner/tenant queries remain
blocked. Grant redemption rechecks wall-clock expiry after acquiring its lock.
This is not automatic retry and is not a recovery policy for external providers.

Migration 010 handles the opposite case: the Gateway committed the record and
signed receipt, but the n8n response was lost. Reading the action loads that
receipt through an owner-scoped RPC. The API verifies its original input,
descriptor, binding and Ed25519 signature before an audited, idempotent RPC
changes `outcome_unknown` to `succeeded`. The original transport error and time
remain recorded; there is no second dispatch. Old receipts are verified against
their saved action identity, not a newly installed workflow version.

For this existing preview, apply committed migrations 009 then 010 through
`scripts/apply-preview-recovery.mjs` (pass `010` and set
`ORQALY_APPLY_PREVIEW_RECOVERY=apply-reviewed-migration-010` for the latter).
The script checks committed bytes and the prior migration ledger. The baseline
008 release scripts intentionally reject this newer ledger; do not rerun them
as a repair path.

The pinned workflow uses Respond to Webhook's native `firstIncomingItem` mode
to return the Gateway JSON without an expression-backed `$json` object. This
avoids the response expression path implicated by the observed native n8n
crash; it does not disable the expression sandbox or add write retries.

Run `bash infra/n8n/test/run-response-canary.sh` from the repository to verify
the exact response-node parameters in the pinned n8n runtime. It checks ten
nested JSON responses using synthetic data, a temporary in-memory filesystem,
no external network and no customer credentials. This isolates response-node
behavior; it is not a substitute for GCP IAM/Cloud SQL/end-to-end verification.

For GCP, the runtime remains the digest-pinned stock n8n image behind internal
Cloud Run ingress with a dedicated service account and separate n8n PostgreSQL
database. An operator-only bootstrap image imports and publishes the exact
content-addressed workflow; the runtime receives no workflow-management API
key. The Gateway runs as a separate private service and persists the real
tenant-scoped operational record plus signed receipt atomically in Orqaly Cloud
SQL. Do not let the control plane impersonate the n8n service account or expose
the editor, webhook or Gateway publicly.

See `GCP_PREVIEW_EXECUTION.md` for the exact Preview service names, identities,
network route, bootstrap procedure, release order and explicit IAM/secret
approval blockers.
