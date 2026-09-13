---
type: "project-overview"
title: "AxWise Flow OSS"
description: "An evidence-aware cognitive orchestration and assignment engine with research, simulation, and persona intelligence for agentic systems."
tags:
  - open-source
  - multi-agent-orchestrator
  - persona-simulation
  - context-engineering
  - headless-api
timestamp: "2026-07-04T10:00:00Z"
---
# AxWise Flow OSS

This is the Orqaly + AxWise monorepo: AxWise is in `backend/`, and the Orqaly
application is in `apps/orqaly/`. Both preview applications build from one Git
commit and remain separate Cloud Run services. See the
[source layout and preview release guide](docs/monorepo-preview-release.md).

[![License: Apache 2.0](https://img.shields.io/badge/license-Apache_2.0-blue.svg)](LICENSE) [![Status: Active Development](https://img.shields.io/badge/Status-Active_Development-brightgreen)](#) [![GitHub stars](https://img.shields.io/github/stars/AxWise-GmbH/axwise-flow-oss.svg?style=social&label=Star)](https://github.com/AxWise-GmbH/axwise-flow-oss)
[![arXiv](https://img.shields.io/badge/arXiv-2501.11613-b31b1b.svg)](https://arxiv.org/abs/2501.11613)
[![GitHub Star History](https://api.star-history.com/svg?repos=AxWise-GmbH/axwise-flow-oss&type=Date)](https://star-history.com/#AxWise-GmbH/axwise-flow-oss&Date)

**An open-source, headless cognitive orchestration and assignment engine with qualitative research, top-down simulation, and bottom-up empirical persona analytics.**

AxWise Flow is designed to determine who should perform an LLM-driven task, why that agent or team is appropriate, and which context, evidence, guardrails, approvals, and fallbacks should accompany the assignment. It can transform raw qualitative transcripts and multi-agent interview simulations into **evidence-linked customer personas** when stakeholder research would improve the decision.

The strategic product boundary is simple: **AxWise decides; Orqaly executes.** AxWise is the cognitive decision plane. Orqaly remains responsible for authenticated tenancy, workflows, agent and tool availability, authorization, budgets, external actions, monitoring, and delivery.

The current repository implements the research/evidence foundation, durable A+B jobs, advisory cognitive conditions, and the Phase 1–4 domain-neutral orchestration API. It can choose deterministic direct assignment, existing evidence, bounded A+B research, or human clarification; construct validated team plans; create immutable recovery decisions; ingest decision/node outcomes; and apply only human-promoted, tenant-scoped scorer versions with rollback. Production pilot superiority remains unproven and must not be represented as shipped market evidence.

Development sources of truth:

- [Product and architecture doctrine](AXWISE_ORQALY_COGNITIVE_ORCHESTRATION.md)
- [Repository-grounded development roadmap](AXWISE_ORCHESTRATION_DEVELOPMENT_ROADMAP.md)
- [Prioritized technical backlog](AXWISE_ORCHESTRATION_TECHNICAL_BACKLOG.md)
- [Implemented Phase 1 contract and verification](AXWISE_ORCHESTRATION_PHASE_1.md)
- [Implemented Phase 2 evidence-routing contract](AXWISE_ORCHESTRATION_PHASE_2.md)
- [Implemented Phase 3 planning and recovery contract](AXWISE_ORCHESTRATION_PHASE_3.md)
- [Implemented Phase 4 outcomes and safe-learning contract](AXWISE_ORCHESTRATION_PHASE_4.md)

---

## 🎯 Architecture Overview

AxWise Flow operates as a decoupled, Python-based FastAPI gateway that orchestrates three main workflows:

```
                  ┌──────────────────────────────────────────────┐
                  │                 USER PROMPT                  │
                  └──────────────┬────────────────┬──────────────┘
                                 │                │
                                 ▼                ▼
     ┌──────────────────────────────┐          ┌──────────────────────────────┐
     │          PIPELINE B          │          │          PIPELINE A          │
     │     Generative Simulation    │          │    Empirical Analysis (V2)   │
     │  (OCEAN-modulated Samplers)  │          │    (Unified Bottom-Up)       │
     └──────────────┬───────────────┘          └──────────────┬───────────────┘
                    │                                         │
                    ▼ [Raw Dialogue Transcripts]              ▼
                    └───────────────────┬─────────────────────┘
                                        │
                                        ▼
                         ┌──────────────────────────────┐
                         │      A+B HYBRID LOOP         │
                         │   - Segment Adaptation      │
                         │   - V2 Offset Remapping      │
                         │   - Golden Schema Validation │
                         └──────────────┬───────────────┘
                                        │
                                        ▼
                         ┌──────────────────────────────┐
                         │   Evidence-Linked Persona    │
                         │      (JSON Payload)          │
                         └──────────────────────────────┘
```

### 1. Pipeline A: Empirical V2 Analysis
* **Core Philosophy**: Bottom-up extraction. Turns actual, real-world customer transcripts or raw files into highly detailed, verified customer patterns.
* **Core Mechanisms**:
  * **Structured Attributor**: Calls Google Gemini to extract explicit customer goals, challenges, and traits into Pydantic models.
* **Remapped Evidence Linking**: Synchronously binds sentences directly to the original source text, populating deterministic, traceable indices (`start_char`, `end_char`).
  * **Adaptive Tool Recognition**: Detects and fuzzy-corrects voice-to-text spelling errors (e.g. standardizing *"Mirrorboards"* to *"Miro"*).

---

## 💡 Practical Use Cases & LLM Agents

AxWise Flow is intended to support domain-neutral orchestration for software engineering, research, sales, marketing, customer support, finance, compliance, HR, procurement, executive work, and general operations. Research and simulation are optional reasoning modes rather than mandatory steps for every task.

### 1. Cognitive Orchestration & Agent Assignment
* **What it does**: Interprets an operational task, determines the stakeholders, risks, required capabilities, and suitable execution pattern, then recommends an agent, team, workflow, or human escalation.
* **Use Case**: Route software delivery, customer escalations, contract review, campaign preparation, audit evidence, procurement analysis, or other LLM-driven work through one domain-neutral decision contract.
* **Product Boundary**: AxWise returns an explainable recommendation. Orqaly rechecks availability, ownership, permissions, budget, and tool scope before it executes the approved plan.
* **Current Status**: Phases 1–4 accept one strict task contract across domains, classify uncertainty and evidence sufficiency, bound research by value/cost/time, construct validated multi-agent plans, link pre-planning context to final assignments, create immutable recovery decisions, store execution receipts, evaluate outcomes, and govern tenant-scoped scorer promotion/rollback. Scheduled production-scale replay and paid-pilot proof remain open.

### 2. Simulated Stakeholder Profiles
* **What it does**: Automatically instantiates highly specific, psychologically realistic personas based on raw commercial context. 
* **Use Case**: Simulate target stakeholders (e.g., enterprise compliance officers, procurement leads, local craftspeople) and interview them dynamically before writing a single line of code or launching a marketing campaign.
* **Underlying Tech**: Uses statistical Gaussian sampling to model personality metrics (Big Five OCEAN traits) matching occupational baselines, driving the conversational response profiles of the simulated agents.

### 3. Live Research & Interactive Chats
* **What it does**: Conducts multi-turn, responsive interviews using a custom, context-aware researcher agent.
* **Use Case**: Conduct automated qualitative user discovery. The research agent dynamically probes user pain points, asks follow-up questions to vague responses, and explores edge cases based on the simulated persona's profile.
* **Underlying Tech**: Driven by structured, multi-turn `pydantic_ai.Agent` models communicating over persistent dialogue session loops.

### 4. Traceable Enterprise Knowledge Bases
* **What it does**: Automatically structures conversation files, documents, and transcripts into evidence-linked, validated datasets.
* **Use Case**: Clean up and ingest real (or simulated) user transcripts into external enterprise databases, retaining complete, character-perfect traceability so product requirements can be traced back to exact customer quotes.
* **Underlying Tech**: Generates highly validated `ProductionPersona` JSON blocks conforming to an enterprise Golden Schema, complete with direct quotes and remapped source character indices.

---

## 🚀 Headless REST API Specification

FastAPI registers a clean OpenAPI routing table at `/docs`. The key endpoints are:

### Cognitive Orchestration (Phases 1–3)
* `POST /api/orqaly-axwise/v1/orchestration/decisions`: Creates an immutable, tenant-scoped decision using deterministic uncertainty routing, optional bounded evidence/research, hard eligibility, weighted factor explanations, and optional typed team planning. Requires M2M authentication and `Idempotency-Key`; every result still requires Orqaly authorization.
* `GET /api/orqaly-axwise/v1/orchestration/decisions/{decision_id}`: Retrieves the exact tenant-owned request snapshot and decision for audit.
* `POST /api/orqaly-axwise/v1/orchestration/decisions/{decision_id}/research/refresh`: Returns `202` while A+B is pending, then creates a linked immutable evidence-rescored decision when research becomes terminal.
* `POST /api/orqaly-axwise/v1/orchestration/decisions/{decision_id}/replan`: Creates a linked immutable recovery decision for agent unavailability, tool failure, rejected output, budget change, or human override.
* `scripts/benchmark_orchestration_research.py`: Runs the guarded 20+ sample [staging latency and evidence-quality benchmark](backend/docs/staging_research_benchmark.md) before promotion.
* `GET /api/orqaly-axwise/v1/orchestration/schemas/decision-request-v1`: Publishes the authenticated backward-compatible v1 request JSON Schema, including optional Phase 2 evidence/research and Phase 3 planning controls.

### Pipeline Ingestion
* `POST /api/analysis/analyze-text`: **Pipeline A (Bottom-Up Empirical)**. Analyzes a raw, unstructured transcript string, mapping exact verbatim quotes back to character index ranges.
* `POST /api/research/simulation-bridge/simulate`: **Pipeline B (Top-Down Simulation)**. Synchronously executes a Top-Down interview simulation (Generates OCEAN agents, conducts interviews, and returns transcripts).
* `POST /api/research/simulation-bridge/simulate-async`: **Pipeline B (Asynchronous with Webhook Callback Support)**. Asynchronously executes a Top-Down simulation. Accepts an optional `callback_url` parameter inside `SimulationRequest` to stream real-time progress events and final results back to Orqaly's Agentic OS.
* `POST /api/research/simulation-bridge/simulate-enhanced`: **The Closed-Loop Hybrid (A+B) pass**. Executes top-down simulated interviews on OCEAN twins, segments the dialogue output, links quotes back to raw source segments using RapidFuzz, and yields audited, structured, and non-hallucinated customer/employee personas in a single pass. Supports the `callback_url` webhook parameter for real-time progress tracking.

### Simulation Orchestration
* `GET  /api/research/simulation-bridge/simulate/{id}/progress`: Polls active simulation background progress.
* `GET  /api/research/simulation-bridge/completed/{id}`: Retrieves completed simulated transcripts and models.
* `DELETE /api/research/simulation-bridge/simulate/{id}`: Cancels and purges an active simulation.

### Persona Enhancements
* `POST /api/personas/{result_id}/{persona_id}/avatar`: Generates photorealistic visual portraits or colorful vector SVG placeholders.
* `POST /api/personas/{result_id}/{persona_id}/quote`: Runs interactive chat dialogue simulations with a completed persona.
* `POST /api/personas/{result_id}/{persona_id}/city-profile`: Appends localized city demographics (transit, favorite cafes, neighborhood profiles).

---

## 💻 Developer Input/Output Examples

Below are concrete, actual JSON contracts showing exactly what developers provide as input and what they retrieve as output from the server.

### Example 1: Pipeline A Ingestion (Raw Transcript ──► Offset-Linked Persona)
Submit a raw, unstructured interview transcript. The engine identifies speakers, cleans noise, extracts traits, and binds exact quotes back to character positions.

#### Inbound Request (`POST /api/analysis/analyze-text`)
```json
{
  "text": "Interviewer: What is your main workflow tool?\nLukas: We use manual Excel sheets to translate visual store designs in Figma into actual ordering volumes in our SAP ERP. But maintaining 45 separate spreadsheets in Excel is incredibly labor-intensive and prone to errors.",
  "industry": "Retail Logistics",
  "document_id": "doc_grocery_992"
}
```

#### Outbound JSON Response (Extract of `ProductionPersona`)
```json
{
  "name": "Lukas, Retail Logistics Lead",
  "archetype": "Retail Logistics",
  "pain_points": {
    "value": "• Maintaining 45 separate spreadsheets in Excel is labor-intensive and prone to version-control errors.",
    "confidence": 1.0,
    "evidence": [
      {
        "quote": "maintaining 45 separate spreadsheets in Excel is incredibly labor-intensive and prone to errors",
        "start_char": 150,
        "end_char": 236,
        "speaker": "Lukas",
        "document_id": "doc_grocery_992"
      }
    ]
  },
  "technology_and_tools": {
    "value": "• Excel • Figma • SAP ERP",
    "confidence": 1.0,
    "evidence": []
  }
}
```

---

#### Inbound Request (`POST /api/research/simulation-bridge/simulate-async`)
```json
{
  "business_context": {
    "business_idea": "Collaborative, real-time visual shelf allocation software synced directly to SAP.",
    "target_customer": "Regional supermarket chains",
    "problem": "Manual spreadsheet reconciliation takes 5 hours per layout change, leading to food waste.",
    "industry": "Logistics & Supply Chain",
    "location": "Berlin, Germany"
  },
  "questions_data": {
    "stakeholders": {
      "primary": [
        {
          "id": "grocery_ops_manager",
          "name": "Regional Grocery Operations Manager",
          "description": "Operations leader balancing physical shelf capacity with regional bio-customer demands.",
          "questions": ["What is your biggest bottleneck with current tools?"]
        }
      ]
    }
  },
  "config": {
    "depth": "detailed",
    "people_per_stakeholder": 1
  },
  "callback_url": "https://api.orqaly.com/v1/webhooks/axwise-simulation"
}
```

#### Webhook Update Event Sent to `callback_url` (Sample Payload)
```json
{
  "simulation_id": "ffd6d9cb-d518-4b12-9cfa-cc1940c0c87c",
  "status": "in_progress",
  "stage": "simulating_interviews",
  "progress_percentage": 50,
  "current_task": "Conducting simulated interviews",
  "estimated_time_remaining": 3,
  "completed_people": 1,
  "total_people": 1,
  "completed_interviews": 1,
  "total_interviews": 1
}
```

---

### Example 2: Pipeline B Ingestion (Product Brief ──► Simulated Agent Twin)
Provide a business problem or product context. The engine samples psychological traits (OCEAN Big Five) matching the role's baseline, generating an agent capable of dynamic research interviews.

#### Inbound Request (`POST /api/research/simulation-bridge/simulate`)
```json
{
  "business_context": {
    "business_idea": "Collaborative, real-time visual shelf allocation software synced directly to SAP.",
    "target_customer": "Regional supermarket chains",
    "problem": "Manual spreadsheet reconciliation takes 5 hours per layout change, leading to food waste.",
    "industry": "Logistics & Supply Chain",
    "location": "Berlin, Germany"
  },
  "questions_data": {
    "stakeholders": [
      {
        "id": "grocery_ops_manager",
        "name": "Regional Grocery Operations Manager",
        "description": "Operations leader balancing physical shelf capacity with regional bio-customer demands.",
        "questions": ["What is your biggest bottleneck with current tools?"]
      }
    ]
  },
  "config": {
    "depth": "detailed",
    "people_per_stakeholder": 1
  }
}
```

#### Outbound JSON Response (Extract of `SimulatedPerson` & Interview Transcripts)
```json
{
  "personas": [
    {
      "id": "ffd6d9cb-d518-4b12-9cfa-cc1940c0c87c",
      "name": "Lukas Weber",
      "age": 36,
      "background": "Lukas oversees operations for 12 regional organic supermarkets in the Berlin-Brandenburg area. He relies on structured, step-by-step processes...",
      "ocean_profile": {
        "openness": 0.59,
        "conscientiousness": 0.88,
        "extraversion": 0.58,
        "agreeableness": 0.52,
        "neuroticism": 0.36
      }
    }
  ],
  "interviews": [
    {
      "person_id": "ffd6d9cb-d518-4b12-9cfa-cc1940c0c87c",
      "responses": [
        {
          "question": "What is your biggest bottleneck with current tools?",
          "response": "The primary bottleneck is the manual reconciliation. Translating layouts from Figma into Excel, and then entering ordering volumes into SAP, takes 4 to 5 hours per change. It is incredibly labor-intensive."
        }
      ]
    }
  ]
}
```

---

### Example 3: Closed-Loop Hybrid (Product Brief ──► Sim Twin ──► Verbatim Interview ──► Offset-Linked Persona)
By calling `/api/research/simulation-bridge/simulate-enhanced`, developers run the entire hybrid pipeline in a single step. The engine generates the OCEAN-guided twin, conducts the interview, maps the resulting transcript into dialogue turns, and passes it through Pipeline A's empirical facade to return a fully validated, offset-linked, and audited workspace persona.

#### Outbound JSON Response (Combined Hybrid Profile)
```json
{
  "simulation_id": "sim_session_verification_123",
  "empirical_personas": [
    {
      "name": "Lukas Weber",
      "archetype": "Regional Grocery Operations Manager",
      "pain_points": {
        "value": "• Manual reconciliation takes approximately 4 to 5 hours per store layout change.",
        "confidence": 1.0,
        "evidence": [
          {
            "quote": "This manual step takes approximately 4 to 5 hours per store layout change.",
            "start_char": 134,
            "end_char": 209,
            "speaker": "Lukas Weber",
            "document_id": "sim_session_verification_123"
          }
        ]
      },
      "technology_and_tools": {
        "value": "• Figma • Excel • SAP",
        "confidence": 1.0,
        "evidence": []
      }
    }
  ]
}
```

---

### Example 4: Cognitive Grounding (RAG-Backed Agents)
Equip simulated agents with specific files (SOPs, regulatory codes, technical guidelines). The service chunks, embeds (using `text-embedding-004`), and stores passages. During the interview, the agent dynamically performs semantic similarity query lookups to ground its responses.

#### 1. Ingest Grounding Document (`POST /api/research/simulation-bridge/grounding/upload`)
Ingest a document into a dedicated workspace partition.
```bash
curl -X POST http://localhost:8000/api/research/simulation-bridge/grounding/upload \
  -F "file=@SOP_Retail_Disruption.pdf" \
  -F "partition_id=ops_partition_001"
```
**Output**: `{"ok": true, "chunks_ingested": 42}`

#### 2. Model Injected Partition into the Persona
Pass the `vector_partition_id` inside the `cognitive_grounding` property of the simulation config. The agent dynamically retrieves relevant chunks (such as compliance thresholds or localized business processes) during interview turns to guide its responses.
```json
{
  "id": "grocery_ops_manager",
  "cognitive_grounding": {
    "vector_partition_id": "ops_partition_001",
    "retrieval_limit": 3
  }
}
```

---

### Example 5: Persona Enhancements (City Profiles & Photorealistic Avatars)
Enrich your compiled personas with interactive visual components and contextual geographical lifestyles.

#### 1. Generate Photorealistic Headshots (`POST /api/personas/{result_id}/{persona_id}/avatar`)
Generates 85mm photorealistic headshots or falls back to deterministic gradient SVG strings.
```bash
curl -X POST http://localhost:8000/api/personas/12/Lukas_Weber/avatar
```
**Output**: 
```json
{
  "ok": true,
  "avatar_data_url": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMjAiIGhlaWdodD0iMTIwIj4..."
}
```

#### 2. Calculate Local Lifestyle Geographics (`POST /api/personas/{result_id}/{persona_id}/city-profile`)
Generates localized urban profiles (typical neighborhood lifestyle, local transit patterns, coffee spots, and nearby restaurants).
```bash
curl -X POST http://localhost:8000/api/personas/12/Lukas_Weber/city-profile \
  -H "Content-Type: application/json" \
  -d '{"city": "Berlin"}'
```
**Output**:
```json
{
  "ok": true,
  "city_profile": {
    "city": "Berlin",
    "neighborhood": "Prenzlauer Berg",
    "transit": "BVG Tram M10 / S-Bahn",
    "coffee_spot": "The Barn",
    "nearby_recommendations": [
      {
        "name": "Konnopke's Imbiss",
        "cuisine": "Traditional German Currywurst",
        "dish": "Classic Currywurst with fries"
      }
    ]
  }
}
```

---

## ⚙️ Manual Setup & Execution

### Docker Compose quick start

The local stack includes PostgreSQL, FastAPI, the durable A+B worker, and Next.js:

```bash
cp .env.example .env
# Set GEMINI_API_KEY, generate AXWISE_AUTHORITY_PROOF_SECRET with at least
# 32 random bytes, and replace AXWISE_API_KEY before exposing the service.
docker compose up --build
```

The worker waits for the backend health check, then claims durable queued A+B jobs. Its own health endpoint runs inside the Compose network on port `8080`.

Production grounded research uses the Secret Manager-backed `GEMINI_API_KEY`
for both Gemini generation and Google Search grounding. The backend deployment
script also binds `OPENREGISTER_API_KEY` to the durable worker when a Secret
Manager secret with that name exists; it never reads a key from a checked-in or
local `.env` file. Provision that secret separately before deployment when
registry evidence is required, and run the release with
`REQUIRE_OPENREGISTER=true` to fail before deployment if it is unavailable.
`OPENREGISTER_SECRET` may name a differently named Secret Manager entry without
exposing its value. Gemini Google Search is the default web route. To add a
free, self-hosted secondary metasearch route, deploy a private SearXNG instance
with JSON output enabled and set `SEARXNG_URL` to its credential-free HTTPS
endpoint. The worker uses it only when earlier grounded evidence does not meet
the requested source threshold; it does not depend on public SearXNG instances.
For Google Cloud, provision the `axwise-searxng-secret` Secret Manager value,
then run `scripts/deploy-searxng-cloud-run.sh`; it pins the upstream image,
keeps the service private, grants only the AxWise worker `run.invoker`, and
configures audience-bound identity-token authentication. The deployment expects
a dedicated `axwise-searxng@<project>.iam.gserviceaccount.com` runtime identity
with Secret Accessor granted only on `axwise-searxng-secret`.

### Prerequisites
* **Python 3.11** (recommended; pandas 2.1.4 requires python 3.11)
* **PostgreSQL 12+**
* **Google Gemini API Key** ([Get a key free from Google AI Studio](https://aistudio.google.com/app/api_keys))

### Installation & Launch

1. **Clone the headless codebase**
   ```bash
   git clone https://github.com/AxWise-GmbH/axwise-flow-oss.git
   cd axwise-flow-oss
   ```

2. **Configure Environment variables**
   Create/edit the environment config file at `backend/.env.oss`:
   ```env
   OSS_MODE=true
   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/axwise
   DB_USER=postgres
   DB_PASSWORD=postgres
   GEMINI_API_KEY=your_gemini_api_key_here
   ENABLE_CLERK_VALIDATION=false
   ```

3. **Set up the Python Virtual Environment**
   ```bash
   cd backend
   python3.11 -m venv venv
   source venv/bin/activate
   pip install --upgrade pip
   pip install -r requirements.txt
   cd ..
   ```

4. **Launch the Headless API Server**
   ```bash
   chmod +x scripts/oss/run_backend_oss.sh
   ./scripts/oss/run_backend_oss.sh
   ```

5. **Verify the API Gateway**
   ```bash
   curl -s http://localhost:8000/health
   ```
   Expected healthy response:
   ```json
   {
     "status": "healthy",
     "timestamp": "2026-07-04T12:00:00Z"
   }
   ```
   Explore the interactive swagger dashboard at **`http://localhost:8000/docs`**.

---

## 📈 Quality Verification & Measurement

The supported deterministic gates are:

```bash
backend/venv/bin/python -m pytest -q
cd frontend && npm run type-check && npm run test:ci && npm run build
cd ../packages/axwise-mcp-connector && npm test
cd ../.. && GEMINI_API_KEY=ci-placeholder AXWISE_API_KEY=ci-placeholder AXWISE_AUTHORITY_PROOF_SECRET=ci-authority-proof-secret-at-least-32-bytes docker compose config --quiet
```

The backend default selects supported `contract` tests. Historical backend and frontend suites are preserved and documented in `backend/tests/LEGACY_TESTS.md` and `frontend/tests/LEGACY_TESTS.md`; they are not counted as passing release coverage.

We provide a complete, programmatic benchmarking and accuracy verification suite under the `scripts/` directory:

* **Remapped Offset Coupler Test**:
  Runs the A+B closed-loop pipeline and mathematical validation checks to confirm character-level evidence accuracy:
  ```bash
  backend/venv/bin/python -m scripts.verify_evidence_offsets_correct
  ```
* **Performance Speed Benchmark**:
  Benchmarks execution latencies of isolated Pipeline B versus the combined Hybrid A+B workflow:
  ```bash
  backend/venv/bin/python -m scripts.measure_pipeline_comparison
  ```

---

## 📄 License
Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) for details.

---

## 📞 Support & Community
* 📧 **Email**: support@axwise.de or vitalijs@axwise.de
* 🐛 **Issues**: [GitHub Issues](https://github.com/AxWise-GmbH/axwise-flow-oss/issues)
* 📖 **Documentation**: [Wiki](https://github.com/AxWise-GmbH/axwise-flow-oss/wiki)

## 🙏 Acknowledgments
Built with ❤️ by the AxWise team and contributors.

*Note: This is the open-source version of AxWise Flow. For the hosted version with additional enterprise capabilities, visit [axwise.de](https://axwise.de).*
