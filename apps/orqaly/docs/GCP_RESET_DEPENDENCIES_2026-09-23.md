# GCP dependencies after the Goose reset — 23 September 2026

Read-only inventory of Cloud Run services, domain mappings, scheduled jobs,
bucket names and allowlisted runtime configuration. No secret payloads or tenant
data were read. No cloud resource was changed, paused or deleted by this audit.
Service presence does not prove active use; retirement candidates below have
not been proved idle.

## Product decision after this audit

Keep the Axwise website and its application services. The user chose to retain
Axwise and pursue a genuinely local, bundled Goose specialist extension for
desktop use. The inventory below identifies what ordinary reset chat does not
call; it is **not** a decision to retire services still supporting Axwise.
See `LOCAL_AXWISE_EXTENSION_PLAN_2026-09-23.md` for the intended boundary.

## Website and desktop release targets

Live mappings in `axwise-v2-preview-001`, region `europe-west4`, both reported
Ready:

| Domain | Cloud Run service |
| --- | --- |
| `orqanix.com` | `orqaly-v2-web-preview` |
| `preview.orqanix.com` | `orqaly-v2-web-preview` |

These are two hostnames for the same deployment, not isolated production and
preview websites. The installer bucket is
`orqaly-preview-downloads-161074549006`. The website release descriptor is
`src/pages/Landing/simple/desktop-release.js`; its installer metadata must match
the published artifact. Website builds use `deploy/workflow-v2/cloudbuild.web.yaml`
and `Dockerfile.web`, with the Clerk public key and explicit API origin as inputs.

## Keep for the reset

- `orqaly-v2-web-preview`, its domain mappings and the installer bucket.
- `orqaly-v2-api-preview`, or a separately extracted thin desktop service, for
  authenticated model transport, grounded search and optional JEV decisions and
  engineering review.
- Existing Clerk configuration, Gemini credentials, and optional TypeSafe
  credentials. The `axwise-*` prefix on the Gemini and TypeSafe secret names does
  not make those secrets legacy-only.
- Artifact Registry and required build infrastructure.
- Current shared SQL, networking and bootstrap configuration until the API
  process is actually separated from the legacy workflow runtime.

The observed API, web, Orqaly worker, Axwise API and Axwise worker revisions all
ended in `r239dae5142b`. This is an observation before the reset publication,
not a claim about subsequent deployment state.

## Not required by ordinary reset chat: retirement candidates

These services remain dependencies of legacy workflows, existing integrations
or a future optional Axwise specialist. They are not required for direct desktop
weather/currency retrieval or the new independent Gemini search path.

| Services | Existing purpose or dependency |
| --- | --- |
| `axwise-v2-preview`, `axwise-v2-worker-preview` | Axwise API and durable research/capability work. Current Orqaly API and worker still configure `AXWISE_SERVICE_URL`. |
| `axwise-v2-search-preview` | SearXNG. The Axwise worker still has an explicit `SEARXNG_URL` binding. |
| `orqaly-v2-worker-preview` | Legacy durable Orqaly workflow and capability processing. |
| `orqaly-agentic-control-preview` | Legacy agent/control-plane workflows; explicitly referenced by the API. |
| `orqaly-agentic-n8n-preview`, `orqaly-agentic-tool-gateway-preview` | Legacy bounded execution and gateway services. |
| `orqaly-coding-sandbox-preview` | Cloud workflow coding sandbox, referenced by the API and worker. This is not the local desktop OMP process. |
| `orqaly-solution-n8n-preview`, `orqaly-solution-n8n-preview-002`, `orqaly-solution-n8n-preview-003` | Legacy solution execution environments. |

No global queue, saved-workflow or active-execution audit was performed.
Therefore these are cleanup candidates, not approved deletion targets. Preserve
database contents, artifacts and recoverable configuration pending an explicit
retirement decision.

## Thin router is not yet a thin server process

`server/workflow-v2/goose-provider-config.js` separates the desktop routes from
legacy workflow context. However, `deploy/workflow-v2/Dockerfile.service` still
starts `server/workflow-v2/api-main.js`. That entrypoint unconditionally creates
PostgreSQL repositories, the Axwise client and workflow/solution services.

The live API still mounts `orqaly-v2-preview-001-pg`, the `workflow-v2-preview`
network and all-traffic VPC egress, together with database and legacy workflow
secret references. Do not remove SQL, networking, database secrets or
`AXWISE_SERVICE_URL` merely because ordinary desktop chat no longer calls them.
Missing configuration can still prevent the process from starting.

Local OMP remains a separate optional capability. Its model transport uses
`/desktop/v1/chat/completions`; JEV edit review uses
`/desktop/v1/engineering/review`. Explicit research-reference validation can
still require access to legacy completed work. The reset source retains review
independently of legacy prompt/context injection; this audit does not establish
deployed OMP acceptance.

## Periodic jobs and monitoring

Two Cloud Scheduler jobs were enabled, each on `*/15 * * * *`:

- `orqanix-agent-evaluations-preview` invokes the same-named Cloud Run job. Its
  suite exercises old assistant/research and engineering paths; it is not the
  new controlled desktop reset benchmark. Pause or rework it before treating
  its output as reset quality evidence.
- `orqanix-heartbeat-preview` invokes the same-named Cloud Run job. This is HTTP
  monitoring of public pages and API readiness, not a model workload; retain it
  if that monitoring remains useful.

The additional Cloud Run jobs `orqaly-agentic-migrate-preview` and
`orqaly-agentic-n8n-bootstrap-preview` are legacy maintenance resources; listing
them does not establish recurring execution. Evaluation and heartbeat buckets
retain historical/dashboard data and should not be deleted as an incidental
part of publishing the reset.

## Separate Axwise production and old preview resources

Project `axwise-73425` is separate. Live mappings point `axwise.de` to
`axwise-flow` and `api.axwise.de` to `axwise-backend`. Its inventory also includes
`axwise-backend-scope-preview`, `axwise-orqaly-worker`,
`axwise-orqaly-scope-worker`, `axwise-searxng`, and older `axwise-v2-preview`,
`orqaly-v2-api-preview`, `orqaly-v2-web-preview` and
`orqaly-v2-worker-preview` services.

Do not confuse their repeated service names with the current desktop project.
Any retirement there needs a separate scope and dependency check; this audit
does not authorize changes to those sites or their stored data.

## Possible infrastructure follow-up (separate approval required)

Publish and verify the reset while retaining bootstrap dependencies. Then add a
standalone production thin entrypoint with only desktop authentication, model
transport, search and optional decision/review capabilities. Once that boundary
is verified, distinguish retained Axwise website dependencies from genuinely
unused desktop-only infrastructure. Request explicit cleanup approval for exact services and
schedules, including a decision about unfinished test work and retained data.
Stopping obsolete compute and deleting persistent data are separate decisions.
