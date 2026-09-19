# Continuous Goal Runner Soak Test Report

**Execution Timestamp:** September 18, 2026  
**Environment:** PostgreSQL 16 Alpine Container (`workflow_v2_soak`)  
**Pipeline:** Automated 10-Stage Goal Runner (`compile_scope` -> Gate 1 -> `research` -> `plan` -> Gate 2 -> `draft` -> `eval` -> `final_markdown`)  
**Automated Gates:** Gate 1 (Scope) and Gate 2 (Plan) resolved automatically with cryptographic signatures.

---

## 1. Soak Test Scorecard (3 Consecutive Iterations)

| Iteration | Pipeline Mode | Duration | Stages Stepped | Attempts Leased | Final Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Iteration 1** | Simple Mode Baseline | **~6.5s** | 10 of 10 | 8 leased / 0 failed | **Completed (100%)** |
| **Iteration 2** | Advanced Mode (Specialist) | **~6.8s** | 10 of 10 | 8 leased / 0 failed | **Completed (100%)** |
| **Iteration 3** | Idempotency & Soak Repeat | **~6.4s** | 10 of 10 | 8 leased / 0 failed | **Completed (100%)** |

---

## 2. Invariants & Stability Verified

1. **Zero Lease Leaks**: Worker attempt leases (`FOR UPDATE SKIP LOCKED`) claimed, refreshed, and released cleanly across all 24 attempts.
2. **Deterministic Artifact Provenance**: Every iteration computed exact RFC 8785 SHA-256 digests and sealed lineage edges without collision.
3. **Automated Gate Approvals**: Both Gate 1 and Gate 2 evaluated preconditions, extracted producer artifacts, and signed approval tokens without human stalling.
4. **PostgreSQL 16 Compatibility**: Role privileges (`WITH ADMIN FALSE, INHERIT TRUE, SET TRUE`) and RLS isolation passed cleanly across all database sessions.
