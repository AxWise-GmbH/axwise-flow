---
type: "project-overview"
title: "AxWise Flow OSS"
description: "Your headless, context-engineered API for top-down interview simulation and bottom-up empirical persona analytics."
tags:
  - open-source
  - multi-agent-orchestrator
  - persona-simulation
  - context-engineering
  - headless-api
timestamp: "2026-07-04T10:00:00Z"
---
# AxWise Flow OSS

[![License: Apache 2.0](https://img.shields.io/badge/license-Apache_2.0-blue.svg)](LICENSE) [![Status: Active Development](https://img.shields.io/badge/Status-Active_Development-brightgreen)](#) [![GitHub stars](https://img.shields.io/github/stars/AxWise-GmbH/axwise-flow.svg?style=social&label=Star)](https://github.com/AxWise-GmbH/axwise-flow)
[![arXiv](https://img.shields.io/badge/arXiv-2501.11613-b31b1b.svg)](https://arxiv.org/abs/2501.11613)
[![GitHub Star History](https://api.star-history.com/svg?repos=AxWise-GmbH/axwise-flow&type=Date)](https://star-history.com/#AxWise-GmbH/axwise-flow&Date)

**An open-source, headless, context-engineered REST API for qualitative customer research, top-down interview simulation, and bottom-up empirical persona analytics.**

AxWise Flow transforms raw qualitative customer transcripts and multi-agent interview simulations into **evidence-linked customer personas** through a context-engineered server workflow. Every insight, persona, and demographic trait is trace-verified back to source transcripts using character-level offset linking.

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

AxWise Flow is built for production-grade design thinking, synthetic data generation, and conversational modeling. The underlying engines power the following primary scenarios:

### 1. Generative Agents & "Digital Twins" (Simulation)
* **What it does**: Automatically instantiates highly specific, psychologically realistic personas based on raw commercial context. 
* **Use Case**: Spin up digital twins of target stakeholders (e.g., enterprise compliance officers, procurement leads, local craftspeople) and interview them dynamically before writing a single line of code or launching a marketing campaign.
* **Underlying Tech**: Uses statistical Gaussian sampling to model personality metrics (Big Five OCEAN traits) matching occupational baselines, driving the conversational response profiles of the simulated agents.

### 2. Live Research & Interactive Chats
* **What it does**: Conducts multi-turn, responsive interviews using a custom, context-aware researcher agent.
* **Use Case**: Conduct automated qualitative user discovery. The research agent dynamically probes user pain points, asks follow-up questions to vague responses, and explores edge cases based on the simulated persona's profile.
* **Underlying Tech**: Driven by structured, multi-turn `pydantic_ai.Agent` models communicating over persistent dialogue session loops.

### 3. Traceable Enterprise Knowledge Bases
* **What it does**: Automatically structures conversation files, documents, and transcripts into evidence-linked, validated datasets.
* **Use Case**: Clean up and ingest real (or simulated) user transcripts into external enterprise databases, retaining complete, character-perfect traceability so product requirements can be traced back to exact customer quotes.
* **Underlying Tech**: Generates highly validated `ProductionPersona` JSON blocks conforming to an enterprise Golden Schema, complete with direct quotes and remapped source character indices.

---

## 🚀 Headless REST API Specification

FastAPI registers a clean OpenAPI routing table at `/docs`. The key endpoints are:

### Pipeline Ingestion
* `POST /api/analysis/analyze-text`: Analyzes a raw, unstructured transcript string using Pipeline A.
* `POST /api/research/simulation-bridge/simulate`: Executes a Pipeline B simulation (Generates OCEAN agents, conducts interviews, and returns transcripts).
* `POST /api/research/simulation-bridge/simulate-enhanced`: **The closed-loop hybrid endpoint.** Runs the complete simulation, adapts dialogue turns into segments, maps them, and runs V2 Facade analysis to output trace-linked, audited personas in a single call.

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

### Prerequisites
* **Python 3.11** (recommended; pandas 2.1.4 requires python 3.11)
* **PostgreSQL 12+**
* **Google Gemini API Key** ([Get a key free from Google AI Studio](https://aistudio.google.com/app/api_keys))

### Installation & Launch

1. **Clone the headless codebase**
   ```bash
   git clone https://github.com/AxWise-GmbH/axwise-flow.git
   cd axwise-flow
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
