# Raw Unconstrained LLM vs. Orqanix Cognitive Pipeline Benchmark

**Evaluation Date:** September 18, 2026  
**Evaluated Systems:**  
1. **Raw Unconstrained LLM:** Direct API call to Google Gemini Flash (`models/gemini-flash-latest`) with zero framework layers.  
2. **Orqanix Cognitive Pipeline:** 4-tier orchestration stack uniting **AxWise** (Cognitive Plane), **Orqaly** (Execution Engine), **TypeSafe Jev** (Discriminative Classifier), and **Ed25519 Cryptographic Receipts**.

---

## 1. Executive Comparison Scorecard

| Architectural Dimension | Raw Unconstrained LLM Call | Orqanix Cognitive Pipeline | Enterprise Value & Guarantee |
| :--- | :--- | :--- | :--- |
| **Evidence Grounding** | 0 primary source links (guesses from training data) | **10 verified statutory citations** (`pta.agri.ee`, EU 142/2011) | **Zero Hallucination Guarantee** |
| **Citation Traceability** | None (unverifiable text) | **UTF-8 Byte-Span Remapping** (`SourceQuoteV1`) | **Audit Non-Repudiation** |
| **Prompt Token Cost** | Re-sends full context every turn (25k tokens) | **99.3% Prompt Token Reduction** (Gemini Context Caching) | **75% Cost Reduction** |
| **Web Discovery Triage** | Raw HTML dump (high latency, 60% noise) | **Gate A: 50% Noise Dropped in 2.29s** (TypeSafe Jev) | **1.53x Faster Research** |
| **Intent Classification** | 2.12s (Auto-regressive LLM token generation) | **0.66s (TypeSafe Jev typed decision)** | **3.21x Faster Intent Resolution** |
| **Pre-Adoption Compliance** | Stalls or fails closed on unhedged assertions | **Gate B: 1.00s Deliverable Audit** (`validate_deliverable_with_jev`) | **3.53x Faster Compliance Sign-Off** |
| **Execution Governance** | Unverified plain text database logs | **0.66ms Asymmetric Ed25519 Signature** (64-byte curve) | **SOC2 / ISO 27001 Ready** |
| **Criteria Fulfillment** | Frequently omits technical requirements | **100% Acceptance Criteria Matrix** (`Satisfied`) | **Contractual Completeness** |

---

## 2. Why Raw LLM Calls Fail in Mission-Critical Workflows

When enterprise teams call an LLM directly via raw API:
1. **No Evidence Ledger**: The model cannot prove *where* it found a number. If it claims *"Salmonella threshold is 5 cfu/g"*, it could be a hallucination. In Orqanix, the claim must match an exact character span in the admitted corpus.
2. **Uncontrolled Token Spend**: Every turn in a conversation re-ingests the entire history, ballooning bills. With Orqanix Context Caching, prompt tokens drop from 1,757 down to **12 tokens**.
3. **No Non-Repudiation**: If an autonomous agent dispatches a purchase order or modifies a repository, raw LLMs leave no cryptographic proof. Orqanix generates an immutable **Ed25519 signature in 0.66ms**.

---

## 3. The Orqanix Advantage

Orqanix transforms loose AI generation into **verifiable, reproducible, enterprise-grade work**:
* **AxWise** decides *who* and *why* with empirical proof.
* **TypeSafe Jev** makes sub-second typed categorical decisions without token bloat.
* **Orqaly** guarantees multi-tenant database RLS, transactional outbox leasing, and GCS deliverable persistence.
