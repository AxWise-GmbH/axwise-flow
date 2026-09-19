# Cloud Run Launch Verification and Zero-Downtime Rollback Operational Plan

## Overview and Scope

### Operational Objective
This operational plan establishes a structured, documentation-only verification framework for deploying and validating services on Google Cloud Run. It specifies operational procedures for pre-release health inspection, tag-based canary validation, gradual traffic splitting, and zero-downtime rollback execution. The framework provides engineering teams with rigorous observability protocols and stage-gate criteria to validate runtime stability, resource scaling, and error budgets prior to full production cutover.

### Strict Boundaries and Operational Limits
* **Documentation and Verification Only:** In strict compliance with project limits (`req-ac158f817d580d47`, `req-c45703e844624ed9`, `req-183c6a1a37a0db44`), this plan governs passive telemetry observation, read-only system inspection, and procedural verification. It strictly prohibits modifying, provisioning, or mutating live cloud infrastructure during verification activities.
* **No Live Infrastructure Mutation:** Release operators and verification personnel must not provision cloud resources, deploy container images, alter service configuration parameters, or trigger mutating traffic adjustments as part of verification tasks.
* **No Automated Tooling Implementation:** Authoring automated CI/CD deployment pipelines, implementing Infrastructure-as-Code (Terraform) scripts, or building container deployment orchestrators are explicit non-goals.
* **Policy Adherence:** In accordance with project policy (`req-ee05cb6ea0445fee`), all procedures and platform capabilities are derived strictly from official Google Cloud documentation. Because official Google Cloud documentation claims have not yet been formally ingested into the project evidence ledger (`ALLOWED_CLAIM_IDS` is empty), vendor-specific mechanics are designated with '**Pending verification:** ' to reflect the `ready_with_gaps` evidence status.

### Stakeholder Personas and Authority Separation
To maintain operational integrity and prevent uncoordinated release actions, duties are segregated between observation and governance roles:

* **DevOps Engineer (`req-3176c83b63cc9e3b`):**
  * Performs passive, read-only service inspection using `gcloud` CLI commands and the Google Cloud Console.
  * Monitors container startup probe conditions, Cloud Monitoring telemetry, and Cloud Trace latency percentiles.
  * Executes synthetic HTTP verification probes against isolated revision tag URLs.
* **Release Engineer (`req-c5af5cafaf2c86cc`):**
  * Enforces release acceptance criteria, error budget burn thresholds, and mandatory soak interval durations.
  * Holds exclusive authority to grant stage-gate sign-offs prior to traffic percentage increments.
  * Maintains sole authority to declare release regressions and initiate emergency rollback workflows.

### System State Rules and Invariants
The operational plan is governed by four deterministic system rules:
1. **Conservation of Ingress Traffic:** Total public traffic allocation across all revisions is strictly conserved to exactly 100% ($P_{\text{stable}} + P_{\text{candidate}} = 100\%$) across every release milestone.
2. **Explicit Authority Requirement:** Rollout progression between milestones requires dual sign-off: technical metric validation by the DevOps Engineer and formal governance sign-off by the Release Engineer.
3. **Declarative Idempotency:** Rollout and rollback configurations must target explicit, immutable revision identifiers rather than relative percentage deltas, preventing out-of-order execution drift.
4. **Telemetry Safety Invariant:** If monitoring metrics are unavailable, ambiguous, or delayed, the active rollout stage is paused immediately; soak timers do not advance without authoritative confirmation.

---

## Pre-Release Verification & Canary Testing

### Pre-Release Baseline Inspection
Before routing any production traffic to a candidate revision, the DevOps Engineer performs read-only inspection to verify that the deployed revision is immutable, healthy, and isolated.

* **Read-Only Revision Status Query:**
  ```bash
  # Verify revision creation, condition status, and container digest without state mutation
  gcloud run revisions describe <CANDIDATE_REVISION_NAME> \
      --project=<PROJECT_ID> \
      --region=<REGION> \
      --format="yaml(metadata.name,status.conditions,status.observedGeneration)"
  ```
* **Baseline Observability Audit:** Verify that the existing stable revision is actively serving 100% of production traffic and that Cloud Monitoring reports nominal HTTP 5xx error rates (< 0.1%) and stable P95 latency percentiles.

### Tag-Based Canary Testing (0% Production Ingress)
Canary validation isolates the candidate revision from public ingress while enabling end-to-end verification through dedicated routing.

* **Pending verification:** According to official Google Cloud Run documentation, assigning a revision tag (e.g., `canary`) provisions a dedicated, addressable URL (`https://canary---<service-name>-<hash>-<region>.a.run.app`) that routes directly to the candidate revision while keeping public production ingress at 0% on the root domain (`req-a5a90ac80479b141`, `req-d009cb95dcfcb988`).
* **Synthetic Health Validation Workflow:**
  1. The DevOps Engineer executes synthetic HTTP probes against the dedicated tagged canary URL.
  2. Verify HTTP response codes (HTTP 200 OK), header structure, and initialization payload integrity.
  3. Monitor Google Cloud Logging for container startup logs, confirming zero unhandled runtime exceptions, panics, or crashloops.
  4. Confirm via Google Cloud Console or read-only CLI that root domain traffic remains 100% allocated to the stable revision.

### Pre-Release State Verification Model

| State Stage | Stable Revision Allocation | Candidate Revision Allocation | Tag Routing State | Verified Invariant |
| :--- | :--- | :--- | :--- | :--- |
| **Initial Baseline** | 100% | 0% | None | Production baseline active and undisturbed. |
| **Deployment Event** | Deploy immutable candidate revision; assign tag `canary`. | | | Candidate revision deployed in complete isolation. |
| **Canary Validation** | 100% | 0% | `canary` tag URL active | Synthetic probes hit candidate; zero public blast radius. |
| **Gate 1 Evaluation** | 100% | 0% | Verified healthy | Candidate passes Gate 1; approved for gradual traffic exposure. |

---

## Rollback Procedures & Traffic Reallocation

### Official Documentation Rollback Mechanics
* **Pending verification:** **Instantaneous Zero-Downtime Rollback via Traffic Reallocation to Immutable Revision:** In Google Cloud Run, rollback is executed by shifting 100% of ingress traffic back to a known-healthy, previous immutable revision rather than redeploying containers or rolling back source code. Because previous revisions remain deployed and provisioned in the immutable revision record, Cloud Run shifts incoming HTTP requests instantaneously without downtime or cold starts, while existing in-flight connections on the deprecated revision are permitted to drain gracefully (Source: [Google Cloud Run Documentation: Rollouts, rollbacks, and traffic migration](https://cloud.google.com/run/docs/rollouts-rollbacks-traffic-migration)) (`req-13a38b05a74d591b`, `req-21c1051f80261c20`, `req-ee05cb6ea0445fee`).

### Telemetry Anomaly Triggers for Rollback
The Release Engineer immediately halts the release and triggers emergency rollback if any of the following operational thresholds are breached:
* Service HTTP 5xx error rate exceeds 1.0% over a 2-minute rolling observation window.
* P95 request latency degrades by more than 25% relative to the pre-release baseline for > 3 minutes.
* Cloud Logging indicates memory exhaustion (OOMKilled), database connection starvation, or repeated container restarts.
* Unhandled application exceptions or severe client-facing regressions are detected in production telemetry.

### Detailed Zero-Downtime Rollback Procedures (Runbook Reference)
For operational incident response, the following step-by-step procedures are documented. During passive launch verification, these steps serve as runbook reference and are executed only if an authorized emergency rollback is declared (`req-13a38b05a74d591b`).

#### Option A: Google Cloud Console Rollback Workflow
1. In the Google Cloud Console, navigate to the **Cloud Run** section and select the affected service from the services list.
2. Click the **Revisions** tab and select **Manage Traffic**.
3. In the traffic management interface, locate the row corresponding to `<PREVIOUS_STABLE_REVISION>` and set the traffic percentage input to **100%**.
4. Set the candidate revision traffic allocation to **0%**, ensuring the total sums to exactly 100%.
5. Click **Save** to commit the traffic allocation change.
6. In the Revisions overview table, visually verify that 100% of ingress traffic is allocated to `<PREVIOUS_STABLE_REVISION>`.

#### Option B: gcloud CLI Rollback Procedure
```bash
# Reference operational command for incident operators (Rollback to stable anchor):
gcloud run services update-traffic <SERVICE_NAME> \
    --project=<PROJECT_ID> \
    --region=<REGION> \
    --to-revisions=<PREVIOUS_STABLE_REVISION>=100
```

#### Post-Rollback Telemetry Verification
Following traffic reallocation, the DevOps Engineer executes passive read-only queries to confirm complete traffic restoration:
```bash
# Passive verification of active traffic distribution across revisions:
gcloud run services describe <SERVICE_NAME> \
    --project=<PROJECT_ID> \
    --region=<REGION> \
    --format="table(status.traffic[].revisionName, status.traffic[].percent)"
```
* Verify in Cloud Monitoring that HTTP 5xx error rates and P95 latency percentiles normalize to baseline levels within 2 minutes.

### Rollback State Conservation Model

| Rollback Step | Stable Anchor Revision | Candidate Revision | Net Traffic Sum | Validation Invariant |
| :--- | :--- | :--- | :--- | :--- |
| **Pre-Incident State** | $100 - X\%$ | $X\%$ ($X \in \{5, 25, 50\}$) | 100% | Degraded telemetry or alert firing detected. |
| **Rollback Execution** | Reallocate to 100% | Reallocate to 0% | 100% | Declarative rollback command/console action executed. |
| **Post-Rollback State** | 100% | 0% | 100% | Traffic confirmed 100% on stable anchor; candidate traffic reaches 0%. |

---

## Traffic Splitting & Gradual Rollout Verification

### Official Documentation Safe Release Principles
In accordance with official Google Cloud documentation, Cloud Run traffic splitting supports safe releases through two core capabilities (`req-a5a90ac80479b141`, `req-d009cb95dcfcb988`, `req-ee05cb6ea0445fee`):

* **Pending verification:** **Canary Blast-Radius Containment:** Cloud Run traffic splitting enables routing a small, controlled percentage of incoming live requests (e.g., 5% or 10%) to a newly deployed revision while serving the vast majority of traffic from the existing stable revision. This allows engineering teams to observe runtime metrics, error rates, and resource utilization under genuine production workloads while strictly limiting any blast radius in the event of an undetected regression (Source: [Google Cloud Run Documentation: Rollouts, rollbacks, and traffic migration](https://cloud.google.com/run/docs/rollouts-rollbacks-traffic-migration)).
* **Pending verification:** **Multi-Revision Percentage Splitting and Deterministic Cutover:** Cloud Run supports dividing ingress across multiple revisions simultaneously by assigning percentage allocations that sum to exactly 100%. This enables structured, phased rollouts (e.g., 5% → 25% → 50% → 100%) with dedicated soak periods at each threshold, allowing auto-scaling, database connections, and cache layers to adjust gradually prior to full production cutover (Source: [Google Cloud Run Documentation: Rollouts, rollbacks, and traffic migration](https://cloud.google.com/run/docs/rollouts-rollbacks-traffic-migration)).

### Phased Rollout Milestones and Soak Schedule
Progression follows four discrete observational milestones. All numeric durations and operational thresholds represent proposed engineering targets designed to structure verification rigor, not externally guaranteed benchmarks.

```
[Pre-Release: 0% Tagged URL]
              │ (Synthetic probes pass -> Gate 1 sign-off)
              ▼
[Milestone 1: 5% Canary / 95% Stable]
              │ (15-min soak; error rate < 0.1% -> Gate 2 sign-off)
              ▼
[Milestone 2: 25% Traffic / 75% Stable]
              │ (30-min soak; latency within 10% baseline -> Gate 3 sign-off)
              ▼
[Milestone 3: 50% Traffic / 50% Stable]
              │ (30-min soak; scaling verified -> Gate 4 sign-off)
              ▼
[Milestone 4: 100% Full Production Cutover]
              │ (Final verification & exit sign-off)
              ▼
[Post-Launch Observation: 60-min Soak]
```

### Phased Verification Milestones

| Rollout Milestone | Stable % | Candidate % | Minimum Soak Time | Primary Verification Focus | Exit Gate Sign-Off |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Milestone 1: Initial Canary** | 95% | 5% | 15 minutes | Edge-case errors, initialization panics, probe health | Gate 2: DevOps + Release Sign-off |
| **Milestone 2: Scaling Ramp** | 75% | 25% | 30 minutes | Auto-scaling behavior, CPU/memory concurrency | Gate 3: DevOps + Release Sign-off |
| **Milestone 3: Load Validation** | 50% | 50% | 30 minutes | Downstream database load, cache hit ratios, P95 latency | Gate 4: DevOps + Release Sign-off |
| **Milestone 4: Full Cutover** | 0% | 100% | 60 minutes | Complete traffic migration, residual connection drain | Gate 5: Final Launch Sign-off |

### Passive Telemetry Verification Commands
During each soak window, the DevOps Engineer executes read-only CLI commands to verify routing status without mutating configurations:
```bash
# Inspect active traffic allocations across revisions:
gcloud run services describe <SERVICE_NAME> \
    --project=<PROJECT_ID> \
    --region=<REGION> \
    --format="table(status.traffic[].revisionName, status.traffic[].percent, status.traffic[].tag)"
```
* **Pending verification:** Reference syntax for gradual traffic allocation updates executed by authorized deployment tooling:
  ```bash
  gcloud run services update-traffic <SERVICE_NAME> \
      --project=<PROJECT_ID> \
      --region=<REGION> \
      --to-revisions=<CANDIDATE_REVISION_NAME>=5,<CURRENT_STABLE_REVISION>=95
  ```

### Proposed Operational Target Thresholds
* **HTTP 5xx Error Rate:** Sustained < 0.1% of total requests across all tiers.
* **P95 Latency:** Degradation < 10% relative to the pre-release stable baseline.
* **Container Restarts:** Zero unexpected container exits or restart spikes in Cloud Logging.
* **Soak Timer Invariant:** Any transient telemetry anomaly pauses the soak timer. If an application defect is identified, the soak timer resets to zero and rollback is evaluated.

---

## Verification Checklist & Exit Criteria

### Acceptance Criteria Traceability Matrix

| Acceptance Criteria ID | Evaluation Context (Given / When / Then) | Implementation in Verification Plan | Verification Status |
| :--- | :--- | :--- | :--- |
| `acc-11c319003b0bc9f1` | **Given** new revision deployed, **When** verifying launch, **Then** provide documentation-only canary and traffic splitting steps without altering infrastructure. | Sections 2 & 4 specify passive telemetry checks and read-only inspection commands. | Satisfied |
| `acc-1b6cc2311a509d51` | **Given** deliverable boundary, **When** evaluated, **Then** keep it documentation and verification only; do not change infrastructure. | Section 1 defines strict non-goals prohibiting cloud provisioning or configuration mutation. | Satisfied |
| `acc-359bdc3f289fe0b8` | **Given** anomaly during rollout, **When** initiating rollback, **Then** outline exact gcloud and console traffic reallocation steps to 100% stable revision. | Section 3 details step-by-step Console and CLI runbook procedures for 100% traffic reallocation. | Satisfied |
| `acc-51f82a3e0da571ef` | **Given** evidence boundary, **When** evaluated, **Then** provide grounded evidence from official Google Cloud docs on traffic splitting, tags, and gradual rollouts. | Flagged as open evidence gap (`ev-cloud-run-traffic-splitting`) pending official documentation ingestion. | Retained as Gap (Pending Official Evidence Ingestion) |
| `acc-57d319c980b4c7d1` | **Given** deliverable boundary, **When** evaluated, **Then** ensure all verification steps are documentation- and observation-focused without infra changes. | Inspection checklists strictly employ read-only commands (`describe`, `list`) and monitoring dashboards. | Satisfied |
| `acc-60df8c88170a18af` | **Given** evidence boundary, **When** evaluated, **Then** provide grounded evidence from official Google Cloud docs describing Cloud Run rollback mechanics. | Flagged as open evidence gap (`ev-cloud-run-rollback-procedures`) pending official documentation ingestion. | Retained as Gap (Pending Official Evidence Ingestion) |
| `acc-759849751a45661f` | **Given** persona requirement, **When** evaluated, **Then** integrate DevOps Engineer. | DevOps Engineer profiled with specific telemetry inspection and observability tasks. | Satisfied |
| `acc-7653d9f7c727a255` | **Given** limit, **When** evaluated, **Then** do not change any infrastructure. | Negative constraint enforced across all runbooks, checklists, and procedures. | Satisfied |
| `acc-a5e786a27a01ac1b` | **Given** PRD requirement, **When** evaluated, **Then** detail gradual rollout and canary testing methods including revision tags and traffic allocations. | Sections 2 & 4 detail tag-based canary validation and phased traffic splitting milestones (5%, 25%, 50%, 100%). | Satisfied |
| `acc-c0b7bdc9d1e01361` | **Given** PRD requirement, **When** evaluated, **Then** detail zero-downtime rollback procedures using console and gcloud CLI commands. | Section 3 details zero-downtime rollback procedures using Google Cloud Console and gcloud CLI commands. | Satisfied |
| `acc-c9d974259da7bc83` | **Given** plan review, **When** assessing operational constraints, **Then** strictly limit to documentation/verification and prohibit modifying live infrastructure. | Explicitly established as core operational policy in Section 1. | Satisfied |
| `acc-e450cb5b3cc7d538` | **Given** persona requirement, **When** evaluated, **Then** integrate Release Engineer. | Release Engineer profiled with governance, stage sign-off, and rollback authority. | Satisfied |
| `acc-f06f375481632699` | **Given** policy requirement, **When** evaluated, **Then** use only official Google Cloud documentation. | Policy enforced: strictly utilizes official Google Cloud documentation principles and links; unadmitted claims marked provisional. | Satisfied |

### Stage-Gate Verification & Sign-Off Checklist

```
[ ] Gate 0: Pre-Release Readiness
    ├── [ ] Stable revision ID documented as rollback anchor: ____________________
    ├── [ ] Target candidate revision deployed and reports Ready status
    ├── [ ] Current production traffic confirmed 100% on stable revision
    └── [ ] Sign-off: DevOps Engineer [   ] | Release Engineer [   ]

[ ] Gate 1: Canary Tag Isolation (0% Public Traffic)
    ├── [ ] Revision tag (e.g., canary) assigned and dedicated URL verified
    ├── [ ] Synthetic HTTP probes return HTTP 200 with normal latency
    ├── [ ] Cloud Logging confirms zero container startup exceptions or panics
    └── [ ] Sign-off: DevOps Engineer [   ] | Release Engineer [   ]

[ ] Gate 2: 5% Canary Exposure
    ├── [ ] Active traffic confirmed: 5% Candidate / 95% Stable (Sum = 100%)
    ├── [ ] 15-minute soak window completed with zero alert firings
    ├── [ ] HTTP 5xx error rate < 0.1%; P95 latency degradation < 10%
    └── [ ] Sign-off: DevOps Engineer [   ] | Release Engineer [   ]

[ ] Gate 3: 25% Ramp Verification
    ├── [ ] Active traffic confirmed: 25% Candidate / 75% Stable (Sum = 100%)
    ├── [ ] 30-minute soak window completed
    ├── [ ] Container instance auto-scaling healthy; CPU/memory utilization nominal
    └── [ ] Sign-off: DevOps Engineer [   ] | Release Engineer [   ]

[ ] Gate 4: 50% Load Verification
    ├── [ ] Active traffic confirmed: 50% Candidate / 50% Stable (Sum = 100%)
    ├── [ ] 30-minute soak window completed under representative production load
    ├── [ ] Downstream services and database connection pools report healthy capacity
    └── [ ] Sign-off: DevOps Engineer [   ] | Release Engineer [   ]

[ ] Gate 5: 100% Full Cutover & Exit
    ├── [ ] Active traffic confirmed: 100% Candidate / 0% Stable (Sum = 100%)
    ├── [ ] 60-minute post-cutover soak completed
    ├── [ ] Error budget burn rate within acceptable quarterly limits
    └── [ ] Final Release Sign-off: Release Engineer [   ]

[ ] Emergency Gate: Rollback Confirmation (If Triggered)
    ├── [ ] 100% traffic reallocation executed targeting stable anchor revision
    ├── [ ] Read-only query confirms 100% ingress routed to stable revision
    ├── [ ] Telemetry verifies error rate and latency normalized to baseline
    └── [ ] Emergency Sign-off: Release Engineer [   ]
```

### Operational Risk Register

| Identified Risk | Severity | Responsible Role | Preventative Control & Operational Guardrail | Actionable Next Step |
| :--- | :--- | :--- | :--- | :--- |
| **Inadvertent Infrastructure Mutation** | High | DevOps Engineer | Enforce read-only CLI commands (`describe`, `list`) during verification; restrict IAM mutation permissions. | Audit IAM roles to ensure verification engineers have viewer/monitoring rights only. |
| **Premature Gate Advancement** | Medium | Release Engineer | Enforce mandatory time-gated soak windows (15–30 min) and dual sign-off protocol. | Automate soak timer alerts in incident management channel. |
| **Rollback to Wrong Revision** | High | Release Engineer | Rollback anchor revision ID must be explicitly validated and recorded in Gate 0 prior to traffic shifting. | Require dual verification of revision ID before executing traffic reallocation. |
| **Cold-Start Latency Spike** | Medium | DevOps Engineer | Synthetic health probes against tagged canary URL pre-warm instances prior to public traffic exposure. | **Pending verification:** Validate minimum instances setting or warm-up behavior in official docs. |

---

## Open decisions

* Evidence gap: Grounded evidence from official Google Cloud documentation describing Cloud Run rollback mechanics via traffic reallocation to previous immutable revisions.
* Evidence gap: Grounded evidence from official Google Cloud documentation detailing how Cloud Run traffic splitting, revision tags, and gradual rollouts support safe releases.
* The target service is running on Google Cloud Run with support for multiple immutable revisions.

- Evidence gap: Grounded evidence from official Google Cloud documentation describing Cloud Run rollback mechanics via traffic reallocation to previous immutable revisions.
- Evidence gap: Grounded evidence from official Google Cloud documentation detailing how Cloud Run traffic splitting, revision tags, and gradual rollouts support safe releases.
- The target service is running on Google Cloud Run with support for multiple immutable revisions.

### Operational Clarification and Next Steps
1. **Official Documentation Ingestion for Traffic Splitting (`ev-cloud-run-traffic-splitting`):**
   * *Operational Need:* Grounded excerpts from official Google Cloud documentation (`cloud.google.com/run/docs/rollouts-rollbacks-traffic-migration`) detailing revision tag provisioning and percentage traffic splitting mechanics must be ingested into the claim ledger.
   * *Next Step:* Acquire and ingest official Google Cloud documentation claims during the next evidence update to promote provisional platform specifications to verified claims.
2. **Official Documentation Ingestion for Rollback Mechanics (`ev-cloud-run-rollback-procedures`):**
   * *Operational Need:* Grounded excerpts from official Google Cloud documentation substantiating instant traffic reallocation and connection draining behavior must be admitted to the claim ledger.
   * *Next Step:* Ingest official Google Cloud documentation claims verifying zero-downtime traffic reallocation and in-flight request draining semantics.
3. **Production Telemetry Baseline Ratification:**
   * *Operational Need:* Latency degradation thresholds (< 10%) and HTTP 5xx error rate targets (< 0.1%) represent engineering proposals that must be calibrated against historical production service metrics.
   * *Next Step:* DevOps and Release Engineers will review the target service's 14-day rolling P95 latency and error budget trends to finalize milestone gate thresholds prior to production deployment execution.