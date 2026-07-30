# Staging research-assisted benchmark

`scripts/benchmark_orchestration_research.py` measures the live AxWise
research-assisted path without embedding a credential or silently targeting
production. It creates at least 20 authenticated orchestration decisions, polls
each durable hybrid job, refreshes the immutable parent decision, and writes a
JSON gate artifact.

This is a live and potentially billable test. Run it only against an isolated
tenant whose agent and tool catalogue may safely receive benchmark records.

## Safety contract

The command fails before its first HTTP request unless all of these conditions
are true:

- `--confirm` is present.
- `--count` is at least `20`.
- `--environment` explicitly names `staging`, `development`, or `test`.
- The service key is available through the environment variable named by
  `--api-key-env`. There is deliberately no command-line API-key value option.
- The base URL is an absolute HTTP(S) URL without embedded credentials.

`api.axwise.de` is always refused unless the operator supplies the deliberate
double opt-in `--environment production --allow-production --confirm`. That
override should be used only after a separate production approval; the normal
production-readiness gate must run in staging.

## Run

Export the credential in the current shell without putting it in command
history:

```bash
export AXWISE_API_KEY='<staging service key>'
```

Run the default 20-sample gate:

```bash
python scripts/benchmark_orchestration_research.py \
  --base-url https://api.staging.example \
  --environment staging \
  --org-id '<staging Orqaly organisation ID>' \
  --user-id '<staging Orqaly user ID>' \
  --count 20 \
  --concurrency 2 \
  --p95-target-seconds 120 \
  --output tmp/axwise-benchmarks/staging-research.json \
  --confirm
```

`tmp/` is ignored by Git. A custom `--output` path should likewise remain in an
ignored artifact directory. The report file is created with owner-only
permissions.

Useful controls:

- `--sample-size 1` is the default bounded research size.
- `--job-timeout-seconds 600` bounds every durable job.
- `--poll-interval-seconds 5` controls status polling.
- `--request-timeout-seconds 30` controls each HTTP request.
- `--concurrency` controls simultaneous jobs; start conservatively to respect
  model and staging database quotas.

Do not use `--allow-unobservable-profile` on the current stack. It exists only
to diagnose a known legacy staging deployment that does not return
`performance_profile`. An explicit profile other than `quality_fast` always
fails.

## What the report proves

For every sample the harness verifies:

1. The initial immutable decision routes as `research_assisted` and remains
   non-executable pending research.
2. The durable hybrid A+B job reaches a terminal state.
3. The completed dataset reports `quality_fast`.
4. Every audited persona quote has a known source document and valid character
   offsets, and the exact source slice equals the quote.
5. Refreshed decision evidence has a valid provenance label and maps back to an
   offset-linked field quote.
6. The result contains the customer persona and ideal execution persona when
   persona resolution is requested by the orchestration adapter.
7. Both parent and refreshed decisions preserve
   `requires_orqaly_authorization=true`.

The summary includes create-to-terminal minimum, p50, p95 and maximum latency,
benchmark and terminal failure rates, aggregate quote/source/offset counts,
provenance counts, and the serving revision when `/health` exposes it. Tenant
IDs are represented only by short SHA-256 digests. The API key, request
headers, and raw quotes are never written to the report.

The process exits:

- `0` when all samples pass and p95 is within the configured target.
- `1` when the benchmark completes but the quality/latency gate fails.
- `2` for a safety, configuration, transport, or report-writing error.

Archive the JSON artifact with the staging revision and migration evidence used
for the release decision.
