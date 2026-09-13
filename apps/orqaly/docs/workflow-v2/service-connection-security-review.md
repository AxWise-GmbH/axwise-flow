# Service connections: pinned n8n security review

Reviewed 2026-09-05 against the installed `n8nio/n8n:2.37.10` image and official
version-tagged sources. **This is an implementation boundary, not a claim that
outgoing customer integrations are deployed or tested.** Source inspection used
ephemeral, network-disabled, read-only containers; no credentials, cloud settings
or workflows were changed and no external request was executed.

## What the pinned runtime provides

| Area                   | Verified behavior and consequence                                                                                                                                                                                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Credential API         | `/api/v1/credentials` supports creation; `/api/v1/credentials/:id` supports metadata reads, update and deletion; `/api/v1/credentials/:id/test` tests stored credentials. Creation/read responses omit credential data. Use the server-owned API boundary, not native editor credential/decryption endpoints. |
| Header credential      | `httpHeaderAuth` keeps header `name` and secret `value` in n8n's encrypted credential data. A workflow refers to a credential by type and `{id,name}`; the secret must not appear in workflow parameters, answers or model input.                                                                             |
| Connection proof       | Generic Header Auth declares no built-in test. The stored-credential test can return HTTP 200 with `status: Error` and no test function. Creation, existence, or transport HTTP 200 is **not** proof that a receiver accepted authentication.                                                                 |
| Credential destination | Injected `allowedHttpRequestDomains` defaults to `all`. Set `domains` plus one exact normalized hostname in `allowedDomains`. This hostname restriction does not bind HTTPS, port, path or method; Orqaly must bind those separately.                                                                         |
| SSRF                   | Global protection defaults to **false**. When enabled, the HTTP helper checks DNS before sending, uses a secure connect-time lookup and validates redirect hops. Explicit hostname/IP allow entries can bypass blocked-IP checks.                                                                             |
| Redirects              | HTTP Request v4+ follows redirects when its redirect option is absent. Versions before 4.4 default to forwarding credentials across origins. Pin node version 4.5 and explicitly disable redirects and cross-origin credential forwarding.                                                                    |
| Request privacy        | HTTP Request sanitizes credential headers in its UI request message. This is not a guarantee that a receiver's response, error details, a secret embedded in a URL, or every log is safe to persist.                                                                                                          |
| Response size          | Both pinned HTTP transports initialize effectively unlimited response sizes (`maxContentLength` is `-1` or `Infinity`). Limiting output after Orqaly receives it does not bound n8n's earlier allocation. A timeout and Cloud Run memory limit are not a byte limit.                                          |

Primary references: [credential API handlers](https://raw.githubusercontent.com/n8n-io/n8n/n8n%402.37.10/packages/cli/src/public-api/v1/handlers/credentials/credentials.handler.ts),
[Header Auth type](https://raw.githubusercontent.com/n8n-io/n8n/n8n%402.37.10/packages/nodes-base/credentials/HttpHeaderAuth.credentials.ts),
[HTTP Request implementation](https://raw.githubusercontent.com/n8n-io/n8n/n8n%402.37.10/packages/nodes-base/nodes/HttpRequest/V3/HttpRequestV3.node.ts),
[SSRF configuration](https://raw.githubusercontent.com/n8n-io/n8n/n8n%402.37.10/packages/%40n8n/config/src/configs/ssrf-protection.config.ts),
and [official SSRF guidance](https://docs.n8n.io/hosting/securing/ssrf-protection/).

Exact additional installed source paths, relative to
`/usr/local/lib/node_modules/n8n/`, were inspected rather than assuming current
documentation describes the pinned binary:

- `dist/public-api/v1/openapi.yml`, `dist/public-api/v1/handlers/credentials/credentials.mapper.js`,
  `node_modules/@n8n/api-types/dist/schemas/credential-response.schema.js`.
- `dist/services/credentials-tester.service.js`: generic credential test fallback.
- `node_modules/n8n-workflow/dist/cjs/credential-domain-restrictions.js`: injected
  fields, exact-host matching and default allow-all behavior.
- `node_modules/@n8n/backend-network/dist/ssrf/ssrf-protection.service.js` and
  `http/node-agents.js`: all-address validation, secure lookup and IP connection guard.
- The same package's `http/axios/redirect.js`, `http/axios/request.js` and
  `http/legacy-request.js`: redirect revalidation and response-size defaults.
- `node_modules/n8n-nodes-base/dist/nodes/HttpRequest/GenericFunctions.js`:
  request-message redaction, not arbitrary response-body redaction.

## Recommended first HTTPS POST capability

1. Persist a tenant/owner/environment-bound connection reference and immutable
   connection version. Collect the secret in a dedicated secure form; send it
   only through the authenticated backend to the selected n8n credential store.
   Keep management credentials server-only, use the environment's existing stable
   encryption key, and retain only opaque credential references in ordinary
   records. Do not allow customers to supply arbitrary existing credential IDs.
2. Freeze the exact customer-authorized public HTTPS destination, method `POST`,
   port 443, body schema and connection version into the reviewed release. Reject
   URL expressions, user-info, fragments, secret-bearing URLs, arbitrary query
   strings, IP literals and non-public/metadata destinations. Never copy incoming
   application authentication, cookies, arbitrary headers or URL fields downstream.
3. Keep `N8N_SSRF_PROTECTION_ENABLED=true` and blocked ranges enabled. Leave
   `N8N_SSRF_ALLOWED_HOSTNAMES` and allowed IP ranges empty for this public-only
   capability: **a customer hostname must not become a global SSRF exception**.
   Add relevant non-public ranges beyond defaults, including shared-address space,
   and retain infrastructure-level egress restrictions as defense in depth.
4. Compile a fixed native HTTP node with credential-domain restriction, verified
   TLS, no redirects, no proxy override, no pagination, bounded request timeout
   and one bounded JSON payload. Native saves may not widen those constraints.
   Keep arbitrary Code, HTTP-tool and credential/admin endpoints unavailable.
   Actual delivery remains an n8n execution, not an Orqaly-side replacement POST.
5. Before accepting arbitrary customer endpoints, implement and test a byte-bounded
   transport/egress boundary or audited bounded n8n node, including decompressed
   response limits. Until then, restrict acceptance to an explicitly controlled
   receiver and disclose the response-memory limitation; do not describe the
   stock HTTP node as a fully bounded untrusted-egress sandbox.
6. Show **Saved, not verified** after credential creation. Require explicit approval
   for a real test to the frozen destination; testing a POST is an external effect.
   Persist a small allowlisted acknowledgement/status and correlation ID, not raw
   upstream headers/body/errors that may echo a secret. A successful delivery is
   not by itself proof that an endpoint enforces authentication or is legally owned
   by the customer. Do not auto-register, purchase or send SMS as a connection test.
7. Preserve `saveDataSuccessExecution=none` and `saveDataErrorExecution=none`.
   Orqaly owns the sanitized durable receipt. Use idempotency keys when the receiver
   supports them; an ambiguous POST is **unknown**, not safe to retry automatically.
   Rotation creates a new connection version and invalidates affected approvals.
   Revocation blocks new dependent invocations and deletes only the exact owned
   credential after considering in-flight runs; it cannot undo an already sent POST.

The current preview operator already explicitly enables SSRF and environment/file
access restrictions, but includes only Webhook, Set and Respond to Webhook nodes.
An HTTP-node allowlist expansion and safe outbound capability require a reviewed
runtime change and independent execution proof; this research does not authorize
or perform that rollout.
