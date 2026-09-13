# Orchestrator – Deployment

## Prerequisites

- Vercel account
- Supabase project
- A supported LLM provider credential
- Independent worker and cron secrets

## Vercel Deployment

1. **Connect repo** to Vercel (GitHub/GitLab/Bitbucket).
2. **Set required environment variables** in Vercel project settings:
   - `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
   - `SUPABASE_URL` and server-only `SUPABASE_SERVICE_ROLE_KEY`
   - independent `WORKER_SECRET` and `CRON_SECRET` values
   - server-only `ORQ_KEK_V1`
   - `LLM_DEFAULT_PROVIDER=gemini`,
     `LLM_DEFAULT_MODEL=gemini-3.8-flash`, and
     `LLM_DEFAULT_CHEAP_MODEL=gemini-3.8-flash`
   - optional `GEMINI_REASONING_EFFORT=medium` (`low`, `medium`, or `high`)
   - server-only `GEMINI_API_KEY` for that Google provider configuration; never
     prefix it with `VITE_` or pass it as a frontend build argument
   - when AxWise is enabled: `AXWISE_ENABLE`, `AXWISE_ENFORCE`,
     `AXWISE_API_URL`, and `AXWISE_API_KEY`
3. **Validate:** run `npm run validate-env:strict`,
   `node scripts/verify-migrations.mjs`, tests, and the production build against
   production-equivalent configuration.
4. **Prepare the database:** complete the backup, read-only preflight, and
   migration steps below before the new deployment receives traffic, or in the
   same coordinated release window.
5. **Deploy:** Vercel builds and deploys on push to main.

### Production promotion gate

Vercel environment variables are scoped. A value configured only for Preview
is absent from the Production deployment even when both deployments use the
same commit. Before promoting an AxWise-enabled release, verify the
**Production** scope for all four `AXWISE_*` variables and for the selected LLM
provider variables, then redeploy so the new runtime receives them.

The following signatures identify configuration or migration failures rather
than an AxWise API outage:

| Production signal                           | Meaning                                                                   | Required action                                                                                    |
| ------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| No Orqaly calls appear in AxWise logs       | AxWise is disabled or its variables are absent in that Vercel environment | Add all four `AXWISE_*` values to **Production**, start with `AXWISE_ENFORCE=shadow`, and redeploy |
| `column goals.loop_advanced does not exist` | Production Supabase has not reached migration 176                         | Apply every unapplied migration in numeric order before redeploying                                |
| `BYOK_REQUIRED` on a user-owned goal        | User-scoped jobs deliberately do not borrow the platform key              | Add the user's Google credential in **Settings → API Keys**; keep `GEMINI_API_KEY` for system jobs |
| Provider returns `401`                      | The selected provider credential is invalid or stale                      | Replace that server/user credential and rerun a signed-in goal                                     |

`node scripts/preflight-release-migrations.mjs` now checks the release-critical
columns from migrations 176 and 194 before checking the data conditions for
migrations 191 and 192. Run it against staging and Production; a clean
repository migration inventory does not prove that either database was
migrated.

Goal handlers may wake `/api/agent?path=process-next` immediately through the
current deployment's server-provided `VERCEL_URL`. That same-origin request uses
the server-only `WORKER_SECRET`; it is not initiated by the browser or relayed
through QStash. The scheduled Vercel Cron route remains the durable fallback and
authenticates independently with `CRON_SECRET`.

See `docs/VERCEL_STEP_BY_STEP.md` for generation instructions and the complete
required/optional variable matrix. Service-role, worker, cron, encryption, and
provider secrets must never use a `VITE_` prefix.

## Supabase Setup

1. Create project at [supabase.com](https://supabase.com).
2. Run `node scripts/verify-migrations.mjs` against the release checkout.
3. Take a timestamped database backup and verify the restore procedure.
4. With the target database's server-only Supabase variables loaded, run the
   read-only `node scripts/preflight-release-migrations.mjs`. It first verifies
   release-critical columns from migrations 176 and 194. Resolve duplicate
   active AxWise outcome jobs before migration 191. Review and explicitly
   accept or resolve any duplicate active goal teams that migration 192 will
   deactivate.
5. Run every unapplied SQL file in `supabase/migrations/` in numeric order,
   staging first and production second. Do not run files under
   `supabase/migrations/legacy/`. Migrations must be applied before, or
   atomically with, code that calls the migration-190 goal-organization RPC.
6. Copy Project URL and anon key to Vercel env.

### Migration 194 credential rollout

Apply migration 194 before deploying the credential-writing code. It adds the
OAuth Vault-pointer columns and `NOT VALID` constraints. PostgreSQL enforces
those constraints for every new insert/update while leaving legacy rows intact;
the migration does not copy, print, or delete existing secrets.

Legacy OAuth rows fail closed in the new application and must reconnect. A
successful reconnect writes an envelope to Vault, stores only its pointer, and
clears the old token columns on that row. Legacy tool credentials must likewise
be re-entered through Tool Setup; that save writes encrypted BYOK and removes
the audited plaintext fields from the tool row. Browser localStorage is cleaned
on read and every subsequent write.

There is no safe SQL-only backfill: `ORQ_KEK_V1` intentionally is not available
to the database. Existing workflow delivery credentials also have no encrypted
runtime release path yet and stay disabled for credentialed execution. After an
authorized operator has verified re-entry/reconnect coverage, remove remaining
legacy values in a separately reviewed cleanup and run `VALIDATE CONSTRAINT` for
the three integration-credential constraints plus the tool/workflow constraints.
Until then, database backups may still contain pre-migration plaintext and must
be handled as sensitive credential material.

### Migration 195 execution-approval rollout

Apply migration 195 before deploying the approval code. It adds the transient
`authorizing_execution` status used as an atomic reservation while Orqaly binds
the second human approval snapshot to every task. If a worker dies during that
short interval, the reconciler returns the goal to `awaiting_approval`; it never
auto-authorizes execution. Apply this migration and the application code in the
same release window so the database constraint cannot reject a valid approval.

## Rollback

- **App:** Revert deployment in Vercel dashboard.
- **Database:** Migrations are forward-only unless a migration explicitly
  documents a safe rollback. Restore from a verified backup when rollback is
  not explicitly supported.

## Health Check

`GET /api/health` returns `{ ok: true }`. Use for load balancers or uptime checks.

That endpoint proves the API function is reachable; it does not prove that the
database schema, user BYOK credential, or AxWise Production scope is ready. The
release sign-off must also run one authenticated goal through context approval,
execution approval, Agent Hub assignment, execution, and AxWise outcome
delivery.
