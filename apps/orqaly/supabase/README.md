# Supabase migrations

Run every active `.sql` file in `supabase/migrations/` in numeric order through
**Supabase Dashboard → SQL Editor**. Files under `migrations/legacy/` are retained
for history and must not be applied.

Before deployment, run `node scripts/verify-migrations.mjs`. CI performs the
same inventory check and the migration contract tests, but it does not execute
SQL against staging or production. Take a timestamped backup, verify its restore
procedure, and run the read-only
`node scripts/preflight-release-migrations.mjs` against each target. Resolve
migration-191 outcome-job duplicates and review migration-192 team
deactivations before proceeding. Apply new migrations to staging first, verify
the target workflow, then apply the identical files to production before or in
the same coordinated window as dependent code. Record the highest applied
migration number in the release evidence.

Migration 194 is a two-phase credential boundary. It adds OAuth Vault-pointer
metadata and `NOT VALID` checks that reject new plaintext OAuth/tool/workflow
credential writes without destructively changing legacy rows. Deploy it before
the dependent application code. Legacy OAuth and tool credentials are not read
by the new code: users must reconnect/re-enter them so the server can encrypt
with the external `ORQ_KEK_V1` and clear that row. SQL cannot perform that
encryption because the KEK is intentionally outside Supabase. Treat backups and
unmigrated rows as sensitive until a separately approved cleanup is complete;
then validate all migration-194 constraints. Workflow credential execution has
no Vault-backed release path yet and remains fail-closed.

Migration 195 adds the transient `authorizing_execution` goal status used to
reserve the second human approval while its exact snapshot is bound to tasks.
Deploy it before the dependent approval code. Interrupted reservations recover
to `awaiting_approval` after the active binding job is gone; they never advance
execution without another authenticated confirmation.
