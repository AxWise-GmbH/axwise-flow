# Orqanix & AxWise Platform — Co-Founders Architectural Sign-Off Report
**Date:** September 18, 2026  
**Audience:** Co-Founders & Core Engineering  
**Repositories & Deployments:** `axwise-flow-oss` on `codex/universal-agentic-foundation`  
**Google Cloud Projects:** `axwise-73425` (Production) & `axwise-v2-preview-001` (Preview / Orqanix)  

---

## 1. Executive Summary: Core Operating Thesis

The platform separates the AI architecture into three distinct, non-overlapping planes:
> **"AxWise Decides; Orqaly Executes; Goose Desktop & OMP Act Locally."**

1. **Cognitive Decision Plane (AxWise)**: High-level qualitative reasoning, evidence extraction, interview analysis, Big Five OCEAN persona simulation, and PRD synthesis.
2. **Execution & Workflow Plane (Orqaly)**: Multi-tenant Row-Level Security, 5-queue durable job engine (`FOR UPDATE SKIP LOCKED`), real-time Server-Sent Events (SSE) assistant chat, visual DAG workflow builder, and Cloud Run IAM API gateways.
3. **Local Desktop Operator (Goose Desktop & Oh My Pi)**: Fast local code refactoring, AST inspection (Tree-sitter/LSP), macOS Accessibility UI automation (Peekaboo), and OS Keychain-backed Clerk PKCE authentication.

---

## 2. Infrastructure & Live Service Directory

### A. Production Environment (`axwise-73425`)
* **Web Frontend (`https://axwise.de`)**:
  - Service: `axwise-flow` (Revision `axwise-flow-00242-547`, 100% traffic).
  - Framework: Next.js 14 App Router, `minScale: 1` (zero cold starts).
  - Auth: Production Clerk live instance (`clerk.axwise.de`, verified JWKS active).
* **Cognitive API (`https://api.axwise.de`)**:
  - Service: `axwise-backend` (Revision `axwise-backend-00189-zkt`, 100% traffic).
  - Engine: **Google Gemini 3.8 Flash** (`google_genai 2.17.0`, `pydantic 2.13.4`).
  - Database: Cloud SQL `axwise-postgres` (PostgreSQL 15.18, 82 users, 184 analyses).
  - Search: Private Cloud Run SearXNG proxy (`axwise-searxng`).
* **Durable Workers**:
  - `axwise-orqaly-worker` & `axwise-orqaly-scope-worker` (Serving 100% traffic).

### B. Preview & Orqanix Execution Environment (`axwise-v2-preview-001`)
* **Workspace Portal (`https://preview.orqanix.com` / `https://orqanix.com`)**:
  - Service: `orqaly-v2-web-preview` (Revision `orqaly-v2-web-preview-00091-fw6`).
  - Framework: React 19 / Vite 7 under strict module boundary (`gcpModuleBoundaryGuard`).
* **API Gateway & Desktop Proxy**:
  - Service: `orqaly-v2-api-preview` (Revision `orqaly-v2-api-preview-00103-ntb`).
  - Endpoints: REST `/v2/*`, `/desktop/v1/chat/completions`, `/desktop/v1/work`.
* **5-Queue Durable Execution Worker**:
  - Service: `orqaly-v2-worker-preview` (Revision `orqaly-v2-worker-preview-00082-8jt`).
  - Mechanics: Outbox leasing via PostgreSQL `FOR UPDATE SKIP LOCKED`.
* **Execution Database**:
  - Cloud SQL `orqaly-v2-preview-001-pg` (PostgreSQL 16, 25 schema migrations, RLS enforced).

---

## 3. Key Accomplishments & Improvements Completed

| Area | Problem Solved | Verification Outcome |
| :--- | :--- | :--- |
| **PR #52 (Topic Expansion)** | 300-char goal ceiling caused Pydantic schema validation crashes. | Expanded limit to **4,000 characters** with SHA-256 hash anchors. Passed 69/69 regression tests and live 534-char Estonia market probe. |
| **SearXNG Scraper Timeout** | 15s timeout caused `AXWISE_ASSISTANT_EVIDENCE_UNAVAILABLE` on government/retail sites. | Calibrated scraper fetch window to **25 seconds**. Successfully completed statutory research with 10 primary citations. |
| **UI Error Guidance Banner** | Failed evidence turns rendered empty/stuck bubbles. | Patched `AssistantOperationStatus.jsx` to show clear, actionable error guidance. Verified with 6/6 Vitest component tests. |
| **Closed-Loop Roles** | Pipeline A+B simulation degraded personas into generic "participant" tags. | Preserved exact source roles (`economic_buyer`, `regulatory_auditor`). Verified with 31/31 passed tests. |
| **Domain Cutover** | Codebase contained dead references to `orqaly.com`. | Mapped all webhook callbacks and CORS to **`orqanix.com`** and **`api.orqanix.com`**. |
| **Technical Debt Pruned** | 40+ unmounted legacy Vercel handlers & shims in `apps/orqaly/api/`. | Physically removed dead handlers; CI contract tests passed (9/9). Freed ~900 MB local disk space. |
| **Production Promotion** | Production backend was running August 30 baseline with Gemini 3.7. | Built and deployed new revisions to `api.axwise.de`, `axwise.de`, and worker queues with zero downtime. |
| **DNS Configuration** | `orqanix.com` pointed to old parking IP. | Mapped to Google Cloud Run; all 4 Anycast IPs verified live on authoritative nameservers. |

---

## 4. Next Strategic Horizons (Q4 2026 Roadmap)

1. **TypeSafe AI Integration**:
   - Implement grammar-constrained decoding (`outlines` / `instructor` strict schemas) so LLMs cannot physically output malformed tokens violating Zod/Pydantic schemas.
2. **Jevons Paradox Compression (Gate A)**:
   - Deploy small, high-throughput classifiers on evidence intake to filter out 90% of raw HTML and conversational noise before triggering expensive synthesis models.
3. **Closed-Set Capability Dispatch (Gate B)**:
   - Enforce `CapabilityContractV1` in Orqanix Desktop to route tasks directly to `omp` (AST code), `Peekaboo` (GUI automation), or `shell` without exploratory hallucination turns.

---
**Sign-off Status:** Verified & Operational Across Production and Preview Clusters.
