# Bounded native HTTPS delivery

Implemented locally on 2026-09-06. This document does not claim a cloud rollout
or a real customer/provider action. Existing preview environments 001 and 002
were not changed by this implementation or its acceptance test.

## What executes

```text
Owner-approved native workflow + frozen connection scope
    │
    ├─ Orqaly: owner/environment/version/revocation checks
    ├─ n8n encrypted credential: connection ID + scope + header secret
    │
    ▼
CUSTOM.boundedHttp v1 (actual n8n node, not an Orqaly replacement POST)
    ├─ one input item, one effect, no native retries/error continuation
    ├─ exact raw parameters hash and node ID match encrypted scope
    ├─ fixed HTTPS destination + POST, verified public DNS and TLS
    ├─ one bounded request; no redirects or response-content forwarding
    ▼
Native response → server-pinned delivery/correlation headers
    ▼
Orqaly verifies actual execution ID + connection ID + delivery acknowledgement
```

The custom node returns only `delivery`, HTTP `statusCode`, a fixed diagnostic
code (or null), `responseBytes`, and the opaque `connectionId`. Provider response
bodies, headers and error text are discarded. A 2xx acknowledgement proves a
request was accepted by that receiver, not that the receiver enforces its token
or that a downstream business process completed.

The first external capability is JSON delivery to a fixed public HTTPS receiver.
It is **not** arbitrary HTTP fetch, OAuth setup, arbitrary GitHub actions or SMS
account registration. Those can be designed as dependencies but are not silently
converted into this action. Stock HTTP Request, GitHub, Twilio, Code and shell
nodes remain unauthorized under this runtime policy.

## Exact enforcement

| Boundary | Enforcement |
| --- | --- |
| Destination | Canonical `https:` URL, port 443, no query, fragment, user-info, IP literal, URL expression or local/reserved hostname suffix |
| DNS/connect | Every DNS answer must be public unicast; reject mapped/transition/private/link-local/metadata/documentation/shared-address ranges. Pin a validated address without second DNS lookup; require exact socket address and valid hostname TLS before sending headers/body |
| Request | POST only; one JSON item; 32 KiB UTF-8 body; frozen parameter hash and connection scope/version |
| Headers | One separately stored credential header plus transport-owned JSON headers; no incoming auth/cookies/Google/N8N headers; deny transport/hop-by-hop/proxy overrides |
| Response | 8 KiB headers, 64 KiB wire bytes, 64 KiB decompressed bytes; identity/gzip/deflate only, bounded streaming discard; no provider content enters receipts |
| Time | 15-second whole operation including DNS; 5-second connection/TLS deadline; no retry |
| Ambiguity | Any failure after request dispatch is unknown. No unknown outbound error enters the pure-workflow failure/automatic-repair path |
| Cardinality | Exactly one outbound node, no cycles, unique predecessor path, node rejects multiple items, every response must follow delivery |
| Credential authority | Orqaly connection records must match owner/environment/type/parameter scope; only exact server-generated native credential ID/name/type is used; metadata rechecked before runtime actions |
| Persistence | Native successful and failed execution-data retention both `none` for outbound tests/releases. Orqaly stores sanitized proof; no raw provider runData is requested |

This is application-level egress enforcement, not a claim that an arbitrary
untrusted n8n runtime is a complete OS sandbox. Keep the native allowlist, file/env
restrictions, private ingress, SSRF flag, no global SSRF allow exceptions, and
reviewed image/configuration alongside it. All side effects still require user
approval. A revoked connection blocks new admissions but cannot undo a request
already sent.

## Packaging and policy

- Package: `infra/n8n/nodes-orqaly-bounded-http`.
- Image: `infra/n8n/bounded-http.Dockerfile`, pinned base n8n 2.37.10 registry
  digest `sha256:848166b4051fd4251869f48c18455bddff922f04cb2f2676929463ba973dbde2`.
- Native namespace verified from pinned `CustomDirectoryLoader`: `CUSTOM.boundedHttp`.
- Package content hash:
  `2a8a544204006d48217725bde9fb1e4e81ffeca40895d91cf011370d1c558201`.
- `createBoundedHttpPolicy({imageDigest})` requires the **built custom image**
  digest, not an invented or base-image digest. The server policy also pins the
  package hash and transport version, and only permits the reviewed pure types
  plus the one custom node. Changing package bytes changes the policy hash.
- Required management scopes: workflow create/read/list/delete/activate/deactivate;
  execution read/list (pure tests); credential create/read/delete. Recovery of a
  credential whose creation acknowledgement was lost additionally requires
  credential list; without that scope recovery remains explicitly unknown.
  No workflow
  update, credential update, credential decryption, or owner MCP capability.

## Local acceptance evidence

`node scripts/native-outbound-local-e2e.mjs` executed the actual pinned n8n node
and credential API against a real TLS receiver inside an internet-disabled,
internal Docker network. Synthetic public-unicast addresses allowed testing the
production public-address guard unchanged; a temporary synthetic CA verified the
receiver hostname. Docker-exec management avoided adding a host network path.
No private-address exception or custom TLS bypass exists in the production node.

The final run included `NODES_INCLUDE` for reviewed pure nodes + CUSTOM,
`NODES_EXCLUDE` for stock HTTP/Code/shell/file nodes, SSRF protection and
environment/file restrictions.

| Controlled case | Actual result | Receiver requests |
| --- | --- | --- |
| `/ok` with separately stored synthetic credential | n8n execution `1`, accepted acknowledgement, verified connection/node receipt | 1 |
| `/redirect` | n8n execution `2`, rejected/redirect denied; redirect target never called | 1 |
| `/disconnect` after receiving POST | `outcome_unknown`, no invented execution ID and no retry | 1 |
| `/compressed` with oversized gzip expansion | `outcome_unknown`, bounded decompression and no retry | 1 |

All four receiver calls carried the expected synthetic credential. No incoming
cookie, N8N management key, Google identity header or Orqaly invocation header was
forwarded. A receiver echoing the stored secret did not expose it in any returned
evidence. Every disposable workflow and credential was removed; only the owned
test containers/network were deleted. Synthetic TLS artifacts remain in a
task-specific temporary directory for audit.

Automated unit/regression coverage additionally checks SSRF address families,
mixed DNS, address rebinding, invalid TLS, all byte/deadline limits, getter-free
JSON validation, credential/parameter/version scope, graph bypass/duplication,
explicit test consent, fake receipts and immutable credential cleanup.

### Durable Build, release and revision acceptance

`node scripts/native-workflow-build-local-e2e.mjs` now additionally calls
`native-outbound-build-local-e2e.mjs` against real PostgreSQL 16 restricted roles
and a separate actual n8n/TLS fixture. The designer is explicitly a deterministic
fixture, not a claimed model run. The complete owner-facing lifecycle passed:

1. Save the separate credential: zero receiver calls.
2. Approve the exact Build test: API returns queued with zero calls; a recreated
   worker claims it and produces the first authenticated delivery.
3. Verify the connection using migration 018's narrow worker-only function,
   consuming immutable, successful, consented execution proof. API execution of
   the function, general worker status updates, and mismatched test, connection
   or tenant IDs are denied. Rechecking exact proof sends nothing.
4. Review and hand off the exact graph, then stage a Solution: no delivery.
5. Explicitly approve the Solution's real-effect test: second delivery. Its
   persisted evidence pins workflow and connection scope; replay sends nothing.
6. Activate, then invoke production: activation sends nothing; invocation is the
   third delivery.
7. Review and stage a native revision with the same exact connection scope.
   Its test requires fresh explicit approval and produces the fourth delivery.
8. A durable synthetic unknown receipt blocks new human and application-key
   sends without another receiver request. Credential revocation still permits
   pausing the already active workflow. Revocation is not represented as undo.

All four actual deliveries used the separate synthetic credential, and no
incoming authentication leaked. The pre-existing pure native graph, repair,
schedule, revision and machine-access suite still passed with its 11 actual
executions. The final focused transport, credential, lifecycle, readiness and UI
regression run passed 217 tests.
Owned test containers and networks were removed after the run. No cloud or real
provider request was made by this local acceptance.

The actual local runtime also passed credential reconciliation after deliberately
omitting the recorded provider ID: a complete, at-most-100-entry metadata list
identified only the exact task UUID name and credential type; a fresh read
verified it, one DELETE removed it, and a 404 readback proved absence. Repeating
cleanup by its known ID returned the same absence without another delete. A
cursor, duplicate name, mismatched type/ID, missing list permission or uncertain
readback produces `unknown`; cleanup never creates credentials or repeats the
business action.

Before preview promotion: independently review the transport, build the exact
package/image, verify private environment scope/configuration, then run one
explicitly approved real receipt test through Orqaly's durable worker path. Local
proof does not substitute for that deployment acceptance.
