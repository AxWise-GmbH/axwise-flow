# Orqanix website and managed services

This **private** repository retains the historical name `axwise-flow-oss`.
It contains Orqanix's website, authenticated model gateway and the migration
sources for the standalone AxWise extension. The repository name does not mean
that this entire workspace is the public AxWise distribution.

## Product boundaries

| Project | Responsibility | Source |
| --- | --- | --- |
| AxWise extension | Optional discovery, interviews, personas, evidence analysis, PRDs and delivery briefs | [Public AxWise repository](https://github.com/AxWise-GmbH/axwise-flow) |
| Orqanix desktop | Goose conversation/tool loop, approvals, local utilities, optional AxWise and native engineering tools | [Desktop repository](https://github.com/vitalyvishnevsky/orqaly-goose) |
| Orqanix website and gateway | Downloads, production account access, authenticated Gemini/search/JEV transport | This private repository |

AxWise is a specialist tool, not a compulsory router. Enabling it does not send
ordinary chat, weather, news or coding through a remote AxWise workflow. The host
decides when to call it and retains tool permissions and user approvals.

## Source layout

- `apps/orqaly/`: Orqanix website and service code. `orqaly` is a historical
  internal name; renaming it is not required for the production product.
- `apps/axwise-site/`: focused AxWise extension website and distribution links.
- `packages/axwise-local/` and `backend/services/local_axwise/`: current local
  specialist implementation and migration source for the public distribution.
- `packages/axwise-distribution/`: allowlisted standalone source and npm/uv
  artifact generation. Never export this repository wholesale.
- `packages/orqaly-goose-connector/`: Orqanix's account connector and local
  utilities. Its managed authentication is not required by standalone BYOK mode.
- `frontend/` and the remaining `backend/`: retained legacy AxWise web-platform
  implementation, not a promise of standalone-extension feature parity.

The public extension and desktop must share a versioned implementation, not
independently evolving copies. Desktop packaging records exact source hashes.
Standalone releases must pass clean-install checks before public download links
are enabled. Registry availability must not be inferred from a package name.

## Production account access

Orqanix uses the production Clerk instance at `clerk.orqanix.com`. The target is
one production stack; historical `preview` names on Cloud Run resources do not
determine the authentication environment. See the
[cutover checklist](apps/orqaly/docs/CLERK_PRODUCTION_READINESS.md) and release
records for what has actually been deployed.

Account access alone is not the whole managed backend: the desktop also needs
Gemini inference, grounded search and optional JEV endpoints. Model credentials
stay server-side. Standalone AxWise instead uses explicitly configured model
credentials supplied by its operator; model-provider charges still apply.

No new billing system or cloud conversation/artifact synchronization is implied
by this split. Existing local conversations and artifacts must not be deleted or
reassigned automatically when changing Clerk identity.

## Legacy code and retirement

The former web interface, regional enrichment, video/pre-call experiments and
remote workflow orchestration are not required by the local extension. They
remain recoverable in source/history. Service retirement is separate from
package extraction and requires checking callers, queued work and retained data.

The [archived platform overview](docs/archive/README_PRE_EXTENSION_2026-09-24.md)
documents the old product. It is historical context, not the current public
installation guide.
